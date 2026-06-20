/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import type { PrecacheEntry } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>
}

// Precache the app shell injected at build time.
precacheAndRoute(self.__WB_MANIFEST)

interface PushPayload {
  title: string
  body: string
  url: string
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = { title: 'Meal Planner', body: '', url: '/' }
  try {
    if (event.data) payload = { ...payload, ...(event.data.json() as Partial<PushPayload>) }
  } catch {
    if (event.data) payload.body = event.data.text()
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url },
    }),
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          void client.focus()
          if ('navigate' in client) void (client as WindowClient).navigate(url)
          return
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})

// When the subscription rotates, re-subscribe locally. We do NOT POST from here:
// the service worker has no Supabase JWT, and /api/push/subscribe requires auth.
// The client re-syncs the (possibly new) subscription via enablePush() — which is
// idempotent (getSubscription reuse + upsert-on-endpoint) — next time the app opens.
self.addEventListener('pushsubscriptionchange', (event: Event) => {
  const e = event as ExtendableEvent & {
    oldSubscription?: PushSubscription
    newSubscription?: PushSubscription
  }
  const applicationServerKey = e.oldSubscription?.options?.applicationServerKey ?? undefined
  if (e.newSubscription || !applicationServerKey) return
  e.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey })
      .then(() => undefined)
      .catch(() => undefined),
  )
})
