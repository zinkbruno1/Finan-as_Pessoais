// Modo local: persistência no armazenamento do navegador (IndexedDB não é necessário para o volume esperado).
// Os dados sobrevivem a recarregar e fechar o navegador, mas ficam apenas neste dispositivo.
import { emptyDB, TABLES, type DB, type RowOf, type Settings, type TableName } from '../domain/types';
import type { Repo } from './repo';

const KEY = 'fp:data:v1';
const SETTINGS_KEY = 'fp:settings:v1';

function read(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDB();
    const parsed = JSON.parse(raw);
    const db = emptyDB();
    for (const t of TABLES) if (Array.isArray(parsed[t])) (db as any)[t] = parsed[t];
    return db;
  } catch {
    return emptyDB();
  }
}

function write(db: DB) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    throw new Error('Não foi possível salvar no armazenamento do navegador (espaço insuficiente ou bloqueado).');
  }
}

export function createLocalRepo(): Repo {
  let cache: DB | null = null;
  const get = () => (cache ??= read());
  return {
    mode: 'local',
    async loadAll() {
      cache = read();
      let settings: Settings | null = null;
      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        settings = raw ? JSON.parse(raw) : null;
      } catch {
        settings = null;
      }
      return { db: structuredClone(cache), settings };
    },
    async upsert<T extends TableName>(table: T, rows: RowOf<T>[]) {
      const db = get();
      const list = db[table] as RowOf<T>[];
      for (const r of rows) {
        const i = list.findIndex((x) => x.id === r.id);
        if (i >= 0) list[i] = r;
        else list.push(r);
      }
      write(db);
    },
    async remove(table, ids) {
      const db = get();
      const set = new Set(ids);
      (db as any)[table] = (db[table] as { id: string }[]).filter((r) => !set.has(r.id));
      write(db);
    },
    async saveSettings(s) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    },
  };
}
