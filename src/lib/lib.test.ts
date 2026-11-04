import { describe, expect, it } from 'vitest';
import { formatBRL, parseMoney, formatPercent } from './format';
import { addMonths, formatDate, periodFromPreset, previousPeriod, todayISO, buckets } from './dates';
import { generateRecurring, occurrences } from '../domain/recurrence';
import type { Recurring } from '../domain/types';

describe('formatação brasileira', () => {
  it('formata moeda', () => {
    expect(formatBRL(125000)).toBe('R$ 1.250,00');
    expect(formatBRL(-4590)).toBe('-R$ 45,90');
  });
  it('interpreta valores digitados', () => {
    expect(parseMoney('1.250,00')).toBe(125000);
    expect(parseMoney('1250,5')).toBe(125050);
    expect(parseMoney('45.90')).toBe(4590);
    expect(parseMoney('1.250')).toBe(125000);
    expect(parseMoney('R$ 20')).toBe(2000);
    expect(parseMoney('abc')).toBeNull();
  });
  it('percentual não disponível', () => {
    expect(formatPercent(null)).toBe('Não disponível');
  });
  it('data DD/MM/AAAA', () => {
    expect(formatDate('2026-11-02')).toBe('02/11/2026');
  });
});

describe('períodos', () => {
  it('hoje usa o fuso de São Paulo', () => {
    // 02:00 UTC de 03/11 ainda é 02/11 em São Paulo (UTC-3)
    expect(todayISO(new Date('2026-11-03T02:00:00Z'))).toBe('2026-11-02');
  });
  it('semana de segunda a domingo', () => {
    expect(periodFromPreset('this_week', '2026-11-04')).toMatchObject({ start: '2026-11-02', end: '2026-11-08' });
    expect(periodFromPreset('last_week', '2026-11-04')).toMatchObject({ start: '2026-10-26', end: '2026-11-01' });
  });
  it('meses e anos', () => {
    expect(periodFromPreset('last_month', '2026-03-31')).toMatchObject({ start: '2026-02-01', end: '2026-02-28' });
    expect(periodFromPreset('this_year', '2026-03-31')).toMatchObject({ start: '2026-01-01', end: '2026-12-31' });
    expect(previousPeriod(periodFromPreset('this_month', '2026-03-15'))).toMatchObject({ start: '2026-02-01', end: '2026-02-28' });
  });
  it('addMonths respeita fim de mês', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
  });
  it('buckets mensais contínuos', () => {
    expect(buckets('2026-01-15', '2026-03-02', 'month').map((b) => b.key)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01']);
  });
});

describe('recorrências', () => {
  const T = '2026-01-01T00:00:00.000Z';
  const r: Recurring = {
    id: 'r1', kind: 'expense', description: 'Aluguel', amount_cents: 150000, category_id: null, subcategory_id: null, account_id: null, payment_method: '',
    frequency: 'monthly', start_date: '2026-01-01', end_date: null, due_day: 10, auto_confirm: false, active: true, generated_until: null, created_at: T, updated_at: T,
  };
  it('gera ocorrências no dia do vencimento', () => {
    expect(occurrences(r, '2026-01-01', '2026-03-31')).toEqual(['2026-01-10', '2026-02-10', '2026-03-10']);
  });
  it('não duplica ao rodar duas vezes', () => {
    const first = generateRecurring([r], [], '2026-02-15', 0);
    expect(first.created.map((t) => t.date)).toEqual(['2026-01-10', '2026-02-10']);
    expect(first.created.every((t) => t.status === 'pending')).toBe(true);
    const second = generateRecurring(first.updated, first.created, '2026-02-15', 0);
    expect(second.created).toHaveLength(0);
    // mesmo sem o marcador generated_until, a chave impede duplicação
    const third = generateRecurring([r], first.created, '2026-02-15', 0);
    expect(third.created).toHaveLength(0);
  });
  it('auto_confirm marca ocorrências vencidas como realizadas, futuras como pendentes', () => {
    const out = generateRecurring([{ ...r, auto_confirm: true }], [], '2026-02-15', 31);
    expect(out.created.map((t) => [t.date, t.status])).toEqual([['2026-01-10', 'done'], ['2026-02-10', 'done'], ['2026-03-10', 'pending']]);
  });
  it('respeita data final', () => {
    expect(occurrences({ ...r, end_date: '2026-02-01' }, '2026-01-01', '2026-12-31')).toEqual(['2026-01-10']);
  });
});
