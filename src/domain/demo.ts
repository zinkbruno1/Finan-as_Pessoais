// Dados de demonstração — carregados apenas por ação explícita do usuário e marcados com is_demo
// para poderem ser removidos sem afetar os dados reais.
import { addDays, addMonths, startOfMonth, type ISODate } from '../lib/dates';
import { nowISO, uid } from './defaults';
import type { Category, DB, Transaction } from './types';

export function buildDemo(categories: Category[], today: ISODate): Partial<DB> {
  const now = nowISO();
  const base = { created_at: now, updated_at: now, is_demo: true };
  const top = (name: string) => categories.find((c) => !c.parent_id && c.name === name);
  const sub = (parent: string, name: string) => {
    const p = top(parent);
    return categories.find((c) => c.parent_id === p?.id && c.name === name);
  };
  const start = addMonths(startOfMonth(today), -3);
  const bank = { id: uid(), name: 'Conta corrente (demonstração)', institution: 'Banco Exemplo', type: 'checking' as const, initial_balance_cents: 250_000, initial_date: start, archived: false, ...base };
  const broker = { id: uid(), name: 'Corretora (demonstração)', institution: 'Corretora Exemplo', type: 'brokerage' as const, initial_balance_cents: 0, initial_date: start, archived: false, ...base };

  const tx: Transaction[] = [];
  const add = (kind: 'income' | 'expense', amount: number, desc: string, cat: string, subName: string | null, date: ISODate, status: 'done' | 'pending' = 'done', pm: Transaction['payment_method'] = 'pix') => {
    if (date > addDays(today, 31)) return;
    tx.push({
      id: uid(),
      kind,
      amount_cents: amount,
      description: desc,
      original_text: '',
      category_id: top(cat)?.id ?? null,
      subcategory_id: subName ? sub(cat, subName)?.id ?? null : null,
      account_id: bank.id,
      date,
      settled_date: status === 'done' ? date : null,
      status: date > today ? 'pending' : status,
      payment_method: pm,
      payer: kind === 'income' ? 'Empresa Exemplo' : '',
      recurring_id: null,
      recurrence_date: null,
      notes: '',
      tags: [],
      ...base,
    });
  };
  for (let m = 0; m <= 3; m++) {
    const ms = addMonths(start, m);
    const d = (day: number) => `${ms.slice(0, 8)}${String(day).padStart(2, '0')}`;
    add('income', 520_000, 'Salário', 'Salário', null, d(5));
    add('expense', 150_000, 'Aluguel', 'Moradia', 'Aluguel', d(10), 'done', 'boleto');
    add('expense', 18_990, 'Energia elétrica', 'Moradia', 'Energia', d(15), 'done', 'boleto');
    add('expense', 9_990, 'Internet', 'Moradia', 'Internet', d(15));
    add('expense', 55_000 + m * 3_200, 'Supermercado', 'Alimentação', 'Mercado', d(7), 'done', 'debit');
    add('expense', 21_350, 'Supermercado', 'Alimentação', 'Mercado', d(21), 'done', 'debit');
    add('expense', 6_490, 'Pizza', 'Alimentação', 'Pizza', d(12), 'done', 'credit');
    add('expense', 4_590, 'Delivery', 'Alimentação', 'Delivery', d(18), 'done', 'credit');
    add('expense', 25_000, 'Gasolina', 'Transporte', 'Combustível', d(9), 'done', 'debit');
    add('expense', 3_890, 'Uber', 'Transporte', 'Aplicativos de transporte', d(20), 'done', 'credit');
    add('expense', 5_590, 'Netflix', 'Assinaturas e serviços digitais', 'Streaming', d(3), 'done', 'credit');
    add('expense', 8_000 + m * 1_000, 'Farmácia', 'Saúde', 'Farmácia', d(14), 'done', 'debit');
    add('expense', 12_000, 'Cinema e jantar', 'Lazer', 'Cinema', d(23), 'done', 'credit');
    if (m % 2 === 1) add('income', 80_000, 'Projeto freelancer', 'Trabalho freelancer', null, d(25));
  }
  const investment = {
    id: uid(),
    name: 'Tesouro Selic (demonstração)',
    asset_class: 'Tesouro Direto',
    institution: 'Corretora Exemplo',
    ticker: '',
    valuation_mode: 'total' as const,
    quote_provider: 'none' as const,
    currency: 'BRL',
    current_unit_price_cents: null,
    current_total_cents: 103_200,
    fx_rate: null,
    quote_source: 'Manual',
    quote_kind: 'manual' as const,
    quote_at: now,
    daily_change_pct: null,
    acquisition_date: addDays(start, 6),
    maturity_date: `${Number(today.slice(0, 4)) + 3}-03-01`,
    rate: 'Selic + 0,1%',
    indexer: 'Selic',
    liquidity: 'D+1',
    account_id: broker.id,
    notes: 'Exemplo de renda fixa com atualização manual.',
    ...base,
  };
  return {
    accounts: [bank, broker],
    transactions: tx,
    transfers: [{ id: uid(), from_account_id: bank.id, to_account_id: broker.id, amount_cents: 100_000, date: addDays(start, 6), status: 'done', description: 'Envio para a corretora', ...base }],
    investments: [investment],
    investment_operations: [
      { id: uid(), investment_id: investment.id, type: 'contribution', quantity: 0, unit_price_cents: 0, amount_cents: 100_000, costs_cents: 0, taxes_cents: 0, date: addDays(start, 6), account_id: broker.id, notes: '', ...base },
    ],
    quote_history: [{ id: uid(), investment_id: investment.id, price_cents: 103_200, currency: 'BRL', source: 'Manual', kind: 'manual', quoted_at: now, ...base }],
    budgets: top('Alimentação')
      ? [{ id: uid(), category_id: top('Alimentação')!.id, month: today.slice(0, 7), limit_cents: 90_000, alert_levels: [70, 90, 100], ...base }]
      : [],
    goals: [
      { id: uid(), name: 'Reserva de emergência (demonstração)', target_cents: 1_500_000, saved_cents: 0, start_date: start, deadline: `${Number(today.slice(0, 4)) + 1}-12-31`, link_type: 'investment', link_id: investment.id, description: '', status: 'active', ...base },
    ],
  };
}
