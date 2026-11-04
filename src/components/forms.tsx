// Formulários de movimentação, transferência e conta.
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Button, Field, Input, Modal, MoneyInput, Select, Textarea, cx } from './ui';
import { useStore } from '../store/store';
import { useUI, type TxDraft } from '../store/ui';
import { useLookups } from '../lib/hooks';
import { isValidISO } from '../lib/dates';
import { nowISO, uid } from '../domain/defaults';
import type { Account, AccountType, Frequency, PaymentMethod, Recurring, Transaction, Transfer, TxKind, TxStatus } from '../domain/types';
import { ACCOUNT_TYPE_LABELS, FREQUENCY_LABELS, PAYMENT_LABELS } from '../domain/types';

export function KindToggle({ value, onChange }: { value: TxKind; onChange: (k: TxKind) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface-2 p-1" role="radiogroup" aria-label="Tipo">
      {(['expense', 'income'] as TxKind[]).map((k) => (
        <button
          type="button"
          key={k}
          role="radio"
          aria-checked={value === k}
          onClick={() => onChange(k)}
          className={cx(
            'flex h-8 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium transition',
            value === k ? (k === 'income' ? 'bg-surface text-pos shadow-sm' : 'bg-surface text-neg shadow-sm') : 'text-ink-3 hover:text-ink',
          )}
        >
          {k === 'income' ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
          {k === 'income' ? 'Entrada' : 'Saída'}
        </button>
      ))}
    </div>
  );
}

export function emptyTx(today: string, p: Partial<Transaction> = {}): Transaction {
  const now = nowISO();
  return {
    id: uid(),
    kind: 'expense',
    amount_cents: 0,
    description: '',
    original_text: '',
    category_id: null,
    subcategory_id: null,
    account_id: null,
    date: today,
    settled_date: today,
    status: 'done',
    payment_method: '',
    payer: '',
    recurring_id: null,
    recurrence_date: null,
    notes: '',
    tags: [],
    created_at: now,
    updated_at: now,
    ...p,
  };
}

/** Valida campos obrigatórios e formatos. Retorna mapa campo -> mensagem. */
export function validateTx(t: Partial<Transaction>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!t.amount_cents || t.amount_cents <= 0) e.amount = 'Informe um valor maior que zero.';
  else if (t.amount_cents > 100_000_000_000) e.amount = 'Valor muito alto. Verifique.';
  if (!t.date || !isValidISO(t.date)) e.date = 'Data inválida.';
  if (t.status === 'done' && t.settled_date && !isValidISO(t.settled_date)) e.settled = 'Data inválida.';
  if (!t.description?.trim()) e.description = 'Informe uma descrição.';
  return e;
}

export function TransactionDialog({ draft }: { draft: TxDraft }) {
  const { db, save, bulk, today } = useStore();
  const { close } = useUI();
  const L = useLookups();
  const existing = draft.id && !draft._duplicate ? db.transactions.find((t) => t.id === draft.id) : undefined;
  const [t, setT] = useState<Transaction>(() => {
    const base = existing ?? emptyTx(today, { account_id: L.activeAccounts[0]?.id ?? null });
    const merged = { ...base, ...draft };
    if (draft._duplicate) Object.assign(merged, { id: uid(), recurring_id: null, recurrence_date: null, created_at: nowISO() });
    delete (merged as any)._duplicate;
    return merged as Transaction;
  });
  const [recurrence, setRecurrence] = useState<'' | Frequency>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<Transaction>) => setT((x) => ({ ...x, ...p }));
  const tops = L.tops(t.kind);
  const subs = L.subs(t.category_id);

  // Ao trocar o tipo, limpa categoria incompatível.
  useEffect(() => {
    const c = L.cat(t.category_id);
    if (c && c.kind !== t.kind) set({ category_id: null, subcategory_id: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.kind]);

  async function submit() {
    const e = validateTx(t);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const row: Transaction = {
      ...t,
      description: t.description.trim(),
      settled_date: t.status === 'done' ? t.settled_date || t.date : null,
      tags: t.tags.map((x) => x.trim()).filter(Boolean),
    };
    let ok: boolean;
    if (recurrence && !existing) {
      const r: Recurring = {
        id: uid(),
        kind: row.kind,
        description: row.description,
        amount_cents: row.amount_cents,
        category_id: row.category_id,
        subcategory_id: row.subcategory_id,
        account_id: row.account_id,
        payment_method: row.payment_method,
        frequency: recurrence,
        start_date: row.date,
        end_date: null,
        due_day: recurrence === 'monthly' || recurrence === 'yearly' ? Number(row.date.slice(8)) : null,
        auto_confirm: false,
        active: true,
        generated_until: row.date,
        created_at: nowISO(),
        updated_at: nowISO(),
      };
      row.recurring_id = r.id;
      row.recurrence_date = row.date;
      ok = await bulk(
        [
          { table: 'recurrings', upsert: [r] },
          { table: 'transactions', upsert: [row] },
        ],
        'Lançamento e recorrência salvos.',
      );
    } else {
      ok = await save('transactions', row, existing ? 'Lançamento atualizado.' : 'Lançamento salvo.');
    }
    setSaving(false);
    if (ok) close();
  }

  const title = existing ? 'Editar lançamento' : draft._duplicate ? 'Duplicar lançamento' : t.kind === 'income' ? 'Nova entrada' : 'Novo gasto';
  return (
    <Modal
      open
      onClose={close}
      title={title}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            {existing ? 'Salvar alterações' : 'Salvar lançamento'}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="sm:col-span-2">
          <KindToggle value={t.kind} onChange={(kind) => set({ kind })} />
        </div>
        <Field label="Valor *" error={errors.amount} htmlFor="f-amount">
          <MoneyInput id="f-amount" autoFocus value={t.amount_cents || null} onChange={(c) => set({ amount_cents: c ?? 0 })} invalid={!!errors.amount} />
        </Field>
        <Field label="Descrição *" error={errors.description} htmlFor="f-desc">
          <Input id="f-desc" value={t.description} onChange={(e) => set({ description: e.target.value })} placeholder={t.kind === 'income' ? 'Ex.: Salário de março' : 'Ex.: Mercado do mês'} />
        </Field>
        <Field label="Categoria" htmlFor="f-cat">
          <Select id="f-cat" value={t.category_id ?? ''} onChange={(e) => set({ category_id: e.target.value || null, subcategory_id: null })}>
            <option value="">Sem categoria</option>
            {tops.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Subcategoria" htmlFor="f-sub">
          <Select id="f-sub" value={t.subcategory_id ?? ''} onChange={(e) => set({ subcategory_id: e.target.value || null })} disabled={!subs.length}>
            <option value="">{subs.length ? 'Nenhuma' : 'Sem subcategorias'}</option>
            {subs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t.kind === 'income' ? 'Data prevista / do recebimento *' : 'Data / vencimento *'} error={errors.date} htmlFor="f-date">
          <Input id="f-date" type="date" value={t.date} onChange={(e) => set({ date: e.target.value, settled_date: t.status === 'done' ? e.target.value : t.settled_date })} />
        </Field>
        <Field label="Status" htmlFor="f-status">
          <Select id="f-status" value={t.status} onChange={(e) => set({ status: e.target.value as TxStatus, settled_date: e.target.value === 'done' ? t.settled_date || t.date : null })}>
            <option value="done">{t.kind === 'income' ? 'Recebido (realizado)' : 'Pago (realizado)'}</option>
            <option value="pending">{t.kind === 'income' ? 'Previsto (a receber)' : 'Pendente (a pagar)'}</option>
          </Select>
        </Field>
        {t.status === 'done' && (
          <Field label={t.kind === 'income' ? 'Data em que foi recebido' : 'Data em que foi pago'} error={errors.settled} hint="Data que afeta o saldo da conta." htmlFor="f-settled">
            <Input id="f-settled" type="date" value={t.settled_date ?? t.date} onChange={(e) => set({ settled_date: e.target.value })} />
          </Field>
        )}
        <Field label={t.kind === 'income' ? 'Conta de destino' : 'Conta'} htmlFor="f-acc" hint={!L.activeAccounts.length ? 'Cadastre uma conta em Configurações para controlar saldos.' : undefined}>
          <Select id="f-acc" value={t.account_id ?? ''} onChange={(e) => set({ account_id: e.target.value || null })}>
            <option value="">Sem conta</option>
            {L.activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Forma de pagamento" htmlFor="f-pm">
          <Select id="f-pm" value={t.payment_method} onChange={(e) => set({ payment_method: e.target.value as PaymentMethod })}>
            <option value="">Não informada</option>
            {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        {t.kind === 'income' && (
          <Field label="Fonte pagadora" htmlFor="f-payer">
            <Input id="f-payer" value={t.payer} onChange={(e) => set({ payer: e.target.value })} placeholder="Ex.: Empresa X, cliente Y" />
          </Field>
        )}
        {!existing && !t.recurring_id && (
          <Field label="Recorrência" htmlFor="f-rec" hint={recurrence ? 'As próximas ocorrências serão criadas como pendentes.' : undefined}>
            <Select id="f-rec" value={recurrence} onChange={(e) => setRecurrence(e.target.value as '' | Frequency)}>
              <option value="">Não se repete</option>
              {Object.entries(FREQUENCY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {t.recurring_id && <p className="self-end text-xs text-ink-3">Este lançamento faz parte de uma recorrência (gerencie em Lançamentos → Recorrentes).</p>}
        <Field label="Tags" hint="Separe por vírgulas." htmlFor="f-tags">
          <Input id="f-tags" value={t.tags.join(', ')} onChange={(e) => set({ tags: e.target.value.split(',') })} placeholder="Ex.: viagem, trabalho" />
        </Field>
        <Field label="Observações" className="sm:col-span-2" htmlFor="f-notes">
          <Textarea id="f-notes" value={t.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>
        {t.original_text && <p className="text-xs text-ink-3 sm:col-span-2">Texto original: “{t.original_text}”</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function TransferDialog({ draft }: { draft: Partial<Transfer> }) {
  const { db, save, today } = useStore();
  const { close } = useUI();
  const L = useLookups();
  const existing = draft.id ? db.transfers.find((t) => t.id === draft.id) : undefined;
  const [t, setT] = useState<Transfer>(() => ({
    id: uid(),
    from_account_id: L.activeAccounts[0]?.id ?? '',
    to_account_id: L.activeAccounts[1]?.id ?? '',
    amount_cents: 0,
    date: today,
    status: 'done',
    description: '',
    created_at: nowISO(),
    updated_at: nowISO(),
    ...existing,
    ...draft,
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (p: Partial<Transfer>) => setT((x) => ({ ...x, ...p }));

  async function submit() {
    const e: Record<string, string> = {};
    if (!t.amount_cents || t.amount_cents <= 0) e.amount = 'Informe um valor maior que zero.';
    if (!t.from_account_id) e.from = 'Selecione a conta de origem.';
    if (!t.to_account_id) e.to = 'Selecione a conta de destino.';
    if (t.from_account_id && t.from_account_id === t.to_account_id) e.to = 'Origem e destino devem ser diferentes.';
    if (!isValidISO(t.date)) e.date = 'Data inválida.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const ok = await save('transfers', { ...t, description: t.description.trim() || 'Transferência entre contas' }, existing ? 'Transferência atualizada.' : 'Transferência registrada.');
    if (ok) close();
  }

  if (L.activeAccounts.length < 2) {
    return (
      <Modal open onClose={close} title="Nova transferência">
        <p className="text-sm text-ink-2">Para transferir é preciso ter pelo menos duas contas ativas. Cadastre suas contas em Configurações → Contas.</p>
      </Modal>
    );
  }
  return (
    <Modal
      open
      onClose={close}
      title={existing ? 'Editar transferência' : 'Nova transferência'}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit}>
            Salvar transferência
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), submit())}>
        <p className="rounded-lg bg-surface-2 p-3 text-xs text-ink-2 sm:col-span-2">
          Transferências entre suas contas alteram o saldo de cada conta, mas não contam como entrada nem como gasto. Use também para enviar dinheiro à corretora antes de investir.
        </p>
        <Field label="Valor *" error={errors.amount}>
          <MoneyInput autoFocus value={t.amount_cents || null} onChange={(c) => set({ amount_cents: c ?? 0 })} />
        </Field>
        <Field label="Data *" error={errors.date}>
          <Input type="date" value={t.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="De (origem) *" error={errors.from}>
          <Select value={t.from_account_id} onChange={(e) => set({ from_account_id: e.target.value })}>
            <option value="">Selecione</option>
            {L.activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Para (destino) *" error={errors.to}>
          <Select value={t.to_account_id} onChange={(e) => set({ to_account_id: e.target.value })}>
            <option value="">Selecione</option>
            {L.activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select value={t.status} onChange={(e) => set({ status: e.target.value as TxStatus })}>
            <option value="done">Realizada</option>
            <option value="pending">Agendada (pendente)</option>
          </Select>
        </Field>
        <Field label="Descrição">
          <Input value={t.description} onChange={(e) => set({ description: e.target.value })} placeholder="Transferência entre contas" />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function AccountDialog({ id }: { id: string | null }) {
  const { db, save, today } = useStore();
  const { close } = useUI();
  const existing = id ? db.accounts.find((a) => a.id === id) : undefined;
  const [a, setA] = useState<Account>(
    () =>
      existing ?? {
        id: uid(),
        name: '',
        institution: '',
        type: 'checking',
        initial_balance_cents: 0,
        initial_date: today,
        archived: false,
        created_at: nowISO(),
        updated_at: nowISO(),
      },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (p: Partial<Account>) => setA((x) => ({ ...x, ...p }));
  const submit = async () => {
    const e: Record<string, string> = {};
    if (!a.name.trim()) e.name = 'Informe o nome da conta.';
    if (!isValidISO(a.initial_date)) e.date = 'Data inválida.';
    setErrors(e);
    if (Object.keys(e).length) return;
    if (await save('accounts', { ...a, name: a.name.trim() }, existing ? 'Conta atualizada.' : 'Conta cadastrada.')) close();
  };
  return (
    <Modal
      open
      onClose={close}
      title={existing ? 'Editar conta' : 'Nova conta'}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit}>
            Salvar conta
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), submit())}>
        <Field label="Nome *" error={errors.name}>
          <Input autoFocus value={a.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Nubank" />
        </Field>
        <Field label="Instituição">
          <Input value={a.institution} onChange={(e) => set({ institution: e.target.value })} placeholder="Ex.: Nu Pagamentos" />
        </Field>
        <Field label="Tipo">
          <Select value={a.type} onChange={(e) => set({ type: e.target.value as AccountType })}>
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Saldo inicial" hint="Pode ser negativo (ex.: -100,00).">
          <SignedMoney value={a.initial_balance_cents} onChange={(v) => set({ initial_balance_cents: v })} />
        </Field>
        <Field label="Data do saldo inicial *" error={errors.date} hint="Movimentações a partir desta data são somadas ao saldo.">
          <Input type="date" value={a.initial_date} onChange={(e) => set({ initial_date: e.target.value })} />
        </Field>
        <Field label="Situação">
          <Select value={a.archived ? '1' : '0'} onChange={(e) => set({ archived: e.target.value === '1' })}>
            <option value="0">Ativa</option>
            <option value="1">Arquivada</option>
          </Select>
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function SignedMoney({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [neg, setNeg] = useState(value < 0);
  const abs = Math.abs(value);
  return (
    <div className="flex gap-2">
      <Select className="w-14 shrink-0 px-2" value={neg ? '-' : '+'} onChange={(e) => (setNeg(e.target.value === '-'), onChange(e.target.value === '-' ? -abs : abs))} aria-label="Sinal">
        <option value="+">+</option>
        <option value="-">−</option>
      </Select>
      <div className="min-w-0 flex-1">
        <MoneyInput value={abs || null} onChange={(c) => onChange((neg ? -1 : 1) * (c ?? 0))} />
      </div>
    </div>
  );
}

export function useCategoryOptions(kind: TxKind) {
  const L = useLookups();
  return useMemo(() => L.tops(kind), [L, kind]);
}
