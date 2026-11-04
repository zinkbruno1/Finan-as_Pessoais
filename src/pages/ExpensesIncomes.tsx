import { useMemo } from 'react';
import { ArrowUpRight, CalendarDays, Crown, Repeat, Timer, TrendingDown, TrendingUp, Trophy, X } from 'lucide-react';
import { Button, Card, CardHeader, Dot, EmptyState, Money, Progress, Stat } from '../components/ui';
import { DonutChart, HBarChart } from '../components/charts';
import { TransactionTable } from '../components/TransactionTable';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { categoryBreakdown, periodSummary, realizedInRange, variation } from '../domain/finance';
import { addMonths, diffDays, endOfMonth, periodLabel, previousPeriod, startOfMonth } from '../lib/dates';
import { formatPercent } from '../lib/format';

function VarHint({ cur, prev, invert }: { cur: number; prev: number; invert?: boolean }) {
  const v = variation(cur, prev);
  if (v === null) return <>Sem base no período anterior</>;
  const good = invert ? v <= 0 : v >= 0;
  return (
    <span className={good ? 'text-pos' : 'text-neg'}>
      {v >= 0 ? '▲' : '▼'} {formatPercent(Math.abs(v))} vs. período anterior
    </span>
  );
}

export function Expenses() {
  const { db, period, today } = useStore();
  const { route, setParams } = useUI();
  const selected = route.params.category;
  const s = useMemo(() => periodSummary(db.transactions, period), [db.transactions, period]);
  const prev = useMemo(() => periodSummary(db.transactions, previousPeriod(period)), [db.transactions, period]);
  const cats = useMemo(() => categoryBreakdown(db.transactions, db.categories, period, 'expense'), [db.transactions, db.categories, period]);
  const realized = useMemo(() => realizedInRange(db.transactions, period, 'expense'), [db.transactions, period]);
  const biggest = realized.reduce<(typeof realized)[number] | null>((m, t) => (!m || t.amount_cents > m.amount_cents ? t : m), null);
  const elapsedEnd = period.end < today ? period.end : today;
  const days = Math.max(1, diffDays(period.start, elapsedEnd) + 1);
  const recurringTotal = db.transactions
    .filter((t) => t.kind === 'expense' && t.recurring_id && (t.status === 'done' ? (t.settled_date ?? t.date) : t.date) >= period.start && (t.status === 'done' ? (t.settled_date ?? t.date) : t.date) <= period.end)
    .reduce((a, t) => a + t.amount_cents, 0);
  const detail = selected ? cats.find((c) => c.categoryId === selected) : undefined;
  const selectedCat = selected ? db.categories.find((c) => c.id === selected) : undefined;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label={`Total gasto · ${periodLabel(period)}`} value={<Money cents={s.expense} />} hint={<VarHint cur={s.expense} prev={prev.expense} invert />} icon={<TrendingDown className="size-4" />} tone="neg" />
        <Stat label="Média diária" value={<Money cents={Math.round(s.expense / days)} />} hint={`${days} dia(s) considerados`} icon={<CalendarDays className="size-4" />} />
        <Stat label="Maior despesa" value={biggest ? <Money cents={biggest.amount_cents} /> : '—'} hint={biggest?.description ?? 'Sem despesas no período'} icon={<Trophy className="size-4" />} />
        <Stat label="Categoria com maior gasto" value={<span className="text-lg">{cats[0]?.name ?? '—'}</span>} hint={cats[0] ? <Money cents={cats[0].total} /> : 'Sem despesas'} icon={<Crown className="size-4" />} />
        <Stat label="Despesas pendentes" value={<Money cents={s.pendingExpense} />} hint={`${s.pendingExpenseCount} a pagar no período`} icon={<Timer className="size-4" />} tone="warn" />
        <Stat label="Despesas recorrentes" value={<Money cents={recurringTotal} />} hint="Geradas por recorrências no período" icon={<Repeat className="size-4" />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Gastos por categoria" subtitle="Clique em uma categoria para ver o detalhamento e filtrar a tabela" />
          <div className="p-5 pt-3">
            {cats.length === 0 ? (
              <EmptyState title="Nenhum gasto no período" />
            ) : (
              <ul className="space-y-3">
                {cats.map((c) => (
                  <li key={c.name}>
                    <button className="w-full text-left" onClick={() => setParams({ ...route.params, category: c.categoryId ?? '', sub: '' })}>
                      <div className="mb-1 flex items-center gap-2 text-[13px]">
                        <Dot color={c.color} />
                        <span className={`flex-1 truncate ${selected === c.categoryId ? 'font-semibold' : ''}`}>{c.name}</span>
                        <span className="text-xs text-ink-3">{formatPercent(c.share)}</span>
                        <Money cents={c.total} className="w-28 text-right font-medium" />
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full" style={{ width: `${c.share * 100}%`, background: c.color }} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader
            title={selectedCat ? selectedCat.name : 'Detalhamento'}
            subtitle={detail ? `${formatPercent(detail.share)} do total de despesas` : selectedCat ? 'Sem gastos nesta categoria no período' : 'Selecione uma categoria'}
            action={
              selected && (
                <Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => setParams({ ...route.params, category: '', sub: '' })}>
                  Limpar
                </Button>
              )
            }
          />
          <div className="p-5 pt-3">
            {detail ? (
              <>
                <div className="mb-3 text-2xl font-semibold">
                  <Money cents={detail.total} />
                </div>
                <DonutChart data={detail.subs.map((x, i) => ({ name: x.name, value: x.total, color: `color-mix(in srgb, ${detail.color} ${100 - i * 15}%, var(--color-surface))` }))} height={170} />
                <ul className="mt-3 space-y-2">
                  {detail.subs.map((x) => (
                    <li key={x.name}>
                      <button
                        className="flex w-full items-center justify-between gap-2 text-[13px] hover:underline"
                        onClick={() => x.categoryId && setParams({ ...route.params, category: selected!, sub: x.categoryId })}
                      >
                        <span>{x.name}</span>
                        <Money cents={x.total} className="font-medium" />
                      </button>
                      <Progress value={x.total / detail.total} />
                    </li>
                  ))}
                </ul>
              </>
            ) : cats.length > 0 ? (
              <DonutChart data={cats.map((c) => ({ name: c.name, value: c.total, color: c.color, id: c.categoryId }))} onSelect={(id) => id && setParams({ ...route.params, category: id })} centerLabel="Total" centerValue={s.expense} />
            ) : (
              <EmptyState title="Sem dados" />
            )}
          </div>
        </Card>
      </div>

      <TransactionTable kind="expense" title="Despesas" />
    </div>
  );
}

export function Incomes() {
  const { db, period, today } = useStore();
  const s = useMemo(() => periodSummary(db.transactions, period), [db.transactions, period]);
  const prev = useMemo(() => periodSummary(db.transactions, previousPeriod(period)), [db.transactions, period]);
  const cats = useMemo(() => categoryBreakdown(db.transactions, db.categories, period, 'income'), [db.transactions, db.categories, period]);
  // Média mensal dos últimos 6 meses completos com dados
  const monthly = useMemo(() => {
    const vals: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const st = addMonths(startOfMonth(today), -i);
      const v = periodSummary(db.transactions, { start: st, end: endOfMonth(st) }).income;
      if (v > 0) vals.push(v);
    }
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  }, [db.transactions, today]);
  const overdue = db.transactions.filter((t) => t.kind === 'income' && t.status === 'pending' && t.date < today);
  const recurringTotal = db.transactions
    .filter((t) => t.kind === 'income' && t.recurring_id && t.date >= period.start && t.date <= period.end)
    .reduce((a, t) => a + t.amount_cents, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Stat label={`Total recebido · ${periodLabel(period)}`} value={<Money cents={s.income} />} hint={<VarHint cur={s.income} prev={prev.income} />} icon={<TrendingUp className="size-4" />} tone="pos" />
        <Stat
          label="Previsto para receber"
          value={<Money cents={s.expectedIncome} />}
          hint={overdue.length ? <span className="text-neg">{overdue.length} recebimento(s) atrasado(s)</span> : 'Não soma ao saldo até ser recebido'}
          icon={<Timer className="size-4" />}
          tone="warn"
        />
        <Stat label="Média mensal de entradas" value={monthly === null ? 'Não disponível' : <Money cents={monthly} />} hint="Últimos 6 meses com entradas" icon={<CalendarDays className="size-4" />} />
        <Stat label="Principal fonte de renda" value={<span className="text-lg">{cats[0]?.name ?? '—'}</span>} hint={cats[0] ? <Money cents={cats[0].total} /> : 'Sem entradas no período'} icon={<Crown className="size-4" />} />
        <Stat label="Entradas recorrentes" value={<Money cents={recurringTotal} />} hint="Recebidas e previstas no período" icon={<Repeat className="size-4" />} />
        <Stat label="Variação" value={variation(s.income, prev.income) === null ? 'Não disponível' : formatPercent(variation(s.income, prev.income))} hint="Em relação ao período anterior" icon={<ArrowUpRight className="size-4" />} />
      </div>
      <Card>
        <CardHeader title="Entradas por fonte" subtitle="Somente valores efetivamente recebidos" />
        <div className="p-5 pt-3">{cats.length ? <HBarChart data={cats.map((c) => ({ name: c.name, value: c.total, color: c.color }))} /> : <EmptyState title="Nenhuma entrada recebida no período" />}</div>
      </Card>
      <TransactionTable kind="income" title="Entradas" />
    </div>
  );
}
