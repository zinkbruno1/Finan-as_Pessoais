import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRightLeft,
  BarChart3,
  CheckCircle2,
  Eye,
  EyeOff,
  Flag,
  Info,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  Moon,
  PiggyBank,
  Plus,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Sun,
  TrendingDown,
  TrendingUp,
  Wallet,
  X,
  XCircle,
  FileDown,
} from 'lucide-react';
import { Button, Dot, IconButton, Input, Modal, Money, Select, cx } from './ui';
import { useStore } from '../store/store';
import { PAGE_TITLES, useUI, type PageKey } from '../store/ui';
import { PERIOD_LABELS, formatDate, periodFromPreset, type PeriodPreset } from '../lib/dates';
import { useLookups } from '../lib/hooks';
import { normalize } from '../domain/parser';
import { formatBRL } from '../lib/format';
import { useQuoteRefresh } from '../store/useQuoteRefresh';
import { supabaseConfigured } from '../data/supabase';

const NAV: { key: PageKey; icon: typeof Wallet }[] = [
  { key: 'overview', icon: LayoutDashboard },
  { key: 'transactions', icon: ListOrdered },
  { key: 'expenses', icon: TrendingDown },
  { key: 'incomes', icon: TrendingUp },
  { key: 'investments', icon: BarChart3 },
  { key: 'budgets', icon: PiggyBank },
  { key: 'goals', icon: Flag },
  { key: 'reports', icon: FileDown },
  { key: 'settings', icon: SettingsIcon },
];

/** Páginas em que o seletor de período faz sentido. */
const PERIOD_PAGES: PageKey[] = ['overview', 'transactions', 'expenses', 'incomes'];

export function Layout({ children }: { children: ReactNode }) {
  const { route, navigate, sidebarOpen, setSidebarOpen, open } = useUI();
  const { settings, updateSettings, userEmail, signOut, repo } = useStore();
  const { refresh } = useQuoteRefresh();

  // Atalhos de teclado (Alt + letra) e Ctrl/Cmd + K para pesquisa.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open({ type: 'search' });
        return;
      }
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      if (k === 'g') open({ type: 'tx', draft: { kind: 'expense' } });
      else if (k === 'e') open({ type: 'tx', draft: { kind: 'income' } });
      else if (k === 't') open({ type: 'transfer', draft: {} });
      else if (k === 'i') open({ type: 'investment', id: null });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const dark = document.documentElement.classList.contains('dark');

  const sidebar = (
    <nav className="flex h-full flex-col" aria-label="Menu principal">
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-white">
          <Wallet className="size-4" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold">Finanças</div>
          <div className="text-[11px] text-ink-3">{repo.mode === 'supabase' ? 'Sincronizado na nuvem' : 'Modo local'}</div>
        </div>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV.map(({ key, icon: Icon }) => {
          const active = route.page === key;
          return (
            <li key={key}>
              <a
                href={`#/${key}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(key);
                }}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium transition',
                  active ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )}
              >
                <Icon className="size-[18px]" />
                {PAGE_TITLES[key]}
              </a>
            </li>
          );
        })}
      </ul>
      <div className="space-y-1 border-t border-line p-3">
        <button
          onClick={() => updateSettings({ theme: dark ? 'light' : 'dark' })}
          className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13px] text-ink-2 hover:bg-surface-2"
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />} {dark ? 'Modo claro' : 'Modo escuro'}
        </button>
        <button onClick={() => updateSettings({ hide_values: !settings.hide_values })} className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13px] text-ink-2 hover:bg-surface-2">
          {settings.hide_values ? <Eye className="size-4" /> : <EyeOff className="size-4" />} {settings.hide_values ? 'Mostrar valores' : 'Ocultar valores'}
        </button>
        {signOut && (
          <button onClick={signOut} className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13px] text-ink-2 hover:bg-surface-2" title={userEmail ?? ''}>
            <LogOut className="size-4" /> Sair
          </button>
        )}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Pular para o conteúdo
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-surface lg:block">{sidebar}</aside>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="animate-in absolute inset-y-0 left-0 w-64 border-r border-line bg-surface shadow-xl">
            <IconButton label="Fechar menu" className="absolute right-2 top-4" onClick={() => setSidebarOpen(false)}>
              <X className="size-4" />
            </IconButton>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
            <IconButton label="Abrir menu" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="size-5" />
            </IconButton>
            <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight sm:text-xl">{PAGE_TITLES[route.page]}</h1>
            {PERIOD_PAGES.includes(route.page) && <PeriodPicker />}
            <button
              onClick={() => open({ type: 'search' })}
              className="hidden h-9 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[13px] text-ink-3 hover:text-ink md:flex"
            >
              <Search className="size-4" /> Pesquisar
              <kbd className="rounded border border-line px-1 text-[10px]">Ctrl K</kbd>
            </button>
            <IconButton label="Pesquisar" className="md:hidden" onClick={() => open({ type: 'search' })}>
              <Search className="size-5" />
            </IconButton>
            <NewMenu onRefreshQuotes={refresh} />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6">
          {!supabaseConfigured && route.page === 'overview' && <LocalModeNotice />}
          {children}
        </main>
      </div>
      <Toasts />
    </div>
  );
}

function LocalModeNotice() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('fp:hide-local-notice') === '1';
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-line bg-surface p-3 text-[13px] text-ink-2">
      <Info className="mt-0.5 size-4 shrink-0 text-sky-500" />
      <p className="flex-1">
        <strong className="font-medium text-ink">Modo local:</strong> seus dados ficam salvos neste navegador e continuam disponíveis ao fechar e reabrir. Para login e sincronização entre dispositivos,
        configure o Supabase (veja o README). Faça backups em Configurações → Dados.
      </p>
      <IconButton
        label="Dispensar aviso"
        onClick={() => {
          setHidden(true);
          try {
            localStorage.setItem('fp:hide-local-notice', '1');
          } catch {
            /* ignora */
          }
        }}
      >
        <X className="size-4" />
      </IconButton>
    </div>
  );
}

export function PeriodPicker() {
  const { period, setPeriod, today } = useStore();
  const presets: PeriodPreset[] = ['today', 'this_week', 'this_month', 'last_month', 'this_year', 'custom'];
  return (
    <div className="flex items-center gap-2">
      <Select
        aria-label="Período"
        className="h-9 w-[118px] text-[13px] sm:w-auto sm:min-w-[130px]"
        value={period.preset}
        onChange={(e) => setPeriod(periodFromPreset(e.target.value as PeriodPreset, today, { start: period.start, end: period.end }))}
      >
        {presets.map((p) => (
          <option key={p} value={p}>
            {PERIOD_LABELS[p]}
          </option>
        ))}
      </Select>
      {period.preset === 'custom' && (
        <div className="hidden items-center gap-1 sm:flex">
          <Input type="date" aria-label="Início" className="h-9 w-[140px] text-[13px]" value={period.start} onChange={(e) => e.target.value && setPeriod({ ...period, start: e.target.value })} />
          <Input type="date" aria-label="Fim" className="h-9 w-[140px] text-[13px]" value={period.end} onChange={(e) => e.target.value && setPeriod({ ...period, end: e.target.value })} />
        </div>
      )}
      {period.preset !== 'custom' && <span className="hidden text-xs text-ink-3 xl:inline">{formatDate(period.start)} – {formatDate(period.end)}</span>}
    </div>
  );
}

function NewMenu({ onRefreshQuotes }: { onRefreshQuotes: () => void }) {
  const { open, navigate } = useUI();
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!show) return;
    const fn = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setShow(false);
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [show]);
  const item = (label: string, kbd: string | null, icon: ReactNode, fn: () => void) => (
    <button
      role="menuitem"
      onClick={() => {
        setShow(false);
        fn();
      }}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] hover:bg-surface-2"
    >
      {icon}
      <span className="flex-1">{label}</span>
      {kbd && <kbd className="text-[10px] text-ink-3">{kbd}</kbd>}
    </button>
  );
  return (
    <div className="relative" ref={ref}>
      <Button variant="primary" size="sm" className="h-9" icon={<Plus className="size-4" />} onClick={() => setShow((s) => !s)} aria-haspopup="menu" aria-expanded={show}>
        <span className="hidden sm:inline">Novo</span>
      </Button>
      {show && (
        <div role="menu" className="animate-in absolute right-0 z-30 mt-2 w-60 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          {item('Novo gasto', 'Alt+G', <TrendingDown className="size-4 text-neg" />, () => open({ type: 'tx', draft: { kind: 'expense' } }))}
          {item('Nova entrada', 'Alt+E', <TrendingUp className="size-4 text-pos" />, () => open({ type: 'tx', draft: { kind: 'income' } }))}
          {item('Nova transferência', 'Alt+T', <ArrowRightLeft className="size-4 text-sky-500" />, () => open({ type: 'transfer', draft: {} }))}
          {item('Novo investimento', 'Alt+I', <BarChart3 className="size-4 text-violet-500" />, () => open({ type: 'investment', id: null }))}
          <div className="my-1 border-t border-line" />
          {item('Atualizar cotações', null, <RefreshCw className="size-4 text-ink-3" />, onRefreshQuotes)}
          {item('Exportar relatório', null, <FileDown className="size-4 text-ink-3" />, () => navigate('reports'))}
        </div>
      )}
    </div>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="animate-in pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-surface p-3 text-[13px] shadow-lg" role={t.type === 'error' ? 'alert' : 'status'}>
          {t.type === 'success' ? <CheckCircle2 className="size-4 shrink-0 text-pos" /> : t.type === 'error' ? <XCircle className="size-4 shrink-0 text-neg" /> : <Info className="size-4 shrink-0 text-sky-500" />}
          <span className="flex-1">{t.text}</span>
          <button onClick={() => dismissToast(t.id)} aria-label="Fechar" className="text-ink-3 hover:text-ink">
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Pesquisa global: lançamentos, transferências, contas e investimentos. */
export function SearchDialog() {
  const { db } = useStore();
  const { close, open, navigate } = useUI();
  const L = useLookups();
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const nq = normalize(q);
    if (nq.length < 2) return [];
    const digits = q.replace(/[^\d,]/g, '');
    const out: { key: string; title: string; sub: string; amount?: number; color?: string; go: () => void }[] = [];
    for (const t of db.transactions) {
      const hay = normalize([t.description, t.original_text, t.notes, t.payer, L.catName(t.category_id), L.catName(t.subcategory_id), L.accountName(t.account_id), L.account(t.account_id)?.institution, formatDate(t.date), ...t.tags].join(' '));
      if (hay.includes(nq) || (digits && formatBRL(t.amount_cents).includes(digits))) {
        out.push({
          key: t.id,
          title: t.description,
          sub: `${formatDate(t.date)} · ${L.catName(t.category_id)} · ${L.accountName(t.account_id)}`,
          amount: t.kind === 'income' ? t.amount_cents : -t.amount_cents,
          color: L.catColor(t.category_id),
          go: () => open({ type: 'tx', draft: { id: t.id } }),
        });
      }
    }
    for (const i of db.investments) {
      if (normalize([i.name, i.ticker, i.institution, i.asset_class].join(' ')).includes(nq))
        out.push({ key: i.id, title: `${i.name}${i.ticker ? ` (${i.ticker})` : ''}`, sub: `Investimento · ${i.asset_class} · ${i.institution}`, go: () => (close(), navigate('investments', { id: i.id })) });
    }
    for (const a of db.accounts) {
      if (normalize([a.name, a.institution].join(' ')).includes(nq)) out.push({ key: a.id, title: a.name, sub: `Conta · ${a.institution}`, go: () => (close(), navigate('transactions', { account: a.id, all: '1' })) });
    }
    for (const t of db.transfers) {
      if (normalize([t.description, L.accountName(t.from_account_id), L.accountName(t.to_account_id)].join(' ')).includes(nq) || (digits && formatBRL(t.amount_cents).includes(digits)))
        out.push({ key: t.id, title: t.description, sub: `Transferência · ${formatDate(t.date)} · ${L.accountName(t.from_account_id)} → ${L.accountName(t.to_account_id)}`, go: () => open({ type: 'transfer', draft: { id: t.id } }) });
    }
    return out.slice(0, 50);
  }, [q, db, L, open, close, navigate]);
  return (
    <Modal open onClose={close} title="Pesquisar">
      <Input autoFocus placeholder="Descrição, valor, categoria, conta, data, instituição ou ticker…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="mt-3 max-h-[60vh] divide-y divide-line overflow-y-auto">
        {q.length >= 2 && results.length === 0 && <li className="py-6 text-center text-[13px] text-ink-3">Nada encontrado para “{q}”.</li>}
        {results.map((r) => (
          <li key={r.key}>
            <button onClick={r.go} className="flex w-full items-center gap-3 px-1 py-2.5 text-left hover:bg-surface-2">
              {r.color && <Dot color={r.color} />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.title}</div>
                <div className="truncate text-xs text-ink-3">{r.sub}</div>
              </div>
              {r.amount !== undefined && <Money cents={r.amount} tone={r.amount > 0 ? 'pos' : 'none'} className="text-sm" />}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
