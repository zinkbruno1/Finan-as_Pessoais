// Estado global: carrega os dados do repositório, aplica alterações de forma otimista e
// reverte em caso de erro. Todos os indicadores são derivados deste estado, então qualquer
// inclusão, edição ou exclusão atualiza automaticamente gráficos, saldos e relatórios.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DB, RowOf, Settings, TableName } from '../domain/types';
import { emptyDB, TABLES } from '../domain/types';
import { buildDefaultCategories, defaultSettings, nowISO } from '../domain/defaults';
import { generateRecurring } from '../domain/recurrence';
import { periodFromPreset, todayISO, type Period } from '../lib/dates';
import type { Repo } from '../data/repo';

export type ToastType = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  type: ToastType;
  text: string;
}

export interface StoreValue {
  repo: Repo;
  ready: boolean;
  loadError: string | null;
  db: DB;
  settings: Settings;
  today: string;
  period: Period;
  setPeriod: (p: Period) => void;
  save: <T extends TableName>(table: T, rows: RowOf<T> | RowOf<T>[], okMessage?: string) => Promise<boolean>;
  remove: (table: TableName, ids: string[], okMessage?: string) => Promise<boolean>;
  bulk: (ops: { table: TableName; upsert?: any[]; remove?: string[] }[], okMessage?: string) => Promise<boolean>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  reload: () => Promise<void>;
  toasts: Toast[];
  toast: (text: string, type?: ToastType) => void;
  dismissToast: (id: number) => void;
  userEmail: string | null;
  signOut: (() => Promise<void>) | null;
}

const Ctx = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore fora do StoreProvider');
  return v;
}

function applyTheme(theme: Settings['theme']) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  try {
    if (theme === 'system') localStorage.removeItem('fp:theme');
    else localStorage.setItem('fp:theme', theme);
  } catch {
    /* preferências locais são opcionais */
  }
}

const PERIOD_KEY = 'fp:period';

function loadPeriod(): Period {
  try {
    const raw = sessionStorage.getItem(PERIOD_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Period;
      if (p.preset === 'custom') return p;
      return periodFromPreset(p.preset);
    }
  } catch {
    /* ignora */
  }
  return periodFromPreset('this_month');
}

export function StoreProvider({ repo, children, userEmail = null, signOut = null }: { repo: Repo; children: ReactNode; userEmail?: string | null; signOut?: (() => Promise<void>) | null }) {
  const [db, setDb] = useState<DB>(emptyDB);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [period, setPeriodState] = useState<Period>(loadPeriod);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dbRef = useRef(db);
  dbRef.current = db;
  const today = todayISO();

  const toast = useCallback((text: string, type: ToastType = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, type, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 7000 : 3500);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const setPeriod = useCallback((p: Period) => {
    setPeriodState(p);
    try {
      sessionStorage.setItem(PERIOD_KEY, JSON.stringify(p));
    } catch {
      /* ignora */
    }
  }, []);

  const bulk = useCallback<StoreValue['bulk']>(
    async (ops, okMessage) => {
      const before = dbRef.current;
      const now = nowISO();
      const next: DB = { ...before };
      const prepared = ops.map((op) => ({
        ...op,
        upsert: op.upsert?.map((r) => ({ ...r, updated_at: now, created_at: r.created_at ?? now })),
      }));
      for (const op of prepared) {
        let list = [...(next[op.table] as any[])];
        if (op.remove?.length) {
          const s = new Set(op.remove);
          list = list.filter((r) => !s.has(r.id));
        }
        for (const r of op.upsert ?? []) {
          const i = list.findIndex((x) => x.id === r.id);
          if (i >= 0) list[i] = r;
          else list.push(r);
        }
        (next as any)[op.table] = list;
      }
      dbRef.current = next;
      setDb(next);
      try {
        // Ordem: inclusões na ordem das tabelas (pais antes de filhos); exclusões na ordem inversa.
        const order = (t: TableName) => TABLES.indexOf(t);
        for (const op of [...prepared].sort((a, b) => order(a.table) - order(b.table))) if (op.upsert?.length) await repo.upsert(op.table, op.upsert);
        for (const op of [...prepared].sort((a, b) => order(b.table) - order(a.table))) if (op.remove?.length) await repo.remove(op.table, op.remove);
        if (okMessage) toast(okMessage, 'success');
        return true;
      } catch (e) {
        dbRef.current = before;
        setDb(before);
        toast((e as Error).message || 'Não foi possível salvar. Tente novamente.', 'error');
        return false;
      }
    },
    [repo, toast],
  );

  const save = useCallback<StoreValue['save']>(
    (table, rows, okMessage) => bulk([{ table, upsert: Array.isArray(rows) ? rows : [rows] }], okMessage),
    [bulk],
  );
  const remove = useCallback<StoreValue['remove']>((table, ids, okMessage) => bulk([{ table, remove: ids }], okMessage), [bulk]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch, updated_at: nowISO() };
      setSettings(next);
      if (patch.theme) applyTheme(patch.theme);
      try {
        await repo.saveSettings(next);
      } catch (e) {
        toast((e as Error).message, 'error');
      }
    },
    [repo, settings, toast],
  );

  // Evita duas cargas simultâneas (ex.: StrictMode), que poderiam semear categorias em dobro.
  const inflight = useRef<Promise<void> | null>(null);
  const load = useCallback(() => (inflight.current ??= doLoad().finally(() => (inflight.current = null))), [repo]);
  async function doLoad() {
    setLoadError(null);
    try {
      const { db: loaded, settings: s } = await repo.loadAll();
      const st = { ...defaultSettings(), ...(s ?? {}) };
      setSettings(st);
      applyTheme(st.theme);
      if (!s) await repo.saveSettings(st);
      // Primeiro acesso: cria categorias iniciais (editáveis). Não cria lançamentos nem saldos fictícios.
      if (loaded.categories.length === 0) {
        const cats = buildDefaultCategories();
        await repo.upsert('categories', cats);
        loaded.categories = cats;
      }
      // Gera ocorrências de recorrências sem duplicar.
      const gen = generateRecurring(loaded.recurrings, loaded.transactions, todayISO());
      if (gen.created.length) {
        await repo.upsert('transactions', gen.created);
        loaded.transactions = [...loaded.transactions, ...gen.created];
      }
      if (gen.updated.length) {
        await repo.upsert('recurrings', gen.updated);
        const m = new Map(gen.updated.map((r) => [r.id, r]));
        loaded.recurrings = loaded.recurrings.map((r) => m.get(r.id) ?? r);
      }
      setDb(loaded);
      setReady(true);
    } catch (e) {
      setLoadError((e as Error).message || 'Falha ao carregar os dados.');
    }
  }

  useEffect(() => {
    load();
  }, [load]);

  // Ao alterar/criar recorrências, gera as ocorrências que faltam.
  const recurringSig = db.recurrings.map((r) => `${r.id}:${r.updated_at}`).join('|');
  useEffect(() => {
    if (!ready) return;
    const gen = generateRecurring(dbRef.current.recurrings, dbRef.current.transactions, todayISO());
    if (gen.created.length || gen.updated.some((u) => u.generated_until !== dbRef.current.recurrings.find((r) => r.id === u.id)?.generated_until)) {
      bulk([
        { table: 'transactions', upsert: gen.created },
        { table: 'recurrings', upsert: gen.updated },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringSig, ready]);

  useEffect(() => {
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const fn = () => applyTheme('system');
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [settings.theme]);

  const value = useMemo<StoreValue>(
    () => ({
      repo,
      ready,
      loadError,
      db,
      settings,
      today,
      period,
      setPeriod,
      save,
      remove,
      bulk,
      updateSettings,
      reload: load,
      toasts,
      toast,
      dismissToast,
      userEmail,
      signOut,
    }),
    [repo, ready, loadError, db, settings, today, period, setPeriod, save, remove, bulk, updateSettings, load, toasts, toast, dismissToast, userEmail, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
