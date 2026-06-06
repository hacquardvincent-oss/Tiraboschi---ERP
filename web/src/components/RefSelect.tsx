import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Item {
  code: string;
  label: string;
}

/** Liste déroulante alimentée par le référentiel (/api/ref/:category). */
export function RefSelect({
  category,
  value,
  onChange,
  placeholder = '—',
}: {
  category: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    api<Item[]>('/api/ref/' + category)
      .then(setItems)
      .catch(() => setItems([]));
  }, [category]);
  return (
    <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {items.map((it) => (
        <option key={it.code} value={it.code}>
          {it.label} ({it.code})
        </option>
      ))}
    </select>
  );
}
