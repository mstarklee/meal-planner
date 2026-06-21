import { motion, type Variants, type Transition } from 'motion/react'
import type { ReactNode } from 'react'

/** Shared spring/ease presets so motion feels consistent and physical across the app. */
export const ease = [0.22, 1, 0.36, 1] as const
export const springSoft: Transition = { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 }
export const springGentle: Transition = { type: 'spring', stiffness: 210, damping: 26 }

/** Editorial reveal: content rises + fades as it scrolls into view (once). */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className,
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -8% 0px' }}
      transition={{ duration: 0.7, ease, delay }}
    >
      {children}
    </motion.div>
  )
}

const containerVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease } },
}

/** Staggered container — children wrapped in <Stagger.Item> reveal in sequence on mount. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={containerVariants} initial="hidden" animate="show">
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  )
}
