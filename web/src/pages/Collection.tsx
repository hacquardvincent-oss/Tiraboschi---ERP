import { useState } from 'react';
import { api } from '../lib/api';
import { useI18n } from '../i18n';

interface Preview {
  sku: string;
  yearId: string;
  seasonId: string;
}

export function Collection() {
  const { t } = useI18n();
  const [form, setForm] = useState({
    modelId: 'AA002',
    year: '2026',
    season: 'Été',
    materialId: 'CU002',
    optionId: '01',
    colorId: '001',
  });
  const [res, setRes] = useState<Preview | null>(null);
  const [err, setErr] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const preview = async () => {
    setErr('');
    try {
      setRes(await api<Preview>('/api/erp/sku/preview', { method: 'POST', body: form }));
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="card">
      <h2 className="text-base mb-1">{t('nav.collection')} — Générateur SKU</h2>
      <p className="text-white/40 text-xs mb-4">
        Format : [MODÈLE][ANNÉE][SAISON]-[MATIÈRE][OPTION]-[COULEUR]
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="ID Modèle" value={form.modelId} onChange={set('modelId')} placeholder="AA002" />
        <Field label="Année" value={form.year} onChange={set('year')} placeholder="2026" />
        <Field label="Saison" value={form.season} onChange={set('season')} placeholder="Été / Hiver" />
        <Field label="ID Matière" value={form.materialId} onChange={set('materialId')} placeholder="CU002 / CE001" />
        <Field label="Option" value={form.optionId} onChange={set('optionId')} placeholder="01" />
        <Field label="ID Couleur" value={form.colorId} onChange={set('colorId')} placeholder="001 (999=Noir)" />
      </div>

      <button className="btn w-full mt-4" onClick={preview}>
        Générer le SKU
      </button>

      {err && <p className="text-red-400 text-sm mt-3">{err}</p>}
      {res && (
        <div className="mt-4 text-center">
          <div className="text-2xl font-semibold tracking-wider text-azure break-all">{res.sku}</div>
          <div className="text-white/40 text-xs mt-2">
            Année → {res.yearId} · Saison → {res.seasonId}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1">{label}</label>
      <input className="field" value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}
