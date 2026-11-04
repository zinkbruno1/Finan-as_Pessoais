// Tabela de movimentações com pesquisa, filtros, ordenação, paginação, exportação e ações.
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Copy, Download, Pencil, Search, Trash2, X } from 'lucide-react';
import { Badge, Button, Card, Dot, EmptyState, IconButton, Input, Money, Select, cx } from './ui';
import { useStore } from '../store/store';
import { useUI } from '../store/ui';
import { useLookups } from '../lib/hooks';
import { displayStatus, effectiveDate, statusLabel } from '../domain/finance';
import { normalize } from '../domain/parser';
import { FREQUENCY_LABELS, PAYMENT_LABELS, type Transaction, type TxKind } from '../domain/types';
import { formatDate, inPeriod, periodLabel } from '../lib/dates';
import { csvMoney, downloadFile, toCSV } from '../lib/csv';
import { formatBRL } from '../lib/format';

const PAGE_SIZE = 25;

export function useTxActions() {
  const { save, remove } = useStore();
  const { open, confirm } = useUI();
  return {
    edit: (t: Transaction) => open({ type: 'tx', draft: { id: t.id } }),
    duplicate: (t: Transaction) => open({ type: 'tx', draft: { ...t, _duplicate: true, status: 'done', settled_date: t.date } }),
    del: async (t: Transaction) => {
      const ok = await confirm({
        title: 'Excluir lançamento?',
        text: `“${t.description}” (${formatBRL(t.amount_cents)}) será excluído permanentemente. Saldos e relatórios serão recalculados.`,
        confirmLabel: 'Excluir',
        danger: true,
      });
      if (ok) await remove('transactions', [t.id], 'Lançamento excluído.');
    },
    settle: (t: Transaction, date: string) => save('transactions', { ...t, status: 'done', settled_date: date }, t.kind === 'income' ? 'Marcado como recebido.' : 'Marcado como pago.'),
  };
}

export function StatusBadge({ t }: { t: Transaction }) {
  const { today } = useStore();
  const s = displayStatus(t, today);
  return <Badge tone={s === 'done' ? 'pos' : s === 'overdue' ? 'neg' : 'warn'}>{statusLabel(t.kind, s)}</Badge>;
}

export function TransactionTable({ kind, title }: { kind?: TxKind; title?: string }) {
  const { db, period, today } = useStore();
  const { route, setParams, open } = useUI();
  const L = useLookups();
  const actions = useTxActions();
  const p = route.params;
  const [page, setPage] = useState(1);
  const setP = (patch: Record<string, string>) => {
    setPage(1);
    setParams({ ...p, ...patch });
  };

  const q = p.q ?? '';
  const sort = p.sort ?? 'date_desc';
  const allDates = p.all === '1';
  const range = p.from && p.to ? { start: p.from, end: p.to } : period;

  const rows = useMemo(() => {
    const nq = normalize(q);
    const qMoney = q.replace(/[^\d,.]/g, '');
    let list = db.transactions.filter((t) => !kind || t.kind === kind);
    if (!allDates) list = list.filter((t) => inPeriod(t.status === 'done' ? effectiveDate(t) : t.date, range));
    if (p.type) list = list.filter((t) => t.kind === p.type);
    if (p.category) list = list.filter((t) => t.category_id === p.category || L.cat(t.category_id)?.parent_id === p.category);
    if (p.sub) list = list.filter((t) => t.subcategory_id === p.sub);
    if (p.account) list = list.filter((t) => t.account_id === p.account);
    if (p.pm) list = list.filter((t) => t.payment_method === p.pm);
    if (p.status) list = list.filter((t) => displayStatus(t, today) === p.status);
    if (p.recurring === '1') list = list.filter((t) => t.recurring_id);
    if (nq) {
      list = list.filter((t) => {
        const hay = normalize(
          [t.description, t.original_text, t.notes, t.payer, L.catName(t.category_id), L.catName(t.subcategory_id), L.accountName(t.account_id), L.account(t.account_id)?.institution, formatDate(t.date), ...t.tags].join(' '),
        );
        if (hay.includes(nq)) return true;
        if (qMoney && /\d/.test(qMoney)) return formatBRL(t.amount_cents).includes(qMoney) || String(t.amount_cents / 100).includes(qMoney);
        return false;
      });
    }
    const [field, dir] = sort.split('_');
    const m = dir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => (field === 'amount' ? (a.amount_cents - b.amount_cents) * m : a.date.localeCompare(b.date) * m || a.created_at.localeCompare(b.created_at) * m));
    return list;
  }, [db.transactions, kind, allDates, range.start, range.end, p, q, sort, today, L]);

  const total = rows.reduce((s, t) => s + (t.kind === 'income' ? t.amount_cents : -t.amount_cents), 0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const tops = kind ? L.tops(kind) : [...L.tops('expense'), ...L.tops('income')];
  const subs = L.subs(p.category);
  const activeFilters = ['q', 'category', 'sub', 'account', 'pm', 'status', 'type', 'recurring', 'all', 'from', 'to'].filter((k) => p[k]).length;

  function exportCSV() {
    const csv = toCSV(
      ['Data', 'Data de liquidação', 'Tipo', 'Descrição', 'Categoria', 'Subcategoria', 'Conta', 'Forma de pagamento', 'Fonte pagadora', 'Status', 'Valor (R$)', 'Tags', 'Observações'],
      rows.map((t) => [
        formatDate(t.date),
        t.settled_date ? formatDate(t.settled_date) : '',
        t.kind === 'income' ? 'Entrada' : 'Saída',
        t.description,
        L.catName(t.category_id),
        t.subcategory_id ? L.catName(t.subcategory_id) : '',
        L.accountName(t.account_id),
        t.payment_method ? PAYMENT_LABELS[t.payment_method] : '',
        t.payer,
        statusLabel(t.kind, displayStatus(t, today)),
        csvMoney(t.kind === 'income' ? t.amount_cents : -t.amount_cents),
        t.tags.join(', '),
        t.notes,
      ]),
    );
    downloadFile(`${kind === 'income' ? 'entradas' : kind === 'expense' ? 'gastos' : 'lancamentos'}-${today}.csv`, csv);
  }

  const sortBtn = (field: 'date' | 'amount', label: string) => {
    const active = sort.startsWith(field);
    const dir = active && sort.endsWith('asc') ? 'asc' : 'desc';
    return (
      <button className={cx('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')} onClick={() => setP({ sort: `${field}_${active && dir === 'desc' ? 'asc' : 'desc'}` })}>
        {label}
        {active && (dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    );
  };

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div>
          <h3 className="text-[15px] font-semibold">{title ?? 'Movimentações'}</h3>
          <p className="text-[13px] text-ink-3">
            {rows.length} registro(s) · {allDates ? 'todas as datas' : p.from ? `${formatDate(range.start)} – ${formatDate(range.end)}` : periodLabel(period)} · saldo dos filtrados{' '}
            <Money cents={total} tone="auto" />
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" icon={<Download className="size-4" />} onClick={exportCSV} disabled={!rows.length}>
            Exportar CSV
          </Button>
          <Button size="sm" variant="primary" onClick={() => open({ type: 'tx', draft: { kind: kind ?? 'expense' } })}>
            {kind === 'income' ? 'Nova entrada' : kind === 'expense' ? 'Novo gasto' : 'Novo lançamento'}
          </Button>
        </div>
      </div>

      <div className="grid gap-2 px-5 pt-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <Input className="h-9 pl-9" placeholder="Pesquisar descrição, valor, conta…" value={q} onChange={(e) => setP({ q: e.target.value })} aria-label="Pesquisar" />
        </div>
        {!kind && (
          <Select className="h-9" value={p.type ?? ''} onChange={(e) => setP({ type: e.target.value })} aria-label="Tipo">
            <option value="">Todos os tipos</option>
            <option value="expense">Saídas</option>
            <option value="income">Entradas</option>
          </Select>
        )}
        <Select className="h-9" value={p.category ?? ''} onChange={(e) => setP({ category: e.target.value, sub: '' })} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {tops.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select className="h-9" value={p.sub ?? ''} onChange={(e) => setP({ sub: e.target.value })} disabled={!subs.length} aria-label="Subcategoria">
          <option value="">Todas as subcategorias</option>
          {subs.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select className="h-9" value={p.account ?? ''} onChange={(e) => setP({ account: e.target.value })} aria-label="Conta">
          <option value="">Todas as contas</option>
          {db.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <Select className="h-9" value={p.pm ?? ''} onChange={(e) => setP({ pm: e.target.value })} aria-label="Forma de pagamento">
          <option value="">Todas as formas</option>
          {Object.entries(PAYMENT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select className="h-9" value={p.status ?? ''} onChange={(e) => setP({ status: e.target.value })} aria-label="Status">
          <option value="">Todos os status</option>
          <option value="done">{kind === 'income' ? 'Recebido' : 'Realizado'}</option>
          <option value="pending">{kind === 'income' ? 'Previsto' : 'Pendente'}</option>
          <option value="overdue">Atrasado</option>
        </Select>
        <div className="flex items-center gap-2 sm:col-span-2 xl:col-span-2">
          <Input className="h-9" type="date" value={p.from ?? ''} onChange={(e) => setP({ from: e.target.value, to: p.to || e.target.value, all: '' })} aria-label="Data inicial" />
          <span className="text-ink-3">–</span>
          <Input className="h-9" type="date" value={p.to ?? ''} onChange={(e) => setP({ to: e.target.value, from: p.from || e.target.value, all: '' })} aria-label="Data final" />
        </div>
        <label className="flex h-9 items-center gap-2 text-[13px] text-ink-2">
          <input type="checkbox" checked={allDates} onChange={(e) => setP({ all: e.target.checked ? '1' : '', from: '', to: '' })} className="accent-[var(--color-accent)]" />
          Todas as datas
        </label>
        {activeFilters > 0 && (
          <Button size="sm" variant="ghost" className="h-9" icon={<X className="size-4" />} onClick={() => (setPage(1), setParams({}))}>
            Limpar filtros
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={db.transactions.length ? 'Nenhum lançamento encontrado' : 'Nenhum lançamento ainda'}
          text={db.transactions.length ? 'Ajuste os filtros ou o período selecionado.' : 'Use o lançamento rápido na Visão geral ou o botão acima para registrar sua primeira movimentação.'}
        />
      ) : (
        <>
          {/* Tabela (telas médias e grandes) */}
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full text-left text-[13px]">
              <thead className="border-y border-line bg-surface-2 text-xs font-medium text-ink-3">
                <tr>
                  <th className="px-5 py-2.5">{sortBtn('date', 'Data')}</th>
                  <th className="px-3 py-2.5">Descrição</th>
                  <th className="px-3 py-2.5">Categoria</th>
                  <th className="px-3 py-2.5">Conta</th>
                  <th className="px-3 py-2.5">{kind === 'income' ? 'Fonte / recorrência' : 'Pagamento'}</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">{sortBtn('amount', 'Valor')}</th>
                  <th className="px-5 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((t) => {
                  const rec = t.recurring_id ? db.recurrings.find((r) => r.id === t.recurring_id) : undefined;
                  return (
                    <tr key={t.id} className="group hover:bg-surface-2/60">
                      <td className="px-5 py-2.5 whitespace-nowrap text-ink-2 tabular">{formatDate(t.date)}</td>
                      <td className="max-w-[260px] px-3 py-2.5">
                        <div className="truncate font-medium text-ink">{t.description}</div>
                        {t.tags.length > 0 && <div className="truncate text-xs text-ink-3">{t.tags.map((x) => `#${x}`).join(' ')}</div>}
                      </td>
                      <td className="px-3 py-2.5">
                        <button className="flex items-center gap-2 text-left hover:underline" onClick={() => setP({ category: L.cat(t.category_id)?.parent_id ?? t.category_id ?? '' })}>
                          <Dot color={L.catColor(t.category_id)} />
                          <span className="truncate">
                            {L.catName(t.category_id)}
                            {t.subcategory_id && <span className="text-ink-3"> · {L.catName(t.subcategory_id)}</span>}
                          </span>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-ink-2">{L.accountName(t.account_id)}</td>
                      <td className="px-3 py-2.5 text-ink-2">
                        {kind === 'income' ? [t.payer, rec ? FREQUENCY_LABELS[rec.frequency] : ''].filter(Boolean).join(' · ') || '—' : t.payment_method ? PAYMENT_LABELS[t.payment_method] : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge t={t} />
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium">
                        <Money cents={t.kind === 'income' ? t.amount_cents : -t.amount_cents} tone={t.kind === 'income' ? 'pos' : 'none'} />
                      </td>
                      <td className="px-5 py-2.5">
                        <RowActions t={t} actions={actions} today={today} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Lista (celulares) */}
          <ul className="mt-4 divide-y divide-line border-t border-line md:hidden">
            {visible.map((t) => (
              <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                <Dot color={L.catColor(t.category_id)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-sm font-medium">{t.description}</span>
                    <Money cents={t.kind === 'income' ? t.amount_cents : -t.amount_cents} tone={t.kind === 'income' ? 'pos' : 'none'} className="text-sm font-medium" />
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
                    <span>{formatDate(t.date)}</span>
                    <span>{L.catName(t.subcategory_id ?? t.category_id)}</span>
                    <span>{L.accountName(t.account_id)}</span>
                    <StatusBadge t={t} />
                  </div>
                  <div className="mt-1">
                    <RowActions t={t} actions={actions} today={today} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-line px-5 py-3 text-[13px] text-ink-3">
              <span>
                Página {page} de {pages}
              </span>
              <div className="flex gap-2">
                <Button size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Anterior
                </Button>
                <Button size="sm" disabled={page === pages} onClick={() => setPage(page + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      <div className="h-2" />
    </Card>
  );
}

export function RowActions({ t, actions, today }: { t: Transaction; actions: ReturnType<typeof useTxActions>; today: string }) {
  return (
    <div className="flex justify-end gap-0.5 md:justify-end">
      {t.status === 'pending' && (
        <IconButton label={t.kind === 'income' ? 'Marcar como recebido' : 'Marcar como pago'} onClick={() => actions.settle(t, today)}>
          <Check className="size-4" />
        </IconButton>
      )}
      <IconButton label="Editar" onClick={() => actions.edit(t)}>
        <Pencil className="size-4" />
      </IconButton>
      <IconButton label="Duplicar" onClick={() => actions.duplicate(t)}>
        <Copy className="size-4" />
      </IconButton>
      <IconButton label="Excluir" onClick={() => actions.del(t)} className="hover:text-neg">
        <Trash2 className="size-4" />
      </IconButton>
    </div>
  );
}
