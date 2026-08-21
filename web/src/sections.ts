export type Section =
  | 'dashboard'
  | 'pos'
  | 'collection'
  | 'crm'
  | 'sales'
  | 'inventory'
  | 'admin';

export interface NavItem {
  key: Section;
  icon: string;
  labelKey: string;
}

export const NAV: NavItem[] = [
  { key: 'dashboard', icon: '⌂', labelKey: 'nav.dashboard' },
  { key: 'pos', icon: '🛍', labelKey: 'nav.pos' },
  { key: 'collection', icon: '📚', labelKey: 'nav.collection' },
  { key: 'crm', icon: '👤', labelKey: 'nav.crm' },
  { key: 'sales', icon: '📈', labelKey: 'nav.sales' },
  { key: 'inventory', icon: '📦', labelKey: 'nav.inventory' },
  { key: 'admin', icon: '⚙', labelKey: 'nav.admin' },
];
