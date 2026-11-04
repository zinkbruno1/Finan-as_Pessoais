// Formatação regional: pt-BR, BRL, America/Sao_Paulo.
// Valores monetários circulam no sistema como centavos inteiros (number), evitando erros de ponto flutuante.

export const TIME_ZONE = 'America/Sao_Paulo';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 8 });
const pct = new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** 125000 -> "R$ 1.250,00" (com espaço normal para facilitar testes e leitura). */
export function formatBRL(cents: number): string {
  return brl.format((cents || 0) / 100).replace(/ /g, ' ');
}

export function formatCurrency(cents: number, currency = 'BRL'): string {
  if (currency === 'BRL') return formatBRL(cents);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100).replace(/ /g, ' ');
}

/** Valor compacto para eixos de gráficos: "R$ 1,2 mil". */
export function formatBRLCompact(cents: number): string {
  const v = cents / 100;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

export function formatNumber(n: number): string {
  return num.format(n);
}

/** Recebe fração (0.153) e devolve "15,3%". */
export function formatPercent(fraction: number | null | undefined): string {
  if (fraction === null || fraction === undefined || !isFinite(fraction)) return 'Não disponível';
  return pct.format(fraction);
}

/**
 * Converte texto digitado em centavos. Aceita "1.250,90", "1250,90", "1250.90", "45,9", "R$ 20".
 * Retorna null quando não for um valor válido.
 */
export function parseMoney(input: string): number | null {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().replace(/\s/g, '').replace(/^R\$/i, '');
  if (!s) return null;
  const negative = s.startsWith('-');
  s = s.replace(/^-/, '');
  if (!/^[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma > -1 && lastDot > -1) {
    // O último separador é o decimal.
    normalized = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // No padrão brasileiro, uma única vírgula é sempre o separador decimal.
    normalized = s.match(/,/g)!.length > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot > -1) {
    const decimals = s.length - lastDot - 1;
    // "1.250" é milhar no padrão brasileiro; "45.90" é decimal.
    normalized = s.match(/\./g)!.length > 1 || decimals === 3 ? s.replace(/\./g, '') : s;
  } else {
    normalized = s;
  }
  const value = Number(normalized);
  if (!isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

/** Centavos -> texto editável "1250,90". */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
