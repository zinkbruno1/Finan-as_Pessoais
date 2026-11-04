// Atualização de cotações.
// - Com Supabase configurado: chama a Edge Function "quotes" (o token da brapi fica no backend).
// - Sem backend: consulta APIs públicas sem credencial (brapi sem token cobre apenas alguns tickers de teste;
//   CoinGecko e AwesomeAPI são gratuitas e sem chave). Nenhuma cotação é inventada: falhas são reportadas.
import type { Investment, QuoteKind } from '../domain/types';
import { supabase } from './supabase';

export interface QuoteResult {
  id: string;
  price?: number; // na moeda do ativo, em unidades (não centavos)
  currency?: string;
  changePct?: number | null;
  quotedAt?: string;
  source?: string;
  kind?: QuoteKind;
  error?: string;
}

export interface QuoteResponse {
  results: QuoteResult[];
  fx: { USD: number; at: string; source: string } | null;
}

/** Símbolos comuns -> id CoinGecko. */
const CRYPTO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', USDT: 'tether', USDC: 'usd-coin', BNB: 'binancecoin', XRP: 'ripple',
  ADA: 'cardano', DOGE: 'dogecoin', DOT: 'polkadot', MATIC: 'matic-network', LTC: 'litecoin', AVAX: 'avalanche-2', LINK: 'chainlink',
};

export function coingeckoId(ticker: string): string {
  return CRYPTO_IDS[ticker.toUpperCase()] ?? ticker.toLowerCase();
}

const STALE_MS = 3 * 24 * 3600 * 1000;

/** Classifica a cotação: dados com mais de 3 dias viram "último valor conhecido". */
export function classify(kind: QuoteKind, quotedAt: string, now = Date.now()): QuoteKind {
  return now - new Date(quotedAt).getTime() > STALE_MS ? 'last_known' : kind;
}

export function quotable(inv: Investment): boolean {
  return inv.valuation_mode === 'unit' && inv.quote_provider !== 'none' && Boolean(inv.ticker);
}

export async function fetchQuotes(investments: Investment[]): Promise<QuoteResponse> {
  const items = investments.filter(quotable).map((i) => ({
    id: i.id,
    provider: i.quote_provider as 'brapi' | 'coingecko',
    ticker: i.quote_provider === 'coingecko' ? coingeckoId(i.ticker) : i.ticker.toUpperCase(),
  }));
  if (!items.length) return { results: [], fx: null };

  if (supabase) {
    const { data, error } = await supabase.functions.invoke('quotes', { body: { items } });
    if (!error && data?.results) return data as QuoteResponse;
    // Se a função não estiver publicada, segue para as fontes públicas.
    console.warn('Edge Function "quotes" indisponível:', error?.message);
  }
  return fetchPublic(items);
}

async function fetchPublic(items: { id: string; provider: 'brapi' | 'coingecko'; ticker: string }[]): Promise<QuoteResponse> {
  const results: QuoteResult[] = [];
  await Promise.all(
    items
      .filter((i) => i.provider === 'brapi')
      .map(async (it) => {
        try {
          const r = await fetch(`https://brapi.dev/api/quote/${encodeURIComponent(it.ticker)}`);
          const data = await r.json().catch(() => null);
          const q = data?.results?.[0];
          if (!r.ok || !q || typeof q.regularMarketPrice !== 'number') {
            results.push({
              id: it.id,
              error: r.status === 401 || r.status === 403 ? 'A brapi exige token para este ticker. Configure o backend (Edge Function) com BRAPI_TOKEN.' : data?.message ?? `Falha HTTP ${r.status}`,
            });
            return;
          }
          results.push({
            id: it.id,
            price: q.regularMarketPrice,
            currency: q.currency ?? 'BRL',
            changePct: q.regularMarketChangePercent ?? null,
            quotedAt: q.regularMarketTime ?? new Date().toISOString(),
            source: 'brapi.dev (B3)',
            kind: 'delayed',
          });
        } catch {
          results.push({ id: it.id, error: 'Fonte de cotações indisponível no momento.' });
        }
      }),
  );
  const cg = items.filter((i) => i.provider === 'coingecko');
  if (cg.length) {
    try {
      const ids = [...new Set(cg.map((i) => i.ticker))].join(',');
      const r = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=brl&include_24hr_change=true&include_last_updated_at=true`,
      );
      const data = await r.json();
      for (const it of cg) {
        const q = data?.[it.ticker];
        if (!q?.brl) results.push({ id: it.id, error: 'Ativo não encontrado na CoinGecko (use o id, ex.: bitcoin).' });
        else
          results.push({
            id: it.id,
            price: q.brl,
            currency: 'BRL',
            changePct: q.brl_24h_change ?? null,
            quotedAt: q.last_updated_at ? new Date(q.last_updated_at * 1000).toISOString() : new Date().toISOString(),
            source: 'CoinGecko',
            kind: 'delayed',
          });
      }
    } catch {
      for (const it of cg) results.push({ id: it.id, error: 'CoinGecko indisponível no momento.' });
    }
  }
  let fx: QuoteResponse['fx'] = null;
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    const d = await r.json();
    if (d?.USDBRL?.bid) fx = { USD: Number(d.USDBRL.bid), at: new Date(Number(d.USDBRL.timestamp) * 1000).toISOString(), source: 'AwesomeAPI' };
  } catch {
    fx = null;
  }
  return { results, fx };
}
