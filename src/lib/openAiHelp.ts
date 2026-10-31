// A tiny cross-component signal, not React context — the dashboard's "Ask
// AI" box (PortfolioDigestCard) and the floating chat widget
// (FloatingChatWidget) don't share a parent that's convenient to lift
// state into, and this is the only thing that needs to cross that gap:
// "open the AI help panel and send this question." A window CustomEvent
// is the simplest thing that actually works for that, same idea as the
// browser's own popstate/visibilitychange events this codebase already
// listens for elsewhere.
const EVENT_NAME = 'prophandld:open-ai-help'

export function openAiHelp(message: string) {
  if (typeof window === 'undefined' || !message.trim()) return
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { message: message.trim() } }))
}

export function onOpenAiHelp(handler: (message: string) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (e: Event) => {
    const message = (e as CustomEvent).detail?.message
    if (typeof message === 'string' && message) handler(message)
  }
  window.addEventListener(EVENT_NAME, listener)
  return () => window.removeEventListener(EVENT_NAME, listener)
}
