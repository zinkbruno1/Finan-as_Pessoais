// Garante que os campos enviados pelo app existem como colunas no esquema do Supabase.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildDefaultCategories, defaultSettings } from './defaults';
import { buildDemo } from './demo';
import { TABLES } from './types';

const sql = readFileSync(new URL('../../supabase/migrations/001_schema.sql', import.meta.url), 'utf8');

function columns(table: string): Set<string> {
  const m = sql.match(new RegExp(`create table if not exists public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!m) throw new Error(`Tabela ${table} não encontrada no SQL`);
  return new Set(
    m[1]
      .split('\n')
      .map((l) => l.trim().match(/^([a-z_]+)\s/)?.[1])
      .filter((c): c is string => !!c && !['check', 'unique', 'primary', 'foreign', 'constraint'].includes(c)),
  );
}

describe('esquema do banco', () => {
  const cats = buildDefaultCategories();
  const demo = buildDemo(cats, '2026-11-02');
  const samples: Record<string, object[]> = { ...demo, categories: cats } as any;

  for (const t of TABLES) {
    it(`colunas de ${t} cobrem os campos do app`, () => {
      const cols = columns(t);
      expect(cols.has('user_id')).toBe(true);
      for (const row of samples[t] ?? []) for (const k of Object.keys(row)) expect(cols, `${t}.${k}`).toContain(k);
    });
  }

  it('colunas de user_settings cobrem as preferências', () => {
    const cols = columns('user_settings');
    const { id: _id, ...rest } = defaultSettings();
    for (const k of Object.keys(rest)) expect(cols, `user_settings.${k}`).toContain(k);
  });
});
