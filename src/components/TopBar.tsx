import { useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import Icon from './Icon'
import Logo from './Logo'

interface TopBarProps {
  /** 'brand' shows the logo + wordmark (main tabs); 'back' shows a back button + title (sub-pages). */
  variant?: 'brand' | 'back'
  /** title shown beside the back button (back variant) */
  title?: string
  /** trailing actions, right-aligned */
  actions?: ReactNode
  /** override the default navigate(-1) back behaviour */
  onBack?: () => void
}

/**
 * The single, consistent top app bar used on every screen. Sticky + frosted,
 * respects the iOS safe-area inset, with a hairline base.
 */
export default function TopBar({ variant = 'brand', title, actions, onBack }: TopBarProps) {
  const navigate = useNavigate()
  return (
    <div className="sticky top-0 z-30 px-5 pt-safe bg-bone/80 backdrop-blur-xl border-b border-ink/10">
      <div className="flex h-12 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {variant === 'back' ? (
            <button
              type="button"
              onClick={onBack ?? (() => navigate(-1))}
              aria-label="Back"
              className="-ml-2 flex h-9 w-9 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/5 active:bg-ink/10"
            >
              <span className="block rotate-180">
                <Icon name="chevron" size={20} strokeWidth={1.8} />
              </span>
            </button>
          ) : (
            <Logo />
          )}
          {variant === 'back' && title && (
            <span className="truncate font-display text-[17px] font-semibold text-ink">{title}</span>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
    </div>
  )
}
