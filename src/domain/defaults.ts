import type { Category, CategoryKind, Settings } from './types';
import { DEFAULT_ASSET_CLASSES } from './types';

export function uid(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

interface Seed {
  name: string;
  color: string;
  icon: string;
  subs: string[];
}

export const DEFAULT_EXPENSE_CATEGORIES: Seed[] = [
  { name: 'Alimentação', color: '#f59e0b', icon: 'utensils', subs: ['Mercado', 'Restaurantes', 'Pizza', 'Delivery', 'Lanches', 'Café', 'Outros'] },
  { name: 'Moradia', color: '#6366f1', icon: 'home', subs: ['Aluguel', 'Condomínio', 'Energia', 'Água', 'Internet', 'Manutenção', 'Outros'] },
  { name: 'Transporte', color: '#0ea5e9', icon: 'car', subs: ['Combustível', 'Transporte público', 'Aplicativos de transporte', 'Estacionamento', 'Manutenção do veículo', 'Seguro', 'Outros'] },
  { name: 'Saúde', color: '#ef4444', icon: 'heart-pulse', subs: ['Consultas', 'Medicamentos', 'Farmácia', 'Exames', 'Plano de saúde', 'Academia', 'Outros'] },
  { name: 'Educação', color: '#8b5cf6', icon: 'graduation-cap', subs: ['Universidade', 'Cursos', 'Livros', 'Materiais', 'Outros'] },
  { name: 'Lazer', color: '#ec4899', icon: 'party-popper', subs: ['Viagens', 'Jogos', 'Eventos', 'Cinema', 'Passeios', 'Outros'] },
  { name: 'Assinaturas e serviços digitais', color: '#14b8a6', icon: 'tv', subs: ['Streaming', 'Aplicativos', 'Softwares', 'Outros'] },
  { name: 'Compras pessoais', color: '#a855f7', icon: 'shopping-bag', subs: ['Roupas', 'Eletrônicos', 'Acessórios', 'Outros'] },
  { name: 'Financeiro', color: '#64748b', icon: 'landmark', subs: ['Tarifas bancárias', 'Juros', 'Impostos', 'Seguros', 'Outros'] },
  { name: 'Outras despesas', color: '#78716c', icon: 'package', subs: ['Presentes', 'Doações', 'Despesas diversas'] },
];

export const DEFAULT_INCOME_CATEGORIES: Seed[] = [
  { name: 'Salário', color: '#059669', icon: 'briefcase', subs: [] },
  { name: 'Bolsa ou auxílio', color: '#10b981', icon: 'award', subs: [] },
  { name: 'Trabalho freelancer', color: '#22c55e', icon: 'laptop', subs: [] },
  { name: 'Serviços prestados', color: '#16a34a', icon: 'wrench', subs: [] },
  { name: 'Comissões', color: '#65a30d', icon: 'percent', subs: [] },
  { name: 'Rendimentos de investimentos', color: '#0d9488', icon: 'trending-up', subs: [] },
  { name: 'Dividendos e juros recebidos', color: '#0891b2', icon: 'coins', subs: [] },
  { name: 'Reembolsos', color: '#0284c7', icon: 'undo', subs: [] },
  { name: 'Venda de produtos', color: '#4f46e5', icon: 'tag', subs: [] },
  { name: 'Outras receitas', color: '#57534e', icon: 'plus', subs: [] },
];

export function buildDefaultCategories(): Category[] {
  const out: Category[] = [];
  const now = nowISO();
  const add = (seeds: Seed[], kind: CategoryKind) => {
    seeds.forEach((s, i) => {
      const id = uid();
      out.push({ id, name: s.name, kind, parent_id: null, color: s.color, icon: s.icon, sort_order: i, created_at: now, updated_at: now });
      s.subs.forEach((sub, j) =>
        out.push({ id: uid(), name: sub, kind, parent_id: id, color: s.color, icon: s.icon, sort_order: j, created_at: now, updated_at: now }),
      );
    });
  };
  add(DEFAULT_EXPENSE_CATEGORIES, 'expense');
  add(DEFAULT_INCOME_CATEGORIES, 'income');
  return out;
}

export function defaultSettings(): Settings {
  return {
    id: 'settings',
    user_name: '',
    currency: 'BRL',
    theme: 'system',
    default_alert_levels: [70, 90, 100],
    notify_budget: true,
    notify_due: true,
    due_days_ahead: 7,
    report_format: 'csv',
    hide_values: false,
    asset_classes: [...DEFAULT_ASSET_CLASSES],
    updated_at: nowISO(),
  };
}

export const CATEGORY_PALETTE = [
  '#f59e0b', '#6366f1', '#0ea5e9', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#a855f7', '#64748b', '#78716c',
  '#059669', '#22c55e', '#0891b2', '#4f46e5', '#d946ef', '#f97316', '#84cc16', '#06b6d4',
];
