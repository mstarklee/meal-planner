import type { ReactNode } from 'react'

interface ScreenHeaderProps {
  title: string
  /** small letterspaced label above the title */
  eyebrow?: ReactNode
  /** 'lg' for section pages, 'md' for the busier Today greeting */
  size?: 'lg' | 'md'
}

/**
 * In-flow editorial title that sits beneath the persistent TopBar. Kept compact
 * so it adds personality without eating the screen.
 */
export default function ScreenHeader({ title, eyebrow, size = 'lg' }: ScreenHeaderProps) {
  return (
    <header className="pt-4 pb-5">
      {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
      <h1
        className={`font-display font-semibold text-ink ${
          size === 'md' ? 'text-[30px] leading-[1.06]' : 'text-[34px] leading-[1.04]'
        }`}
      >
        {title}
      </h1>
    </header>
  )
}
