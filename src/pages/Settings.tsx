import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Database, Download, FlaskConical, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { z } from 'zod';
import { Badge, Button, Card, CardHeader, Dot, EmptyState, Field, IconButton, Input, Modal, Select, Tabs } from '../components/ui';
import { Accounts } from './Transactions';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { useLookups } from '../lib/hooks';
import { CATEGORY_PALETTE, nowISO, uid } from '../domain/defaults';
import { buildDemo } from '../domain/demo';
import { TABLES, type Category, type CategoryKind, type CategoryRule, type DB, type TableName, type TxKind } from '../domain/types';
import { downloadFile } from '../lib/csv';
import { supabaseConfigured } from '../data/supabase';

type Tab = 'general' | 'accounts' | 'categories' | 'rules' | 'data';

export function Settings() {
  const { route, setParams } = useUI();
  const tab = (route.params.tab as Tab) || 'general';
  return (
    <div className="space-y-5">
      <Tabs
        value={tab}
        onChange={(v) => setParams({ tab: v === 'general' ? '' : v })}
        options={[
          { value: 'general', label: 'Geral' },
          { value: 'accounts', label: 'Contas' },
          { value: 'categories', label: 'Categorias' },
          { value: 'rules', label: 'Regras de categorização' },
          { value: 'data', label: 'Dados e backup' },
        ]}
      />
      {tab === 'general' && <General />}
      {tab === 'accounts' && <Accounts />}
      {tab === 'categories' && <Categories />}
      {tab === 'rules' && <Rules />}
      {tab === 'data' && <DataTab />}
    </div>
  );
}

function General() {
  const { settings, updateSettings, userEmail, repo } = useStore();
  const [levels, setLevels] = useState(settings.default_alert_levels.join(', '));
  const [newClass, setNewClass] = useState('');
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Perfil e aparência" />
        <div className="grid gap-4 p-5">
          <Field label="Seu nome (opcional)">
            <Input value={settings.user_name} onChange={(e) => updateSettings({ user_name: e.target.value })} placeholder="Como prefere ser chamado" />
          </Field>
          {userEmail && <p className="text-[13px] text-ink-3">Conectado como {userEmail}</p>}
          <Field label="Moeda padrão" hint="A aplicação trabalha em reais (BRL). Ativos em outras moedas são convertidos.">
            <Select value="BRL" disabled>
              <option value="BRL">Real brasileiro (R$)</option>
            </Select>
          </Field>
          <Field label="Tema">
            <Select value={settings.theme} onChange={(e) => updateSettings({ theme: e.target.value as 'light' | 'dark' | 'system' })}>
              <option value="system">Seguir o sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Escuro</option>
            </Select>
          </Field>
          <Field label="Formato preferido dos relatórios">
            <Select value={settings.report_format} onChange={(e) => updateSettings({ report_format: e.target.value as 'csv' | 'pdf' })}>
              <option value="csv">CSV (planilhas)</option>
              <option value="pdf">PDF (impressão)</option>
            </Select>
          </Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Notificações, alertas e privacidade" />
        <div className="grid gap-4 p-5">
          <Toggle label="Alertas de orçamento" hint="Exibe avisos ao atingir os percentuais configurados." checked={settings.notify_budget} onChange={(v) => updateSettings({ notify_budget: v })} />
          <Toggle label="Lembretes de vencimento" hint="Mostra contas a pagar e receber na visão geral." checked={settings.notify_due} onChange={(v) => updateSettings({ notify_due: v })} />
          <Field label="Mostrar vencimentos dos próximos (dias)">
            <Input type="number" min={1} max={90} value={settings.due_days_ahead} onChange={(e) => updateSettings({ due_days_ahead: Math.min(90, Math.max(1, Number(e.target.value) || 7)) })} />
          </Field>
          <Field label="Alertas padrão de orçamento (%)" hint="Usado em novos orçamentos. Ex.: 70, 90, 100">
            <Input
              value={levels}
              onChange={(e) => setLevels(e.target.value)}
              onBlur={() => {
                const lv = levels
                  .split(/[,;\s]+/)
                  .map(Number)
                  .filter((x) => x > 0 && x <= 500);
                if (lv.length) updateSettings({ default_alert_levels: [...new Set(lv)].sort((a, b) => a - b) });
                else setLevels(settings.default_alert_levels.join(', '));
              }}
            />
          </Field>
          <Toggle label="Ocultar valores" hint="Esconde valores monetários na tela (útil em locais públicos)." checked={settings.hide_values} onChange={(v) => updateSettings({ hide_values: v })} />
          <p className="rounded-lg bg-surface-2 p-3 text-xs text-ink-2">
            Privacidade: o app não pede nem armazena senhas bancárias, números de cartão ou documentos. {repo.mode === 'supabase' ? 'Seus dados ficam no seu projeto Supabase, isolados por usuário (RLS).' : 'No modo local, os dados ficam apenas neste navegador.'}
          </p>
        </div>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader title="Classes de ativos" subtitle="Usadas no cadastro de investimentos." />
        <div className="flex flex-wrap gap-2 p-5">
          {settings.asset_classes.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[13px]">
              {c}
              <button aria-label={`Remover ${c}`} className="text-ink-3 hover:text-neg" onClick={() => updateSettings({ asset_classes: settings.asset_classes.filter((x) => x !== c) })}>
                ×
              </button>
            </span>
          ))}
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = newClass.trim();
              if (v && !settings.asset_classes.includes(v)) updateSettings({ asset_classes: [...settings.asset_classes, v] });
              setNewClass('');
            }}
          >
            <Input className="h-8 w-48" value={newClass} onChange={(e) => setNewClass(e.target.value)} placeholder="Nova classe" />
            <Button size="sm" type="submit">
              Adicionar
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-[13.5px] font-medium">{label}</span>
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1 size-4 accent-[var(--color-accent)]" />
    </label>
  );
}

function Categories() {
  const { db, bulk, save } = useStore();
  const { confirm } = useUI();
  const L = useLookups();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const [editing, setEditing] = useState<Category | null>(null);
  const tops = L.tops(kind);

  async function move(c: Category, dir: -1 | 1) {
    const siblings = c.parent_id ? L.subs(c.parent_id) : tops;
    const i = siblings.findIndex((x) => x.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
    await bulk([{ table: 'categories', upsert: reordered.map((x, k) => ({ ...x, sort_order: k })) }]);
  }
  async function del(c: Category) {
    const ids = [c.id, ...db.categories.filter((x) => x.parent_id === c.id).map((x) => x.id)];
    const used = db.transactions.filter((t) => ids.includes(t.category_id ?? '') || ids.includes(t.subcategory_id ?? ''));
    const ok = await confirm({
      title: `Excluir “${c.name}”?`,
      text: used.length
        ? `${used.length} lançamento(s) usam esta categoria e ficarão sem categoria (os valores não são alterados). Orçamentos e regras desta categoria também serão excluídos.`
        : 'A categoria e suas subcategorias serão excluídas.',
      danger: true,
      confirmLabel: 'Excluir',
    });
    if (!ok) return;
    const set = new Set(ids);
    await bulk(
      [
        {
          table: 'transactions',
          upsert: used.map((t) => ({
            ...t,
            category_id: set.has(t.category_id ?? '') ? null : t.category_id,
            subcategory_id: set.has(t.subcategory_id ?? '') || set.has(t.category_id ?? '') ? null : t.subcategory_id,
          })),
        },
        { table: 'recurrings', upsert: db.recurrings.filter((r) => set.has(r.category_id ?? '') || set.has(r.subcategory_id ?? '')).map((r) => ({ ...r, category_id: set.has(r.category_id ?? '') ? null : r.category_id, subcategory_id: null })) },
        { table: 'budgets', remove: db.budgets.filter((b) => set.has(b.category_id)).map((b) => b.id) },
        { table: 'category_rules', remove: db.category_rules.filter((r) => set.has(r.category_id)).map((r) => r.id) },
        { table: 'categories', remove: ids },
      ],
      'Categoria excluída.',
    );
  }
  const newCat = (parent: Category | null): Category => ({
    id: uid(),
    name: '',
    kind,
    parent_id: parent?.id ?? null,
    color: parent?.color ?? CATEGORY_PALETTE[tops.length % CATEGORY_PALETTE.length],
    icon: '',
    sort_order: parent ? L.subs(parent.id).length : tops.length,
    created_at: nowISO(),
    updated_at: nowISO(),
  });

  return (
    <Card>
      <CardHeader
        title="Categorias e subcategorias"
        subtitle="Totalmente editáveis. Excluir uma categoria não apaga lançamentos."
        action={
          <div className="flex gap-2">
            <Tabs
              value={kind}
              onChange={setKind}
              options={[
                { value: 'expense', label: 'Despesas' },
                { value: 'income', label: 'Entradas' },
              ]}
            />
            <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(newCat(null))}>
              Categoria
            </Button>
          </div>
        }
      />
      <ul className="mt-3 divide-y divide-line">
        {tops.map((c, i) => (
          <li key={c.id} className="px-5 py-3">
            <div className="flex items-center gap-2">
              <Dot color={c.color} />
              <span className="flex-1 text-[13.5px] font-medium">{c.name}</span>
              <IconButton label="Subir" disabled={i === 0} onClick={() => move(c, -1)}>
                <ArrowUp className="size-4" />
              </IconButton>
              <IconButton label="Descer" disabled={i === tops.length - 1} onClick={() => move(c, 1)}>
                <ArrowDown className="size-4" />
              </IconButton>
              <Button size="sm" variant="ghost" onClick={() => setEditing(newCat(c))}>
                + Sub
              </Button>
              <IconButton label="Editar" onClick={() => setEditing(c)}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton label="Excluir" className="hover:text-neg" onClick={() => del(c)}>
                <Trash2 className="size-4" />
              </IconButton>
            </div>
            {L.subs(c.id).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 pl-5">
                {L.subs(c.id).map((s, j, arr) => (
                  <span key={s.id} className="group inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 py-0.5 pl-2 pr-1 text-xs">
                    {s.name}
                    <button aria-label="Mover para a esquerda" className="text-ink-3 hover:text-ink disabled:opacity-30" disabled={j === 0} onClick={() => move(s, -1)}>
                      ‹
                    </button>
                    <button aria-label="Mover para a direita" className="text-ink-3 hover:text-ink disabled:opacity-30" disabled={j === arr.length - 1} onClick={() => move(s, 1)}>
                      ›
                    </button>
                    <button aria-label={`Editar ${s.name}`} className="text-ink-3 hover:text-ink" onClick={() => setEditing(s)}>
                      <Pencil className="size-3" />
                    </button>
                    <button aria-label={`Excluir ${s.name}`} className="text-ink-3 hover:text-neg" onClick={() => del(s)}>
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {tops.length === 0 && <EmptyState title="Nenhuma categoria" />}
      <div className="h-2" />
      {editing && (
        <CategoryDialog
          value={editing}
          onClose={() => setEditing(null)}
          onSave={async (c) => {
            if (!c.name.trim()) return false;
            const children = !c.parent_id ? db.categories.filter((x) => x.parent_id === c.id && x.color !== c.color).map((x) => ({ ...x, color: c.color })) : [];
            return children.length ? bulk([{ table: 'categories', upsert: [c, ...children] }], 'Categoria salva.') : save('categories', c, 'Categoria salva.');
          }}
        />
      )}
    </Card>
  );
}

function CategoryDialog({ value, onClose, onSave }: { value: Category; onClose: () => void; onSave: (c: Category) => Promise<boolean> }) {
  const [c, setC] = useState(value);
  const [err, setErr] = useState('');
  return (
    <Modal
      open
      onClose={onClose}
      title={value.name ? `Editar “${value.name}”` : value.parent_id ? 'Nova subcategoria' : 'Nova categoria'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              if (!c.name.trim()) return setErr('Informe o nome.');
              if (await onSave({ ...c, name: c.name.trim() })) onClose();
            }}
          >
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="Nome *" error={err}>
          <Input autoFocus value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
        </Field>
        {!c.parent_id && (
          <Field label="Cor">
            <div className="flex flex-wrap gap-2">
              {CATEGORY_PALETTE.map((col) => (
                <button
                  key={col}
                  type="button"
                  aria-label={`Cor ${col}`}
                  onClick={() => setC({ ...c, color: col })}
                  className={`size-7 rounded-full border-2 ${c.color === col ? 'border-ink' : 'border-transparent'}`}
                  style={{ background: col }}
                />
              ))}
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function Rules() {
  const { db, save, remove } = useStore();
  const L = useLookups();
  const [r, setR] = useState<{ keyword: string; kind: TxKind; category_id: string; subcategory_id: string }>({ keyword: '', kind: 'expense', category_id: '', subcategory_id: '' });
  const [err, setErr] = useState('');
  async function add() {
    if (!r.keyword.trim() || !r.category_id) return setErr('Informe a palavra-chave e a categoria.');
    setErr('');
    const row: CategoryRule = { id: uid(), keyword: r.keyword.trim().toLowerCase(), kind: r.kind, category_id: r.category_id, subcategory_id: r.subcategory_id || null, created_at: nowISO(), updated_at: nowISO() };
    if (await save('category_rules', row, 'Regra criada.')) setR({ ...r, keyword: '' });
  }
  return (
    <Card>
      <CardHeader
        title="Regras de categorização do lançamento rápido"
        subtitle="Têm prioridade sobre o histórico e o dicionário embutido. Ex.: “kumon” → Educação > Cursos. A interpretação funciona localmente, sem IA."
      />
      <div className="grid gap-3 p-5 sm:grid-cols-5">
        <Input placeholder="Palavra-chave" value={r.keyword} onChange={(e) => setR({ ...r, keyword: e.target.value })} aria-label="Palavra-chave" />
        <Select value={r.kind} onChange={(e) => setR({ ...r, kind: e.target.value as TxKind, category_id: '', subcategory_id: '' })} aria-label="Tipo">
          <option value="expense">Saída</option>
          <option value="income">Entrada</option>
        </Select>
        <Select value={r.category_id} onChange={(e) => setR({ ...r, category_id: e.target.value, subcategory_id: '' })} aria-label="Categoria">
          <option value="">Categoria</option>
          {L.tops(r.kind).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={r.subcategory_id} onChange={(e) => setR({ ...r, subcategory_id: e.target.value })} disabled={!L.subs(r.category_id).length} aria-label="Subcategoria">
          <option value="">Subcategoria</option>
          {L.subs(r.category_id).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Button variant="primary" onClick={add} icon={<Plus className="size-4" />}>
          Adicionar regra
        </Button>
        {err && <p className="text-xs text-neg sm:col-span-5">{err}</p>}
      </div>
      {db.category_rules.length === 0 ? (
        <EmptyState title="Nenhuma regra personalizada" text="O sistema já reconhece termos comuns (mercado, pizza, gasolina, farmácia, Netflix…) e aprende com seus lançamentos anteriores." />
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {db.category_rules.map((x) => (
            <li key={x.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
              <code className="rounded bg-surface-2 px-1.5 py-0.5">{x.keyword}</code>
              <span className="text-ink-3">→</span>
              <Badge tone={x.kind === 'income' ? 'pos' : 'neg'}>{x.kind === 'income' ? 'Entrada' : 'Saída'}</Badge>
              <span className="flex-1">
                {L.catName(x.category_id)}
                {x.subcategory_id ? ` > ${L.catName(x.subcategory_id)}` : ''}
              </span>
              <IconButton label="Excluir regra" className="hover:text-neg" onClick={() => remove('category_rules', [x.id], 'Regra excluída.')}>
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="h-2" />
    </Card>
  );
}

// ---------- Exportação / importação ----------

const rowSchema = z.object({ id: z.string().min(1), created_at: z.string().optional(), updated_at: z.string().optional() }).passthrough();
const backupSchema = z.object({
  app: z.literal('financas-pessoais'),
  version: z.number(),
  exported_at: z.string(),
  data: z.object(Object.fromEntries(TABLES.map((t) => [t, z.array(rowSchema).default([])])) as Record<TableName, z.ZodDefault<z.ZodArray<typeof rowSchema>>>),
  settings: z.any().optional(),
});
const amountSchema = z.number().int().nonnegative();

function validateBackup(raw: unknown): { ok: true; data: DB; settings: any } | { ok: false; error: string } {
  const r = backupSchema.safeParse(raw);
  if (!r.success) return { ok: false, error: 'Arquivo inválido: não é um backup desta aplicação ou está corrompido.' };
  const data = r.data.data as unknown as DB;
  for (const t of data.transactions) {
    if (!amountSchema.safeParse(t.amount_cents).success || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !['income', 'expense'].includes(t.kind)) return { ok: false, error: `Lançamento inválido (${t.id}).` };
  }
  for (const t of data.transfers) if (!amountSchema.safeParse(t.amount_cents).success || !/^\d{4}-\d{2}-\d{2}$/.test(t.date)) return { ok: false, error: `Transferência inválida (${t.id}).` };
  for (const a of data.accounts) if (!Number.isInteger(a.initial_balance_cents) || !a.name) return { ok: false, error: `Conta inválida (${a.id}).` };
  return { ok: true, data, settings: r.data.settings };
}

function DataTab() {
  const { db, settings, bulk, today, toast, updateSettings } = useStore();
  const { confirm } = useUI();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<{ data: DB; settings: any; newCount: Record<string, number>; dupIds: number; dupContent: number } | null>(null);
  const demoCount = TABLES.reduce((s, t) => s + (db[t] as { is_demo?: boolean }[]).filter((r) => r.is_demo).length, 0);

  function exportJSON() {
    const payload = { app: 'financas-pessoais', version: 1, exported_at: new Date().toISOString(), data: db, settings };
    downloadFile(`backup-financas-${today}.json`, JSON.stringify(payload, null, 2), 'application/json');
    toast('Backup exportado.');
  }

  async function onFile(f: File) {
    try {
      const raw = JSON.parse(await f.text());
      const v = validateBackup(raw);
      if (!v.ok) return toast(v.error, 'error');
      const newCount: Record<string, number> = {};
      let dupIds = 0;
      for (const t of TABLES) {
        const ids = new Set((db[t] as { id: string }[]).map((r) => r.id));
        const incoming = v.data[t] as { id: string }[];
        dupIds += incoming.filter((r) => ids.has(r.id)).length;
        newCount[t] = incoming.filter((r) => !ids.has(r.id)).length;
      }
      const key = (t: { date: string; amount_cents: number; description: string; kind: string }) => `${t.date}|${t.amount_cents}|${t.kind}|${t.description.toLowerCase().trim()}`;
      const existingKeys = new Set(db.transactions.map(key));
      const ids = new Set(db.transactions.map((t) => t.id));
      const dupContent = v.data.transactions.filter((t) => !ids.has(t.id) && existingKeys.has(key(t))).length;
      setPreview({ data: v.data, settings: v.settings, newCount, dupIds, dupContent });
    } catch {
      toast('Não foi possível ler o arquivo. Selecione um backup .json válido.', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function applyImport(mode: 'merge' | 'replace', skipContentDups: boolean) {
    if (!preview) return;
    if (mode === 'replace' && !(await confirm({ title: 'Substituir todos os dados?', text: 'Todos os dados atuais serão excluídos e substituídos pelo backup.', danger: true, confirmLabel: 'Substituir' }))) return;
    const key = (t: { date: string; amount_cents: number; description: string; kind: string }) => `${t.date}|${t.amount_cents}|${t.kind}|${t.description.toLowerCase().trim()}`;
    const existingKeys = new Set(db.transactions.map(key));
    const ops = TABLES.map((t) => {
      let rows = preview.data[t] as any[];
      if (mode === 'merge') {
        const ids = new Set((db[t] as { id: string }[]).map((r) => r.id));
        rows = rows.filter((r) => !ids.has(r.id));
        if (t === 'transactions' && skipContentDups) rows = rows.filter((r) => !existingKeys.has(key(r)));
      }
      return { table: t, upsert: rows, remove: mode === 'replace' ? (db[t] as { id: string }[]).map((r) => r.id) : [] };
    });
    // Em substituição, remove primeiro (bulk aplica inclusões antes de exclusões; separamos as etapas).
    if (mode === 'replace') {
      const ok = await bulk(ops.map((o) => ({ table: o.table, remove: o.remove })));
      if (!ok) return;
    }
    const ok = await bulk(
      ops.map((o) => ({ table: o.table, upsert: o.upsert })),
      'Importação concluída.',
    );
    if (ok && preview.settings && mode === 'replace') await updateSettings({ ...preview.settings, id: 'settings' });
    if (ok) setPreview(null);
  }

  async function loadDemo() {
    if (!(await confirm({ title: 'Carregar dados de demonstração?', text: 'Serão criadas contas, lançamentos, um investimento, um orçamento e uma meta marcados como demonstração. Você poderá removê-los depois sem afetar seus dados.', confirmLabel: 'Carregar' }))) return;
    const demo = buildDemo(db.categories, today);
    await bulk(
      (Object.keys(demo) as TableName[]).map((t) => ({ table: t, upsert: demo[t] as any[] })),
      'Dados de demonstração carregados.',
    );
  }
  async function removeDemo() {
    if (!(await confirm({ title: 'Remover dados de demonstração?', text: `${demoCount} registro(s) de demonstração serão excluídos.`, danger: true, confirmLabel: 'Remover' }))) return;
    // Lançamentos reais vinculados a contas de demonstração ficam sem conta.
    const demoAccounts = new Set(db.accounts.filter((a) => a.is_demo).map((a) => a.id));
    const orphanFix = db.transactions.filter((t) => !t.is_demo && t.account_id && demoAccounts.has(t.account_id)).map((t) => ({ ...t, account_id: null }));
    await bulk([{ table: 'transactions', upsert: orphanFix }, ...TABLES.map((t) => ({ table: t, remove: (db[t] as { id: string; is_demo?: boolean }[]).filter((r) => r.is_demo).map((r) => r.id) }))], 'Dados de demonstração removidos.');
  }
  async function wipe() {
    if (!(await confirm({ title: 'Excluir TODOS os dados?', text: 'Contas, lançamentos, investimentos, orçamentos e metas serão apagados permanentemente. Exporte um backup antes. As categorias padrão serão mantidas.', danger: true, confirmLabel: 'Excluir tudo' }))) return;
    await bulk(TABLES.filter((t) => t !== 'categories').map((t) => ({ table: t, remove: (db[t] as { id: string }[]).map((r) => r.id) })), 'Todos os dados foram excluídos.');
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Backup e exportação" subtitle="Guarde uma cópia dos seus dados em um arquivo." />
        <div className="space-y-3 p-5">
          <Button variant="primary" icon={<Download className="size-4" />} onClick={exportJSON}>
            Exportar backup completo (.json)
          </Button>
          <p className="text-xs text-ink-3">Para planilhas, use “Exportar CSV” nas páginas de Lançamentos, Gastos, Entradas e Relatórios.</p>
        </div>
      </Card>
      <Card>
        <CardHeader title="Importar / restaurar" subtitle="Os dados são validados antes de serem aplicados." />
        <div className="space-y-3 p-5">
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <Button icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
            Selecionar arquivo de backup
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Dados de demonstração" subtitle="Para conhecer o app sem usar seus dados reais." />
        <div className="flex flex-wrap items-center gap-3 p-5">
          <Button icon={<FlaskConical className="size-4" />} onClick={loadDemo}>
            Carregar demonstração
          </Button>
          <Button variant="ghost" disabled={!demoCount} onClick={removeDemo}>
            Remover demonstração ({demoCount})
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader title="Armazenamento" subtitle={supabaseConfigured ? 'Supabase (PostgreSQL) com login e isolamento por usuário.' : 'Modo local: dados neste navegador.'} />
        <div className="flex flex-wrap items-center gap-3 p-5">
          <Badge tone={supabaseConfigured ? 'pos' : 'warn'}>
            <Database className="size-3" /> {supabaseConfigured ? 'Sincronização entre dispositivos ativa' : 'Sem sincronização entre dispositivos'}
          </Badge>
          <Button variant="danger" size="sm" onClick={wipe}>
            Excluir todos os dados
          </Button>
        </div>
      </Card>
      {preview && (
        <Modal open onClose={() => setPreview(null)} title="Revisar importação">
          <div className="space-y-3 text-[13px]">
            <p>Registros novos encontrados no arquivo:</p>
            <ul className="grid grid-cols-2 gap-1 text-ink-2">
              {TABLES.filter((t) => preview.newCount[t]).map((t) => (
                <li key={t}>
                  {LABELS[t]}: <strong>{preview.newCount[t]}</strong>
                </li>
              ))}
            </ul>
            {(preview.dupIds > 0 || preview.dupContent > 0) && (
              <p className="rounded-lg border border-warn/30 bg-warn/10 p-2 text-warn">
                Possíveis duplicações: {preview.dupIds} registro(s) já existem (mesmo identificador) e {preview.dupContent} lançamento(s) têm mesma data, valor e descrição de lançamentos existentes.
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setPreview(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => applyImport('replace', false)}>
              Substituir tudo
            </Button>
            {preview.dupContent > 0 && <Button onClick={() => applyImport('merge', false)}>Mesclar (incluir possíveis duplicados)</Button>}
            <Button variant="primary" onClick={() => applyImport('merge', true)}>
              Mesclar sem duplicados
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

const LABELS: Record<TableName, string> = {
  accounts: 'Contas',
  categories: 'Categorias',
  transactions: 'Lançamentos',
  transfers: 'Transferências',
  recurrings: 'Recorrências',
  investments: 'Investimentos',
  investment_operations: 'Operações de investimento',
  quote_history: 'Histórico de cotações',
  budgets: 'Orçamentos',
  goals: 'Metas',
  net_worth_items: 'Bens e dívidas',
  category_rules: 'Regras',
};
