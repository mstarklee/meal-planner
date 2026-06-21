import type { SVGProps } from 'react'

export type IconName =
  | 'today'
  | 'plan'
  | 'recipes'
  | 'shop'
  | 'pantry'
  | 'settings'
  | 'plus'
  | 'chevron'
  | 'search'
  | 'edit'
  | 'empty-plate'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
}

/**
 * Hand-drawn stroke icon set. Rounded caps + a touch of irregularity give an
 * Excalidraw-like feel. Color follows `currentColor`; stroke scales with size.
 */
export default function Icon({ name, size = 24, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}

const paths: Record<IconName, React.ReactNode> = {
  // Home / Today — a cozy house with a slight wobble
  today: (
    <>
      <path d="M3.4 11.2 12 4.2l8.6 7" />
      <path d="M5.2 9.9V19c0 .6.5 1 1 1h11.6c.6 0 1-.4 1-1V9.9" />
      <path d="M9.6 20v-4.4c0-.6.5-1 1-1h2.8c.5 0 1 .4 1 1V20" />
    </>
  ),
  // Plan — a torn-edge calendar
  plan: (
    <>
      <path d="M4.5 6.4c-.1 4 .1 9 0 12.6 0 .6.4 1 1 1h13c.6 0 1-.5 1-1.1-.1-3.6.1-8.4 0-12.5 0-.6-.5-1-1-1H5.5c-.6 0-1 .4-1 1Z" />
      <path d="M8 3.5v3.2M16 3.5v3.2M4.6 10.2h14.8" />
      <path d="M9 14.3l1.4 1.4 2.4-2.6" />
    </>
  ),
  // Recipes — an open cookbook
  recipes: (
    <>
      <path d="M12 6.2C10.4 5 8 4.6 5.2 5c-.5.1-.8.5-.8 1v11.4c0 .6.6 1 1.1.9C8 17.9 10.4 18.3 12 19.4" />
      <path d="M12 6.2c1.6-1.2 4-1.6 6.8-1.2.5.1.8.5.8 1v11.4c0 .6-.6 1-1.1.9-2.5-.4-4.9 0-6.5 1.1" />
      <path d="M12 6.4V19" />
    </>
  ),
  // Shop — a market basket / cart
  shop: (
    <>
      <path d="M3.2 5.4h2l2.2 9.3c.1.5.6.9 1.1.9h7.9c.5 0 1-.4 1.1-.9l1.5-6.4H6.1" />
      <circle cx="9.3" cy="19" r="1.3" />
      <circle cx="16.6" cy="19" r="1.3" />
    </>
  ),
  // Pantry — a woven basket
  pantry: (
    <>
      <path d="M4 9.2h16l-1.2 9.1c-.1.6-.6 1-1.1 1H6.3c-.5 0-1-.4-1.1-1L4 9.2Z" />
      <path d="M8.4 5.2 6.6 9.2M15.6 5.2l1.8 4M8.2 12.4l.5 3.6M12 12.4v3.6M15.8 12.4l-.5 3.6" />
    </>
  ),
  // Settings — proper cog (Feather-style) so it reads unmistakably as a gear
  settings: (
    <>
      <circle cx="12" cy="12" r="2.9" />
      <path d="M19.1 14.4a1.5 1.5 0 0 0 .3 1.65l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.5 1.5 0 0 0-1.65-.3 1.5 1.5 0 0 0-.9 1.37V20a2 2 0 0 1-4 0v-.07a1.5 1.5 0 0 0-.98-1.37 1.5 1.5 0 0 0-1.65.3l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05a1.5 1.5 0 0 0 .3-1.65 1.5 1.5 0 0 0-1.37-.9H4a2 2 0 0 1 0-4h.07a1.5 1.5 0 0 0 1.37-.98 1.5 1.5 0 0 0-.3-1.65l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05a1.5 1.5 0 0 0 1.65.3H9.6a1.5 1.5 0 0 0 .9-1.37V4a2 2 0 0 1 4 0v.07a1.5 1.5 0 0 0 .9 1.37 1.5 1.5 0 0 0 1.65-.3l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.5 1.5 0 0 0-.3 1.65V9.6a1.5 1.5 0 0 0 1.37.9H20a2 2 0 0 1 0 4h-.07a1.5 1.5 0 0 0-1.37.9Z" />
    </>
  ),
  plus: <path d="M12 5.2v13.6M5.2 12h13.6" />,
  chevron: <path d="M8.5 5.5 15 12l-6.5 6.5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.2" />
      <path d="m16 16 4 4" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20.2 4.8 16 16.4 4.4c.6-.6 1.6-.6 2.2 0l1 1c.6.6.6 1.6 0 2.2L8 19.2 4 20.2Z" />
      <path d="m14.4 6.4 3.2 3.2" />
    </>
  ),
  'empty-plate': (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="4.6" />
    </>
  ),
}
