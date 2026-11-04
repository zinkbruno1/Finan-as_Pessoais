import { useMemo, useState } from 'react';
import { BarChart3, Coins, History, LineChart, Pencil, Percent, Plus, RefreshCw, Trash2, TrendingUp, Wallet, X } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Field, IconButton, Input, Modal, Money, MoneyInput, Select, Stat, Tabs, Textarea, cx } from '../components/ui';
import { DonutChart, LinesChart } from '../components/charts';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { useLookups } from '../lib/hooks';
import { useQuoteRefresh } from '../store/useQuoteRefresh';
import { portfolioSeries, portfolioSummary, positionOf } from '../domain/finance';
import { nowISO, uid, CATEGORY_PALETTE } from '../domain/defaults';
import { INV_OP_LABELS, QUOTE_KIND_LABELS, type InvOpType, type Investment, type InvestmentOperation, type QuoteKind } from '../domain/types';
import { addMonths, formatDate, formatDateTime, isValidISO, startOfMonth, type Granularity } from '../lib/dates';
import { formatCurrency, formatNumber, formatPercent } from '../lib/format';
import { supabaseConfigured } from '../data/supabase';

function QuoteBadge({ inv }: { inv: Investment }) {
  const tone: Record<QuoteKind, 'pos' | 'info' | 'warn' | 'neutral'> = { realtime: 'pos', delayed: 'info', last_known: 'warn', manual: 'neutral' };
  return (
    <div className="flex flex-col gap-0.5">
      <Badge tone={tone[inv.quote_kind]}>{QUOTE_KIND_LABELS[inv.quote_kind]}</Badge>
      <span className="text-[11px] text-ink-3">
        {inv.quote_at ? formatDateTime(inv.quote_at) : 'Nunca atualizado'}
        {inv.quote_source ? ` · ${inv.quote_source}` : ''}
      </span>
    </div>
  );
}

export function Investments() {
  const { db, bulk, today } = useStore();
  const { open, confirm, route, setParams } = useUI();
  const { refresh, loading, eligibleCount } = useQuoteRefresh();
  const [gran, setGran] = useState<Granularity>('month');
  const [manual, setManual] = useState<Investment | null>(null);
  const sum = useMemo(() => portfolioSummary(db), [db]);
  const series = useMemo(
    () => portfolioSeries(db, { start: gran === 'year' ? `${Number(today.slice(0, 4)) - 4}-01-01` : addMonths(startOfMonth(today), gran === 'month' ? -11 : -2), end: today }, gran === 'day' ? 'week' : gran),
    [db, gran, today],
  );
  const rows = useMemo(() => db.investments.map((inv) => ({ inv, p: positionOf(inv, db.investment_operations) })).sort((a, b) => b.p.currentValue - a.p.currentValue), [db]);
  const selected = route.params.id ? db.investments.find((i) => i.id === route.params.id) : undefined;
  const lastUpdate = db.investments.reduce<string | null>((m, i) => (i.quote_at && (!m || i.quote_at > m) ? i.quote_at : m), null);

  async function del(inv: Investment) {
    if (!(await confirm({ title: 'Excluir investimento?', text: `“${inv.name}” e todo o seu histórico de operações e cotações serão excluídos.`, danger: true, confirmLabel: 'Excluir' }))) return;
    await bulk(
      [
        { table: 'quote_history', remove: db.quote_history.filter((q) => q.investment_id === inv.id).map((q) => q.id) },
        { table: 'investment_operations', remove: db.investment_operations.filter((o) => o.investment_id === inv.id).map((o) => o.id) },
        { table: 'investments', remove: [inv.id] },
      ],
      'Investimento excluído.',
    );
    if (selected?.id === inv.id) setParams({});
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-ink-3">
          Valores de mercado atualizados em: <strong className="text-ink-2">{lastUpdate ? formatDateTime(lastUpdate) : 'nenhuma atualização ainda'}</strong>
          {sum.oldestQuote && sum.oldestQuote !== lastUpdate ? ` · cotação mais antiga: ${formatDateTime(sum.oldestQuote)}` : ''}
        </p>
        <div className="flex gap-2">
          <Button icon={<RefreshCw className={cx('size-4', loading && 'animate-spin')} />} disabled={loading} onClick={refresh} title={eligibleCount ? '' : 'Defina a fonte de cotação nos ativos'}>
            Atualizar cotações
          </Button>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => open({ type: 'investment', id: null })}>
            Novo investimento
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Patrimônio investido" value={<Money cents={sum.currentValue} />} hint="Valor atual estimado" icon={<Wallet className="size-4" />} />
        <Stat label="Total aportado" value={<Money cents={sum.contributed} />} hint="Soma das compras e aportes" icon={<Coins className="size-4" />} />
        <Stat label="Custo da posição atual" value={<Money cents={sum.costBasis} />} hint="Descontadas vendas e resgates" icon={<BarChart3 className="size-4" />} />
        <Stat label="Lucro / prejuízo" value={<Money cents={sum.result} tone="auto" signed />} hint="Valorização + realizados + proventos − taxas" icon={<TrendingUp className="size-4" />} tone={sum.result >= 0 ? 'pos' : 'neg'} />
        <Stat label="Rentabilidade" value={formatPercent(sum.returnPct)} hint="Resultado ÷ total aportado" icon={<Percent className="size-4" />} />
        <Stat label="Proventos recebidos" value={<Money cents={sum.income} />} hint="Dividendos e juros (líquidos)" icon={<LineChart className="size-4" />} />
      </div>
      {sum.unknownPrices > 0 && (
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-[13px] text-warn">
          {sum.unknownPrices} ativo(s) sem cotação ou valor atualizado: estão avaliados pelo custo de aquisição até você atualizar.
        </p>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhum investimento cadastrado"
            text="Cadastre ações, FIIs, Tesouro Direto, CDBs, fundos, cripto ou previdência. Para não duplicar valores, transfira o dinheiro para a conta da corretora e registre a compra a partir dela."
            action={
              <Button variant="primary" onClick={() => open({ type: 'investment', id: null })}>
                Cadastrar investimento
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="Por classe de ativo" />
              <div className="p-5 pt-2">
                <DonutChart data={sum.byClass.map((c, i) => ({ name: c.name, value: c.value, color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] }))} centerLabel="Total" centerValue={sum.currentValue} height={200} />
                <Legend items={sum.byClass} total={sum.currentValue} />
              </div>
            </Card>
            <Card>
              <CardHeader title="Por instituição" />
              <div className="p-5 pt-2">
                <DonutChart data={sum.byInstitution.map((c, i) => ({ name: c.name, value: c.value, color: CATEGORY_PALETTE[(i + 5) % CATEGORY_PALETTE.length] }))} height={200} />
                <Legend items={sum.byInstitution} total={sum.currentValue} offset={5} />
              </div>
            </Card>
            <Card>
              <CardHeader
                title="Evolução patrimonial"
                subtitle="Valor de mercado x custo, pelo último preço conhecido em cada data"
                action={
                  <Tabs
                    value={gran}
                    onChange={setGran}
                    options={[
                      { value: 'day', label: 'Semanal' },
                      { value: 'month', label: 'Mensal' },
                      { value: 'year', label: 'Anual' },
                    ]}
                  />
                }
              />
              <div className="px-2 pb-4 pt-3">
                <LinesChart
                  data={series}
                  height={250}
                  lines={[
                    { key: 'value', name: 'Valor', color: 'var(--color-accent)' },
                    { key: 'contributed', name: 'Custo', color: 'var(--color-ink-3)', dashed: true },
                  ]}
                />
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Carteira" subtitle="Clique em um ativo para ver o histórico de operações e cotações" />
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-[13px]">
                <thead className="border-y border-line bg-surface-2 text-xs text-ink-3">
                  <tr>
                    <th className="px-5 py-2.5">Ativo</th>
                    <th className="px-3 py-2.5">Classe · Instituição</th>
                    <th className="px-3 py-2.5 text-right">Qtd. · Preço médio</th>
                    <th className="px-3 py-2.5 text-right">Custo</th>
                    <th className="px-3 py-2.5 text-right">Valor atual</th>
                    <th className="px-3 py-2.5 text-right">Resultado</th>
                    <th className="px-3 py-2.5">Cotação</th>
                    <th className="px-5 py-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map(({ inv, p }) => (
                    <tr key={inv.id} className={cx('cursor-pointer hover:bg-surface-2/60', selected?.id === inv.id && 'bg-accent-soft/50')} onClick={() => setParams({ id: inv.id })}>
                      <td className="px-5 py-2.5">
                        <div className="font-medium">{inv.name}</div>
                        <div className="text-xs text-ink-3">
                          {inv.ticker || '—'}
                          {inv.maturity_date ? ` · vence ${formatDate(inv.maturity_date)}` : ''}
                          {inv.rate ? ` · ${inv.rate}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">
                        {inv.asset_class}
                        <div className="text-xs text-ink-3">{inv.institution || '—'}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular">
                        {inv.valuation_mode === 'unit' ? formatNumber(p.quantity) : '—'}
                        <div className="text-xs text-ink-3">{p.avgPrice !== null && inv.valuation_mode === 'unit' ? <Money cents={Math.round(p.avgPrice)} /> : ''}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Money cents={p.costBasis} />
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium">
                        <Money cents={p.currentValue} />
                        {inv.valuation_mode === 'unit' && inv.current_unit_price_cents !== null && (
                          <div className="text-xs font-normal text-ink-3">
                            {formatCurrency(inv.current_unit_price_cents, inv.currency)}
                            {inv.daily_change_pct !== null && (
                              <span className={inv.daily_change_pct >= 0 ? 'text-pos' : 'text-neg'}> {inv.daily_change_pct >= 0 ? '+' : ''}{inv.daily_change_pct.toFixed(2).replace('.', ',')}%</span>
                            )}
                          </div>
                        )}
                        {!p.priceKnown && p.costBasis > 0 && <div className="text-xs font-normal text-warn">sem cotação</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Money cents={p.result} tone="auto" signed />
                        <div className="text-xs text-ink-3">{formatPercent(p.returnPct)}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <QuoteBadge inv={inv} />
                      </td>
                      <td className="px-5 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end">
                          <Button size="sm" variant="ghost" onClick={() => setManual(inv)}>
                            Atualizar valor
                          </Button>
                          <IconButton label="Nova operação" onClick={() => open({ type: 'invop', investmentId: inv.id, opId: null })}>
                            <Plus className="size-4" />
                          </IconButton>
                          <IconButton label="Editar" onClick={() => open({ type: 'investment', id: inv.id })}>
                            <Pencil className="size-4" />
                          </IconButton>
                          <IconButton label="Excluir" className="hover:text-neg" onClick={() => del(inv)}>
                            <Trash2 className="size-4" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="h-2" />
          </Card>
          {selected && <InvestmentDetail inv={selected} onClose={() => setParams({})} />}
        </>
      )}
      <Card className="p-5 text-[13px] text-ink-2">
        <h3 className="mb-1 font-semibold text-ink">Fontes de cotação</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Ações, FIIs, ETFs e BDRs da B3: brapi.dev (cotação com atraso). {supabaseConfigured ? 'Consultada pelo backend (Edge Function).' : 'Sem backend configurado, apenas alguns tickers de teste (ex.: PETR4, VALE3, ITUB4, MGLU3) funcionam sem token.'}</li>
          <li>Criptomoedas: CoinGecko, cotadas diretamente em reais (informe o símbolo, ex.: BTC, ou o id CoinGecko).</li>
          <li>Câmbio USD/BRL para ativos internacionais: AwesomeAPI.</li>
          <li>Renda fixa, Tesouro Direto, fundos e previdência: atualização manual do valor total (não há fonte gratuita confiável para o valor de cada título).</li>
        </ul>
      </Card>
      {manual && <ManualValueDialog inv={manual} onClose={() => setManual(null)} />}
    </div>
  );
}

function Legend({ items, total, offset = 0 }: { items: { name: string; value: number }[]; total: number; offset?: number }) {
  return (
    <ul className="mt-3 space-y-1">
      {items.map((c, i) => (
        <li key={c.name} className="flex items-center gap-2 text-[13px]">
          <span className="size-2.5 rounded-full" style={{ background: CATEGORY_PALETTE[(i + offset) % CATEGORY_PALETTE.length] }} />
          <span className="flex-1 truncate">{c.name}</span>
          <span className="text-xs text-ink-3">{formatPercent(total ? c.value / total : 0)}</span>
          <Money cents={c.value} className="w-24 text-right" />
        </li>
      ))}
    </ul>
  );
}

function InvestmentDetail({ inv, onClose }: { inv: Investment; onClose: () => void }) {
  const { db, remove } = useStore();
  const { open, confirm } = useUI();
  const L = useLookups();
  const ops = db.investment_operations.filter((o) => o.investment_id === inv.id).sort((a, b) => b.date.localeCompare(a.date));
  const quotes = db.quote_history.filter((q) => q.investment_id === inv.id).sort((a, b) => b.quoted_at.localeCompare(a.quoted_at));
  return (
    <Card>
      <CardHeader
        title={`${inv.name}${inv.ticker ? ` · ${inv.ticker}` : ''}`}
        subtitle={[inv.asset_class, inv.institution, inv.indexer, inv.rate, inv.liquidity && `Liquidez: ${inv.liquidity}`].filter(Boolean).join(' · ')}
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => open({ type: 'invop', investmentId: inv.id, opId: null })}>
              Nova operação
            </Button>
            <IconButton label="Fechar" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          </div>
        }
      />
      <div className="grid gap-5 p-5 lg:grid-cols-2">
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
            <History className="size-4" /> Operações
          </h4>
          {ops.length === 0 ? (
            <p className="text-[13px] text-ink-3">Nenhuma operação.</p>
          ) : (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {ops.map((o) => (
                <li key={o.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <span className="w-20 text-ink-3 tabular">{formatDate(o.date)}</span>
                  <Badge tone={['sell', 'redemption', 'dividend', 'interest'].includes(o.type) ? 'pos' : ['fee', 'tax'].includes(o.type) ? 'neg' : 'info'}>{INV_OP_LABELS[o.type]}</Badge>
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-3">
                    {o.quantity ? `${formatNumber(o.quantity)} × ` : ''}
                    {o.unit_price_cents ? <Money cents={o.unit_price_cents} /> : ''}
                    {o.costs_cents ? ` · custos ${formatCurrency(o.costs_cents)}` : ''}
                    {o.taxes_cents ? ` · impostos ${formatCurrency(o.taxes_cents)}` : ''}
                    {o.account_id ? ` · ${L.accountName(o.account_id)}` : ''}
                  </span>
                  <Money cents={o.amount_cents} className="font-medium" />
                  <IconButton label="Editar" onClick={() => open({ type: 'invop', investmentId: inv.id, opId: o.id })}>
                    <Pencil className="size-3.5" />
                  </IconButton>
                  <IconButton
                    label="Excluir"
                    className="hover:text-neg"
                    onClick={async () => (await confirm({ title: 'Excluir operação?', danger: true, confirmLabel: 'Excluir' })) && remove('investment_operations', [o.id], 'Operação excluída.')}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-[13px] font-semibold">
            <LineChart className="size-4" /> Histórico de cotações e valores
          </h4>
          {quotes.length === 0 ? (
            <p className="text-[13px] text-ink-3">Nenhum preço registrado. Use “Atualizar valor” ou “Atualizar cotações”.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line">
              {quotes.map((q) => (
                <li key={q.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                  <span className="w-32 text-ink-3 tabular">{formatDateTime(q.quoted_at)}</span>
                  <span className="flex-1 truncate text-xs text-ink-3">
                    {q.source} · {QUOTE_KIND_LABELS[q.kind]}
                  </span>
                  <span className="tabular font-medium">{formatCurrency(q.price_cents, q.currency)}</span>
                  <IconButton label="Excluir" className="hover:text-neg" onClick={() => remove('quote_history', [q.id])}>
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
          {inv.notes && <p className="mt-3 text-[13px] text-ink-2">Observações: {inv.notes}</p>}
        </div>
      </div>
    </Card>
  );
}

function ManualValueDialog({ inv, onClose }: { inv: Investment; onClose: () => void }) {
  const { bulk, today } = useStore();
  const unit = inv.valuation_mode === 'unit';
  const [value, setValue] = useState<number | null>(unit ? inv.current_unit_price_cents : inv.current_total_cents);
  const [date, setDate] = useState(today);
  const [err, setErr] = useState('');
  async function submit() {
    if (value === null || value < 0) return setErr('Informe um valor válido.');
    if (!isValidISO(date)) return setErr('Data inválida.');
    const at = date === today ? nowISO() : `${date}T12:00:00.000Z`;
    const ok = await bulk(
      [
        { table: 'investments', upsert: [{ ...inv, ...(unit ? { current_unit_price_cents: value } : { current_total_cents: value }), quote_kind: 'manual', quote_source: 'Manual', quote_at: at, daily_change_pct: null }] },
        { table: 'quote_history', upsert: [{ id: uid(), investment_id: inv.id, price_cents: value, currency: unit ? inv.currency : 'BRL', source: 'Manual', kind: 'manual', quoted_at: at, created_at: nowISO(), updated_at: nowISO() }] },
      ],
      'Valor atualizado.',
    );
    if (ok) onClose();
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Atualizar valor · ${inv.name}`}
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
      <div className="grid gap-4">
        <Field label={unit ? `Preço atual por unidade (${inv.currency})` : 'Valor total atual (bruto, em R$)'} error={err} hint={unit ? undefined : 'Consulte o extrato da instituição. Este valor substitui o anterior.'}>
          <MoneyInput autoFocus value={value} onChange={setValue} />
        </Field>
        <Field label="Data de referência">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function InvestmentDialog({ id }: { id: string | null }) {
  const { db, bulk, settings, today } = useStore();
  const { close } = useUI();
  const L = useLookups();
  const existing = id ? db.investments.find((i) => i.id === id) : undefined;
  const [inv, setInv] = useState<Investment>(
    () =>
      existing ?? {
        id: uid(),
        name: '',
        asset_class: 'Ações',
        institution: '',
        ticker: '',
        valuation_mode: 'unit',
        quote_provider: 'brapi',
        currency: 'BRL',
        current_unit_price_cents: null,
        current_total_cents: null,
        fx_rate: null,
        quote_source: '',
        quote_kind: 'manual',
        quote_at: null,
        daily_change_pct: null,
        acquisition_date: today,
        maturity_date: null,
        rate: '',
        indexer: '',
        liquidity: '',
        account_id: L.activeAccounts.find((a) => a.type === 'brokerage')?.id ?? null,
        notes: '',
        created_at: nowISO(),
        updated_at: nowISO(),
      },
  );
  const [qty, setQty] = useState('');
  const [avg, setAvg] = useState<number | null>(null);
  const [invested, setInvested] = useState<number | null>(null);
  const [debit, setDebit] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (p: Partial<Investment>) => setInv((x) => ({ ...x, ...p }));
  const classes = settings.asset_classes.length ? settings.asset_classes : ['Outros investimentos'];
  const unit = inv.valuation_mode === 'unit';
  const qn = Number(qty.replace(/\./g, '').replace(',', '.')) || 0;

  const onClass = (c: string) => {
    const totalClasses = ['Renda fixa', 'Tesouro Direto', 'CDB', 'LCI e LCA', 'Fundos de investimento', 'Previdência privada'];
    const total = totalClasses.includes(c);
    set({ asset_class: c, valuation_mode: total ? 'total' : 'unit', quote_provider: total ? 'none' : c === 'Criptomoedas' ? 'coingecko' : ['Ações', 'ETFs', 'FIIs', 'BDRs'].includes(c) ? 'brapi' : 'none' });
  };

  async function submit() {
    const e: Record<string, string> = {};
    if (!inv.name.trim()) e.name = 'Informe o nome.';
    if (inv.quote_provider !== 'none' && !inv.ticker.trim()) e.ticker = 'Informe o ticker para buscar cotações.';
    if (inv.maturity_date && !isValidISO(inv.maturity_date)) e.maturity = 'Data inválida.';
    const amount = unit ? (invested ?? Math.round(qn * (avg ?? 0))) : invested ?? 0;
    if (!existing) {
      if (unit && qn <= 0) e.qty = 'Informe a quantidade.';
      if (amount <= 0) e.invested = 'Informe o valor investido ou o preço médio.';
      if (!inv.acquisition_date || !isValidISO(inv.acquisition_date)) e.date = 'Informe a data de aquisição.';
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    const row: Investment = { ...inv, name: inv.name.trim(), ticker: inv.ticker.trim().toUpperCase() };
    const ops: InvestmentOperation[] = [];
    if (!existing) {
      ops.push({
        id: uid(),
        investment_id: row.id,
        type: unit ? 'buy' : 'contribution',
        quantity: unit ? qn : 0,
        unit_price_cents: unit ? Math.round(amount / qn) : 0,
        amount_cents: amount,
        costs_cents: 0,
        taxes_cents: 0,
        date: inv.acquisition_date!,
        account_id: debit ? row.account_id : null,
        notes: 'Operação inicial',
        created_at: nowISO(),
        updated_at: nowISO(),
      });
      if (!unit && row.current_total_cents === null) row.current_total_cents = amount;
    }
    const ok = await bulk(
      [
        { table: 'investments', upsert: [row] },
        { table: 'investment_operations', upsert: ops },
      ],
      existing ? 'Investimento atualizado.' : 'Investimento cadastrado.',
    );
    if (ok) close();
  }

  return (
    <Modal
      open
      onClose={close}
      title={existing ? 'Editar investimento' : 'Novo investimento'}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit}>
            Salvar
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label="Nome *" error={errors.name}>
          <Input autoFocus value={inv.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Petrobras PN, CDB Banco X" />
        </Field>
        <Field label="Classe do ativo">
          <Select value={inv.asset_class} onChange={(e) => onClass(e.target.value)}>
            {classes.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Instituição / corretora">
          <Input value={inv.institution} onChange={(e) => set({ institution: e.target.value })} />
        </Field>
        <Field label="Forma de avaliação" hint={unit ? 'Valor = quantidade × preço.' : 'Você informa o valor total atualizado.'}>
          <Select value={inv.valuation_mode} onChange={(e) => set({ valuation_mode: e.target.value as 'unit' | 'total', quote_provider: e.target.value === 'total' ? 'none' : inv.quote_provider })}>
            <option value="unit">Por cotação (quantidade × preço)</option>
            <option value="total">Por valor total (renda fixa, fundos)</option>
          </Select>
        </Field>
        <Field label="Código / ticker" error={errors.ticker}>
          <Input value={inv.ticker} onChange={(e) => set({ ticker: e.target.value })} placeholder="Ex.: PETR4, BTC" />
        </Field>
        {unit && (
          <Field label="Fonte de cotação">
            <Select value={inv.quote_provider} onChange={(e) => set({ quote_provider: e.target.value as Investment['quote_provider'] })}>
              <option value="brapi">B3 (brapi.dev)</option>
              <option value="coingecko">Criptomoeda (CoinGecko)</option>
              <option value="none">Manual</option>
            </Select>
          </Field>
        )}
        {unit && inv.quote_provider === 'none' && (
          <Field label="Moeda do ativo">
            <Select value={inv.currency} onChange={(e) => set({ currency: e.target.value })}>
              <option value="BRL">Real (BRL)</option>
              <option value="USD">Dólar (USD)</option>
            </Select>
          </Field>
        )}
        {unit && inv.currency !== 'BRL' && (
          <Field label="Câmbio (R$ por 1 USD)" hint="Atualizado automaticamente em “Atualizar cotações”.">
            <Input inputMode="decimal" value={inv.fx_rate ?? ''} onChange={(e) => set({ fx_rate: Number(e.target.value.replace(',', '.')) || null })} />
          </Field>
        )}
        <Field label="Conta / corretora vinculada" hint="Compras e resgates movimentam o saldo desta conta.">
          <Select value={inv.account_id ?? ''} onChange={(e) => set({ account_id: e.target.value || null })}>
            <option value="">Nenhuma</option>
            {L.activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        {!existing && (
          <>
            {unit && (
              <Field label="Quantidade *" error={errors.qty}>
                <Input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Ex.: 100" />
              </Field>
            )}
            {unit && (
              <Field label="Preço médio de aquisição">
                <MoneyInput value={avg} onChange={(v) => (setAvg(v), setInvested(v !== null && qn ? Math.round(v * qn) : null))} />
              </Field>
            )}
            <Field label="Valor investido *" error={errors.invested}>
              <MoneyInput value={invested} onChange={(v) => (setInvested(v), unit && v !== null && qn && setAvg(Math.round(v / qn)))} />
            </Field>
            <Field label="Data de aquisição *" error={errors.date}>
              <Input type="date" value={inv.acquisition_date ?? ''} onChange={(e) => set({ acquisition_date: e.target.value })} />
            </Field>
            {inv.account_id && (
              <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink-2">
                <input type="checkbox" checked={debit} onChange={(e) => setDebit(e.target.checked)} className="accent-[var(--color-accent)]" />
                Descontar o valor do saldo da conta vinculada
              </label>
            )}
          </>
        )}
        {unit ? (
          <Field label="Valor atual por unidade" hint="Opcional; preenchido pelas cotações.">
            <MoneyInput value={inv.current_unit_price_cents} onChange={(v) => set({ current_unit_price_cents: v, quote_kind: 'manual', quote_source: 'Manual', quote_at: nowISO() })} />
          </Field>
        ) : (
          <Field label="Valor total atual" hint="Se vazio, usa o valor investido.">
            <MoneyInput value={inv.current_total_cents} onChange={(v) => set({ current_total_cents: v, quote_kind: 'manual', quote_source: 'Manual', quote_at: nowISO() })} />
          </Field>
        )}
        <Field label="Vencimento" error={errors.maturity}>
          <Input type="date" value={inv.maturity_date ?? ''} onChange={(e) => set({ maturity_date: e.target.value || null })} />
        </Field>
        <Field label="Taxa contratada">
          <Input value={inv.rate} onChange={(e) => set({ rate: e.target.value })} placeholder="Ex.: 110% do CDI, IPCA + 6%" />
        </Field>
        <Field label="Indexador">
          <Select value={inv.indexer} onChange={(e) => set({ indexer: e.target.value })}>
            <option value="">—</option>
            {['CDI', 'Selic', 'IPCA', 'IGP-M', 'Prefixado', 'Outro'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Select>
        </Field>
        <Field label="Liquidez">
          <Input value={inv.liquidity} onChange={(e) => set({ liquidity: e.target.value })} placeholder="Ex.: Diária, D+2, no vencimento" />
        </Field>
        <Field label="Observações" className="sm:col-span-2 lg:col-span-3">
          <Textarea value={inv.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function InvestmentOpDialog({ investmentId, opId }: { investmentId: string; opId: string | null }) {
  const { db, save, today } = useStore();
  const { close } = useUI();
  const L = useLookups();
  const inv = db.investments.find((i) => i.id === investmentId);
  const existing = opId ? db.investment_operations.find((o) => o.id === opId) : undefined;
  const [op, setOp] = useState<InvestmentOperation>(
    () =>
      existing ?? {
        id: uid(),
        investment_id: investmentId,
        type: inv?.valuation_mode === 'total' ? 'contribution' : 'buy',
        quantity: 0,
        unit_price_cents: 0,
        amount_cents: 0,
        costs_cents: 0,
        taxes_cents: 0,
        date: today,
        account_id: inv?.account_id ?? null,
        notes: '',
        created_at: nowISO(),
        updated_at: nowISO(),
      },
  );
  const [qtyText, setQtyText] = useState(op.quantity ? String(op.quantity).replace('.', ',') : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (!inv) return null;
  const set = (p: Partial<InvestmentOperation>) => setOp((x) => ({ ...x, ...p }));
  const withQty = inv.valuation_mode === 'unit' && ['buy', 'sell', 'contribution', 'redemption'].includes(op.type);
  const pos = positionOf(inv, db.investment_operations.filter((o) => o.id !== op.id));
  const qtyNum = Number(qtyText.replace(/\./g, '').replace(',', '.')) || 0;

  async function submit() {
    const e: Record<string, string> = {};
    const q = withQty ? Number(qtyText.replace(/\./g, '').replace(',', '.')) || 0 : 0;
    const amount = withQty && op.unit_price_cents && q ? Math.round(q * op.unit_price_cents) : op.amount_cents;
    if (withQty && q <= 0) e.qty = 'Informe a quantidade.';
    if (withQty && ['sell', 'redemption'].includes(op.type) && q > pos.quantity + 1e-9) e.qty = `Quantidade maior que a posição (${formatNumber(pos.quantity)}).`;
    if (amount <= 0) e.amount = 'Informe o valor.';
    if (!isValidISO(op.date)) e.date = 'Data inválida.';
    setErrors(e);
    if (Object.keys(e).length) return;
    if (await save('investment_operations', { ...op, quantity: q, amount_cents: amount, unit_price_cents: withQty ? Math.round(amount / q) : 0 }, existing ? 'Operação atualizada.' : 'Operação registrada.')) close();
  }

  const cashHint: Record<InvOpType, string> = {
    buy: 'Sai da conta vinculada',
    contribution: 'Sai da conta vinculada',
    sell: 'Entra na conta vinculada (líquido de custos e impostos)',
    redemption: 'Entra na conta vinculada (líquido de custos e impostos)',
    dividend: 'Entra na conta vinculada',
    interest: 'Entra na conta vinculada',
    fee: 'Sai da conta vinculada',
    tax: 'Sai da conta vinculada',
  };

  return (
    <Modal
      open
      onClose={close}
      title={`${existing ? 'Editar' : 'Nova'} operação · ${inv.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit}>
            Salvar
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label="Tipo de operação">
          <Select value={op.type} onChange={(e) => set({ type: e.target.value as InvOpType })}>
            {Object.entries(INV_OP_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data *" error={errors.date}>
          <Input type="date" value={op.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        {withQty && (
          <>
            <Field label="Quantidade *" error={errors.qty} hint={['sell', 'redemption'].includes(op.type) ? `Posição atual: ${formatNumber(pos.quantity)}` : undefined}>
              <Input inputMode="decimal" autoFocus value={qtyText} onChange={(e) => setQtyText(e.target.value)} />
            </Field>
            <Field label="Preço unitário (R$)">
              <MoneyInput value={op.unit_price_cents || null} onChange={(v) => set({ unit_price_cents: v ?? 0 })} />
            </Field>
          </>
        )}
        <Field label={withQty ? 'Valor total (calculado se preço informado)' : 'Valor *'} error={errors.amount}>
          <MoneyInput
            value={withQty && op.unit_price_cents && qtyNum ? Math.round(qtyNum * op.unit_price_cents) : op.amount_cents || null}
            onChange={(v) => set({ amount_cents: v ?? 0, unit_price_cents: withQty ? 0 : op.unit_price_cents })}
          />
        </Field>
        {['buy', 'sell', 'contribution', 'redemption'].includes(op.type) && (
          <Field label="Custos (corretagem, emolumentos)">
            <MoneyInput value={op.costs_cents || null} onChange={(v) => set({ costs_cents: v ?? 0 })} />
          </Field>
        )}
        {['sell', 'redemption', 'dividend', 'interest'].includes(op.type) && (
          <Field label="Impostos retidos (IR)">
            <MoneyInput value={op.taxes_cents || null} onChange={(v) => set({ taxes_cents: v ?? 0 })} />
          </Field>
        )}
        <Field label="Conta movimentada" hint={op.account_id ? cashHint[op.type] : 'Sem conta: não altera saldos em contas.'}>
          <Select value={op.account_id ?? ''} onChange={(e) => set({ account_id: e.target.value || null })}>
            <option value="">Nenhuma</option>
            {L.activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <Textarea value={op.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
