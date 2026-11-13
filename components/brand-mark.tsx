/** Expirix mark: an hourglass built from two leaf shapes. Uses currentColor; `cut` is the colour behind it. */
export function BrandMark({ className, cut = "#15803d" }: { className?: string; cut?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path d="M15 7 H49 C49 23 38 28 32 32 C26 28 15 23 15 7Z" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M15 57 H49 C49 41 38 36 32 32 C26 36 15 41 15 57Z" fill="currentColor" />
      <circle cx="32" cy="32" r="3.2" fill="#f59e0b" />
      <path d="M32 49 C37 45 38 40 32 37 C26 40 27 45 32 49Z" fill={cut} />
    </svg>
  );
}
