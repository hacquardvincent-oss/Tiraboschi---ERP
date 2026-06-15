/**
 * Logotype Tiraboschi (wordmark serif + signature « SINCE 1904 »).
 * `compact` = version horizontale pour le header ; sinon version empilée (écran de connexion).
 * Pour substituer un vrai logo image : remplacer le wordmark par <img src=… />.
 */
export function Logo({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-baseline gap-2 select-none">
        <span className="font-serif text-xl text-white" style={{ letterSpacing: '0.02em' }}>
          Tiraboschi
        </span>
        <span className="text-gold text-[9px] tracking-editorial">SINCE 1904</span>
      </div>
    );
  }
  return (
    <div className="text-center select-none">
      <div className="font-serif text-white" style={{ fontSize: '2.6rem', lineHeight: 1.05, letterSpacing: '0.02em' }}>
        Tiraboschi
      </div>
      <div className="text-gold text-[11px] tracking-editorial mt-1">SINCE 1904</div>
      <div className="mx-auto mt-3 h-px w-16 bg-gold" />
    </div>
  );
}
