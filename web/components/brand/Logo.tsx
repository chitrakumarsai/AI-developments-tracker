/**
 * The AI Chronicles brand mark — the "ai" monogram, cropped from the official
 * vendor artwork (`public/brand/logo-full.png`) with the background keyed out to
 * transparency. Served as `public/brand/logo-mark.png` so it stays faithful to
 * the real logo rather than an approximation. The square favicon lives at
 * `app/icon.png`.
 *
 * Intrinsic size is 578×540; the aspect ratio is fixed here so callers only pass
 * a height (`size`) and never introduce layout shift.
 */

const MARK_W = 578;
const MARK_H = 540;

interface LogoMarkProps {
  /** Rendered height in px (width follows the fixed aspect ratio). */
  size?: number;
  className?: string;
  /** Accessible label; leave unset when a text wordmark sits beside it. */
  title?: string;
}

export function LogoMark({ size = 40, className, title }: LogoMarkProps) {
  const width = Math.round((size * MARK_W) / MARK_H);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static brand asset; next/image adds no value for a tiny inline logo
    <img
      src="/brand/logo-mark.png"
      alt={title ?? ""}
      width={width}
      height={size}
      className={className}
    />
  );
}
