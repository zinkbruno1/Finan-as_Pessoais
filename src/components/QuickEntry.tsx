// Lançamento rápido: o usuário digita em linguagem natural, o sistema interpreta e mostra uma prévia editável.
import { useRef, useState } from 'react';
import { AlertCircle, ArrowRightLeft, CornerDownLeft, Sparkles } from 'lucide-react';
import { Badge, Button, Card, Field, Input, MoneyInput, Select, cx } from './ui';
import { KindToggle, emptyTx, validateTx } from './forms';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { useLookups } from '../lib/hooks';
import { parseQuickEntry, type ParsedEntry } from '../domain/parser';
import { nowISO, uid } from '../domain/defaults';
import type { Transaction, TxStatus } from '../domain/types';
import { formatBRL } from '../lib/format';
import { isValidISO } from '../lib/dates';

const EXAMPLES = ['20 alimentação mercado', '45,90 pizza', '120 combustível', '1500 salário', '80 farmácia ontem'];

export function QuickEntry({ compact }: { compact?: boolean }) {
  const { db, save, today } = useStore();
  const { open } = useUI();
  const L = useLookups();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedEntry | null>(null);
  const [tx, setTx] = useState<Transaction | null>(null);
  const [transferTo, setTransferTo] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function interpret(value = text) {
    if (!value.trim()) return;
    const p = parseQuickEntry(value, { categories: db.categories, rules: db.category_rules, history: db.transactions, accounts: db.accounts, today });
    setParsed(p);
    setErrors({});
    setTransferTo(p.transfer_to_account_id ?? '');
    setTx(
      emptyTx(today, {
        kind: p.kind,
        amount_cents: p.amount_cents ?? 0,
        description: p.description,
        original_text: p.original_text,
        category_id: p.category_id,
        subcategory_id: p.subcategory_id,
        account_id: p.account_id ?? L.activeAccounts.find((a) => a.type !== 'brokerage')?.id ?? L.activeAccounts[0]?.id ?? null,
        date: p.date,
        settled_date: p.date > today ? null : p.date,
        status: p.date > today ? 'pending' : 'done',
      }),
    );
  }

  function reset() {
    setText('');
    setParsed(null);
    setTx(null);
    setErrors({});
    inputRef.current?.focus();
  }

  async function confirm() {
    if (!tx || !parsed) return;
    if (parsed.isTransfer) {
      const e: Record<string, string> = {};
      if (!tx.amount_cents) e.amount = 'Informe o valor.';
      if (!tx.account_id) e.account = 'Selecione a conta de origem.';
      if (!transferTo) e.to = 'Selecione a conta de destino.';
      if (transferTo && transferTo === tx.account_id) e.to = 'Origem e destino devem ser diferentes.';
      if (!isValidISO(tx.date)) e.date = 'Data inválida.';
      setErrors(e);
      if (Object.keys(e).length) return;
      setSaving(true);
      const ok = await save(
        'transfers',
        {
          id: uid(),
          from_account_id: tx.account_id!,
          to_account_id: transferTo,
          amount_cents: tx.amount_cents,
          date: tx.date,
          status: tx.status,
          description: tx.description || 'Transferência',
          created_at: nowISO(),
          updated_at: nowISO(),
        },
        `Transferência de ${formatBRL(tx.amount_cents)} registrada.`,
      );
      setSaving(false);
      if (ok) reset();
      return;
    }
    const e = validateTx(tx);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const ok = await save(
      'transactions',
      { ...tx, settled_date: tx.status === 'done' ? tx.settled_date || tx.date : null },
      `${tx.kind === 'income' ? 'Entrada' : 'Gasto'} de ${formatBRL(tx.amount_cents)} registrado.`,
    );
    setSaving(false);
    if (ok) reset();
  }

  const set = (p: Partial<Transaction>) => setTx((x) => (x ? { ...x, ...p } : x));
  const tops = tx ? L.tops(tx.kind) : [];
  const subs = tx ? L.subs(tx.category_id) : [];

  return (
    <Card className={cx('overflow-hidden', !compact && 'border-accent/30')}>
      <form
        className="p-4 sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          interpret();
        }}
      >
        <label htmlFor="quick" className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
          <Sparkles className="size-4 text-accent" /> Lançamento rápido
        </label>
        <div className="flex gap-2">
          <Input
            id="quick"
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Digite o que você gastou ou recebeu. Ex.: 20 alimentação mercado"
            className="h-11 text-[15px]"
            autoComplete="off"
            aria-describedby="quick-help"
          />
          <Button type="submit" variant="primary" className="h-11 shrink-0" icon={<CornerDownLeft className="size-4" />}>
            <span className="hidden sm:inline">Interpretar</span>
          </Button>
        </div>
        {!parsed && (
          <div id="quick-help" className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
            <span>Experimente:</span>
            {EXAMPLES.map((ex) => (
              <button
                type="button"
                key={ex}
                onClick={() => {
                  setText(ex);
                  interpret(ex);
                }}
                className="rounded-md border border-line px-2 py-0.5 transition hover:border-accent hover:text-ink"
              >
                {ex}
              </button>
            ))}
          </div>
        )}
      </form>

      {parsed && tx && (
        <div className="animate-in border-t border-line bg-surface-2/60 p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-[13px] font-semibold">Confira antes de salvar</h4>
            {parsed.isTransfer ? (
              <Badge tone="info">
                <ArrowRightLeft className="size-3" /> Transferência entre contas
              </Badge>
            ) : (
              <Badge tone={tx.kind === 'income' ? 'pos' : 'neg'}>{tx.kind === 'income' ? 'Entrada' : 'Saída'}</Badge>
            )}
          </div>
          {parsed.issues.length > 0 && (
            <ul className="mb-3 space-y-1 rounded-lg border border-warn/30 bg-warn/10 p-2.5 text-xs text-warn">
              {parsed.issues.map((i) => (
                <li key={i} className="flex gap-1.5">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" /> {i}
                </li>
              ))}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Valor" error={errors.amount}>
              <MoneyInput value={tx.amount_cents || null} onChange={(c) => set({ amount_cents: c ?? 0 })} />
            </Field>
            {!parsed.isTransfer && (
              <Field label="Tipo">
                <KindToggle value={tx.kind} onChange={(kind) => set({ kind, category_id: null, subcategory_id: null })} />
              </Field>
            )}
            {!parsed.isTransfer && (
              <Field label="Categoria">
                <Select value={tx.category_id ?? ''} onChange={(e) => set({ category_id: e.target.value || null, subcategory_id: null })}>
                  <option value="">Sem categoria</option>
                  {tops.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            {!parsed.isTransfer && (
              <Field label="Subcategoria">
                <Select value={tx.subcategory_id ?? ''} onChange={(e) => set({ subcategory_id: e.target.value || null })} disabled={!subs.length}>
                  <option value="">{subs.length ? 'Nenhuma' : '—'}</option>
                  {subs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Descrição" error={errors.description}>
              <Input value={tx.description} onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <Field label="Data" error={errors.date}>
              <Input type="date" value={tx.date} onChange={(e) => set({ date: e.target.value, settled_date: e.target.value })} />
            </Field>
            <Field label={parsed.isTransfer ? 'Conta de origem' : 'Conta'} error={errors.account}>
              <Select value={tx.account_id ?? ''} onChange={(e) => set({ account_id: e.target.value || null })}>
                <option value="">{parsed.isTransfer ? 'Selecione' : 'Sem conta'}</option>
                {L.activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
            {parsed.isTransfer ? (
              <Field label="Conta de destino" error={errors.to}>
                <Select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                  <option value="">Selecione</option>
                  {L.activeAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Status">
              <Select value={tx.status} onChange={(e) => set({ status: e.target.value as TxStatus })}>
                <option value="done">{parsed.isTransfer ? 'Realizada' : tx.kind === 'income' ? 'Recebido' : 'Pago'}</option>
                <option value="pending">{parsed.isTransfer ? 'Agendada' : tx.kind === 'income' ? 'Previsto' : 'Pendente'}</option>
              </Select>
            </Field>
          </div>
          {parsed.candidates.length > 1 && !parsed.isTransfer && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
              <span>Outras sugestões:</span>
              {parsed.candidates.slice(1, 4).map((c) => (
                <button
                  type="button"
                  key={c.category_id + (c.subcategory_id ?? '')}
                  onClick={() => set({ category_id: c.category_id, subcategory_id: c.subcategory_id })}
                  className="rounded-md border border-line bg-surface px-2 py-0.5 hover:border-accent hover:text-ink"
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          {parsed.isTransfer && L.activeAccounts.length < 2 && (
            <p className="mt-3 text-xs text-warn">Cadastre ao menos duas contas (ex.: banco e corretora) em Configurações para registrar transferências.</p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-ink-3">Texto original: “{parsed.original_text}”</span>
            <div className="flex flex-wrap gap-2">
              {!parsed.isTransfer && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    open({ type: 'tx', draft: { ...tx } });
                    reset();
                  }}
                >
                  Mais detalhes
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={reset}>
                Cancelar
              </Button>
              <Button variant="primary" size="sm" loading={saving} onClick={confirm}>
                Confirmar lançamento
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
