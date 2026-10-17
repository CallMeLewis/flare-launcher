/** The flare from the app icon, without its frame, in the current text colour. */
export function AppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="207 137 700 700" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={60}>
        <path d="M262 806 Q 300 590 470 552" strokeOpacity={0.5} />
        <path d="M590 265V168M706.7 313.3l68.6-68.6M755 430h97M706.7 546.7l68.6 68.6M590 595v97M425 430h-97M473.3 313.3l-68.6-68.6" />
      </g>
      <circle cx={590} cy={430} r={100} fill="currentColor" />
    </svg>
  );
}
