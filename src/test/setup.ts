import '@testing-library/jest-dom'

// jsdom lacks IntersectionObserver, which Framer Motion's `whileInView` relies on.
// Provide a no-op stub so motion components render in tests.
if (!('IntersectionObserver' in globalThis)) {
  class IntersectionObserverStub {
    readonly root = null
    readonly rootMargin = ''
    readonly thresholds: ReadonlyArray<number> = []
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
  }
  // @ts-expect-error assigning stub to global
  globalThis.IntersectionObserver = IntersectionObserverStub
}
