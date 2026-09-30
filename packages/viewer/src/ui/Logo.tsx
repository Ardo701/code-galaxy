/** The Code Galaxy mark: a small tree inside an orbit. The strokes follow the text color. */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <ellipse
        cx="16"
        cy="17"
        rx="14"
        ry="6.5"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.3"
        transform="rotate(-18 16 17)"
      />
      <path
        d="M16 27V12.5M16 19.5l-5.2-4.6M16 16.2l5.4-4.4M16 22.5l4.6-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="9.6" r="2.6" fill="#8f82f0" />
      <circle cx="9.6" cy="13.6" r="2.1" fill="#f07ab5" />
      <circle cx="22.6" cy="10.6" r="2.1" fill="#4fd6c6" />
      <circle cx="21.8" cy="18.6" r="1.7" fill="#f2c14e" />
    </svg>
  );
}
