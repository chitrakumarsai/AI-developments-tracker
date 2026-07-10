/**
 * Branded loading indicator — the logo's gradient orb (the "i" dot), gently
 * pulsing. Echoes the brand mark without shipping the full artwork; the pulse
 * is CSS (`.brand-orb` in globals.css) and stops under prefers-reduced-motion.
 */

interface LoadingOrbProps {
  /** Diameter of the orb in px. */
  size?: number;
  /** Optional caption rendered under the orb (e.g. "Loading the feed…"). */
  label?: string;
  className?: string;
}

export function LoadingOrb({ size = 20, label, className }: LoadingOrbProps) {
  return (
    <div
      className={`flex flex-col items-center gap-3 ${className ?? ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="brand-orb" style={{ width: size, height: size }} aria-hidden />
      {label ? <span className="text-sm text-muted">{label}</span> : null}
      <span className="sr-only">{label ?? "Loading"}</span>
    </div>
  );
}
