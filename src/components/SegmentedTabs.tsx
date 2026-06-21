import { useId } from 'react'
import { motion } from 'motion/react'
import { springSoft } from './motion'

interface SegmentedTabsProps<T extends string> {
  options: readonly (readonly [T, string])[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}

/** Editorial tab control: text tabs over a hairline with a sliding terracotta underline. */
export default function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedTabsProps<T>) {
  const layoutId = useId()
  return (
    <div role="tablist" aria-label={ariaLabel} className="segmented">
      {options.map(([val, label]) => {
        const selected = value === val
        return (
          <button
            key={val}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(val)}
            className="segmented-tab"
          >
            {label}
            {selected && (
              <motion.span
                layoutId={layoutId}
                transition={springSoft}
                className="absolute -bottom-px left-0 right-0 h-[2px] rounded-full bg-terracotta"
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
