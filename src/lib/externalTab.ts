// Stripe pages open in a new tab so the app stays where it was. The blank
// tab has to be opened synchronously inside the click handler — after an
// awaited fetch, browsers treat window.open as a popup and block it.
export function openPendingTab(): Window | null {
  const tab = window.open('', '_blank')
  if (tab) {
    try {
      tab.opener = null
      tab.document.title = 'Opening Stripe…'
      tab.document.body.style.cssText = 'margin:0;display:grid;place-items:center;height:100vh;background:#0C1A2E;color:#fff;font-family:system-ui,sans-serif'
      tab.document.body.textContent = 'Opening Stripe…'
    } catch {}
  }
  return tab
}

export function goToTab(tab: Window | null, url: string) {
  if (tab && !tab.closed) {
    tab.location.href = url
  } else if (!window.open(url, '_blank')) {
    window.location.href = url
  }
}

export function abandonTab(tab: Window | null) {
  if (tab && !tab.closed) tab.close()
}
