/// <reference types="vite-plugin-pwa/react" />
import { useRegisterSW } from 'virtual:pwa-register/react'

// Registers the service worker and, when a new version is waiting, shows a
// dismissible banner. The page reloads ONLY when the user clicks Refresh —
// never automatically — so in-progress typing is never discarded.
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 flex justify-center pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl bg-gray-900 text-white shadow-lg px-4 py-3 text-sm">
        <span>A new version is available.</span>
        <button
          className="rounded-lg bg-brand px-3 py-1.5 font-medium text-white"
          onClick={() => void updateServiceWorker(true)}
        >
          Refresh
        </button>
        <button
          className="rounded-lg px-2 py-1.5 text-gray-300 hover:text-white"
          onClick={() => setNeedRefresh(false)}
        >
          Later
        </button>
      </div>
    </div>
  )
}
