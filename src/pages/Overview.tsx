import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, CalendarClock, Landmark, Lightbulb, PiggyBank, Scale, TrendingUp, Wallet } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Dot, EmptyState, Money, Stat, Tabs, cx } from '../components/ui';
import { QuickEntry } from '../components/QuickEntry';
import { BalanceChart, DonutChart, IncomeExpenseChart } from '../components/charts';
import { RowActions, StatusBadge, useTxActions } from '../components/TransactionTable';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { useLookups } from '../lib/hooks';
import { balanceSeries, buildInsights, categoryBreakdown, incomeExpenseSeries, periodSummary, portfolioSummary, totalCash, variation } from '../domain/finance';
import { upcoming } from '../domain/recurrence';
import { addDays, addMonths, formatDate, periodLabel, previousPeriod, startOfMonth, startOfWeek, type Granularity } from '../lib/dates';
import { formatBRL, formatPercent } from '../lib/format';

export function chartRange(g: Granularity, end: string, start: string) {
  switch (g) {
    case 'day':
      return { start: start === end ? addDays(end, -29) : start, end };
    case 'week':
      return { start: addDays(startOfWeek(end), -7 * 11), end };
    case 'month':
      return { start: addMonths(startOfMonth(end), -11), end };
    case 'year':
      return { start: `${Number(end.slice(0, 4)) - 4}-01-01`, end };
  }
}

export const GRAN_OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Diário' },
  { value: 'week', label: 'Semanal' },
  { value: 'month', label: 'Mensal' },
  { value: 'year', label: 'Anual' },
];

export function Overview() {
  const { db, period, today, settings } = useStore();
  const { navigate, open } = useUI();
  const L = useLookups();
  const actions = useTxActions();
  const [gran, setGran] = useState<Granularity>('month');
  const [balGran, setBalGran] = useState<Granularity>('month');

  const s = useMemo(() => periodSummary(db.transactions, period), [db.transactions, period]);
  const prev = useMemo(() => periodSummary(db.transactions, previousPeriod(period)), [db.transactions, period]);
  const cash = useMemo(() => totalCash(db), [db]);
  const portfolio = useMemo(() => portfolioSummary(db), [db]);
  const cats = useMemo(() => categoryBreakdown(db.transactions, db.categories, period, 'expense'), [db.transactions, db.categories, period]);
  const series = useMemo(() => incomeExpenseSeries(db.transactions, chartRange(gran, period.end, period.start), gran), [db.transactions, gran, period]);
  const bal = useMemo(() => balanceSeries(db, chartRange(balGran, period.end < today ? period.end : today, period.start), balGran), [db, balGran, period, today]);
  const insights = useMemo(() => buildInsights(db, today, formatBRL), [db, today]);
  const dues = useMemo(() => upcoming(db.transactions, today, settings.due_days_ahead || 7).slice(0, 6), [db.transactions, today, settings.due_days_ahead]);
  const latest = useMemo(() => [...db.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)).slice(0, 8), [db.transactions]);
  const overdueExpense = db.transactions.filter((t) => t.status === 'pending' && t.kind === 'expense' && t.date < today);

  const varHint = (cur: number, p: number, invert = false) => {
    const v = variation(cur, p);
    if (v === null) return 'Sem base no período anterior';
    const up = v >= 0;
    const good = invert ? !up : up;
    return (
      <span className={good ? 'text-pos' : 'text-neg'}>
        {up ? '▲' : '▼'} {Math.abs(v * 100).toFixed(1).replace('.', ',')}% vs. período anterior
      </span>
    );
  };

  const empty = db.transactions.length === 0;

  return (
    <div className="space-y-5">
      {db.accounts.length === 0 && (
        <Card className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Landmark className="size-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Comece cadastrando suas contas</p>
            <p className="text-[13px] text-ink-3">Informe o saldo atual de cada conta (banco, carteira, dinheiro, corretora). Assim o saldo financeiro fica correto desde o primeiro lançamento.</p>
          </div>
          <Button variant="primary" onClick={() => open({ type: 'account', id: null })}>
            Cadastrar conta
          </Button>
        </Card>
      )}

      <QuickEntry />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Saldo atual em contas" value={<Money cents={cash} />} hint="Todas as movimentações confirmadas" icon={<Wallet className="size-4" />} />
        <Stat label={`Entradas · ${periodLabel(period)}`} value={<Money cents={s.income} />} hint={varHint(s.income, prev.income)} icon={<ArrowDownLeft className="size-4" />} tone="pos" />
        <Stat label={`Gastos · ${periodLabel(period)}`} value={<Money cents={s.expense} />} hint={varHint(s.expense, prev.expense, true)} icon={<ArrowUpRight className="size-4" />} tone="neg" />
        <Stat label="Resultado do período" value={<Money cents={s.result} tone="auto" signed />} hint="Entradas realizadas − gastos efetivos" icon={<Scale className="size-4" />} />
        <Stat
          label="Total investido (valor atual)"
          value={<Money cents={portfolio.currentValue} />}
          hint={portfolio.unknownPrices ? `${portfolio.unknownPrices} ativo(s) sem cotação, avaliados pelo custo` : 'Separado do saldo em contas'}
          icon={<TrendingUp className="size-4" />}
        />
        <Stat
          label="Percentual economizado"
          value={settings.hide_values ? '•••' : formatPercent(s.savingsRate)}
          hint={s.savingsRate === null ? 'Sem entradas no período' : 'Resultado positivo ÷ entradas'}
          icon={<PiggyBank className="size-4" />}
          tone="pos"
        />
        {(s.pendingExpense > 0 || overdueExpense.length > 0) && (
          <Stat
            label="Despesas pendentes no período"
            value={<Money cents={s.pendingExpense} />}
            hint={
              overdueExpense.length ? (
                <span className="text-neg">{overdueExpense.length} atrasada(s)</span>
              ) : (
                `${s.pendingExpenseCount} lançamento(s) a pagar`
              )
            }
            icon={<AlertTriangle className="size-4" />}
            tone="warn"
          />
        )}
        {s.expectedIncome > 0 && <Stat label="Entradas previstas no período" value={<Money cents={s.expectedIncome} />} hint="Não somam ao saldo até serem recebidas" icon={<CalendarClock className="size-4" />} />}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Entradas x gastos" subtitle="Somente movimentações realizadas" action={<Tabs value={gran} onChange={setGran} options={GRAN_OPTIONS} />} />
          <div className="px-2 pb-4 pt-3 sm:px-4">
            {empty ? <EmptyState title="Sem dados para o gráfico" text="Os valores aparecem aqui após o primeiro lançamento." /> : <IncomeExpenseChart data={series} />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Distribuição dos gastos" subtitle={`${periodLabel(period)} · clique para ver os lançamentos`} />
          <div className="px-5 pb-5 pt-2">
            {cats.length === 0 ? (
              <EmptyState title="Nenhum gasto no período" />
            ) : (
              <>
                <DonutChart
                  data={cats.map((c) => ({ name: c.name, value: c.total, color: c.color, id: c.categoryId }))}
                  onSelect={(id) => id && navigate('expenses', { category: id })}
                  centerLabel="Total"
                  centerValue={s.expense}
                />
                <ul className="mt-3 space-y-1.5">
                  {cats.slice(0, 6).map((c) => (
                    <li key={c.name}>
                      <button
                        className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left text-[13px] hover:bg-surface-2"
                        onClick={() => c.categoryId && navigate('expenses', { category: c.categoryId })}
                      >
                        <Dot color={c.color} />
                        <span className="flex-1 truncate">{c.name}</span>
                        <span className="text-xs text-ink-3">{Math.round(c.share * 100)}%</span>
                        <Money cents={c.total} className="w-24 text-right font-medium" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Evolução do saldo em contas" subtitle="Saldo no início e no fim de cada período" action={<Tabs value={balGran} onChange={setBalGran} options={GRAN_OPTIONS} />} />
          <div className="px-2 pb-4 pt-3 sm:px-4">
            {db.accounts.length === 0 ? <EmptyState title="Cadastre uma conta para acompanhar o saldo" /> : <BalanceChart data={bal} />}
          </div>
          {bal.length > 0 && db.accounts.length > 0 && (
            <div className="grid grid-cols-3 gap-2 border-t border-line px-5 py-3 text-[13px]">
              <div>
                <div className="text-xs text-ink-3">Início ({bal[0].label})</div>
                <Money cents={bal[0].opening} className="font-medium" />
              </div>
              <div>
                <div className="text-xs text-ink-3">Fim ({bal[bal.length - 1].label})</div>
                <Money cents={bal[bal.length - 1].closing} className="font-medium" />
              </div>
              <div>
                <div className="text-xs text-ink-3">Variação</div>
                <Money cents={bal[bal.length - 1].closing - bal[0].opening} tone="auto" signed className="font-medium" />
              </div>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Resumo inteligente" subtitle="Calculado a partir dos seus registros" action={<Lightbulb className="size-4 text-warn" />} />
          <div className="px-5 pb-5 pt-3">
            {insights.length === 0 ? (
              <p className="text-[13px] text-ink-3">Ainda não há dados suficientes para gerar observações. Elas aparecem conforme você registra entradas e gastos.</p>
            ) : (
              <ul className="space-y-2.5">
                {insights.map((i, k) => (
                  <li key={k} className="flex gap-2.5 text-[13px] text-ink-2">
                    <span
                      className={cx('mt-1.5 size-1.5 shrink-0 rounded-full', i.tone === 'positive' ? 'bg-pos' : i.tone === 'negative' ? 'bg-neg' : i.tone === 'warning' ? 'bg-warn' : 'bg-ink-3')}
                    />
                    {settings.hide_values ? i.text.replace(/R\$\s?[\d.,]+/g, 'R$ •••') : i.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Últimas movimentações"
            action={
              <Button size="sm" variant="ghost" onClick={() => navigate('transactions')}>
                Ver todas
              </Button>
            }
          />
          {latest.length === 0 ? (
            <EmptyState
              title="Você ainda não registrou movimentações"
              text="Digite no campo de lançamento rápido acima, por exemplo “45,90 pizza”, ou use o botão Novo."
              action={
                <Button variant="primary" onClick={() => document.getElementById('quick')?.focus()}>
                  Registrar a primeira
                </Button>
              }
            />
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {latest.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                  <Dot color={L.catColor(t.category_id)} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium">{t.description}</div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-3">
                      <span>{formatDate(t.date)}</span>
                      <span>{L.catName(t.category_id)}</span>
                      <span className="hidden sm:inline">{t.kind === 'income' ? 'Entrada' : 'Saída'}</span>
                      <span className="hidden sm:inline">{L.accountName(t.account_id)}</span>
                      {t.status === 'pending' && <StatusBadge t={t} />}
                    </div>
                  </div>
                  <Money cents={t.kind === 'income' ? t.amount_cents : -t.amount_cents} tone={t.kind === 'income' ? 'pos' : 'none'} className="text-[13.5px] font-medium" />
                  <div className="hidden sm:block">
                    <RowActions t={t} actions={actions} today={today} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="h-2" />
        </Card>
        <Card>
          <CardHeader title="Próximos vencimentos" subtitle={`Pendentes até ${formatDate(addDays(today, settings.due_days_ahead || 7))}`} />
          {dues.length === 0 ? (
            <EmptyState title="Nada a vencer" text="Lançamentos pendentes e recorrências aparecem aqui." icon={<CalendarClock className="size-5" />} />
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {dues.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium">{t.description}</div>
                    <div className="flex items-center gap-2 text-xs text-ink-3">
                      {formatDate(t.date)} {t.date < today ? <Badge tone="neg">Atrasado</Badge> : t.date === today ? <Badge tone="warn">Hoje</Badge> : null}
                    </div>
                  </div>
                  <Money cents={t.kind === 'income' ? t.amount_cents : -t.amount_cents} tone={t.kind === 'income' ? 'pos' : 'none'} className="text-[13px]" />
                  <Button size="sm" variant="ghost" onClick={() => actions.settle(t, today)}>
                    {t.kind === 'income' ? 'Recebido' : 'Pago'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="h-2" />
        </Card>
      </div>
    </div>
  );
}
