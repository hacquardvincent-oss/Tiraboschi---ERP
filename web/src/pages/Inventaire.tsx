import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';

interface Material {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  unitCost: string | null;
  currency: string;
  supplier?: { name: string } | null;
}

export function Inventaire() {
  const { t } = useI18n();
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<Material[]>('/api/erp/materials')
      .then(setMaterials)
      .catch((e) => setErr((e as Error).message));
  }, []);

  return (
    <div className="card">
      <h2 className="text-base mb-3">{t('nav.inventory')}</h2>
      {err && <p className="text-red-400 text-sm">{err}</p>}
      {!materials && !err && <p className="text-white/40 text-sm">{t('common.loading')}</p>}
      {materials && materials.length === 0 && (
        <p className="text-white/40 text-sm">Aucune matière. Ajoute-les depuis la console ERP.</p>
      )}
      {materials && materials.length > 0 && (
        <table className="w-full text-sm">
          <thead className="text-white/50 text-left">
            <tr>
              <th className="py-1">Code</th>
              <th className="py-1">Nom</th>
              <th className="py-1">Cat.</th>
              <th className="py-1">Coût</th>
              <th className="py-1">Fournisseur</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={m.id} className="border-t border-white/10">
                <td className="py-1.5">{m.code}</td>
                <td className="py-1.5">{m.name}</td>
                <td className="py-1.5">{m.category}</td>
                <td className="py-1.5">
                  {m.unitCost ?? '—'} {m.currency}
                </td>
                <td className="py-1.5">{m.supplier?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
