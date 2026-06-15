import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * Petite librairie de composants UI cohérents (design system « The Blue Sole » — luxe).
 * Accent maison : or champagne (gold) pour le primaire, bleu acier (azure) pour le secondaire.
 */

// ─── Button ───────────────────────────────────────────────────────────────
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
};
export function Button({ variant = 'primary', loading, disabled, className = '', children, ...rest }: ButtonProps) {
  const base = 'px-4 py-2.5 rounded font-medium text-sm transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2';
  const styles: Record<string, string> = {
    primary: 'bg-ink text-white',
    secondary: 'border border-white/20 text-white/80 hover:border-white/40',
    ghost: 'text-azure hover:text-white',
    danger: 'border border-red-400/40 text-red-300 hover:border-red-400',
  };
  const shadow = variant === 'primary' ? { boxShadow: '0 2px 0 0 #C9A86A' } : undefined;
  return (
    <button className={`${base} ${styles[variant]} ${className}`} style={shadow} disabled={disabled || loading} {...rest}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

// ─── Badge ──────────────────────────────────────────────────────────────────
export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'gold' | 'blue' | 'green' | 'red'; children: ReactNode }) {
  const tones: Record<string, string> = {
    neutral: 'bg-white/10 text-white/60',
    gold: 'bg-gold/15 text-gold',
    blue: 'bg-azure/15 text-azure',
    green: 'bg-green-500/15 text-green-300',
    red: 'bg-red-500/15 text-red-300',
  };
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${tones[tone]}`}>{children}</span>;
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block w-4 h-4 border-2 border-white/20 border-t-gold rounded-full animate-spin ${className}`}
      aria-label="chargement"
    />
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────────────
export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

// ─── État vide ────────────────────────────────────────────────────────────────
export function EmptyState({ icon = '◇', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="text-center py-10 text-white/40">
      <div className="text-2xl mb-2 text-gold/60">{icon}</div>
      <div className="text-sm text-white/60">{title}</div>
      {hint && <div className="text-xs mt-1">{hint}</div>}
    </div>
  );
}

// ─── Titre de section (éditorial) ─────────────────────────────────────────────
export function SectionTitle({ children }: { children: ReactNode }) {
  return <div className="text-xs uppercase tracking-editorial text-white/50 mb-2">{children}</div>;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
export function Tabs<T extends string>({ tabs, active, onChange }: { tabs: [T, string][]; active: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-2 flex-wrap text-sm">
      {tabs.map(([k, label]) => (
        <button
          key={k}
          className={'px-3 py-1 rounded border transition-colors ' + (active === k ? 'border-gold text-gold' : 'border-white/20 text-white/60 hover:border-white/40')}
          onClick={() => onChange(k)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
