// Biblioteca de componentes da interface (consistente em todo o app).
import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2, X, Inbox, AlertTriangle } from 'lucide-react';
import { centsToInput, formatBRL, parseMoney } from '../lib/format';
import { useStore } from '../store/store';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:brightness-110 shadow-sm',
  secondary: 'bg-surface border border-line text-ink hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-neg text-white hover:brightness-110',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }>(
  ({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  ),
);

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={cx('inline-flex size-8 items-center justify-center rounded-lg text-ink-3 transition hover:bg-surface-2 hover:text-ink', className)} {...rest}>
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Exibe valores monetários respeitando a preferência de ocultar valores. */
export function Money({ cents, className, signed, tone }: { cents: number; className?: string; signed?: boolean; tone?: 'auto' | 'pos' | 'neg' | 'none' }) {
  const { settings } = useStore();
  const t = tone ?? 'none';
  const color = t === 'pos' ? 'text-pos' : t === 'neg' ? 'text-neg' : t === 'auto' ? (cents > 0 ? 'text-pos' : cents < 0 ? 'text-neg' : '') : '';
  const txt = settings.hide_values ? 'R$ •••••' : (signed && cents > 0 ? '+' : '') + formatBRL(cents);
  return <span className={cx('tabular whitespace-nowrap', color, className)}>{txt}</span>;
}

export function Stat({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'pos' | 'neg' | 'warn' | 'none' }) {
  const ring = tone === 'pos' ? 'bg-accent-soft text-pos' : tone === 'neg' ? 'bg-neg/10 text-neg' : tone === 'warn' ? 'bg-warn/10 text-warn' : 'bg-surface-2 text-ink-2';
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-3">{label}</span>
        {icon && <span className={cx('flex size-8 items-center justify-center rounded-lg', ring)}>{icon}</span>}
      </div>
      <div className="mt-2 text-[22px] font-semibold tracking-tight text-ink sm:text-2xl">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </Card>
  );
}

export function Field({ label, error, hint, children, className, htmlFor }: { label: string; error?: string | null; hint?: string; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children}
      {error ? <span className="text-xs text-neg">{error}</span> : hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
    </div>
  );
}

const inputCls =
  'h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...rest }, ref) => <input ref={ref} className={cx(inputCls, className)} {...rest} />);

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputCls, 'pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(inputCls, 'h-auto min-h-[72px] py-2', className)} {...rest} />;
}

/** Campo monetário com formatação brasileira. Valor em centavos (null = vazio). */
export function MoneyInput({ value, onChange, id, autoFocus, placeholder = '0,00', invalid }: { value: number | null; onChange: (c: number | null) => void; id?: string; autoFocus?: boolean; placeholder?: string; invalid?: boolean }) {
  const [text, setText] = useState(centsToInput(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(centsToInput(value));
  }, [value]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">R$</span>
      <input
        id={id}
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={cx(inputCls, 'pl-9 tabular', invalid && 'border-neg')}
        value={text}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          setText(centsToInput(value));
        }}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.,]/g, '');
          setText(v);
          onChange(v ? parseMoney(v) : null);
        }}
      />
    </div>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'pos' | 'neg' | 'warn' | 'info'; className?: string }) {
  const t = {
    neutral: 'bg-surface-2 text-ink-2 border-line',
    pos: 'bg-accent-soft text-pos border-transparent',
    neg: 'bg-neg/10 text-neg border-transparent',
    warn: 'bg-warn/10 text-warn border-transparent',
    info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-transparent',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', t, className)}>{children}</span>;
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('[autofocus], input, select, textarea, button');
      el?.focus();
    }, 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx('animate-in flex max-h-[92vh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-xl sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <IconButton label="Fechar" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ title, text, action, icon }: { title: string; text?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-surface-2 text-ink-3">{icon ?? <Inbox className="size-5" />}</div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-[13px] text-ink-3">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-neg/10 text-neg">
        <AlertTriangle className="size-5" />
      </div>
      <p className="text-sm font-medium">Algo deu errado</p>
      <p className="mt-1 max-w-sm text-[13px] text-ink-3">{text}</p>
      {onRetry && (
        <Button className="mt-4" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-3" role="status">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <div role="tablist" className={cx('inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-surface-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('h-7 rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition', value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, tone }: { value: number; tone?: 'pos' | 'warn' | 'neg' | 'accent' }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const c = tone === 'neg' ? 'bg-neg' : tone === 'warn' ? 'bg-warn' : tone === 'pos' ? 'bg-pos' : 'bg-accent';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-all', c)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Dot({ color }: { color: string }) {
  return <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: color }} />;
}
