// Datas de calendário como strings ISO "AAAA-MM-DD", sempre interpretadas no fuso America/Sao_Paulo.
// Trabalhar com datas de calendário (sem hora) evita deslocamentos de fuso em lançamentos.
import { TIME_ZONE } from './format';

export type ISODate = string;

const isoFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Data de hoje no fuso de São Paulo. */
export function todayISO(now: Date = new Date()): ISODate {
  return isoFmt.format(now);
}

export function parseISO(d: ISODate): { y: number; m: number; day: number } {
  const [y, m, day] = d.split('-').map(Number);
  return { y, m, day };
}

/** Converte para Date UTC ao meio-dia (seguro para aritmética de dias). */
function toUTC(d: ISODate): Date {
  const { y, m, day } = parseISO(d);
  return new Date(Date.UTC(y, m - 1, day, 12));
}

function fromUTC(dt: Date): ISODate {
  return dt.toISOString().slice(0, 10);
}

export function isValidISO(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const dt = toUTC(d);
  return fromUTC(dt) === d;
}

export function addDays(d: ISODate, n: number): ISODate {
  const dt = toUTC(d);
  dt.setUTCDate(dt.getUTCDate() + n);
  return fromUTC(dt);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Soma meses preservando o dia quando possível (31/01 + 1 mês = 28/02 ou 29/02). */
export function addMonths(d: ISODate, n: number, preferredDay?: number): ISODate {
  const { y, m, day } = parseISO(d);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const dd = Math.min(preferredDay ?? day, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

/** 0 = segunda ... 6 = domingo. */
export function weekdayMon0(d: ISODate): number {
  return (toUTC(d).getUTCDay() + 6) % 7;
}

export function startOfWeek(d: ISODate): ISODate {
  return addDays(d, -weekdayMon0(d));
}
export function startOfMonth(d: ISODate): ISODate {
  return d.slice(0, 8) + '01';
}
export function endOfMonth(d: ISODate): ISODate {
  const { y, m } = parseISO(d);
  return `${d.slice(0, 8)}${String(daysInMonth(y, m)).padStart(2, '0')}`;
}
export function startOfYear(d: ISODate): ISODate {
  return d.slice(0, 4) + '-01-01';
}
export function endOfYear(d: ISODate): ISODate {
  return d.slice(0, 4) + '-12-31';
}
export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "2026-11-02" -> "02/11/2026" */
export function formatDate(d: ISODate | null | undefined): string {
  if (!d) return '—';
  const { y, m, day } = parseISO(d);
  return `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}
export function formatDateShort(d: ISODate): string {
  const { m, day } = parseISO(d);
  return `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}
export function formatMonth(key: string, full = false): string {
  const [y, m] = key.split('-').map(Number);
  return full ? `${MONTHS_FULL[m - 1]} de ${y}` : `${MONTHS[m - 1]}/${String(y).slice(2)}`;
}
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

/** Aceita "DD/MM/AAAA" ou "DD/MM" e devolve ISO. */
export function parseBRDate(s: string, ref: ISODate = todayISO()): ISODate | null {
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!m) return null;
  let y = m[3] ? Number(m[3]) : Number(ref.slice(0, 4));
  if (y < 100) y += 2000;
  const iso = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return isValidISO(iso) ? iso : null;
}

// ---------- Períodos ----------

export type PeriodPreset =
  | 'today'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_year'
  | 'custom';

export interface Period {
  preset: PeriodPreset;
  start: ISODate; // inclusivo
  end: ISODate; // inclusivo
}

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: 'Hoje',
  this_week: 'Esta semana',
  last_week: 'Semana anterior',
  this_month: 'Este mês',
  last_month: 'Mês anterior',
  this_year: 'Este ano',
  last_year: 'Ano anterior',
  custom: 'Personalizado',
};

/** Semanas vão de segunda a domingo. Todos os limites são inclusivos. */
export function periodFromPreset(preset: PeriodPreset, today: ISODate = todayISO(), custom?: { start: ISODate; end: ISODate }): Period {
  switch (preset) {
    case 'today':
      return { preset, start: today, end: today };
    case 'this_week': {
      const s = startOfWeek(today);
      return { preset, start: s, end: addDays(s, 6) };
    }
    case 'last_week': {
      const s = addDays(startOfWeek(today), -7);
      return { preset, start: s, end: addDays(s, 6) };
    }
    case 'this_month':
      return { preset, start: startOfMonth(today), end: endOfMonth(today) };
    case 'last_month': {
      const s = addMonths(startOfMonth(today), -1);
      return { preset, start: s, end: endOfMonth(s) };
    }
    case 'this_year':
      return { preset, start: startOfYear(today), end: endOfYear(today) };
    case 'last_year': {
      const y = Number(today.slice(0, 4)) - 1;
      return { preset, start: `${y}-01-01`, end: `${y}-12-31` };
    }
    case 'custom':
      return { preset, start: custom?.start ?? startOfMonth(today), end: custom?.end ?? today };
  }
}

/** Período imediatamente anterior, com a mesma "forma" (mês anterior, semana anterior, etc.). */
export function previousPeriod(p: Period): Period {
  const s = p.start;
  if (s === startOfMonth(s) && p.end === endOfMonth(s)) {
    const ps = addMonths(s, -1);
    return { preset: 'custom', start: ps, end: endOfMonth(ps) };
  }
  if (s === startOfYear(s) && p.end === endOfYear(s)) {
    const y = Number(s.slice(0, 4)) - 1;
    return { preset: 'custom', start: `${y}-01-01`, end: `${y}-12-31` };
  }
  const len = diffDays(p.start, p.end) + 1;
  return { preset: 'custom', start: addDays(p.start, -len), end: addDays(p.start, -1) };
}

export function inPeriod(d: ISODate, p: { start: ISODate; end: ISODate }): boolean {
  return d >= p.start && d <= p.end;
}

export function periodLabel(p: Period): string {
  if (p.preset !== 'custom') return PERIOD_LABELS[p.preset];
  return `${formatDate(p.start)} – ${formatDate(p.end)}`;
}

export type Granularity = 'day' | 'week' | 'month' | 'year';

/** Gera buckets contínuos cobrindo o intervalo. */
export function buckets(start: ISODate, end: ISODate, g: Granularity): { key: string; start: ISODate; end: ISODate; label: string }[] {
  const out: { key: string; start: ISODate; end: ISODate; label: string }[] = [];
  let cur: ISODate =
    g === 'day' ? start : g === 'week' ? startOfWeek(start) : g === 'month' ? startOfMonth(start) : startOfYear(start);
  let guard = 0;
  while (cur <= end && guard++ < 2000) {
    let bEnd: ISODate;
    let label: string;
    if (g === 'day') {
      bEnd = cur;
      label = formatDateShort(cur);
    } else if (g === 'week') {
      bEnd = addDays(cur, 6);
      label = `${formatDateShort(cur)}`;
    } else if (g === 'month') {
      bEnd = endOfMonth(cur);
      label = formatMonth(monthKey(cur));
    } else {
      bEnd = endOfYear(cur);
      label = cur.slice(0, 4);
    }
    out.push({ key: cur, start: cur, end: bEnd, label });
    cur = g === 'day' ? addDays(cur, 1) : g === 'week' ? addDays(cur, 7) : g === 'month' ? addMonths(cur, 1, 1) : `${Number(cur.slice(0, 4)) + 1}-01-01`;
  }
  return out;
}
