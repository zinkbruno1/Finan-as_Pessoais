// Gráficos (Recharts) com valores em reais e tooltips em pt-BR.
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBRL, formatBRLCompact } from '../lib/format';
import { useStore } from '../store/store';

const AXIS = { fontSize: 11, fill: 'var(--color-ink-3)' };

function useMoneyFmt() {
  const { settings } = useStore();
  return {
    full: (v: number) => (settings.hide_values ? 'R$ •••' : formatBRL(v)),
    compact: (v: number) => (settings.hide_values ? '•••' : formatBRLCompact(v)),
  };
}

function TooltipBox({ active, payload, label, fmt }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      {label !== undefined && <div className="mb-1 font-medium text-ink">{label}</div>}
      {payload.map((p: any) => (
        <div key={p.dataKey ?? p.name} className="flex items-center gap-2 text-ink-2">
          <span className="size-2 rounded-full" style={{ background: p.color ?? p.payload?.color ?? p.payload?.fill }} />
          <span>{p.name}:</span>
          <span className="tabular font-medium text-ink">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function IncomeExpenseChart({ data, height = 260 }: { data: { label: string; income: number; expense: number; result?: number }[]; height?: number }) {
  const f = useMoneyFmt();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke="var(--color-line)" />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={f.compact} width={64} />
        <Tooltip cursor={{ fill: 'var(--color-surface-2)' }} content={<TooltipBox fmt={f.full} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Entradas" fill="var(--color-pos)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expense" name="Gastos" fill="var(--color-neg)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  data,
  height = 220,
  onSelect,
  centerLabel,
  centerValue,
}: {
  data: { name: string; value: number; color: string; id?: string | null }[];
  height?: number;
  onSelect?: (id: string | null | undefined) => void;
  centerLabel?: string;
  centerValue?: number;
}) {
  const f = useMoneyFmt();
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={data.length > 1 ? 2 : 0}
            stroke="var(--color-surface)"
            strokeWidth={2}
            onClick={(d: any) => onSelect?.(d?.payload?.id ?? d?.id)}
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip content={<TooltipBox fmt={f.full} />} />
        </PieChart>
      </ResponsiveContainer>
      {centerValue !== undefined && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-ink-3">{centerLabel}</span>
          <span className="tabular text-base font-semibold">{f.full(centerValue)}</span>
        </div>
      )}
    </div>
  );
}

export function BalanceChart({ data, height = 240 }: { data: { label: string; opening: number; closing: number }[]; height?: number }) {
  const f = useMoneyFmt();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--color-line)" />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={f.compact} width={64} />
        <Tooltip content={<TooltipBox fmt={f.full} />} />
        <Area type="monotone" dataKey="closing" name="Saldo no fim" stroke="var(--color-accent)" strokeWidth={2} fill="url(#balFill)" />
        <Line type="monotone" dataKey="opening" name="Saldo no início" stroke="var(--color-ink-3)" strokeDasharray="4 4" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function LinesChart({ data, lines, height = 240 }: { data: any[]; lines: { key: string; name: string; color: string; dashed?: boolean }[]; height?: number }) {
  const f = useMoneyFmt();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-line)" />
        <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={8} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={f.compact} width={64} />
        <Tooltip content={<TooltipBox fmt={f.full} />} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {lines.map((l) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} strokeDasharray={l.dashed ? '4 4' : undefined} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function HBarChart({ data, height }: { data: { name: string; value: number; color?: string }[]; height?: number }) {
  const f = useMoneyFmt();
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(120, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" tick={AXIS} axisLine={false} tickLine={false} width={130} />
        <Tooltip cursor={{ fill: 'var(--color-surface-2)' }} content={<TooltipBox fmt={f.full} />} />
        <Bar dataKey="value" name="Valor" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color ?? 'var(--color-accent)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
