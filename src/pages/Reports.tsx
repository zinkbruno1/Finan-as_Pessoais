import { useMemo, useState } from 'react';
import { Download, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Field, IconButton, Input, Modal, Money, MoneyInput, Select, Stat, Tabs, Textarea } from '../components/ui';
import { IncomeExpenseChart, LinesChart } from '../components/charts';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import {
  accountBalance,
  balanceSeries,
  budgetStatus,
  categoryBreakdown,
  goalProgress,
  incomeExpenseSeries,
  netWorth,
  periodSummary,
  positionOf,
  variation,
} from '../domain/finance';
import { nowISO, uid } from '../domain/defaults';
import { FREQUENCY_LABELS, NW_TYPE_LABELS, type NetWorthItem, type NetWorthItemType } from '../domain/types';
import { addDays, addMonths, buckets, endOfMonth, formatDate, formatMonth, isValidISO, PERIOD_LABELS, periodFromPreset, startOfMonth, startOfWeek, type Granularity, type PeriodPreset } from '../lib/dates';
import { formatBRL, formatPercent } from '../lib/format';
import { csvMoney, downloadFile, toCSV } from '../lib/csv';

type ReportKey = 'by_category' | 'by_month' | 'income_sources' | 'balance' | 'networth' | 'investments' | 'comparison' | 'recurring' | 'budgets_goals';
const REPORTS: { key: ReportKey; label: string }[] = [
  { key: 'comparison', label: 'Comparação entre períodos' },
  { key: 'by_category', label: 'Gastos por categoria' },
  { key: 'by_month', label: 'Gastos por mês' },
  { key: 'income_sources', label: 'Entradas por fonte' },
  { key: 'balance', label: 'Evolução do saldo' },
  { key: 'networth', label: 'Evolução do patrimônio líquido' },
  { key: 'investments', label: 'Evolução dos investimentos' },
  { key: 'recurring', label: 'Despesas recorrentes' },
  { key: 'budgets_goals', label: 'Orçamentos e metas' },
];

interface Table {
  headers: string[];
  rows: (string | number)[][];
  money: number[]; // índices das colunas monetárias (centavos)
  pct?: number[]; // índices das colunas percentuais (fração)
}

export function Reports() {
  const { db, today, settings } = useStore();
  const [preset, setPreset] = useState<PeriodPreset>('this_month');
  const [custom, setCustom] = useState({ start: startOfMonth(today), end: today });
  const [cmp, setCmp] = useState<Granularity>('month');
  const [report, setReport] = useState<ReportKey>('comparison');
  const period = periodFromPreset(preset, today, custom);
  const s = useMemo(() => periodSummary(db.transactions, period), [db.transactions, period]);
  const prevRange = useMemo(() => {
    const len = Math.round((Date.parse(period.end) - Date.parse(period.start)) / 86400000) + 1;
    if (['this_month', 'last_month'].includes(preset)) {
      const st = addMonths(period.start, -1);
      return { start: st, end: endOfMonth(st) };
    }
    if (['this_year', 'last_year'].includes(preset)) {
      const y = Number(period.start.slice(0, 4)) - 1;
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
    return { start: addDays(period.start, -len), end: addDays(period.start, -1) };
  }, [period.start, period.end, preset]);
  const p = useMemo(() => periodSummary(db.transactions, prevRange), [db.transactions, prevRange]);

  const cmpRange = useMemo(() => {
    const end = period.end;
    if (cmp === 'week') return { start: addDays(startOfWeek(end), -7 * 7), end };
    if (cmp === 'year') return { start: `${Number(end.slice(0, 4)) - 4}-01-01`, end };
    return { start: addMonths(startOfMonth(end), -11), end };
  }, [cmp, period.end]);
  const cmpSeries = useMemo(() => incomeExpenseSeries(db.transactions, cmpRange, cmp), [db.transactions, cmpRange, cmp]);

  const table: Table = useMemo(() => {
    switch (report) {
      case 'comparison': {
        const rows = cmpSeries.map((x, i) => {
          const prev = cmpSeries[i - 1];
          const label = cmp === 'week' ? `${formatDate(x.start)} – ${formatDate(x.end)}` : cmp === 'month' ? formatMonth(x.key.slice(0, 7), true) : x.label;
          const v = prev ? variation(x.result, prev.result) : null;
          return [label, x.income, x.expense, x.result, x.income > 0 ? Math.max(x.result, 0) / x.income : ('Não disponível' as any), v === null ? 'Não disponível' : (v as any)];
        });
        return { headers: ['Período', 'Entradas realizadas', 'Gastos realizados', 'Resultado', 'Economia', 'Variação do resultado'], rows: rows.reverse(), money: [1, 2, 3], pct: [4, 5] };
      }
      case 'by_category': {
        const cats = categoryBreakdown(db.transactions, db.categories, period, 'expense');
        const rows: (string | number)[][] = [];
        for (const c of cats) {
          rows.push([c.name, '', c.total, c.share]);
          for (const sub of c.subs) rows.push([c.name, sub.name, sub.total, c.total ? sub.total / s.expense : 0]);
        }
        return { headers: ['Categoria', 'Subcategoria', 'Total', 'Participação'], rows, money: [2], pct: [3] };
      }
      case 'by_month': {
        const ser = incomeExpenseSeries(db.transactions, { start: addMonths(startOfMonth(period.end), -11), end: period.end }, 'month');
        return { headers: ['Mês', 'Gastos realizados', 'Entradas realizadas'], rows: ser.map((x) => [formatMonth(x.key.slice(0, 7), true), x.expense, x.income]).reverse(), money: [1, 2] };
      }
      case 'income_sources': {
        const cats = categoryBreakdown(db.transactions, db.categories, period, 'income');
        const payers = new Map<string, number>();
        for (const t of db.transactions) if (t.kind === 'income' && t.status === 'done' && (t.settled_date ?? t.date) >= period.start && (t.settled_date ?? t.date) <= period.end) payers.set(t.payer || 'Não informada', (payers.get(t.payer || 'Não informada') ?? 0) + t.amount_cents);
        return {
          headers: ['Tipo', 'Fonte', 'Total', 'Participação'],
          rows: [...cats.map((c) => ['Categoria', c.name, c.total, c.share]), ...[...payers].sort((a, b) => b[1] - a[1]).map(([n, v]) => ['Fonte pagadora', n, v, s.income ? v / s.income : 0])],
          money: [2],
          pct: [3],
        };
      }
      case 'balance': {
        const ser = balanceSeries(db, { start: addMonths(startOfMonth(period.end), -11), end: period.end > today ? today : period.end }, 'month');
        return { headers: ['Mês', 'Saldo no início', 'Saldo no fim', 'Variação'], rows: ser.map((x) => [x.label, x.opening, x.closing, x.closing - x.opening]).reverse(), money: [1, 2, 3] };
      }
      case 'networth': {
        const bs = buckets(addMonths(startOfMonth(today), -11), today, 'month');
        return {
          headers: ['Mês (fim)', 'Contas', 'Investimentos', 'Outros ativos', 'Dívidas', 'Patrimônio líquido'],
          rows: bs.map((b) => {
            const nw = netWorth(db, b.end > today ? today : b.end);
            return [b.label, nw.cash, nw.investments, nw.otherAssets, nw.liabilities, nw.total];
          }).reverse(),
          money: [1, 2, 3, 4, 5],
        };
      }
      case 'investments': {
        return {
          headers: ['Ativo', 'Classe', 'Instituição', 'Aportado', 'Custo atual', 'Valor atual', 'Proventos', 'Resultado', 'Rentabilidade', 'Atualizado em'],
          rows: db.investments.map((i) => {
            const ps = positionOf(i, db.investment_operations);
            return [i.ticker ? `${i.name} (${i.ticker})` : i.name, i.asset_class, i.institution, ps.contributed, ps.costBasis, ps.currentValue, ps.income, ps.result, ps.returnPct ?? ('Não disponível' as any), i.quote_at ? new Date(i.quote_at).toLocaleString('pt-BR') : '—'];
          }),
          money: [3, 4, 5, 6, 7],
          pct: [8],
        };
      }
      case 'recurring':
        return {
          headers: ['Descrição', 'Tipo', 'Frequência', 'Valor', 'Início', 'Fim', 'Situação'],
          rows: db.recurrings.map((r) => [r.description, r.kind === 'income' ? 'Entrada' : 'Saída', FREQUENCY_LABELS[r.frequency], r.amount_cents, formatDate(r.start_date), r.end_date ? formatDate(r.end_date) : '—', r.active ? 'Ativa' : 'Pausada']),
          money: [3],
        };
      case 'budgets_goals': {
        const mk = period.end.slice(0, 7);
        const rows: (string | number)[][] = db.budgets
          .filter((b) => b.month === mk)
          .map((b) => {
            const st = budgetStatus(b, db.transactions, db.categories, today);
            return ['Orçamento', db.categories.find((c) => c.id === b.category_id)?.name ?? '—', b.limit_cents, st.spent, st.remaining, st.usedPct];
          });
        for (const g of db.goals) {
          const gp = goalProgress(g, db, today);
          rows.push(['Meta', g.name, g.target_cents, gp.saved, gp.remaining, gp.pct]);
        }
        return { headers: ['Tipo', 'Nome', 'Limite / objetivo', 'Gasto / acumulado', 'Restante', 'Percentual'], rows, money: [2, 3, 4], pct: [5] };
      }
    }
  }, [report, db, period, s, cmp, cmpSeries, today]);

  const fmtCell = (v: string | number, i: number) => {
    if (typeof v === 'number' && table.money.includes(i)) return settings.hide_values ? '•••' : formatBRL(v);
    if (typeof v === 'number' && table.pct?.includes(i)) return formatPercent(v);
    return String(v);
  };

  function exportCSV() {
    const csv = toCSV(
      table.headers,
      table.rows.map((r) => r.map((v, i) => (typeof v === 'number' && table.money.includes(i) ? csvMoney(v) : typeof v === 'number' && table.pct?.includes(i) ? (v * 100).toFixed(2).replace('.', ',') + '%' : v))),
    );
    downloadFile(`relatorio-${report}-${today}.csv`, csv);
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Período de análise">
            <Select value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)} className="w-48">
              {(['this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'last_year', 'custom'] as PeriodPreset[]).map((k) => (
                <option key={k} value={k}>
                  {k === 'this_week' ? 'Semana atual' : k === 'this_month' ? 'Mês atual' : k === 'this_year' ? 'Ano atual' : PERIOD_LABELS[k]}
                </option>
              ))}
            </Select>
          </Field>
          {preset === 'custom' && (
            <>
              <Field label="Início">
                <Input type="date" value={custom.start} onChange={(e) => isValidISO(e.target.value) && setCustom({ ...custom, start: e.target.value })} />
              </Field>
              <Field label="Fim">
                <Input type="date" value={custom.end} onChange={(e) => isValidISO(e.target.value) && setCustom({ ...custom, end: e.target.value })} />
              </Field>
            </>
          )}
          <p className="pb-2 text-[13px] text-ink-3">
            De <strong className="text-ink-2">{formatDate(period.start)}</strong> a <strong className="text-ink-2">{formatDate(period.end)}</strong> (inclusive, horário de Brasília; semanas de segunda a domingo).
            Comparado com {formatDate(prevRange.start)} – {formatDate(prevRange.end)}.
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Entradas realizadas" value={<Money cents={s.income} />} hint={<VarText cur={s.income} prev={p.income} />} />
        <Stat label="Gastos realizados" value={<Money cents={s.expense} />} hint={<VarText cur={s.expense} prev={p.expense} invert />} />
        <Stat label="Resultado" value={<Money cents={s.result} tone="auto" signed />} hint={<VarText cur={s.result} prev={p.result} />} />
        <Stat label="Percentual de economia" value={formatPercent(s.savingsRate)} hint={s.pendingExpense ? `Pendentes não incluídos: ${settings.hide_values ? '•••' : formatBRL(s.pendingExpense)}` : 'Somente valores efetivamente pagos'} />
      </div>

      <Card>
        <CardHeader
          title="Comparação entre períodos"
          action={
            <Tabs
              value={cmp}
              onChange={setCmp}
              options={[
                { value: 'week', label: 'Semanas' },
                { value: 'month', label: 'Meses' },
                { value: 'year', label: 'Anos' },
              ]}
            />
          }
        />
        <div className="px-2 pb-4 pt-3 sm:px-4">
          <IncomeExpenseChart data={cmpSeries} />
        </div>
      </Card>

      <NetWorthSection />

      <Card>
        <CardHeader
          title="Relatórios"
          subtitle="Todos os relatórios usam as mesmas regras de cálculo das demais páginas."
          action={
            <div className="no-print flex flex-wrap gap-2">
              <Select value={report} onChange={(e) => setReport(e.target.value as ReportKey)} className="h-9 w-60 text-[13px]" aria-label="Relatório">
                {REPORTS.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </Select>
              <Button size="sm" className="h-9" icon={<Download className="size-4" />} onClick={exportCSV} disabled={!table.rows.length}>
                CSV
              </Button>
              <Button size="sm" className="h-9" icon={<Printer className="size-4" />} onClick={() => window.print()} disabled={!table.rows.length}>
                PDF / Imprimir
              </Button>
            </div>
          }
        />
        <h4 className="hidden px-5 pt-3 text-sm font-semibold print:block">
          {REPORTS.find((r) => r.key === report)?.label} · {formatDate(period.start)} – {formatDate(period.end)}
        </h4>
        {table.rows.length === 0 ? (
          <EmptyState title="Sem dados para este relatório" text="Os relatórios são gerados a partir dos registros cadastrados." />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-y border-line bg-surface-2 text-xs text-ink-3">
                <tr>
                  {table.headers.map((h, i) => (
                    <th key={h} className={`px-5 py-2.5 ${table.money.includes(i) || table.pct?.includes(i) ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {table.rows.map((r, k) => (
                  <tr key={k}>
                    {r.map((v, i) => (
                      <td key={i} className={`px-5 py-2 ${table.money.includes(i) || table.pct?.includes(i) ? 'text-right tabular' : ''} ${typeof v === 'number' && v < 0 && table.money.includes(i) ? 'text-neg' : ''}`}>
                        {fmtCell(v, i)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="h-2" />
      </Card>
    </div>
  );
}

function VarText({ cur, prev, invert }: { cur: number; prev: number; invert?: boolean }) {
  const v = variation(cur, prev);
  if (v === null) return <>Período anterior sem base de comparação</>;
  const good = invert ? v <= 0 : v >= 0;
  return (
    <span className={good ? 'text-pos' : 'text-neg'}>
      {v >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(v))} vs. período anterior
    </span>
  );
}

function NetWorthSection() {
  const { db, today, remove } = useStore();
  const { confirm } = useUI();
  const [editing, setEditing] = useState<NetWorthItem | null>(null);
  const nw = useMemo(() => netWorth(db), [db]);
  const series = useMemo(
    () =>
      buckets(addMonths(startOfMonth(today), -11), today, 'month').map((b) => {
        const x = netWorth(db, b.end > today ? today : b.end);
        return { label: b.label, total: x.total, cash: x.cash, investments: x.investments };
      }),
    [db, today],
  );
  return (
    <Card>
      <CardHeader
        title="Patrimônio líquido"
        subtitle="Estimativa baseada apenas nos itens cadastrados (contas, investimentos, bens e dívidas) — não é uma avaliação automática de todos os seus bens."
        action={
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing({ id: uid(), type: 'debt', name: '', value_cents: 0, interest_rate: '', due_date: null, status: 'active', notes: '', created_at: nowISO(), updated_at: nowISO() })}>
            Bem ou dívida
          </Button>
        }
      />
      <div className="grid gap-5 p-5 lg:grid-cols-5">
        <div className="space-y-2 text-[13px] lg:col-span-2">
          <Row label="Saldo em contas" cents={nw.cash} />
          {db.accounts.map((a) => (
            <Row key={a.id} label={`· ${a.name}`} cents={accountBalance(a, db)} muted />
          ))}
          <Row label="Investimentos (valor atual)" cents={nw.investments} />
          <Row label="Outros ativos e bens" cents={nw.otherAssets} />
          <Row label="Dívidas e obrigações" cents={-nw.liabilities} />
          <div className="flex items-center justify-between border-t border-line pt-2 text-base font-semibold">
            <span>Patrimônio líquido</span>
            <Money cents={nw.total} tone={nw.total < 0 ? 'neg' : 'none'} />
          </div>
        </div>
        <div className="lg:col-span-3">
          <LinesChart
            data={series}
            height={230}
            lines={[
              { key: 'total', name: 'Patrimônio líquido', color: 'var(--color-accent)' },
              { key: 'cash', name: 'Contas', color: '#0ea5e9', dashed: true },
              { key: 'investments', name: 'Investimentos', color: '#8b5cf6', dashed: true },
            ]}
          />
        </div>
      </div>
      {db.net_worth_items.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {db.net_worth_items.map((it) => (
            <li key={it.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[13px]">
              <Badge tone={it.type === 'other_asset' ? 'pos' : 'neg'}>{NW_TYPE_LABELS[it.type]}</Badge>
              <span className="min-w-0 flex-1 truncate font-medium">
                {it.name}
                <span className="font-normal text-ink-3">
                  {it.interest_rate ? ` · juros ${it.interest_rate}` : ''}
                  {it.due_date ? ` · vence ${formatDate(it.due_date)}` : ''}
                  {it.status === 'settled' ? ' · quitado' : ''}
                </span>
              </span>
              <Money cents={it.type === 'other_asset' ? it.value_cents : -it.value_cents} tone={it.type === 'other_asset' ? 'none' : 'neg'} className="font-medium" />
              <IconButton label="Editar" onClick={() => setEditing(it)}>
                <Pencil className="size-4" />
              </IconButton>
              <IconButton label="Excluir" className="hover:text-neg" onClick={async () => (await confirm({ title: 'Excluir item?', danger: true, confirmLabel: 'Excluir' })) && remove('net_worth_items', [it.id], 'Item excluído.')}>
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="h-2" />
      {editing && <NWDialog value={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function Row({ label, cents, muted }: { label: string; cents: number; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? 'pl-2 text-xs text-ink-3' : ''}`}>
      <span>{label}</span>
      <Money cents={cents} tone={cents < 0 ? 'neg' : 'none'} />
    </div>
  );
}

function NWDialog({ value, onClose }: { value: NetWorthItem; onClose: () => void }) {
  const { db, save } = useStore();
  const [it, setIt] = useState(value);
  const [err, setErr] = useState<Record<string, string>>({});
  const set = (p: Partial<NetWorthItem>) => setIt((x) => ({ ...x, ...p }));
  const exists = db.net_worth_items.some((x) => x.id === it.id);
  async function submit() {
    const e: Record<string, string> = {};
    if (!it.name.trim()) e.name = 'Informe o nome.';
    if (it.value_cents < 0) e.value = 'Valor inválido.';
    setErr(e);
    if (Object.keys(e).length) return;
    if (await save('net_worth_items', { ...it, name: it.name.trim() }, 'Item salvo.')) onClose();
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={exists ? 'Editar item' : 'Novo bem ou dívida'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo">
          <Select value={it.type} onChange={(e) => set({ type: e.target.value as NetWorthItemType })}>
            {Object.entries(NW_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome *" error={err.name}>
          <Input autoFocus value={it.name} onChange={(e) => set({ name: e.target.value })} placeholder={it.type === 'other_asset' ? 'Ex.: Carro, imóvel' : 'Ex.: Financiamento do carro'} />
        </Field>
        <Field label={it.type === 'other_asset' ? 'Valor estimado' : 'Saldo devedor'} error={err.value}>
          <MoneyInput value={it.value_cents || null} onChange={(v) => set({ value_cents: v ?? 0 })} />
        </Field>
        {it.type !== 'other_asset' && (
          <>
            <Field label="Taxa de juros (se conhecida)">
              <Input value={it.interest_rate} onChange={(e) => set({ interest_rate: e.target.value })} placeholder="Ex.: 1,9% a.m." />
            </Field>
            <Field label="Vencimento">
              <Input type="date" value={it.due_date ?? ''} onChange={(e) => set({ due_date: e.target.value || null })} />
            </Field>
          </>
        )}
        <Field label="Status">
          <Select value={it.status} onChange={(e) => set({ status: e.target.value as NetWorthItem['status'] })}>
            <option value="active">Ativo</option>
            <option value="settled">{it.type === 'other_asset' ? 'Vendido / baixado' : 'Quitado'}</option>
          </Select>
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={it.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}
