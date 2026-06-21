/** Brand mark — a small ink tile with fork + knife, paired with the "Meals" wordmark. */
export default function Logo({ showWordmark = true }: { showWordmark?: boolean }) {
  return (
    <span className="flex items-center gap-2 select-none">
      <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f4f0e8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3v6.4c0 1.2.8 1.9 1.8 2.1V21" />
          <path d="M6.2 3v4.2M9.8 3v4.2" />
          <path d="M16.6 3c-1.5 1.3-2 4.2-1.8 7 .1 1.1.9 1.7 1.8 1.8V21" />
        </svg>
      </span>
      {showWordmark && (
        <span className="font-display text-[18px] font-semibold tracking-tight text-ink">Meals</span>
      )}
    </span>
  )
}
