// Geração de lançamentos a partir de recorrências, sem duplicações.
import { addDays, addMonths, type ISODate } from '../lib/dates';
import type { Recurring, Transaction } from './types';
import { nowISO, uid } from './defaults';

/** Datas de ocorrência entre `from` e `to` (inclusivos). */
export function occurrences(r: Recurring, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const end = r.end_date && r.end_date < to ? r.end_date : to;
  let i = 0;
  let cur = first(r);
  while (cur <= end && i < 5000) {
    if (cur >= from && cur >= r.start_date) out.push(cur);
    i++;
    cur = nth(r, i);
  }
  return out;
}

function first(r: Recurring): ISODate {
  if ((r.frequency === 'monthly' || r.frequency === 'yearly') && r.due_day) {
    const candidate = addMonths(r.start_date, 0, r.due_day);
    return candidate < r.start_date ? addMonths(r.start_date, r.frequency === 'monthly' ? 1 : 12, r.due_day) : candidate;
  }
  return r.start_date;
}

function nth(r: Recurring, i: number): ISODate {
  const base = first(r);
  switch (r.frequency) {
    case 'daily':
      return addDays(base, i);
    case 'weekly':
      return addDays(base, 7 * i);
    case 'monthly':
      return addMonths(base, i, r.due_day ?? Number(base.slice(8)));
    case 'yearly':
      return addMonths(base, 12 * i, r.due_day ?? Number(base.slice(8)));
  }
}

/**
 * Gera os lançamentos que faltam até `horizon`.
 * Duplicação é impedida por (recurring_id, recurrence_date) e pelo marcador `generated_until`
 * (ocorrências excluídas pelo usuário não reaparecem).
 * Ocorrências viram "pendente" — exceto quando auto_confirm está ativo e a data já chegou.
 */
export function generateRecurring(
  recurrings: Recurring[],
  existing: Transaction[],
  today: ISODate,
  horizonDays = 31,
): { created: Transaction[]; updated: Recurring[] } {
  const horizon = addDays(today, horizonDays);
  const keys = new Set(existing.filter((t) => t.recurring_id).map((t) => `${t.recurring_id}|${t.recurrence_date}`));
  const created: Transaction[] = [];
  const updated: Recurring[] = [];
  for (const r of recurrings) {
    if (!r.active) continue;
    const from = r.generated_until ? addDays(r.generated_until, 1) : r.start_date;
    const dates = occurrences(r, from, horizon);
    if (!dates.length) continue;
    const now = nowISO();
    for (const d of dates) {
      const key = `${r.id}|${d}`;
      if (keys.has(key)) continue;
      keys.add(key);
      const done = r.auto_confirm && d <= today;
      created.push({
        id: uid(),
        kind: r.kind,
        amount_cents: r.amount_cents,
        description: r.description,
        original_text: '',
        category_id: r.category_id,
        subcategory_id: r.subcategory_id,
        account_id: r.account_id,
        date: d,
        settled_date: done ? d : null,
        status: done ? 'done' : 'pending',
        payment_method: r.payment_method,
        payer: '',
        recurring_id: r.id,
        recurrence_date: d,
        notes: '',
        tags: [],
        is_demo: r.is_demo,
        created_at: now,
        updated_at: now,
      });
    }
    updated.push({ ...r, generated_until: dates[dates.length - 1], updated_at: now });
  }
  return { created, updated };
}

/** Próximos vencimentos (pendentes) dentro de `days` dias, incluindo atrasados. */
export function upcoming(transactions: Transaction[], today: ISODate, days: number): Transaction[] {
  const limit = addDays(today, days);
  return transactions.filter((t) => t.status === 'pending' && t.date <= limit).sort((a, b) => a.date.localeCompare(b.date));
}
