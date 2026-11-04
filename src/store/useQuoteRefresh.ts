import { useState } from 'react';
import { useStore } from './store';
import { classify, fetchQuotes, quotable } from '../data/quotes';
import { nowISO, uid } from '../domain/defaults';
import type { Investment, QuoteHistory } from '../domain/types';

/** Atualiza cotações dos investimentos com fonte configurada e grava o histórico de preços. */
export function useQuoteRefresh() {
  const { db, bulk, toast } = useStore();
  const [loading, setLoading] = useState(false);
  const eligible = db.investments.filter(quotable);

  async function refresh() {
    if (!eligible.length) {
      toast('Nenhum investimento com fonte de cotação automática. Defina a fonte (B3 ou cripto) e o ticker no cadastro do ativo.', 'info');
      return;
    }
    setLoading(true);
    try {
      const res = await fetchQuotes(eligible);
      const updates: Investment[] = [];
      const history: QuoteHistory[] = [];
      const errors: string[] = [];
      for (const r of res.results) {
        const inv = db.investments.find((i) => i.id === r.id);
        if (!inv) continue;
        if (r.error || r.price === undefined) {
          errors.push(`${inv.ticker}: ${r.error ?? 'sem dados'}`);
          // Mantém o último valor, mas deixa claro que não é atual.
          if (inv.quote_at && inv.quote_kind !== 'manual') updates.push({ ...inv, quote_kind: 'last_known' });
          continue;
        }
        const currency = (r.currency ?? 'BRL').toUpperCase();
        const priceCents = Math.round(r.price * 100);
        const fx = currency === 'BRL' ? null : currency === 'USD' && res.fx ? res.fx.USD : inv.fx_rate;
        if (currency !== 'BRL' && !fx) errors.push(`${inv.ticker}: sem câmbio ${currency}/BRL disponível`);
        const quotedAt = r.quotedAt ?? nowISO();
        const kind = classify(r.kind ?? 'delayed', quotedAt);
        updates.push({
          ...inv,
          currency,
          current_unit_price_cents: priceCents,
          fx_rate: fx ?? null,
          quote_source: r.source ?? '',
          quote_kind: kind,
          quote_at: quotedAt,
          daily_change_pct: r.changePct ?? null,
        });
        history.push({ id: uid(), investment_id: inv.id, price_cents: priceCents, currency, source: r.source ?? '', kind, quoted_at: quotedAt, created_at: nowISO(), updated_at: nowISO() });
      }
      if (updates.length || history.length) {
        await bulk([
          { table: 'investments', upsert: updates },
          { table: 'quote_history', upsert: history },
        ]);
      }
      const okCount = history.length;
      if (okCount) toast(`${okCount} cotação(ões) atualizada(s)${res.fx ? ` · USD/BRL ${res.fx.USD.toFixed(4).replace('.', ',')} (${res.fx.source})` : ''}.`, 'success');
      if (errors.length) toast(`Não foi possível atualizar: ${errors.join('; ')}`, 'error');
    } catch (e) {
      toast(`Fonte de cotações indisponível: ${(e as Error).message}. Os últimos valores foram mantidos.`, 'error');
    } finally {
      setLoading(false);
    }
  }

  return { refresh, loading, eligibleCount: eligible.length };
}
