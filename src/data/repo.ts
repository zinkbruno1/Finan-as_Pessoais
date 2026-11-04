import type { DB, RowOf, Settings, TableName } from '../domain/types';

/** Contrato de persistência. Implementado pelo Supabase (PostgreSQL + RLS) e pelo modo local. */
export interface Repo {
  mode: 'local' | 'supabase';
  loadAll(): Promise<{ db: DB; settings: Settings | null }>;
  upsert<T extends TableName>(table: T, rows: RowOf<T>[]): Promise<void>;
  remove(table: TableName, ids: string[]): Promise<void>;
  saveSettings(s: Settings): Promise<void>;
}
