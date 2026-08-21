import logoRaw from '../assets/logo.svg?raw';

// Logo officiel Tiraboschi (SVG vectoriel). Recoloré en crème (currentColor) pour le fond sombre.
const LOGO_SVG = logoRaw.replace(/#1e2223/gi, 'currentColor');

/**
 * Logotype Tiraboschi. `compact` = header (petite hauteur) ; sinon écran de connexion.
 * Le SVG hérite de la couleur du conteneur (crème) et conserve son ratio.
 */
export function Logo({ compact = false }: { compact?: boolean }) {
  const height = compact ? 24 : 64;
  return (
    <div
      className="select-none [&>svg]:h-full [&>svg]:w-auto"
      style={{ color: '#F4F1EA', height }}
      aria-label="Tiraboschi — Since 1904"
      dangerouslySetInnerHTML={{ __html: LOGO_SVG }}
    />
  );
}
