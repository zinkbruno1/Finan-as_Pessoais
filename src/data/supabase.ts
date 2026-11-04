// Cliente Supabase. Só a chave pública (anon) fica no frontend; o isolamento por usuário é garantido pelas políticas RLS.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { emptyDB, TABLES, type DB, type Settings } from '../domain/types';
import type { Repo } from './repo';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);
export const supabase: SupabaseClient | null = supabaseConfigured ? createClient(url!, key!) : null;

function friendly(error: { message: string; code?: string } | null): Error {
  if (!error) return new Error('Erro desconhecido.');
  if (/fetch|network/i.test(error.message)) return new Error('Sem conexão com o servidor. Verifique sua internet e tente novamente.');
  if (error.code === '23514') return new Error('Valor inválido rejeitado pelo banco de dados.');
  if (error.code === '42501') return new Error('Permissão negada para esta operação.');
  return new Error(`Erro do banco de dados: ${error.message}`);
}

const PAGE = 1000;

export function createSupabaseRepo(client: SupabaseClient, userId: string): Repo {
  return {
    mode: 'supabase',
    async loadAll() {
      const db: DB = emptyDB();
      await Promise.all(
        TABLES.map(async (t) => {
          const rows: any[] = [];
          for (let from = 0; ; from += PAGE) {
            const { data, error } = await client.from(t).select('*').range(from, from + PAGE - 1);
            if (error) throw friendly(error);
            rows.push(...data);
            if (data.length < PAGE) break;
          }
          (db as any)[t] = rows.map(({ user_id: _u, ...r }) => r);
        }),
      );
      const { data, error } = await client.from('user_settings').select('*').maybeSingle();
      if (error) throw friendly(error);
      const settings = data ? ({ ...data, id: 'settings' } as Settings) : null;
      if (settings) delete (settings as any).user_id;
      return { db, settings };
    },
    async upsert(table, rows) {
      if (!rows.length) return;
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await client.from(table).upsert(rows.slice(i, i + 500) as any[]);
        if (error) throw friendly(error);
      }
    },
    async remove(table, ids) {
      if (!ids.length) return;
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await client.from(table).delete().in('id', ids.slice(i, i + 200));
        if (error) throw friendly(error);
      }
    },
    async saveSettings(s) {
      const { id: _id, ...rest } = s;
      const { error } = await client.from('user_settings').upsert({ ...rest, user_id: userId } as any);
      if (error) throw friendly(error);
    },
  };
}
