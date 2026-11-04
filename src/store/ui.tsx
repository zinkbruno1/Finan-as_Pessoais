// Navegação (por hash, preserva filtros na URL) e diálogos globais (formulários e confirmação).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Transaction, Transfer } from '../domain/types';

export type PageKey = 'overview' | 'transactions' | 'expenses' | 'incomes' | 'investments' | 'budgets' | 'goals' | 'reports' | 'settings';
export const PAGE_TITLES: Record<PageKey, string> = {
  overview: 'Visão geral',
  transactions: 'Lançamentos',
  expenses: 'Gastos',
  incomes: 'Entradas',
  investments: 'Investimentos',
  budgets: 'Orçamentos',
  goals: 'Metas financeiras',
  reports: 'Relatórios',
  settings: 'Configurações',
};

export interface Route {
  page: PageKey;
  params: Record<string, string>;
}

function parseHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const page = (Object.keys(PAGE_TITLES) as PageKey[]).includes(path as PageKey) ? (path as PageKey) : 'overview';
  return { page, params: Object.fromEntries(new URLSearchParams(qs ?? '')) };
}

export type TxDraft = Partial<Transaction> & { _duplicate?: boolean };

interface ConfirmOpts {
  title: string;
  text?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}

export type DialogState =
  | { type: 'tx'; draft: TxDraft }
  | { type: 'transfer'; draft: Partial<Transfer> }
  | { type: 'investment'; id: string | null }
  | { type: 'invop'; investmentId: string; opId: string | null }
  | { type: 'account'; id: string | null }
  | { type: 'search' }
  | { type: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | null;

interface UIValue {
  route: Route;
  navigate: (page: PageKey, params?: Record<string, string>) => void;
  setParams: (params: Record<string, string>) => void;
  dialog: DialogState;
  open: (d: Exclude<DialogState, null | { type: 'confirm' }>) => void;
  close: () => void;
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;
}

const Ctx = createContext<UIValue | null>(null);
export function useUI(): UIValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useUI fora do UIProvider');
  return v;
}

export function UIProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(parseHash);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const fn = () => setRoute(parseHash());
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);

  const navigate = useCallback((page: PageKey, params?: Record<string, string>) => {
    const qs = params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : '';
    window.location.hash = `/${page}${qs}`;
    setSidebarOpen(false);
    window.scrollTo({ top: 0 });
  }, []);

  const setParams = useCallback((params: Record<string, string>) => {
    const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined));
    const qs = Object.keys(clean).length ? `?${new URLSearchParams(clean)}` : '';
    const page = parseHash().page;
    history.replaceState(null, '', `#/${page}${qs}`);
    setRoute({ page, params: clean });
  }, []);

  const open = useCallback((d: Exclude<DialogState, null | { type: 'confirm' }>) => setDialog(d), []);
  const close = useCallback(() => setDialog(null), []);
  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => {
        setDialog({ type: 'confirm', opts, resolve });
      }),
    [],
  );

  const value = useMemo(() => ({ route, navigate, setParams, dialog, open, close, confirm, sidebarOpen, setSidebarOpen }), [route, navigate, setParams, dialog, open, close, confirm, sidebarOpen]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
