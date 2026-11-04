import type { ISODate } from '../lib/dates';

// Todos os valores monetários são centavos inteiros (amount_cents etc.).
// Os nomes dos campos seguem snake_case para corresponder 1:1 às colunas do PostgreSQL.

export interface BaseRow {
  id: string;
  created_at: string;
  updated_at: string;
  is_demo?: boolean;
}

export type AccountType = 'checking' | 'savings' | 'wallet' | 'cash' | 'brokerage' | 'other';
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Conta poupança',
  wallet: 'Carteira digital',
  cash: 'Dinheiro em espécie',
  brokerage: 'Corretora',
  other: 'Outra conta',
};

export interface Account extends BaseRow {
  name: string;
  institution: string;
  type: AccountType;
  initial_balance_cents: number;
  initial_date: ISODate;
  archived: boolean;
}

export type CategoryKind = 'expense' | 'income';

export interface Category extends BaseRow {
  name: string;
  kind: CategoryKind;
  parent_id: string | null;
  color: string;
  icon: string;
  sort_order: number;
}

export type TxKind = 'income' | 'expense';
export type TxStatus = 'done' | 'pending';

export type PaymentMethod = 'pix' | 'debit' | 'credit' | 'cash' | 'boleto' | 'transfer' | 'other' | '';
export const PAYMENT_LABELS: Record<Exclude<PaymentMethod, ''>, string> = {
  pix: 'Pix',
  debit: 'Débito',
  credit: 'Crédito',
  cash: 'Dinheiro',
  boleto: 'Boleto',
  transfer: 'Transferência',
  other: 'Outro',
};

export interface Transaction extends BaseRow {
  kind: TxKind;
  amount_cents: number; // sempre positivo; o sinal vem de kind
  description: string;
  original_text: string; // texto digitado no lançamento rápido, preservado
  category_id: string | null;
  subcategory_id: string | null;
  account_id: string | null;
  date: ISODate; // data da movimentação (competência / vencimento)
  settled_date: ISODate | null; // data efetiva de pagamento/recebimento
  status: TxStatus;
  payment_method: PaymentMethod;
  payer: string; // fonte pagadora (entradas)
  recurring_id: string | null;
  recurrence_date: ISODate | null; // ocorrência que originou o lançamento (evita duplicações)
  notes: string;
  tags: string[];
}

export interface Transfer extends BaseRow {
  from_account_id: string;
  to_account_id: string;
  amount_cents: number;
  date: ISODate;
  status: TxStatus;
  description: string;
}

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'Diária',
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

export interface Recurring extends BaseRow {
  kind: TxKind;
  description: string;
  amount_cents: number;
  category_id: string | null;
  subcategory_id: string | null;
  account_id: string | null;
  payment_method: PaymentMethod;
  frequency: Frequency;
  start_date: ISODate;
  end_date: ISODate | null;
  due_day: number | null; // dia do vencimento (mensal/anual)
  auto_confirm: boolean; // se true, ocorrências vencidas entram como realizadas
  active: boolean;
  generated_until: ISODate | null; // última ocorrência já gerada
}

export type AssetClass = string; // classes são editáveis pelo usuário
export const DEFAULT_ASSET_CLASSES = [
  'Renda fixa',
  'Tesouro Direto',
  'CDB',
  'LCI e LCA',
  'Fundos de investimento',
  'Ações',
  'ETFs',
  'FIIs',
  'BDRs',
  'Criptomoedas',
  'Previdência privada',
  'Outros investimentos',
];

/** unit: valor = quantidade × preço unitário (ações, FIIs, cripto). total: valor total atualizado manualmente (CDB, previdência). */
export type ValuationMode = 'unit' | 'total';
export type QuoteKind = 'manual' | 'realtime' | 'delayed' | 'last_known';
export const QUOTE_KIND_LABELS: Record<QuoteKind, string> = {
  manual: 'Atualização manual',
  realtime: 'Tempo real',
  delayed: 'Cotação com atraso',
  last_known: 'Último valor conhecido',
};

export type QuoteProvider = 'none' | 'brapi' | 'coingecko';

export interface Investment extends BaseRow {
  name: string;
  asset_class: AssetClass;
  institution: string;
  ticker: string;
  valuation_mode: ValuationMode;
  quote_provider: QuoteProvider;
  currency: string; // moeda de cotação do ativo (BRL, USD)
  current_unit_price_cents: number | null; // na moeda do ativo
  current_total_cents: number | null; // em BRL (modo total)
  fx_rate: number | null; // BRL por unidade da moeda do ativo, quando currency != BRL
  quote_source: string;
  quote_kind: QuoteKind;
  quote_at: string | null; // ISO date-time da cotação/atualização
  daily_change_pct: number | null;
  acquisition_date: ISODate | null;
  maturity_date: ISODate | null;
  rate: string; // taxa contratada (ex.: "110% do CDI", "IPCA + 6%")
  indexer: string;
  liquidity: string;
  account_id: string | null; // conta/corretora onde o dinheiro está
  notes: string;
}

export type InvOpType = 'buy' | 'contribution' | 'sell' | 'redemption' | 'dividend' | 'interest' | 'fee' | 'tax';
export const INV_OP_LABELS: Record<InvOpType, string> = {
  buy: 'Compra',
  contribution: 'Aporte',
  sell: 'Venda',
  redemption: 'Resgate',
  dividend: 'Dividendos',
  interest: 'Juros recebidos',
  fee: 'Taxas',
  tax: 'Impostos',
};

export interface InvestmentOperation extends BaseRow {
  investment_id: string;
  type: InvOpType;
  quantity: number; // unidades (modo unit); 0 no modo total
  unit_price_cents: number; // em BRL
  amount_cents: number; // valor bruto da operação em BRL
  costs_cents: number; // corretagem/emolumentos
  taxes_cents: number; // IR etc.
  date: ISODate;
  account_id: string | null; // se informado, a operação movimenta o saldo desta conta
  notes: string;
}

export interface QuoteHistory extends BaseRow {
  investment_id: string;
  price_cents: number; // unitário (modo unit, na moeda do ativo) ou total (modo total, BRL)
  currency: string;
  source: string;
  kind: QuoteKind;
  quoted_at: string;
}

export interface Budget extends BaseRow {
  category_id: string;
  month: string; // AAAA-MM
  limit_cents: number;
  alert_levels: number[]; // ex.: [70, 90, 100]
}

export type GoalLink = 'none' | 'account' | 'investment';
export interface Goal extends BaseRow {
  name: string;
  target_cents: number;
  saved_cents: number; // usado quando link_type = none
  start_date: ISODate;
  deadline: ISODate | null;
  link_type: GoalLink;
  link_id: string | null;
  description: string;
  status: 'active' | 'done' | 'archived';
}

export type NetWorthItemType = 'other_asset' | 'debt' | 'loan' | 'financing' | 'other_liability';
export const NW_TYPE_LABELS: Record<NetWorthItemType, string> = {
  other_asset: 'Outro ativo/bem',
  debt: 'Dívida',
  loan: 'Empréstimo',
  financing: 'Financiamento',
  other_liability: 'Outra obrigação',
};
export interface NetWorthItem extends BaseRow {
  type: NetWorthItemType;
  name: string;
  value_cents: number; // positivo; a natureza vem do tipo
  interest_rate: string;
  due_date: ISODate | null;
  status: 'active' | 'settled';
  notes: string;
}

export interface CategoryRule extends BaseRow {
  keyword: string;
  kind: TxKind;
  category_id: string;
  subcategory_id: string | null;
}

export interface Settings {
  id: string;
  user_name: string;
  currency: 'BRL';
  theme: 'light' | 'dark' | 'system';
  default_alert_levels: number[];
  notify_budget: boolean;
  notify_due: boolean;
  due_days_ahead: number;
  report_format: 'csv' | 'pdf';
  hide_values: boolean;
  asset_classes: string[];
  updated_at: string;
}

export interface DB {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  transfers: Transfer[];
  recurrings: Recurring[];
  investments: Investment[];
  investment_operations: InvestmentOperation[];
  quote_history: QuoteHistory[];
  budgets: Budget[];
  goals: Goal[];
  net_worth_items: NetWorthItem[];
  category_rules: CategoryRule[];
}

export type TableName = keyof DB;
export const TABLES: TableName[] = [
  'accounts',
  'categories',
  'transactions',
  'transfers',
  'recurrings',
  'investments',
  'investment_operations',
  'quote_history',
  'budgets',
  'goals',
  'net_worth_items',
  'category_rules',
];

export type RowOf<T extends TableName> = DB[T][number];

export function emptyDB(): DB {
  return Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as DB;
}
