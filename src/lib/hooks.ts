import { useMemo } from 'react';
import { useStore } from '../store/store';
import type { Category, CategoryKind } from '../domain/types';
import { ACCOUNT_TYPE_LABELS } from '../domain/types';

/** Helpers de categorias e contas usados por formulários e tabelas. */
export function useLookups() {
  const { db } = useStore();
  return useMemo(() => {
    const cats = new Map(db.categories.map((c) => [c.id, c]));
    const accounts = new Map(db.accounts.map((a) => [a.id, a]));
    const sortCats = (a: Category, b: Category) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'pt-BR');
    return {
      cat: (id: string | null | undefined) => (id ? cats.get(id) : undefined),
      catName: (id: string | null | undefined) => (id ? cats.get(id)?.name ?? '—' : '—'),
      catColor: (id: string | null | undefined) => (id ? cats.get(id)?.color ?? '#94a3b8' : '#94a3b8'),
      tops: (kind: CategoryKind) => db.categories.filter((c) => c.kind === kind && !c.parent_id).sort(sortCats),
      subs: (parentId: string | null | undefined) => (parentId ? db.categories.filter((c) => c.parent_id === parentId).sort(sortCats) : []),
      account: (id: string | null | undefined) => (id ? accounts.get(id) : undefined),
      accountName: (id: string | null | undefined) => (id ? accounts.get(id)?.name ?? '—' : '—'),
      activeAccounts: db.accounts.filter((a) => !a.archived).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      accountTypeLabel: (t: keyof typeof ACCOUNT_TYPE_LABELS) => ACCOUNT_TYPE_LABELS[t],
    };
  }, [db.categories, db.accounts]);
}
