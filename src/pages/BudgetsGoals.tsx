import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Copy, Flag, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { Badge, Button, Card, Dot, EmptyState, Field, IconButton, Input, Modal, Money, MoneyInput, Progress, Select, Textarea } from '../components/ui';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { useLookups } from '../lib/hooks';
import { budgetStatus, goalProgress } from '../domain/finance';
import { nowISO, uid } from '../domain/defaults';
import type { Budget, Goal, GoalLink } from '../domain/types';
import { addMonths, formatDate, formatMonth, isValidISO, monthKey } from '../lib/dates';
import { formatBRL, formatPercent } from '../lib/format';

export function Budgets() {
  const { db, today, bulk, remove, settings } = useStore();
  const { confirm } = useUI();
  const L = useLookups();
  const [month, setMonth] = useState(monthKey(today));
  const [editing, setEditing] = useState<Budget | null>(null);
  const list = useMemo(
    () => db.budgets.filter((b) => b.month === month).map((b) => budgetStatus(b, db.transactions, db.categories, today)).sort((a, b) => b.usedPct - a.usedPct),
    [db, month, today],
  );
  const totLimit = list.reduce((s, x) => s + x.budget.limit_cents, 0);
  const totSpent = list.reduce((s, x) => s + x.spent, 0);
  const shift = (n: number) => setMonth(monthKey(addMonths(`${month}-01`, n)));
  const prevMonth = monthKey(addMonths(`${month}-01`, -1));
  const prevBudgets = db.budgets.filter((b) => b.month === prevMonth);

  async function copyFromPrevious() {
    const existing = new Set(db.budgets.filter((b) => b.month === month).map((b) => b.category_id));
    const rows = prevBudgets.filter((b) => !existing.has(b.category_id)).map((b) => ({ ...b, id: uid(), month, created_at: nowISO() }));
    if (!rows.length) return;
    await bulk([{ table: 'budgets', upsert: rows }], `${rows.length} orçamento(s) copiado(s) de ${formatMonth(prevMonth, true)}.`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <IconButton label="Mês anterior" onClick={() => shift(-1)}>
            <ChevronLeft className="size-4" />
          </IconButton>
          <span className="min-w-40 text-center text-sm font-semibold capitalize">{formatMonth(month, true)}</span>
          <IconButton label="Próximo mês" onClick={() => shift(1)}>
            <ChevronRight className="size-4" />
          </IconButton>
        </div>
        <div className="flex flex-wrap gap-2">
          {prevBudgets.length > 0 && (
            <Button icon={<Copy className="size-4" />} onClick={copyFromPrevious}>
              Reutilizar limites de {formatMonth(prevMonth)}
            </Button>
          )}
          <Button
            variant="primary"
            icon={<Plus className="size-4" />}
            onClick={() => setEditing({ id: uid(), category_id: '', month, limit_cents: 0, alert_levels: [...settings.default_alert_levels], created_at: nowISO(), updated_at: nowISO() })}
          >
            Novo orçamento
          </Button>
        </div>
      </div>

      {list.length > 0 && (
        <Card className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-[13px] text-ink-3">Total orçado no mês</div>
              <div className="text-2xl font-semibold">
                <Money cents={totSpent} /> <span className="text-base font-normal text-ink-3">de {settings.hide_values ? '•••' : formatBRL(totLimit)}</span>
              </div>
            </div>
            <span className="text-[13px] text-ink-3">{formatPercent(totLimit ? totSpent / totLimit : 0)} utilizado</span>
          </div>
          <div className="mt-3">
            <Progress value={totLimit ? totSpent / totLimit : 0} tone={totSpent > totLimit ? 'neg' : 'accent'} />
          </div>
        </Card>
      )}

      {list.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhum orçamento para este mês"
            text="Defina limites por categoria (ex.: Alimentação R$ 800). Os valores gastos são calculados a partir dos lançamentos realizados."
            icon={<Target className="size-5" />}
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((st) => {
            const cat = L.cat(st.budget.category_id);
            const tone = st.usedPct >= 1 ? 'neg' : st.level !== null ? 'warn' : 'pos';
            return (
              <Card key={st.budget.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Dot color={cat?.color ?? '#999'} />
                    <span className="font-medium">{cat?.name ?? 'Categoria removida'}</span>
                  </div>
                  <div className="flex">
                    <IconButton label="Editar" onClick={() => setEditing(st.budget)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton
                      label="Excluir"
                      className="hover:text-neg"
                      onClick={async () => (await confirm({ title: 'Excluir orçamento?', danger: true, confirmLabel: 'Excluir' })) && remove('budgets', [st.budget.id], 'Orçamento excluído.')}
                    >
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <Money cents={st.spent} className="text-xl font-semibold" />
                  <span className="text-[13px] text-ink-3">de {settings.hide_values ? '•••' : formatBRL(st.budget.limit_cents)}</span>
                </div>
                <div className="mt-2">
                  <Progress value={st.usedPct} tone={tone} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className={st.remaining < 0 ? 'text-neg' : 'text-ink-3'}>
                    {st.remaining >= 0 ? 'Restam ' : 'Excedido em '}
                    {settings.hide_values ? '•••' : formatBRL(Math.abs(st.remaining))}
                  </span>
                  <span className="font-medium">{formatPercent(st.usedPct)}</span>
                </div>
                {st.level !== null && settings.notify_budget && (
                  <div className={`mt-3 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ${st.usedPct >= 1 ? 'bg-neg/10 text-neg' : 'bg-warn/10 text-warn'}`}>
                    <AlertTriangle className="size-3.5" />
                    {st.usedPct >= 1 ? 'Orçamento ultrapassado' : `Atingiu ${st.level}% do limite`}
                  </div>
                )}
                <div className="mt-2 text-xs text-ink-3">
                  {st.forecast !== null
                    ? `Previsão até o fim do mês: ${settings.hide_values ? '•••' : formatBRL(st.forecast)}${st.forecast > st.budget.limit_cents ? ' (acima do limite)' : ''}`
                    : 'Previsão disponível após 5 dias de gastos no mês.'}
                </div>
                <div className="mt-1 text-[11px] text-ink-3">Alertas: {st.budget.alert_levels.join('%, ')}%</div>
              </Card>
            );
          })}
        </div>
      )}
      {editing && <BudgetDialog value={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BudgetDialog({ value, onClose }: { value: Budget; onClose: () => void }) {
  const { db, save } = useStore();
  const L = useLookups();
  const [b, setB] = useState(value);
  const [levels, setLevels] = useState(value.alert_levels.join(', '));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const exists = db.budgets.some((x) => x.id === b.id);
  async function submit() {
    const e: Record<string, string> = {};
    if (!b.category_id) e.cat = 'Escolha a categoria.';
    if (db.budgets.some((x) => x.id !== b.id && x.month === b.month && x.category_id === b.category_id)) e.cat = 'Já existe orçamento para esta categoria neste mês.';
    if (!b.limit_cents || b.limit_cents <= 0) e.limit = 'Informe um limite maior que zero.';
    const lv = levels
      .split(/[,;\s]+/)
      .map((x) => Number(x.replace('%', '')))
      .filter((x) => x > 0 && x <= 500);
    if (!lv.length) e.levels = 'Informe ao menos um percentual (ex.: 70, 90, 100).';
    setErrors(e);
    if (Object.keys(e).length) return;
    if (await save('budgets', { ...b, alert_levels: [...new Set(lv)].sort((x, y) => x - y) }, exists ? 'Orçamento atualizado.' : 'Orçamento criado.')) onClose();
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`${exists ? 'Editar' : 'Novo'} orçamento · ${formatMonth(b.month, true)}`}
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
      <div className="grid gap-4">
        <Field label="Categoria de despesa *" error={errors.cat}>
          <Select value={b.category_id} onChange={(e) => setB({ ...b, category_id: e.target.value })}>
            <option value="">Selecione</option>
            {L.tops('expense').map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Limite mensal *" error={errors.limit}>
          <MoneyInput value={b.limit_cents || null} onChange={(v) => setB({ ...b, limit_cents: v ?? 0 })} />
        </Field>
        <Field label="Alertas (% do limite)" error={errors.levels} hint="Separe por vírgulas. Padrão: 70, 90, 100.">
          <Input value={levels} onChange={(e) => setLevels(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export function Goals() {
  const { db, today, remove, settings } = useStore();
  const { confirm } = useUI();
  const [editing, setEditing] = useState<Goal | null>(null);
  const goals = [...db.goals].sort((a, b) => (a.status === b.status ? (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') : a.status === 'active' ? -1 : 1));
  const linkName = (g: Goal) =>
    g.link_type === 'account' ? `Conta: ${db.accounts.find((a) => a.id === g.link_id)?.name ?? '—'}` : g.link_type === 'investment' ? `Investimento: ${db.investments.find((i) => i.id === g.link_id)?.name ?? '—'}` : 'Valor acumulado informado manualmente';
  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button
          variant="primary"
          icon={<Plus className="size-4" />}
          onClick={() => setEditing({ id: uid(), name: '', target_cents: 0, saved_cents: 0, start_date: today, deadline: null, link_type: 'none', link_id: null, description: '', status: 'active', created_at: nowISO(), updated_at: nowISO() })}
        >
          Nova meta
        </Button>
      </div>
      {goals.length === 0 ? (
        <Card>
          <EmptyState title="Nenhuma meta cadastrada" text="Ex.: reserva de emergência, viagem, carro. Vincule a uma conta ou investimento para o progresso ser atualizado automaticamente." icon={<Flag className="size-5" />} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.map((g) => {
            const p = goalProgress(g, db, today);
            const late = g.deadline && g.deadline < today && p.remaining > 0;
            return (
              <Card key={g.id} className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      {g.name}
                      {g.status === 'done' || p.remaining === 0 ? <Badge tone="pos">Concluída</Badge> : late ? <Badge tone="neg">Prazo vencido</Badge> : g.status === 'archived' ? <Badge>Arquivada</Badge> : null}
                    </div>
                    <div className="text-xs text-ink-3">{linkName(g)}</div>
                  </div>
                  <div className="flex">
                    <IconButton label="Editar" onClick={() => setEditing(g)}>
                      <Pencil className="size-4" />
                    </IconButton>
                    <IconButton label="Excluir" className="hover:text-neg" onClick={async () => (await confirm({ title: 'Excluir meta?', danger: true, confirmLabel: 'Excluir' })) && remove('goals', [g.id], 'Meta excluída.')}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <Money cents={p.saved} className="text-xl font-semibold" />
                  <span className="text-[13px] text-ink-3">de {settings.hide_values ? '•••' : formatBRL(g.target_cents)}</span>
                </div>
                <div className="mt-2">
                  <Progress value={p.pct} tone={p.pct >= 1 ? 'pos' : 'accent'} />
                </div>
                <div className="mt-2 flex justify-between text-xs text-ink-3">
                  <span>Faltam {settings.hide_values ? '•••' : formatBRL(p.remaining)}</span>
                  <span className="font-medium text-ink">{formatPercent(p.pct)}</span>
                </div>
                <div className="mt-3 space-y-0.5 text-xs text-ink-3">
                  <div>
                    Início: {formatDate(g.start_date)}
                    {g.deadline ? ` · Prazo: ${formatDate(g.deadline)}` : ' · Sem prazo definido'}
                  </div>
                  {p.monthlyNeeded !== null && p.remaining > 0 && (
                    <div className="text-ink-2">
                      Contribuição necessária: <strong>{settings.hide_values ? '•••' : formatBRL(p.monthlyNeeded)}/mês</strong> por {p.monthsLeft} mês(es)
                    </div>
                  )}
                  {g.description && <div className="pt-1">{g.description}</div>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <p className="text-xs text-ink-3">Metas não somam ao patrimônio: quando vinculadas a uma conta ou investimento, apenas acompanham o valor que já está contabilizado lá.</p>
      {editing && <GoalDialog value={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function GoalDialog({ value, onClose }: { value: Goal; onClose: () => void }) {
  const { db, save } = useStore();
  const [g, setG] = useState(value);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (p: Partial<Goal>) => setG((x) => ({ ...x, ...p }));
  const exists = db.goals.some((x) => x.id === g.id);
  async function submit() {
    const e: Record<string, string> = {};
    if (!g.name.trim()) e.name = 'Informe o nome.';
    if (!g.target_cents || g.target_cents <= 0) e.target = 'Informe o valor desejado.';
    if (!isValidISO(g.start_date)) e.start = 'Data inválida.';
    if (g.deadline && (!isValidISO(g.deadline) || g.deadline < g.start_date)) e.deadline = 'O prazo deve ser posterior ao início.';
    if (g.link_type !== 'none' && !g.link_id) e.link = 'Selecione o item vinculado.';
    setErrors(e);
    if (Object.keys(e).length) return;
    if (await save('goals', { ...g, name: g.name.trim() }, exists ? 'Meta atualizada.' : 'Meta criada.')) onClose();
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={exists ? 'Editar meta' : 'Nova meta'}
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
        <Field label="Nome *" error={errors.name}>
          <Input autoFocus value={g.name} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Reserva de emergência" />
        </Field>
        <Field label="Valor desejado *" error={errors.target}>
          <MoneyInput value={g.target_cents || null} onChange={(v) => set({ target_cents: v ?? 0 })} />
        </Field>
        <Field label="Data de início *" error={errors.start}>
          <Input type="date" value={g.start_date} onChange={(e) => set({ start_date: e.target.value })} />
        </Field>
        <Field label="Prazo desejado" error={errors.deadline}>
          <Input type="date" value={g.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value || null })} />
        </Field>
        <Field label="Acompanhar progresso por" error={errors.link}>
          <Select value={g.link_type} onChange={(e) => set({ link_type: e.target.value as GoalLink, link_id: null })}>
            <option value="none">Valor informado manualmente</option>
            <option value="account">Saldo de uma conta</option>
            <option value="investment">Valor de um investimento</option>
          </Select>
        </Field>
        {g.link_type === 'none' ? (
          <Field label="Valor acumulado">
            <MoneyInput value={g.saved_cents || null} onChange={(v) => set({ saved_cents: v ?? 0 })} />
          </Field>
        ) : (
          <Field label={g.link_type === 'account' ? 'Conta' : 'Investimento'} error={errors.link}>
            <Select value={g.link_id ?? ''} onChange={(e) => set({ link_id: e.target.value || null })}>
              <option value="">Selecione</option>
              {(g.link_type === 'account' ? db.accounts : db.investments).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Status">
          <Select value={g.status} onChange={(e) => set({ status: e.target.value as Goal['status'] })}>
            <option value="active">Ativa</option>
            <option value="done">Concluída</option>
            <option value="archived">Arquivada</option>
          </Select>
        </Field>
        <Field label="Descrição" className="sm:col-span-2">
          <Textarea value={g.description} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
