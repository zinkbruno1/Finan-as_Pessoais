// Supabase Edge Function: busca cotações no backend, mantendo o token da brapi fora do frontend.
// Deploy:  supabase functions deploy quotes
// Segredo: supabase secrets set BRAPI_TOKEN=seu_token   (opcional; sem token só alguns tickers de teste funcionam)
// deno-lint-ignore-file no-explicit-any

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Item {
  id: string;
  provider: 'brapi' | 'coingecko';
  ticker: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  // Exige usuário autenticado (o gateway do Supabase valida o JWT quando verify_jwt está ativo).
  if (!req.headers.get('authorization')) return json({ error: 'Não autenticado' }, 401);
  try {
    const { items } = (await req.json()) as { items: Item[] };
    if (!Array.isArray(items) || items.length > 100) return json({ error: 'Requisição inválida' }, 400);
    const token = Deno.env.get('BRAPI_TOKEN') ?? '';
    const results: any[] = [];

    const b3 = items.filter((i) => i.provider === 'brapi' && /^[A-Z0-9.]{3,12}$/i.test(i.ticker));
    for (const it of b3) {
      try {
        const url = `https://brapi.dev/api/quote/${encodeURIComponent(it.ticker.toUpperCase())}${token ? `?token=${token}` : ''}`;
        const r = await fetch(url);
        const data = await r.json();
        const q = data?.results?.[0];
        if (!r.ok || !q || typeof q.regularMarketPrice !== 'number') {
          results.push({ id: it.id, error: data?.message ?? `HTTP ${r.status}` });
          continue;
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
      } catch (e) {
        results.push({ id: it.id, error: String(e) });
      }
    }

    const cg = items.filter((i) => i.provider === 'coingecko');
    if (cg.length) {
      const ids = [...new Set(cg.map((i) => i.ticker.toLowerCase()))].join(',');
      try {
        const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids)}&vs_currencies=brl&include_24hr_change=true&include_last_updated_at=true`);
        const data = await r.json();
        for (const it of cg) {
          const q = data?.[it.ticker.toLowerCase()];
          if (!q?.brl) results.push({ id: it.id, error: 'Ativo não encontrado na CoinGecko' });
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
      } catch (e) {
        for (const it of cg) results.push({ id: it.id, error: String(e) });
      }
    }

    let fx: any = null;
    try {
      const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL');
      const d = await r.json();
      if (d?.USDBRL?.bid) fx = { USD: Number(d.USDBRL.bid), at: new Date(Number(d.USDBRL.timestamp) * 1000).toISOString(), source: 'AwesomeAPI' };
    } catch {
      fx = null;
    }
    return json({ results, fx });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}
