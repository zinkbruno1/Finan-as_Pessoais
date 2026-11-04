import { describe, expect, it } from 'vitest';
import type { Account, DB, Investment, InvestmentOperation, Transaction, Transfer } from './types';
import { emptyDB } from './types';
import {
  accountBalance,
  balanceSeries,
  budgetStatus,
  categoryBreakdown,
  goalProgress,
  incomeExpenseSeries,
  netWorth,
  periodSummary,
  portfolioSummary,
  positionOf,
  savingsRate,
  totalCash,
} from './finance';
import { buildDefaultCategories } from './defaults';

const T = '2026-01-01T00:00:00.000Z';
let n = 0;
const id = () => `id${++n}`;

function acc(p: Partial<Account> = {}): Account {
  return { id: id(), name: 'Conta', institution: 'Banco', type: 'checking', initial_balance_cents: 0, initial_date: '2026-01-01', archived: false, created_at: T, updated_at: T, ...p };
}
function tx(p: Partial<Transaction>): Transaction {
  return {
    id: id(), kind: 'expense', amount_cents: 0, description: '', original_text: '', category_id: null, subcategory_id: null, account_id: null,
    date: '2026-03-10', settled_date: null, status: 'done', payment_method: '', payer: '', recurring_id: null, recurrence_date: null,
    notes: '', tags: [], created_at: T, updated_at: T, ...p,
  };
}
function transfer(p: Partial<Transfer>): Transfer {
  return { id: id(), from_account_id: '', to_account_id: '', amount_cents: 0, date: '2026-03-10', status: 'done', description: '', created_at: T, updated_at: T, ...p };
}
function inv(p: Partial<Investment> = {}): Investment {
  return {
    id: id(), name: 'PETR4', asset_class: 'Ações', institution: 'Corretora', ticker: 'PETR4', valuation_mode: 'unit', quote_provider: 'none', currency: 'BRL',
    current_unit_price_cents: null, current_total_cents: null, fx_rate: null, quote_source: '', quote_kind: 'manual', quote_at: null, daily_change_pct: null,
    acquisition_date: null, maturity_date: null, rate: '', indexer: '', liquidity: '', account_id: null, notes: '', created_at: T, updated_at: T, ...p,
  };
}
function op(p: Partial<InvestmentOperation>): InvestmentOperation {
  return { id: id(), investment_id: '', type: 'buy', quantity: 0, unit_price_cents: 0, amount_cents: 0, costs_cents: 0, taxes_cents: 0, date: '2026-03-01', account_id: null, notes: '', created_at: T, updated_at: T, ...p };
}
function db(p: Partial<DB>): DB {
  return { ...emptyDB(), ...p };
}

describe('saldos de contas', () => {
  it('regras 1, 2 e 3: despesa paga reduz, receita recebida aumenta, pendente não altera', () => {
    const a = acc({ initial_balance_cents: 100_000 });
    const d = db({
      accounts: [a],
      transactions: [
        tx({ account_id: a.id, kind: 'expense', amount_cents: 20_000 }),
        tx({ account_id: a.id, kind: 'income', amount_cents: 50_000 }),
        tx({ account_id: a.id, kind: 'expense', amount_cents: 99_999, status: 'pending' }),
        tx({ account_id: a.id, kind: 'income', amount_cents: 99_999, status: 'pending' }),
      ],
    });
    expect(accountBalance(a, d)).toBe(130_000);
  });

  it('regra 4: transferência entre contas próprias altera as contas mas não o consolidado nem o resultado', () => {
    const a = acc({ initial_balance_cents: 100_000 });
    const b = acc({ initial_balance_cents: 0 });
    const d = db({ accounts: [a, b], transfers: [transfer({ from_account_id: a.id, to_account_id: b.id, amount_cents: 30_000 })] });
    expect(accountBalance(a, d)).toBe(70_000);
    expect(accountBalance(b, d)).toBe(30_000);
    expect(totalCash(d)).toBe(100_000);
    const s = periodSummary(d.transactions, { start: '2026-03-01', end: '2026-03-31' });
    expect(s.income).toBe(0);
    expect(s.expense).toBe(0);
  });

  it('transferência pendente não move saldos', () => {
    const a = acc({ initial_balance_cents: 100_000 });
    const b = acc();
    const d = db({ accounts: [a, b], transfers: [transfer({ from_account_id: a.id, to_account_id: b.id, amount_cents: 30_000, status: 'pending' })] });
    expect(accountBalance(a, d)).toBe(100_000);
  });

  it('regra 11: saldo atual ignora o período selecionado e considera o saldo inicial', () => {
    const a = acc({ initial_balance_cents: 10_000, initial_date: '2026-01-01' });
    const d = db({
      accounts: [a],
      transactions: [tx({ account_id: a.id, kind: 'income', amount_cents: 5_000, date: '2026-01-15' }), tx({ account_id: a.id, amount_cents: 2_000, date: '2026-06-01' })],
    });
    expect(accountBalance(a, d)).toBe(13_000);
    expect(accountBalance(a, d, '2026-02-01')).toBe(15_000);
  });

  it('movimentações anteriores à data do saldo inicial não são somadas', () => {
    const a = acc({ initial_balance_cents: 10_000, initial_date: '2026-03-01' });
    const d = db({ accounts: [a], transactions: [tx({ account_id: a.id, amount_cents: 5_000, date: '2026-02-20' })] });
    expect(accountBalance(a, d)).toBe(10_000);
  });

  it('regra 12: usa a data de liquidação quando informada', () => {
    const a = acc();
    const t = tx({ account_id: a.id, kind: 'expense', amount_cents: 1_000, date: '2026-03-28', settled_date: '2026-04-02' });
    const d = db({ accounts: [a], transactions: [t] });
    expect(accountBalance(a, d, '2026-03-31')).toBe(0);
    expect(accountBalance(a, d, '2026-04-02')).toBe(-1_000);
    expect(periodSummary([t], { start: '2026-03-01', end: '2026-03-31' }).expense).toBe(0);
    expect(periodSummary([t], { start: '2026-04-01', end: '2026-04-30' }).expense).toBe(1_000);
  });
});

describe('resultado do período e economia', () => {
  it('resultado = entradas realizadas − despesas efetivas; pendentes ficam separadas', () => {
    const txs = [
      tx({ kind: 'income', amount_cents: 500_000 }),
      tx({ kind: 'expense', amount_cents: 120_000 }),
      tx({ kind: 'expense', amount_cents: 30_000, status: 'pending' }),
      tx({ kind: 'income', amount_cents: 80_000, status: 'pending' }),
      tx({ kind: 'expense', amount_cents: 7_000, date: '2026-04-01' }),
    ];
    const s = periodSummary(txs, { start: '2026-03-01', end: '2026-03-31' });
    expect(s.income).toBe(500_000);
    expect(s.expense).toBe(120_000);
    expect(s.result).toBe(380_000);
    expect(s.pendingExpense).toBe(30_000);
    expect(s.expectedIncome).toBe(80_000);
    expect(s.savingsRate).toBeCloseTo(0.76);
  });

  it('sem entradas, o percentual de economia é "não disponível" (null)', () => {
    expect(savingsRate(0, 100)).toBeNull();
    expect(savingsRate(1000, 1500)).toBe(0);
  });

  it('regra 9: série mensal soma o mesmo que o resumo do período', () => {
    const txs = [tx({ kind: 'income', amount_cents: 100, date: '2026-01-05' }), tx({ amount_cents: 40, date: '2026-02-10' }), tx({ amount_cents: 60, date: '2026-02-20' })];
    const range = { start: '2026-01-01', end: '2026-03-31' };
    const series = incomeExpenseSeries(txs, range, 'month');
    const s = periodSummary(txs, range);
    expect(series.reduce((x, p) => x + p.expense, 0)).toBe(s.expense);
    expect(series.map((p) => p.expense)).toEqual([0, 100, 0]);
  });

  it('regra 8: excluir um lançamento atualiza os indicadores (cálculo é derivado)', () => {
    const a = acc();
    const t1 = tx({ account_id: a.id, amount_cents: 1_000 });
    const t2 = tx({ account_id: a.id, amount_cents: 2_000 });
    const d = db({ accounts: [a], transactions: [t1, t2] });
    expect(accountBalance(a, d)).toBe(-3_000);
    d.transactions = d.transactions.filter((t) => t.id !== t1.id);
    expect(accountBalance(a, d)).toBe(-2_000);
  });

  it('evolução do saldo informa abertura e fechamento de cada mês', () => {
    const a = acc({ initial_balance_cents: 1_000 });
    const d = db({ accounts: [a], transactions: [tx({ account_id: a.id, kind: 'income', amount_cents: 500, date: '2026-02-10' })] });
    const s = balanceSeries(d, { start: '2026-01-01', end: '2026-02-28' }, 'month');
    expect(s.map((p) => [p.opening, p.closing])).toEqual([[1_000, 1_000], [1_000, 1_500]]);
  });
});

describe('categorias', () => {
  it('agrupa por categoria principal com detalhamento por subcategoria', () => {
    const cats = buildDefaultCategories();
    const alim = cats.find((c) => c.name === 'Alimentação')!;
    const mercado = cats.find((c) => c.name === 'Mercado')!;
    const pizza = cats.find((c) => c.name === 'Pizza')!;
    const transp = cats.find((c) => c.name === 'Transporte')!;
    const txs = [
      tx({ category_id: alim.id, subcategory_id: mercado.id, amount_cents: 30_000 }),
      tx({ category_id: alim.id, subcategory_id: pizza.id, amount_cents: 8_000 }),
      tx({ category_id: transp.id, amount_cents: 12_000 }),
    ];
    const b = categoryBreakdown(txs, cats, { start: '2026-03-01', end: '2026-03-31' }, 'expense');
    expect(b[0].name).toBe('Alimentação');
    expect(b[0].total).toBe(38_000);
    expect(b[0].share).toBeCloseTo(38 / 50);
    expect(b[0].subs.map((s) => [s.name, s.total])).toEqual([['Mercado', 30_000], ['Pizza', 8_000]]);
  });
});

describe('investimentos', () => {
  it('regras 5 e 7: aporte via corretora sai do caixa e entra na carteira, sem duplicar patrimônio', () => {
    const bank = acc({ initial_balance_cents: 100_000 });
    const broker = acc({ type: 'brokerage' });
    const i = inv({ current_unit_price_cents: 4_000, account_id: broker.id });
    const d = db({
      accounts: [bank, broker],
      transfers: [transfer({ from_account_id: bank.id, to_account_id: broker.id, amount_cents: 50_000, date: '2026-02-28' })],
      investments: [i],
      investment_operations: [op({ investment_id: i.id, quantity: 10, unit_price_cents: 3_500, amount_cents: 35_000, costs_cents: 500, account_id: broker.id })],
    });
    expect(accountBalance(bank, d)).toBe(50_000);
    expect(accountBalance(broker, d)).toBe(14_500);
    const nw = netWorth(d);
    expect(nw.investments).toBe(40_000);
    expect(nw.total).toBe(50_000 + 14_500 + 40_000);
    // nenhuma despesa de consumo foi gerada
    expect(periodSummary(d.transactions, { start: '2026-01-01', end: '2026-12-31' }).expense).toBe(0);
  });

  it('regra 6: novos aportes não são lucro; venda usa custo médio', () => {
    const i = inv({ current_unit_price_cents: 1_200 });
    const ops = [
      op({ investment_id: i.id, quantity: 10, amount_cents: 10_000, date: '2026-01-01' }),
      op({ investment_id: i.id, quantity: 10, amount_cents: 12_000, date: '2026-02-01' }),
    ];
    let p = positionOf(i, ops);
    expect(p.contributed).toBe(22_000);
    expect(p.currentValue).toBe(24_000);
    expect(p.result).toBe(2_000);
    ops.push(op({ investment_id: i.id, type: 'sell', quantity: 5, amount_cents: 7_000, date: '2026-03-01' }));
    p = positionOf(i, ops);
    expect(p.quantity).toBe(15);
    expect(p.costBasis).toBe(16_500); // custo médio 11,00
    expect(p.realizedGain).toBe(1_500);
    expect(p.currentValue).toBe(18_000);
    expect(p.result).toBe(1_500 + 1_500);
  });

  it('proventos e taxas entram no resultado, separados dos aportes', () => {
    const i = inv({ valuation_mode: 'total', current_total_cents: 105_000 });
    const ops = [
      op({ investment_id: i.id, type: 'contribution', amount_cents: 100_000 }),
      op({ investment_id: i.id, type: 'interest', amount_cents: 1_000, taxes_cents: 150 }),
      op({ investment_id: i.id, type: 'fee', amount_cents: 200 }),
    ];
    const p = positionOf(i, ops);
    expect(p.unrealized).toBe(5_000);
    expect(p.income).toBe(850);
    expect(p.result).toBe(5_000 + 850 - 200);
    expect(p.returnPct).toBeCloseTo(5_650 / 100_000);
  });

  it('sem cotação, o valor atual usa o custo e sinaliza preço desconhecido', () => {
    const i = inv();
    const d = db({ investments: [i], investment_operations: [op({ investment_id: i.id, quantity: 1, amount_cents: 1_000 })] });
    const s = portfolioSummary(d);
    expect(s.currentValue).toBe(1_000);
    expect(s.unknownPrices).toBe(1);
  });

  it('ativo internacional converte pela taxa de câmbio', () => {
    const i = inv({ currency: 'USD', current_unit_price_cents: 10_000, fx_rate: 5.5 });
    const p = positionOf(i, [op({ investment_id: i.id, quantity: 2, amount_cents: 100_000 })]);
    expect(p.currentValue).toBe(110_000);
  });
});

describe('orçamentos e metas', () => {
  it('orçamento soma gastos realizados da categoria e subcategorias, e indica alerta', () => {
    const cats = buildDefaultCategories();
    const alim = cats.find((c) => c.name === 'Alimentação')!;
    const mercado = cats.find((c) => c.name === 'Mercado')!;
    const txs = [
      tx({ category_id: alim.id, subcategory_id: mercado.id, amount_cents: 60_000, date: '2026-03-05' }),
      tx({ category_id: alim.id, amount_cents: 15_000, date: '2026-03-06' }),
      tx({ category_id: alim.id, amount_cents: 50_000, date: '2026-03-07', status: 'pending' }),
    ];
    const st = budgetStatus({ id: 'b', category_id: alim.id, month: '2026-03', limit_cents: 80_000, alert_levels: [70, 90, 100], created_at: T, updated_at: T }, txs, cats, '2026-03-10');
    expect(st.spent).toBe(75_000);
    expect(st.remaining).toBe(5_000);
    expect(st.level).toBe(90);
    expect(st.forecast).toBe(Math.round((75_000 / 10) * 31));
  });

  it('meta vinculada a conta usa o saldo da conta e calcula aporte mensal', () => {
    const a = acc({ initial_balance_cents: 200_000 });
    const d = db({ accounts: [a] });
    const g = goalProgress(
      { id: 'g', name: 'Reserva', target_cents: 1_400_000, saved_cents: 999_999, start_date: '2026-01-01', deadline: '2027-01-01', link_type: 'account', link_id: a.id, description: '', status: 'active', created_at: T, updated_at: T },
      d,
      '2026-07-01',
    );
    expect(g.saved).toBe(200_000);
    expect(g.remaining).toBe(1_200_000);
    expect(g.monthsLeft).toBe(6);
    expect(g.monthlyNeeded).toBe(200_000);
  });
});
