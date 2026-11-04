import { useMemo, useState } from 'react';
import { Archive, ArrowRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, Field, IconButton, Input, Modal, Money, MoneyInput, Select, Tabs } from '../components/ui';
import { KindToggle } from '../components/forms';
import { TransactionTable } from '../components/TransactionTable';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { useLookups } from '../lib/hooks';
import { accountBalance } from '../domain/finance';
import { occurrences } from '../domain/recurrence';
import { nowISO, uid } from '../domain/defaults';
import { ACCOUNT_TYPE_LABELS, FREQUENCY_LABELS, PAYMENT_LABELS, type Frequency, type PaymentMethod, type Recurring } from '../domain/types';
import { addDays, formatDate, isValidISO } from '../lib/dates';
import { formatBRL } from '../lib/format';

type Tab = 'list' | 'transfers' | 'recurring' | 'accounts';

export function Transactions() {
  const { route, setParams } = useUI();
  const tab = (route.params.tab as Tab) || 'list';
  return (
    <div className="space-y-5">
      <Tabs
        value={tab}
        onChange={(v) => setParams({ tab: v === 'list' ? '' : v })}
        options={[
          { value: 'list', label: 'Movimentações' },
          { value: 'transfers', label: 'Transferências' },
          { value: 'recurring', label: 'Recorrentes' },
          { value: 'accounts', label: 'Contas' },
        ]}
      />
      {tab === 'list' && <TransactionTable title="Todas as movimentações" />}
      {tab === 'transfers' && <Transfers />}
      {tab === 'recurring' && <Recurrings />}
      {tab === 'accounts' && <Accounts />}
    </div>
  );
}

function Transfers() {
  const { db, remove } = useStore();
  const { open, confirm } = useUI();
  const L = useLookups();
  const list = [...db.transfers].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Card>
      <CardHeader
        title="Transferências entre contas"
        subtitle="Não contam como entrada nem gasto; apenas movem dinheiro entre suas contas."
        action={
          <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => open({ type: 'transfer', draft: {} })}>
            Nova transferência
          </Button>
        }
      />
      {list.length === 0 ? (
        <EmptyState title="Nenhuma transferência registrada" text="Ex.: enviar dinheiro do banco para a corretora antes de investir." />
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {list.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="w-24 text-[13px] text-ink-2 tabular">{formatDate(t.date)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium">{t.description}</div>
                <div className="flex items-center gap-1.5 text-xs text-ink-3">
                  {L.accountName(t.from_account_id)} <ArrowRight className="size-3" /> {L.accountName(t.to_account_id)}
                </div>
              </div>
              {t.status === 'pending' && <Badge tone="warn">Agendada</Badge>}
              <Money cents={t.amount_cents} className="font-medium" />
              <div className="flex">
                <IconButton label="Editar" onClick={() => open({ type: 'transfer', draft: { id: t.id } })}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  label="Excluir"
                  className="hover:text-neg"
                  onClick={async () => {
                    if (await confirm({ title: 'Excluir transferência?', text: `${formatBRL(t.amount_cents)} de ${L.accountName(t.from_account_id)} para ${L.accountName(t.to_account_id)}.`, danger: true, confirmLabel: 'Excluir' }))
                      remove('transfers', [t.id], 'Transferência excluída.');
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="h-2" />
    </Card>
  );
}

function Recurrings() {
  const { db, bulk, save, today } = useStore();
  const { confirm } = useUI();
  const L = useLookups();
  const [editing, setEditing] = useState<Recurring | null>(null);
  const next = (r: Recurring) => occurrences({ ...r, generated_until: null }, today, addDays(today, 400))[0];
  return (
    <Card>
      <CardHeader
        title="Despesas e receitas recorrentes"
        subtitle="As ocorrências são geradas como pendentes (ou realizadas, se configurado) até 31 dias à frente, sem duplicar."
        action={
          <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => setEditing(newRecurring(today))}>
            Nova recorrência
          </Button>
        }
      />
      {db.recurrings.length === 0 ? (
        <EmptyState title="Nenhuma recorrência" text="Cadastre salário, aluguel, assinaturas, mensalidades e contas mensais." />
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {db.recurrings.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 truncate text-[13.5px] font-medium">
                  {r.description} {!r.active && <Badge>Pausada</Badge>}
                </div>
                <div className="text-xs text-ink-3">
                  {FREQUENCY_LABELS[r.frequency]}
                  {r.due_day && (r.frequency === 'monthly' || r.frequency === 'yearly') ? ` · vence dia ${r.due_day}` : ''} · {L.catName(r.category_id)} · {L.accountName(r.account_id)}
                  {r.active && next(r) ? ` · próxima: ${formatDate(next(r))}` : ''}
                  {r.end_date ? ` · até ${formatDate(r.end_date)}` : ''}
                </div>
              </div>
              <Money cents={r.kind === 'income' ? r.amount_cents : -r.amount_cents} tone={r.kind === 'income' ? 'pos' : 'none'} className="font-medium" />
              <div className="flex">
                <Button size="sm" variant="ghost" onClick={() => save('recurrings', { ...r, active: !r.active }, r.active ? 'Recorrência pausada.' : 'Recorrência reativada.')}>
                  {r.active ? 'Pausar' : 'Reativar'}
                </Button>
                <IconButton label="Editar" onClick={() => setEditing(r)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  label="Excluir"
                  className="hover:text-neg"
                  onClick={async () => {
                    const pending = db.transactions.filter((t) => t.recurring_id === r.id && t.status === 'pending');
                    if (
                      await confirm({
                        title: 'Excluir recorrência?',
                        text: `Os lançamentos já realizados serão mantidos. ${pending.length} ocorrência(s) pendente(s) também serão excluídas.`,
                        danger: true,
                        confirmLabel: 'Excluir',
                      })
                    ) {
                      await bulk(
                        [
                          { table: 'transactions', remove: pending.map((t) => t.id) },
                          { table: 'recurrings', remove: [r.id] },
                        ],
                        'Recorrência excluída.',
                      );
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="h-2" />
      {editing && <RecurringDialog value={editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function newRecurring(today: string): Recurring {
  return {
    id: uid(),
    kind: 'expense',
    description: '',
    amount_cents: 0,
    category_id: null,
    subcategory_id: null,
    account_id: null,
    payment_method: '',
    frequency: 'monthly',
    start_date: today,
    end_date: null,
    due_day: Number(today.slice(8)),
    auto_confirm: false,
    active: true,
    generated_until: null,
    created_at: nowISO(),
    updated_at: nowISO(),
  };
}

function RecurringDialog({ value, onClose }: { value: Recurring; onClose: () => void }) {
  const { db, bulk } = useStore();
  const L = useLookups();
  const [r, setR] = useState<Recurring>(value);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (p: Partial<Recurring>) => setR((x) => ({ ...x, ...p }));
  const exists = db.recurrings.some((x) => x.id === r.id);
  async function submit() {
    const e: Record<string, string> = {};
    if (!r.description.trim()) e.description = 'Informe a descrição.';
    if (!r.amount_cents || r.amount_cents <= 0) e.amount = 'Informe um valor maior que zero.';
    if (!isValidISO(r.start_date)) e.start = 'Data inválida.';
    if (r.end_date && (!isValidISO(r.end_date) || r.end_date < r.start_date)) e.end = 'A data final deve ser posterior à inicial.';
    if (r.due_day !== null && (r.due_day < 1 || r.due_day > 31)) e.due = 'Dia entre 1 e 31.';
    setErrors(e);
    if (Object.keys(e).length) return;
    // Ao editar, atualiza também as ocorrências pendentes futuras para refletir o novo valor/categoria.
    const pendingUpdates = exists
      ? db.transactions
          .filter((t) => t.recurring_id === r.id && t.status === 'pending')
          .map((t) => ({ ...t, amount_cents: r.amount_cents, description: r.description, category_id: r.category_id, subcategory_id: r.subcategory_id, account_id: r.account_id, kind: r.kind }))
      : [];
    const ok = await bulk(
      [
        { table: 'recurrings', upsert: [{ ...r, description: r.description.trim() }] },
        { table: 'transactions', upsert: pendingUpdates },
      ],
      exists ? 'Recorrência atualizada.' : 'Recorrência criada.',
    );
    if (ok) onClose();
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={exists ? 'Editar recorrência' : 'Nova recorrência'}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit}>
            Salvar
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), submit())}>
        <div className="sm:col-span-2">
          <KindToggle value={r.kind} onChange={(kind) => set({ kind, category_id: null, subcategory_id: null })} />
        </div>
        <Field label="Descrição *" error={errors.description}>
          <Input autoFocus value={r.description} onChange={(e) => set({ description: e.target.value })} placeholder="Ex.: Aluguel" />
        </Field>
        <Field label="Valor *" error={errors.amount}>
          <MoneyInput value={r.amount_cents || null} onChange={(c) => set({ amount_cents: c ?? 0 })} />
        </Field>
        <Field label="Categoria">
          <Select value={r.category_id ?? ''} onChange={(e) => set({ category_id: e.target.value || null, subcategory_id: null })}>
            <option value="">Sem categoria</option>
            {L.tops(r.kind).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Subcategoria">
          <Select value={r.subcategory_id ?? ''} onChange={(e) => set({ subcategory_id: e.target.value || null })} disabled={!L.subs(r.category_id).length}>
            <option value="">Nenhuma</option>
            {L.subs(r.category_id).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Frequência">
          <Select value={r.frequency} onChange={(e) => set({ frequency: e.target.value as Frequency })}>
            {Object.entries(FREQUENCY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        {(r.frequency === 'monthly' || r.frequency === 'yearly') && (
          <Field label="Dia do vencimento" error={errors.due}>
            <Input type="number" min={1} max={31} value={r.due_day ?? ''} onChange={(e) => set({ due_day: e.target.value ? Number(e.target.value) : null })} />
          </Field>
        )}
        <Field label="Data inicial *" error={errors.start}>
          <Input type="date" value={r.start_date} onChange={(e) => set({ start_date: e.target.value, generated_until: exists ? r.generated_until : null })} />
        </Field>
        <Field label="Data final (opcional)" error={errors.end}>
          <Input type="date" value={r.end_date ?? ''} onChange={(e) => set({ end_date: e.target.value || null })} />
        </Field>
        <Field label="Conta">
          <Select value={r.account_id ?? ''} onChange={(e) => set({ account_id: e.target.value || null })}>
            <option value="">Sem conta</option>
            {L.activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Forma de pagamento">
          <Select value={r.payment_method} onChange={(e) => set({ payment_method: e.target.value as PaymentMethod })}>
            <option value="">Não informada</option>
            {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Confirmação" hint="Pendentes só afetam o saldo depois de confirmadas.">
          <Select value={r.auto_confirm ? '1' : '0'} onChange={(e) => set({ auto_confirm: e.target.value === '1' })}>
            <option value="0">Gerar como pendente (confirmo manualmente)</option>
            <option value="1">Marcar como realizado na data</option>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={r.active ? '1' : '0'} onChange={(e) => set({ active: e.target.value === '1' })}>
            <option value="1">Ativa</option>
            <option value="0">Pausada</option>
          </Select>
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function Accounts() {
  const { db, save, remove } = useStore();
  const { open, confirm } = useUI();
  const rows = useMemo(() => db.accounts.map((a) => ({ a, bal: accountBalance(a, db) })).sort((x, y) => Number(x.a.archived) - Number(y.a.archived) || x.a.name.localeCompare(y.a.name)), [db]);
  const used = (id: string) =>
    db.transactions.some((t) => t.account_id === id) ||
    db.transfers.some((t) => t.from_account_id === id || t.to_account_id === id) ||
    db.investment_operations.some((o) => o.account_id === id);
  return (
    <Card>
      <CardHeader
        title="Contas financeiras"
        subtitle="Saldo = saldo inicial + movimentações realizadas + transferências + operações de investimento vinculadas."
        action={
          <Button size="sm" variant="primary" icon={<Plus className="size-4" />} onClick={() => open({ type: 'account', id: null })}>
            Nova conta
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState title="Nenhuma conta cadastrada" text="Cadastre conta corrente, poupança, carteira digital, dinheiro em espécie ou corretora." />
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {rows.map(({ a, bal }) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13.5px] font-medium">
                  {a.name} {a.archived && <Badge>Arquivada</Badge>}
                </div>
                <div className="text-xs text-ink-3">
                  {ACCOUNT_TYPE_LABELS[a.type]}
                  {a.institution ? ` · ${a.institution}` : ''} · saldo inicial {formatBRL(a.initial_balance_cents)} em {formatDate(a.initial_date)}
                </div>
              </div>
              <Money cents={bal} tone={bal < 0 ? 'neg' : 'none'} className="font-semibold" />
              <div className="flex">
                <IconButton label="Editar" onClick={() => open({ type: 'account', id: a.id })}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton label={a.archived ? 'Reativar' : 'Arquivar'} onClick={() => save('accounts', { ...a, archived: !a.archived }, a.archived ? 'Conta reativada.' : 'Conta arquivada.')}>
                  <Archive className="size-4" />
                </IconButton>
                <IconButton
                  label="Excluir"
                  className="hover:text-neg"
                  onClick={async () => {
                    if (used(a.id)) {
                      await confirm({ title: 'Conta com movimentações', text: 'Esta conta possui lançamentos vinculados e não pode ser excluída sem perder histórico. Arquive-a em vez disso.', confirmLabel: 'Entendi' });
                      return;
                    }
                    if (await confirm({ title: 'Excluir conta?', text: `“${a.name}” será excluída.`, danger: true, confirmLabel: 'Excluir' })) remove('accounts', [a.id], 'Conta excluída.');
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="h-2" />
    </Card>
  );
}
