// Interpretação local do lançamento rápido ("20 alimentação mercado", "80 farmácia ontem").
// Não depende de IA: usa regras configuráveis do usuário, histórico de lançamentos e um dicionário embutido.
import { addDays, isValidISO, parseBRDate, todayISO, type ISODate } from '../lib/dates';
import type { Account, Category, CategoryRule, Transaction, TxKind } from './types';

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type Hint = [keywords: string[], category: string, sub: string | null];

/** Dicionário embutido de despesas: palavra-chave -> Categoria > Subcategoria (pelo nome). */
export const EXPENSE_HINTS: Hint[] = [
  [['compras de mercado', 'supermercado', 'mercado', 'feira', 'hortifruti', 'atacadao', 'assai', 'carrefour', 'acougue'], 'Alimentação', 'Mercado'],
  [['pizza', 'pizzaria'], 'Alimentação', 'Pizza'],
  [['restaurante', 'almoco', 'jantar', 'rodizio', 'churrascaria', 'hamburguer', 'hamburger', 'burger', 'sushi', 'marmita'], 'Alimentação', 'Restaurantes'],
  [['delivery', 'ifood', 'rappi', 'ze delivery'], 'Alimentação', 'Delivery'],
  [['lanche', 'salgado', 'padaria', 'sanduiche', 'pastel', 'acai', 'sorvete'], 'Alimentação', 'Lanches'],
  [['cafe', 'cafeteria', 'starbucks'], 'Alimentação', 'Café'],
  [['gasolina', 'etanol', 'diesel', 'combustivel', 'abastecimento', 'abasteci', 'posto'], 'Transporte', 'Combustível'],
  [['uber', 'taxi', 'cabify', '99pop', '99 pop', 'indriver'], 'Transporte', 'Aplicativos de transporte'],
  [['onibus', 'metro', 'trem', 'bilhete unico', 'passagem de onibus', 'brt'], 'Transporte', 'Transporte público'],
  [['estacionamento', 'zona azul', 'pedagio'], 'Transporte', 'Estacionamento'],
  [['oficina', 'mecanico', 'pneu', 'troca de oleo', 'revisao do carro', 'lava jato', 'lavagem'], 'Transporte', 'Manutenção do veículo'],
  [['ipva', 'seguro do carro', 'seguro auto'], 'Transporte', 'Seguro'],
  [['farmacia', 'remedio', 'remedios', 'medicamento', 'drogaria', 'drogasil'], 'Saúde', 'Farmácia'],
  [['consulta', 'medico', 'dentista', 'psicologo', 'terapia', 'fisioterapia'], 'Saúde', 'Consultas'],
  [['exame', 'exames', 'laboratorio'], 'Saúde', 'Exames'],
  [['plano de saude', 'unimed', 'amil', 'hapvida'], 'Saúde', 'Plano de saúde'],
  [['academia', 'smartfit', 'smart fit', 'crossfit'], 'Saúde', 'Academia'],
  [['aluguel'], 'Moradia', 'Aluguel'],
  [['condominio'], 'Moradia', 'Condomínio'],
  [['conta de luz', 'energia', 'luz', 'enel', 'cemig', 'copel', 'light'], 'Moradia', 'Energia'],
  [['conta de agua', 'agua', 'sabesp', 'saneamento'], 'Moradia', 'Água'],
  [['internet', 'wifi', 'fibra', 'vivo fibra', 'claro net'], 'Moradia', 'Internet'],
  [['faculdade', 'universidade', 'mensalidade da faculdade', 'mensalidade'], 'Educação', 'Universidade'],
  [['curso', 'udemy', 'alura', 'coursera'], 'Educação', 'Cursos'],
  [['livro', 'livros', 'kindle'], 'Educação', 'Livros'],
  [['material escolar', 'caderno', 'apostila'], 'Educação', 'Materiais'],
  [['cinema', 'filme'], 'Lazer', 'Cinema'],
  [['show', 'ingresso', 'festa', 'evento', 'teatro'], 'Lazer', 'Eventos'],
  [['viagem', 'hotel', 'passagem aerea', 'airbnb', 'pousada'], 'Lazer', 'Viagens'],
  [['steam', 'playstation', 'xbox', 'nintendo', 'jogo', 'game'], 'Lazer', 'Jogos'],
  [['passeio', 'parque', 'bar', 'cerveja', 'balada'], 'Lazer', 'Passeios'],
  [['netflix', 'spotify', 'disney', 'hbo', 'max', 'prime video', 'amazon prime', 'youtube premium', 'globoplay', 'deezer', 'paramount', 'apple tv', 'streaming'], 'Assinaturas e serviços digitais', 'Streaming'],
  [['icloud', 'google one', 'app', 'aplicativo'], 'Assinaturas e serviços digitais', 'Aplicativos'],
  [['chatgpt', 'software', 'adobe', 'microsoft 365', 'office 365', 'licenca'], 'Assinaturas e serviços digitais', 'Softwares'],
  [['roupa', 'roupas', 'camisa', 'camiseta', 'calca', 'tenis', 'sapato', 'vestido'], 'Compras pessoais', 'Roupas'],
  [['celular', 'notebook', 'fone', 'eletronico', 'carregador', 'monitor', 'teclado', 'mouse'], 'Compras pessoais', 'Eletrônicos'],
  [['relogio', 'oculos', 'bolsa de couro', 'acessorio'], 'Compras pessoais', 'Acessórios'],
  [['tarifa', 'anuidade', 'tarifa bancaria'], 'Financeiro', 'Tarifas bancárias'],
  [['juros', 'multa'], 'Financeiro', 'Juros'],
  [['imposto', 'iof', 'iptu', 'darf', 'irpf'], 'Financeiro', 'Impostos'],
  [['seguro de vida', 'seguro residencial'], 'Financeiro', 'Seguros'],
  [['presente'], 'Outras despesas', 'Presentes'],
  [['doacao', 'dizimo', 'vaquinha'], 'Outras despesas', 'Doações'],
];

export const INCOME_HINTS: Hint[] = [
  [['salario', 'holerite', 'pagamento do mes', '13o', 'decimo terceiro', 'ferias'], 'Salário', null],
  [['bolsa', 'auxilio', 'beneficio', 'bolsa familia'], 'Bolsa ou auxílio', null],
  [['freelance', 'freelancer', 'freela', 'job'], 'Trabalho freelancer', null],
  [['servico', 'servicos', 'cliente', 'consultoria'], 'Serviços prestados', null],
  [['comissao', 'comissoes'], 'Comissões', null],
  [['rendimento', 'rendimentos', 'rendeu'], 'Rendimentos de investimentos', null],
  [['dividendo', 'dividendos', 'jcp', 'juros sobre capital', 'proventos'], 'Dividendos e juros recebidos', null],
  [['reembolso', 'estorno', 'devolucao'], 'Reembolsos', null],
  [['vendi', 'venda'], 'Venda de produtos', null],
];

const INCOME_VERBS = ['recebi', 'recebido', 'recebimento', 'ganhei', 'entrou', 'entrada', 'caiu', 'vendi', 'me pagaram', 'me pagou', 'pix recebido'];
const EXPENSE_VERBS = ['gastei', 'paguei', 'comprei', 'compra', 'gasto', 'despesa', 'pagamento de', 'conta de'];
const TRANSFER_WORDS = ['transferencia', 'transferi', 'transferir', 'aporte', 'aportei', 'apliquei', 'investi', 'guardei', 'mandei para'];
const STOP_PREFIX = ['gastei', 'paguei', 'comprei', 'recebi', 'ganhei', 'com', 'de', 'do', 'da', 'no', 'na', 'em', 'um', 'uma', 'reais', 'real', 'r$', 'pra', 'para'];

export interface ParseContext {
  categories: Category[];
  rules: CategoryRule[];
  history: Transaction[];
  accounts: Account[];
  today?: ISODate;
}

export interface CategoryCandidate {
  category_id: string;
  subcategory_id: string | null;
  label: string;
  source: 'regra' | 'histórico' | 'dicionário' | 'nome';
}

export interface ParsedEntry {
  original_text: string;
  amount_cents: number | null;
  kind: TxKind;
  kindSource: 'palavra-chave' | 'categoria' | 'histórico' | 'padrão';
  isTransfer: boolean;
  transfer_to_account_id: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  candidates: CategoryCandidate[];
  description: string;
  date: ISODate;
  account_id: string | null;
  issues: string[]; // pontos que exigem confirmação do usuário
}

function containsWord(haystack: string, needle: string): boolean {
  const re = new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`);
  return re.test(haystack);
}

const AMOUNT_RE = /(?:r\$\s*)?(-?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|-?\d+(?:[.,]\d{1,2})?)(?:\s*(?:reais|real|conto|contos|pila))?/;

function parseAmountToken(tok: string): number | null {
  let s = tok;
  if (/\.\d{3}/.test(s) && !/\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  s = s.replace(',', '.');
  const v = Number(s);
  return isFinite(v) ? Math.round(Math.abs(v) * 100) : null;
}

export function parseQuickEntry(text: string, ctx: ParseContext): ParsedEntry {
  const today = ctx.today ?? todayISO();
  const issues: string[] = [];
  let work = ` ${normalize(text)} `;

  // ---- Data ----
  let date = today;
  const dateRules: [RegExp, () => ISODate | null][] = [
    [/\banteontem\b/, () => addDays(today, -2)],
    [/\bontem\b/, () => addDays(today, -1)],
    [/\bhoje\b/, () => today],
    [/\bamanha\b/, () => addDays(today, 1)],
  ];
  for (const [re, fn] of dateRules) {
    if (re.test(work)) {
      date = fn() ?? date;
      work = work.replace(re, ' ');
      break;
    }
  }
  const dm = work.match(/\b(?:em |no dia |dia )?(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/);
  if (dm) {
    const d = parseBRDate(dm[1], today);
    if (d) {
      date = d;
      work = work.replace(dm[0], ' ');
    }
  } else {
    const dd = work.match(/\b(?:no )?dia (\d{1,2})\b/);
    if (dd) {
      const day = Number(dd[1]);
      const iso = `${today.slice(0, 8)}${String(day).padStart(2, '0')}`;
      if (isValidISO(iso)) {
        date = iso;
        work = work.replace(dd[0], ' ');
      }
    }
  }

  // ---- Valor ----
  let amount: number | null = null;
  const am = work.match(AMOUNT_RE);
  if (am) {
    amount = parseAmountToken(am[1]);
    work = work.replace(am[0], ' ');
  }
  if (amount === null || amount === 0) issues.push('Não identifiquei o valor. Informe o valor do lançamento.');

  // ---- Conta ----
  let account_id: string | null = null;
  const activeAccounts = ctx.accounts.filter((a) => !a.archived);
  const accountHits = (s: string) =>
    activeAccounts.filter((a) => {
      const n = normalize(a.name);
      const inst = normalize(a.institution || '');
      return (n.length >= 3 && containsWord(s, n)) || (inst.length >= 3 && containsWord(s, inst));
    });

  // ---- Transferência ----
  const isTransfer = TRANSFER_WORDS.some((w) => containsWord(work, w));
  let transfer_to_account_id: string | null = null;
  if (isTransfer) {
    const toMatch = work.match(/\b(?:para|pra|p\/)\s+(?:a |o |conta )?(.+)$/);
    const target = toMatch ? toMatch[1] : work;
    const hits = accountHits(target);
    if (hits.length) transfer_to_account_id = hits[0].id;
    else if (/invest|corretora|aplica/.test(target)) {
      const broker = activeAccounts.find((a) => a.type === 'brokerage');
      if (broker) transfer_to_account_id = broker.id;
    }
    const fromMatch = work.match(/\b(?:de|da|do)\s+(?:conta )?(\S+)/);
    if (fromMatch) {
      const fh = accountHits(fromMatch[1]).filter((a) => a.id !== transfer_to_account_id);
      if (fh.length) account_id = fh[0].id;
    }
    if (!transfer_to_account_id) issues.push('Selecione a conta de destino da transferência.');
  } else {
    const hits = accountHits(work);
    if (hits.length === 1) {
      account_id = hits[0].id;
      const a = hits[0];
      for (const n of [normalize(a.name), normalize(a.institution || '')]) if (n) work = work.replace(new RegExp(`\\b(?:no |na |pelo |pela )?${n}\\b`), ' ');
    } else if (hits.length > 1) issues.push('Mais de uma conta corresponde ao texto. Confirme a conta.');
  }

  // ---- Tipo ----
  const hasIncomeVerb = INCOME_VERBS.some((w) => containsWord(work, w));
  const hasExpenseVerb = EXPENSE_VERBS.some((w) => containsWord(work, w));

  // ---- Descrição (texto restante sem palavras de ligação no início) ----
  const words = work.trim().split(' ').filter(Boolean);
  while (words.length && STOP_PREFIX.includes(words[0])) words.shift();
  let descNorm = words.join(' ');

  // ---- Categoria ----
  const tops = ctx.categories.filter((c) => !c.parent_id);
  const resolveHint = (kind: TxKind, catName: string, subName: string | null): CategoryCandidate | null => {
    const cat = tops.find((c) => c.kind === kind && normalize(c.name) === normalize(catName));
    if (!cat) return null;
    const sub = subName ? ctx.categories.find((c) => c.parent_id === cat.id && normalize(c.name) === normalize(subName)) : undefined;
    return { category_id: cat.id, subcategory_id: sub?.id ?? null, label: sub ? `${cat.name} > ${sub.name}` : cat.name, source: 'dicionário' };
  };
  const label = (catId: string, subId: string | null) => {
    const c = ctx.categories.find((x) => x.id === catId);
    const s = subId ? ctx.categories.find((x) => x.id === subId) : undefined;
    return s ? `${c?.name} > ${s.name}` : c?.name ?? '';
  };

  const candidatesByKind: Record<TxKind, CategoryCandidate[]> = { income: [], expense: [] };
  const push = (kind: TxKind, cand: CategoryCandidate | null) => {
    if (!cand) return;
    const list = candidatesByKind[kind];
    const existing = list.find((x) => x.category_id === cand.category_id);
    if (existing) {
      // Mantém a versão mais específica (com subcategoria).
      if (!existing.subcategory_id && cand.subcategory_id) Object.assign(existing, cand);
      return;
    }
    list.push(cand);
  };

  // 1) Regras do usuário (maior prioridade)
  const fullNorm = normalize(text);
  for (const r of [...ctx.rules].sort((a, b) => b.keyword.length - a.keyword.length)) {
    if (r.keyword && containsWord(fullNorm, normalize(r.keyword))) {
      push(r.kind, { category_id: r.category_id, subcategory_id: r.subcategory_id, label: label(r.category_id, r.subcategory_id), source: 'regra' });
    }
  }
  // 2) Histórico: mesma descrição já lançada antes
  let historyKind: TxKind | null = null;
  if (descNorm) {
    const prev = [...ctx.history]
      .filter((t) => t.category_id && normalize(t.description) === descNorm)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (prev) {
      historyKind = prev.kind;
      push(prev.kind, { category_id: prev.category_id!, subcategory_id: prev.subcategory_id, label: label(prev.category_id!, prev.subcategory_id), source: 'histórico' });
    }
  }
  // 3) Dicionário embutido (palavra mais longa primeiro, para "compras de mercado" vencer "mercado")
  const scan = (hints: Hint[], kind: TxKind) => {
    const found: { len: number; cand: CategoryCandidate }[] = [];
    for (const [kws, cat, sub] of hints) {
      const hit = kws.filter((k) => containsWord(work, k)).sort((a, b) => b.length - a.length)[0];
      if (hit) {
        const c = resolveHint(kind, cat, sub);
        if (c) found.push({ len: hit.length, cand: c });
      }
    }
    found.sort((a, b) => b.len - a.len).forEach((f) => push(kind, f.cand));
  };
  scan(EXPENSE_HINTS, 'expense');
  scan(INCOME_HINTS, 'income');
  // 4) Nome de categoria/subcategoria digitado explicitamente ("20 alimentação mercado")
  for (const c of ctx.categories) {
    const n = normalize(c.name);
    if (n.length < 3 || !containsWord(work, n)) continue;
    if (c.parent_id) push(c.kind, { category_id: c.parent_id, subcategory_id: c.id, label: label(c.parent_id, c.id), source: 'nome' });
    else push(c.kind, { category_id: c.id, subcategory_id: null, label: c.name, source: 'nome' });
  }
  // Nome de categoria explícito + subcategoria explícita: se o usuário digitou a categoria e a sub, junta
  for (const kind of ['expense', 'income'] as TxKind[]) {
    const list = candidatesByKind[kind];
    const explicitTop = list.find((x) => x.source === 'nome' && !x.subcategory_id);
    if (explicitTop) {
      const sub = ctx.categories.find((c) => c.parent_id === explicitTop.category_id && descNorm.split(' ').some((w) => normalize(c.name) === w));
      if (sub) Object.assign(explicitTop, { subcategory_id: sub.id, label: label(explicitTop.category_id, sub.id) });
      // Categoria explícita tem prioridade sobre sugestões do dicionário de outra categoria.
      list.sort((a, b) => (a === explicitTop ? -1 : b === explicitTop ? 1 : 0));
    }
  }

  // Decide o tipo
  let kind: TxKind = 'expense';
  let kindSource: ParsedEntry['kindSource'] = 'padrão';
  if (hasIncomeVerb && !hasExpenseVerb) {
    kind = 'income';
    kindSource = 'palavra-chave';
  } else if (hasExpenseVerb && !hasIncomeVerb) {
    kind = 'expense';
    kindSource = 'palavra-chave';
  } else if (hasIncomeVerb && hasExpenseVerb) {
    issues.push('O texto tem indícios de entrada e de saída. Confirme o tipo.');
  } else if (candidatesByKind.income.length && !candidatesByKind.expense.length) {
    kind = 'income';
    kindSource = 'categoria';
  } else if (candidatesByKind.expense.length && !candidatesByKind.income.length) {
    kindSource = 'categoria';
  } else if (historyKind) {
    kind = historyKind;
    kindSource = 'histórico';
  } else if (candidatesByKind.income.length && candidatesByKind.expense.length) {
    issues.push('Não ficou claro se é entrada ou saída. Confirme o tipo.');
  }

  const candidates = isTransfer ? [] : candidatesByKind[kind];
  const first = candidates[0];
  if (!isTransfer) {
    if (!first) issues.push('Não identifiquei a categoria. Escolha uma categoria.');
    else if (candidates.length > 1 && candidates[0].source === candidates[1].source && candidates[0].category_id !== candidates[1].category_id) {
      issues.push(`Mais de uma categoria possível (${candidates.slice(0, 3).map((c) => c.label).join(', ')}). Confirme a categoria.`);
    }
  }

  // Remove da descrição o nome da categoria principal quando houver outras palavras ("alimentação mercado" -> "mercado").
  if (first) {
    const catName = normalize(ctx.categories.find((c) => c.id === first.category_id)?.name ?? '');
    const stripped = descNorm.replace(new RegExp(`\\b${catName}\\b`), '').replace(/\s+/g, ' ').trim();
    if (stripped) descNorm = stripped;
  }
  const descWords = descNorm.split(' ').filter(Boolean);
  while (descWords.length && STOP_PREFIX.includes(descWords[0])) descWords.shift();
  // Recupera a grafia original (com acentos) das palavras restantes.
  const origWords = text.trim().split(/\s+/);
  const restored = descWords.map((w) => origWords.find((o) => normalize(o) === w) ?? w).join(' ');
  let description = restored || (first ? first.label.split(' > ').pop()! : isTransfer ? 'Transferência' : '');
  description = description.charAt(0).toUpperCase() + description.slice(1);

  return {
    original_text: text.trim(),
    amount_cents: amount,
    kind,
    kindSource,
    isTransfer,
    transfer_to_account_id,
    category_id: first?.category_id ?? null,
    subcategory_id: first?.subcategory_id ?? null,
    candidates,
    description,
    date,
    account_id,
    issues,
  };
}
