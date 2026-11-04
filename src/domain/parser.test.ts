import { describe, expect, it } from 'vitest';
import { parseQuickEntry, type ParseContext } from './parser';
import { buildDefaultCategories } from './defaults';
import type { Account } from './types';

const categories = buildDefaultCategories();
const name = (id: string | null) => categories.find((c) => c.id === id)?.name;
const T = '2026-01-01T00:00:00.000Z';
const accounts: Account[] = [
  { id: 'nu', name: 'Nubank', institution: 'Nubank', type: 'checking', initial_balance_cents: 0, initial_date: '2026-01-01', archived: false, created_at: T, updated_at: T },
  { id: 'xp', name: 'Corretora XP', institution: 'XP', type: 'brokerage', initial_balance_cents: 0, initial_date: '2026-01-01', archived: false, created_at: T, updated_at: T },
];
const ctx: ParseContext = { categories, rules: [], history: [], accounts, today: '2026-11-02' };

describe('lançamento rápido', () => {
  it('"20 alimentação mercado"', () => {
    const p = parseQuickEntry('20 alimentação mercado', ctx);
    expect(p.amount_cents).toBe(2_000);
    expect(p.kind).toBe('expense');
    expect(name(p.category_id)).toBe('Alimentação');
    expect(name(p.subcategory_id)).toBe('Mercado');
    expect(p.description).toBe('Mercado');
    expect(p.date).toBe('2026-11-02');
    expect(p.issues).toEqual([]);
  });

  it('"45,90 pizza" -> Alimentação > Pizza', () => {
    const p = parseQuickEntry('45,90 pizza', ctx);
    expect(p.amount_cents).toBe(4_590);
    expect(name(p.subcategory_id)).toBe('Pizza');
  });

  it('"120 combustível" -> Transporte > Combustível', () => {
    const p = parseQuickEntry('120 combustível', ctx);
    expect(p.amount_cents).toBe(12_000);
    expect(name(p.category_id)).toBe('Transporte');
    expect(name(p.subcategory_id)).toBe('Combustível');
  });

  it('"350 recebi de um serviço" -> entrada em Serviços prestados', () => {
    const p = parseQuickEntry('350 recebi de um serviço', ctx);
    expect(p.kind).toBe('income');
    expect(name(p.category_id)).toBe('Serviços prestados');
  });

  it('"1500 salário" -> entrada Salário', () => {
    const p = parseQuickEntry('1500 salário', ctx);
    expect(p.kind).toBe('income');
    expect(p.amount_cents).toBe(150_000);
    expect(name(p.category_id)).toBe('Salário');
    expect(p.description).toBe('Salário');
  });

  it('"80 farmácia ontem" -> Saúde > Farmácia com data de ontem', () => {
    const p = parseQuickEntry('80 farmácia ontem', ctx);
    expect(name(p.category_id)).toBe('Saúde');
    expect(name(p.subcategory_id)).toBe('Farmácia');
    expect(p.date).toBe('2026-11-01');
    expect(p.description).toBe('Farmácia');
  });

  it('"250 transferência para investimentos" -> transferência para a corretora', () => {
    const p = parseQuickEntry('250 transferência para investimentos', ctx);
    expect(p.isTransfer).toBe(true);
    expect(p.transfer_to_account_id).toBe('xp');
    expect(p.amount_cents).toBe(25_000);
  });

  it('valores com milhar e decimal brasileiros', () => {
    expect(parseQuickEntry('1.250,90 aluguel', ctx).amount_cents).toBe(125_090);
    expect(parseQuickEntry('R$ 12.5 café', ctx).amount_cents).toBe(1_250);
  });

  it('netflix e spotify vão para Assinaturas', () => {
    expect(name(parseQuickEntry('55,90 netflix', ctx).category_id)).toBe('Assinaturas e serviços digitais');
    expect(name(parseQuickEntry('21,90 spotify', ctx).subcategory_id)).toBe('Streaming');
  });

  it('identifica a conta mencionada e datas DD/MM', () => {
    const p = parseQuickEntry('gastei 30 no uber nubank 15/10', ctx);
    expect(p.account_id).toBe('nu');
    expect(p.date).toBe('2026-10-15');
    expect(name(p.subcategory_id)).toBe('Aplicativos de transporte');
  });

  it('pede confirmação quando não reconhece a categoria', () => {
    const p = parseQuickEntry('37 coisa aleatória', ctx);
    expect(p.category_id).toBeNull();
    expect(p.issues.some((i) => i.includes('categoria'))).toBe(true);
    expect(p.original_text).toBe('37 coisa aleatória');
  });

  it('pede o valor quando ausente', () => {
    expect(parseQuickEntry('mercado', ctx).issues[0]).toMatch(/valor/);
  });

  it('regras do usuário têm prioridade', () => {
    const lazer = categories.find((c) => c.name === 'Lazer')!;
    const p = parseQuickEntry('40 mercado livre', { ...ctx, rules: [{ id: 'r', keyword: 'mercado livre', kind: 'expense', category_id: lazer.id, subcategory_id: null, created_at: T, updated_at: T }] });
    expect(name(p.category_id)).toBe('Lazer');
  });

  it('aprende com o histórico de descrições', () => {
    const educ = categories.find((c) => c.name === 'Educação')!;
    const hist = [{ description: 'Kumon', kind: 'expense', category_id: educ.id, subcategory_id: null, created_at: T } as any];
    const p = parseQuickEntry('300 kumon', { ...ctx, history: hist });
    expect(name(p.category_id)).toBe('Educação');
  });
});
