// Regras de negócio e cálculos financeiros. Todas as páginas e relatórios usam estas funções,
// garantindo que os números sejam sempre calculados com as mesmas regras.
import type { ISODate, Granularity } from '../lib/dates';
import { addDays, buckets, inPeriod, addMonths, diffDays, monthKey, startOfMonth, endOfMonth, todayISO } from '../lib/dates';
import type {
  Account,
  Budget,
  Category,
  DB,
  Goal,
  Investment,
  InvestmentOperation,
  Transaction,
  TxKind,
} from './types';

export interface Range {
  start: ISODate;
  end: ISODate;
}

// ---------- Movimentações ----------

/** Regra 3: só movimentações realizadas afetam saldos e resultados. */
export function isRealized(t: { status: string }): boolean {
  return t.status === 'done';
}

/** Regra 12: a data que conta para saldo e resultado é a de liquidação (quando houver) ou a da movimentação. */
export function effectiveDate(t: Transaction): ISODate {
  return t.status === 'done' ? t.settled_date ?? t.date : t.date;
}

export type DisplayStatus = 'done' | 'pending' | 'overdue';
export function displayStatus(t: { status: string; date: ISODate }, today: ISODate = todayISO()): DisplayStatus {
  if (t.status === 'done') return 'done';
  return t.date < today ? 'overdue' : 'pending';
}

export function statusLabel(kind: TxKind, s: DisplayStatus): string {
  if (s === 'done') return kind === 'income' ? 'Recebido' : 'Pago';
  if (s === 'overdue') return 'Atrasado';
  return kind === 'income' ? 'Previsto' : 'Pendente';
}

/** Efeito de uma operação de investimento no saldo em dinheiro da conta vinculada. */
export function investmentOpCashEffect(op: InvestmentOperation): number {
  switch (op.type) {
    case 'buy':
    case 'contribution':
      return -(op.amount_cents + op.costs_cents);
    case 'sell':
    case 'redemption':
      return op.amount_cents - op.costs_cents - op.taxes_cents;
    case 'dividend':
    case 'interest':
      return op.amount_cents - op.taxes_cents;
    case 'fee':
    case 'tax':
      return -op.amount_cents;
  }
}

/**
 * Saldo de uma conta (regras 1, 2, 3, 4, 7, 11).
 * O saldo inicial vale no início do dia `initial_date`; movimentações a partir dessa data são somadas.
 * `asOf` é inclusivo; sem ele, considera todas as movimentações realizadas (saldo atual).
 */
export function accountBalance(account: Account, db: Pick<DB, 'transactions' | 'transfers' | 'investment_operations'>, asOf?: ISODate): number {
  // O saldo inicial vale no início do dia initial_date, ou seja, ao fim do dia anterior.
  if (asOf && asOf < addDays(account.initial_date, -1)) return 0;
  let bal = account.initial_balance_cents;
  const within = (d: ISODate) => d >= account.initial_date && (!asOf || d <= asOf);
  for (const t of db.transactions) {
    if (t.account_id !== account.id || !isRealized(t)) continue;
    const d = effectiveDate(t);
    if (!within(d)) continue;
    bal += t.kind === 'income' ? t.amount_cents : -t.amount_cents;
  }
  for (const tr of db.transfers) {
    if (!isRealized(tr) || !within(tr.date)) continue;
    if (tr.from_account_id === account.id) bal -= tr.amount_cents;
    if (tr.to_account_id === account.id) bal += tr.amount_cents;
  }
  for (const op of db.investment_operations) {
    if (op.account_id !== account.id || !within(op.date)) continue;
    bal += investmentOpCashEffect(op);
  }
  return bal;
}

/** Saldo financeiro disponível em todas as contas (não inclui investimentos, para não duplicar valores). */
export function totalCash(db: DB, asOf?: ISODate): number {
  return db.accounts.reduce((s, a) => s + accountBalance(a, db, asOf), 0);
}

export interface PeriodSummary {
  income: number;
  expense: number;
  result: number;
  savingsRate: number | null; // fração; null = não disponível
  pendingExpense: number;
  pendingExpenseCount: number;
  expectedIncome: number;
  count: number;
}

/**
 * Regra 10 e fórmulas 8.3: resultado = entradas realizadas − despesas efetivas no período.
 * Transferências e operações de investimento não entram (regras 4 e 5).
 * Percentual de economia = resultado positivo ÷ entradas × 100; sem entradas -> não disponível.
 */
export function periodSummary(transactions: Transaction[], range: Range): PeriodSummary {
  let income = 0,
    expense = 0,
    pendingExpense = 0,
    pendingExpenseCount = 0,
    expectedIncome = 0,
    count = 0;
  for (const t of transactions) {
    if (isRealized(t)) {
      if (!inPeriod(effectiveDate(t), range)) continue;
      count++;
      if (t.kind === 'income') income += t.amount_cents;
      else expense += t.amount_cents;
    } else if (inPeriod(t.date, range)) {
      if (t.kind === 'expense') {
        pendingExpense += t.amount_cents;
        pendingExpenseCount++;
      } else expectedIncome += t.amount_cents;
    }
  }
  const result = income - expense;
  return { income, expense, result, savingsRate: savingsRate(income, expense), pendingExpense, pendingExpenseCount, expectedIncome, count };
}

export function savingsRate(income: number, expense: number): number | null {
  if (income <= 0) return null;
  return Math.max(income - expense, 0) / income;
}

/** Variação relativa; null quando a base é zero. */
export function variation(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export function realizedInRange(transactions: Transaction[], range: Range, kind?: TxKind): Transaction[] {
  return transactions.filter((t) => isRealized(t) && (!kind || t.kind === kind) && inPeriod(effectiveDate(t), range));
}

// ---------- Categorias ----------

export function categoryMap(categories: Category[]): Map<string, Category> {
  return new Map(categories.map((c) => [c.id, c]));
}

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  color: string;
  total: number;
  share: number; // fração do total
  subs: { categoryId: string | null; name: string; total: number }[];
}

/** Total por categoria principal (com detalhamento de subcategorias) a partir dos lançamentos realizados. */
export function categoryBreakdown(transactions: Transaction[], categories: Category[], range: Range, kind: TxKind): CategoryTotal[] {
  const map = categoryMap(categories);
  const groups = new Map<string, CategoryTotal>();
  let grand = 0;
  for (const t of realizedInRange(transactions, range, kind)) {
    let cat = t.category_id ? map.get(t.category_id) : undefined;
    let sub = t.subcategory_id ? map.get(t.subcategory_id) : undefined;
    if (cat && cat.parent_id) {
      sub = cat;
      cat = map.get(cat.parent_id);
    }
    const key = cat?.id ?? '__none__';
    let g = groups.get(key);
    if (!g) {
      g = { categoryId: cat?.id ?? null, name: cat?.name ?? 'Sem categoria', color: cat?.color ?? '#94a3b8', total: 0, share: 0, subs: [] };
      groups.set(key, g);
    }
    g.total += t.amount_cents;
    grand += t.amount_cents;
    const subKey = sub?.id ?? null;
    let s = g.subs.find((x) => x.categoryId === subKey);
    if (!s) {
      s = { categoryId: subKey, name: sub?.name ?? 'Sem subcategoria', total: 0 };
      g.subs.push(s);
    }
    s.total += t.amount_cents;
  }
  const out = [...groups.values()].sort((a, b) => b.total - a.total);
  for (const g of out) {
    g.share = grand ? g.total / grand : 0;
    g.subs.sort((a, b) => b.total - a.total);
  }
  return out;
}

// ---------- Séries ----------

export interface SeriesPoint {
  key: string;
  label: string;
  start: ISODate;
  end: ISODate;
  income: number;
  expense: number;
  result: number;
}

export function incomeExpenseSeries(transactions: Transaction[], range: Range, g: Granularity): SeriesPoint[] {
  const bs = buckets(range.start, range.end, g);
  const pts = bs.map((b) => ({ ...b, income: 0, expense: 0, result: 0 }));
  for (const t of transactions) {
    if (!isRealized(t)) continue;
    const d = effectiveDate(t);
    if (!inPeriod(d, range)) continue;
    // busca binária simples: buckets são ordenados
    let lo = 0,
      hi = pts.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (d < pts[mid].start) hi = mid - 1;
      else if (d > pts[mid].end) lo = mid + 1;
      else {
        if (t.kind === 'income') pts[mid].income += t.amount_cents;
        else pts[mid].expense += t.amount_cents;
        break;
      }
    }
  }
  for (const p of pts) p.result = p.income - p.expense;
  return pts;
}

export interface BalancePoint {
  key: string;
  label: string;
  opening: number;
  closing: number;
}

/** Evolução do saldo em contas: saldo no início e no fim de cada bucket. */
export function balanceSeries(db: DB, range: Range, g: Granularity): BalancePoint[] {
  return buckets(range.start, range.end, g).map((b) => {
    const dayBefore = addDays(b.start, -1);
    return { key: b.key, label: b.label, opening: totalCash(db, dayBefore), closing: totalCash(db, b.end) };
  });
}

// ---------- Investimentos ----------

export interface Position {
  quantity: number;
  costBasis: number; // custo da posição em aberto (inclui custos de compra)
  contributed: number; // total aportado bruto
  withdrawn: number; // total líquido resgatado/vendido
  realizedGain: number;
  income: number; // proventos líquidos
  fees: number; // taxas e impostos avulsos
  avgPrice: number | null; // centavos por unidade
  currentValue: number; // BRL
  priceKnown: boolean;
  unrealized: number;
  result: number; // lucro/prejuízo total
  returnPct: number | null;
}

function sortOps(ops: InvestmentOperation[]): InvestmentOperation[] {
  return [...ops].sort((a, b) => (a.date === b.date ? a.created_at.localeCompare(b.created_at) : a.date.localeCompare(b.date)));
}

/**
 * Posição de um investimento a partir das operações (regras 5, 6, 7).
 * Aportes aumentam o custo, não o lucro. Vendas usam custo médio; no modo "total" (renda fixa)
 * o resgate abate primeiro o principal aplicado.
 */
export function positionOf(inv: Investment, ops: InvestmentOperation[], asOf?: ISODate, priceAsOf?: number | null): Position {
  let quantity = 0,
    costBasis = 0,
    contributed = 0,
    withdrawn = 0,
    realizedGain = 0,
    income = 0,
    fees = 0;
  for (const op of sortOps(ops.filter((o) => o.investment_id === inv.id && (!asOf || o.date <= asOf)))) {
    switch (op.type) {
      case 'buy':
      case 'contribution': {
        const total = op.amount_cents + op.costs_cents;
        quantity += op.quantity;
        costBasis += total;
        contributed += total;
        break;
      }
      case 'sell':
      case 'redemption': {
        let basis: number;
        if (inv.valuation_mode === 'unit' && quantity > 0) {
          const q = Math.min(op.quantity, quantity);
          basis = Math.round((costBasis / quantity) * q);
          quantity -= q;
          if (quantity <= 1e-9) {
            quantity = 0;
            basis = costBasis;
          }
        } else {
          basis = Math.min(costBasis, op.amount_cents);
        }
        const proceeds = op.amount_cents - op.costs_cents - op.taxes_cents;
        realizedGain += proceeds - basis;
        costBasis -= basis;
        withdrawn += proceeds;
        break;
      }
      case 'dividend':
      case 'interest':
        income += op.amount_cents - op.taxes_cents;
        break;
      case 'fee':
      case 'tax':
        fees += op.amount_cents;
        break;
    }
  }
  let currentValue: number;
  let priceKnown = true;
  if (inv.valuation_mode === 'unit') {
    const price = priceAsOf !== undefined ? priceAsOf : inv.current_unit_price_cents;
    if (price === null || price === undefined) {
      currentValue = costBasis;
      priceKnown = false;
    } else {
      const fx = inv.currency !== 'BRL' ? inv.fx_rate ?? null : 1;
      if (fx === null) {
        currentValue = costBasis;
        priceKnown = false;
      } else currentValue = Math.round(quantity * price * fx);
    }
  } else {
    const total = priceAsOf !== undefined ? priceAsOf : inv.current_total_cents;
    if (total === null || total === undefined) {
      currentValue = costBasis;
      priceKnown = false;
    } else currentValue = total;
  }
  if (inv.valuation_mode === 'unit' && quantity === 0) currentValue = 0;
  const unrealized = currentValue - costBasis;
  const result = unrealized + realizedGain + income - fees;
  return {
    quantity,
    costBasis,
    contributed,
    withdrawn,
    realizedGain,
    income,
    fees,
    avgPrice: quantity > 0 ? costBasis / quantity : null,
    currentValue,
    priceKnown,
    unrealized,
    result,
    returnPct: contributed > 0 ? result / contributed : null,
  };
}

export interface PortfolioSummary {
  currentValue: number;
  costBasis: number;
  contributed: number;
  result: number;
  returnPct: number | null;
  income: number;
  byClass: { name: string; value: number }[];
  byInstitution: { name: string; value: number }[];
  oldestQuote: string | null;
  unknownPrices: number;
}

export function portfolioSummary(db: DB): PortfolioSummary {
  let currentValue = 0,
    costBasis = 0,
    contributed = 0,
    result = 0,
    income = 0,
    unknownPrices = 0;
  let oldestQuote: string | null = null;
  const byClass = new Map<string, number>();
  const byInst = new Map<string, number>();
  for (const inv of db.investments) {
    const p = positionOf(inv, db.investment_operations);
    currentValue += p.currentValue;
    costBasis += p.costBasis;
    contributed += p.contributed;
    result += p.result;
    income += p.income;
    if (!p.priceKnown && p.costBasis > 0) unknownPrices++;
    if (inv.quote_at && (!oldestQuote || inv.quote_at < oldestQuote)) oldestQuote = inv.quote_at;
    if (p.currentValue > 0) {
      byClass.set(inv.asset_class, (byClass.get(inv.asset_class) ?? 0) + p.currentValue);
      const inst = inv.institution || 'Não informada';
      byInst.set(inst, (byInst.get(inst) ?? 0) + p.currentValue);
    }
  }
  const toArr = (m: Map<string, number>) => [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  return {
    currentValue,
    costBasis,
    contributed,
    result,
    returnPct: contributed > 0 ? result / contributed : null,
    income,
    byClass: toArr(byClass),
    byInstitution: toArr(byInst),
    oldestQuote,
    unknownPrices,
  };
}

/** Valor do investimento em uma data, usando o último preço conhecido até aquela data. */
export function investmentValueAsOf(inv: Investment, db: DB, asOf: ISODate): number {
  const hist = db.quote_history
    .filter((q) => q.investment_id === inv.id && q.quoted_at.slice(0, 10) <= asOf)
    .sort((a, b) => a.quoted_at.localeCompare(b.quoted_at));
  const last = hist[hist.length - 1];
  let price: number | null = last ? last.price_cents : null;
  if (price === null && inv.valuation_mode === 'unit') {
    const ops = sortOps(db.investment_operations.filter((o) => o.investment_id === inv.id && o.date <= asOf && o.unit_price_cents > 0));
    const lastOp = ops[ops.length - 1];
    if (lastOp) price = inv.currency === 'BRL' ? lastOp.unit_price_cents : Math.round(lastOp.unit_price_cents / (inv.fx_rate || 1));
  }
  const p = positionOf(inv, db.investment_operations, asOf, price);
  return p.currentValue;
}

export function portfolioSeries(db: DB, range: Range, g: Granularity): { label: string; value: number; contributed: number }[] {
  return buckets(range.start, range.end, g).map((b) => ({
    label: b.label,
    value: db.investments.reduce((s, inv) => s + investmentValueAsOf(inv, db, b.end), 0),
    contributed: db.investments.reduce((s, inv) => s + positionOf(inv, db.investment_operations, b.end, 0).costBasis, 0),
  }));
}

// ---------- Patrimônio líquido ----------

export interface NetWorth {
  cash: number;
  investments: number;
  otherAssets: number;
  liabilities: number;
  total: number;
}

/** Patrimônio líquido = contas + investimentos + outros bens − dívidas/obrigações (estimativa a partir do que foi cadastrado). */
export function netWorth(db: DB, asOf?: ISODate): NetWorth {
  const cash = totalCash(db, asOf);
  const investments = asOf
    ? db.investments.reduce((s, inv) => s + investmentValueAsOf(inv, db, asOf), 0)
    : db.investments.reduce((s, inv) => s + positionOf(inv, db.investment_operations).currentValue, 0);
  let otherAssets = 0,
    liabilities = 0;
  for (const it of db.net_worth_items) {
    if (it.status !== 'active') continue;
    if (asOf && it.created_at.slice(0, 10) > asOf) continue;
    if (it.type === 'other_asset') otherAssets += it.value_cents;
    else liabilities += it.value_cents;
  }
  return { cash, investments, otherAssets, liabilities, total: cash + investments + otherAssets - liabilities };
}

// ---------- Orçamentos ----------

export interface BudgetStatus {
  budget: Budget;
  spent: number;
  remaining: number;
  usedPct: number; // fração
  forecast: number | null;
  level: number | null; // maior nível de alerta atingido
}

/** Gasto realizado da categoria (incluindo subcategorias) no mês do orçamento. */
export function budgetStatus(budget: Budget, transactions: Transaction[], categories: Category[], today: ISODate = todayISO()): BudgetStatus {
  const start = `${budget.month}-01`;
  const end = endOfMonth(start);
  const ids = new Set([budget.category_id, ...categories.filter((c) => c.parent_id === budget.category_id).map((c) => c.id)]);
  const spent = realizedInRange(transactions, { start, end }, 'expense')
    .filter((t) => (t.category_id && ids.has(t.category_id)) || (t.subcategory_id && ids.has(t.subcategory_id)))
    .reduce((s, t) => s + t.amount_cents, 0);
  const usedPct = budget.limit_cents > 0 ? spent / budget.limit_cents : 0;
  let forecast: number | null = null;
  if (today >= start && today <= end) {
    const elapsed = diffDays(start, today) + 1;
    const total = diffDays(start, end) + 1;
    // Exige ao menos 5 dias de dados para projetar.
    if (elapsed >= 5 && spent > 0) forecast = Math.round((spent / elapsed) * total);
  } else if (today > end) forecast = spent;
  const levels = [...budget.alert_levels].sort((a, b) => a - b);
  let level: number | null = null;
  for (const l of levels) if (usedPct * 100 >= l) level = l;
  return { budget, spent, remaining: budget.limit_cents - spent, usedPct, forecast, level };
}

// ---------- Metas ----------

export interface GoalProgress {
  saved: number;
  remaining: number;
  pct: number;
  monthlyNeeded: number | null;
  monthsLeft: number | null;
}

/** O valor de metas vinculadas é lido da conta/investimento — não é somado de novo ao patrimônio. */
export function goalProgress(goal: Goal, db: DB, today: ISODate = todayISO()): GoalProgress {
  let saved = goal.saved_cents;
  if (goal.link_type === 'account' && goal.link_id) {
    const acc = db.accounts.find((a) => a.id === goal.link_id);
    saved = acc ? accountBalance(acc, db) : 0;
  } else if (goal.link_type === 'investment' && goal.link_id) {
    const inv = db.investments.find((i) => i.id === goal.link_id);
    saved = inv ? positionOf(inv, db.investment_operations).currentValue : 0;
  }
  const remaining = Math.max(goal.target_cents - saved, 0);
  let monthlyNeeded: number | null = null;
  let monthsLeft: number | null = null;
  if (goal.deadline && goal.deadline > today) {
    const months = monthsBetween(today, goal.deadline);
    monthsLeft = months;
    monthlyNeeded = months > 0 ? Math.ceil(remaining / months) : remaining;
  }
  return { saved, remaining, pct: goal.target_cents > 0 ? Math.min(saved / goal.target_cents, 1) : 0, monthlyNeeded, monthsLeft };
}

export function monthsBetween(a: ISODate, b: ISODate): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  let m = (by - ay) * 12 + (bm - am);
  if (Number(b.slice(8)) < Number(a.slice(8))) m -= 1;
  return Math.max(m, 1);
}

// ---------- Resumo inteligente ----------

export interface Insight {
  tone: 'positive' | 'negative' | 'neutral' | 'warning';
  text: string;
}

/** Gera observações apenas a partir de dados reais; sem dados suficientes, não conclui nada. */
export function buildInsights(db: DB, today: ISODate = todayISO(), fmt: (c: number) => string): Insight[] {
  const out: Insight[] = [];
  const month = { start: startOfMonth(today), end: endOfMonth(today) };
  const prevStart = addMonths(month.start, -1);
  const prev = { start: prevStart, end: endOfMonth(prevStart) };
  // Comparação justa: mês anterior até o mesmo dia.
  const prevSameDay = { start: prevStart, end: addMonths(today, -1) };
  const cur = periodSummary(db.transactions, { start: month.start, end: today });
  const prevS = periodSummary(db.transactions, prevSameDay);
  const prevFull = periodSummary(db.transactions, prev);

  const cats = categoryBreakdown(db.transactions, db.categories, month, 'expense');
  if (cats.length > 0 && cats[0].total > 0) {
    out.push({ tone: 'neutral', text: `Maior gasto do mês: ${cats[0].name} (${fmt(cats[0].total)}, ${Math.round(cats[0].share * 100)}% das despesas).` });
  }
  if (cur.expense > 0 && prevS.expense > 0) {
    const v = variation(cur.expense, prevS.expense)!;
    out.push({
      tone: v > 0.05 ? 'negative' : v < -0.05 ? 'positive' : 'neutral',
      text: `Gastos ${v >= 0 ? 'acima' : 'abaixo'} do mês anterior em ${Math.abs(Math.round(v * 100))}% (comparando até o dia ${today.slice(8)}).`,
    });
  }
  if (cur.income > 0 && prevS.income > 0) {
    const v = variation(cur.income, prevS.income)!;
    out.push({ tone: v >= 0 ? 'positive' : 'negative', text: `Entradas ${v >= 0 ? 'subiram' : 'caíram'} ${Math.abs(Math.round(v * 100))}% em relação ao mesmo período do mês anterior.` });
  }
  if (cur.income > 0) {
    out.push({
      tone: cur.result >= 0 ? 'positive' : 'negative',
      text: cur.result >= 0 ? `Sobraram ${fmt(cur.result)} das entradas deste mês após as despesas.` : `As despesas deste mês superam as entradas em ${fmt(-cur.result)}.`,
    });
  }
  const mk = monthKey(today);
  for (const b of db.budgets.filter((x) => x.month === mk)) {
    const st = budgetStatus(b, db.transactions, db.categories, today);
    if (st.usedPct >= 1) {
      const cat = db.categories.find((c) => c.id === b.category_id);
      out.push({ tone: 'warning', text: `Orçamento de ${cat?.name ?? 'categoria'} ultrapassado: ${fmt(st.spent)} de ${fmt(b.limit_cents)}.` });
    }
  }
  const soon = db.transactions.filter((t) => t.status === 'pending' && t.kind === 'expense' && t.date >= today && diffDays(today, t.date) <= 7);
  if (soon.length) {
    out.push({ tone: 'warning', text: `${soon.length} despesa(s) vencem nos próximos 7 dias, somando ${fmt(soon.reduce((s, t) => s + t.amount_cents, 0))}.` });
  }
  const overdue = db.transactions.filter((t) => t.status === 'pending' && t.date < today);
  if (overdue.length) out.push({ tone: 'warning', text: `${overdue.length} lançamento(s) pendente(s) com data já passada.` });
  if (db.transactions.length > 0 && prevFull.count > 0) {
    const nwNow = netWorth(db).total;
    const nwPrev = netWorth(db, prev.end).total;
    const diff = nwNow - nwPrev;
    if (diff !== 0) out.push({ tone: diff > 0 ? 'positive' : 'negative', text: `Patrimônio líquido ${diff > 0 ? 'cresceu' : 'diminuiu'} ${fmt(Math.abs(diff))} desde o fim do mês anterior.` });
  }
  return out;
}
