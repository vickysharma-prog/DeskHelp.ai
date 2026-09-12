/**
 * The mark is a D with a dot sitting in its counter.
 *
 * The D is the product. The dot is the thing the product does: one call, one
 * answer, one row that came back. It doubles as the button on a reception
 * bell, which is the object being replaced, so the mark reads as a monogram
 * first and as a small joke second.
 *
 * Drawn as strokes rather than a font so it holds its weight at 26px in a
 * sidebar and at 46px on the sign-in page.
 */

export function Logo({ size = 'md' }) {
  return (
    <span className={size === 'lg' ? 'logo lg' : 'logo'} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <path
          d="M11.5 7.5h4.2a8.5 8.5 0 0 1 0 17h-4.2z"
          stroke="#fff"
          strokeWidth="3.1"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx="17.4" cy="16" r="2.5" fill="#fff" />
      </svg>
    </span>
  );
}

export function Wordmark({ size = 'md' }) {
  return (
    <span className={size === 'lg' ? 'wordmark lg' : 'wordmark'}>
      DeskHelp<span className="wordmark-dot">.ai</span>
    </span>
  );
}
