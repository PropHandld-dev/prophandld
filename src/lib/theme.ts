export type ThemeChoice = 'dark' | 'light' | 'system'
export const THEME_KEY = 'prophandld:theme'

// Runs in <head> before first paint, so the chosen appearance never flashes.
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');var l=t==='light'||(t==='system'&&window.matchMedia('(prefers-color-scheme: light)').matches);document.documentElement.setAttribute('data-theme',l?'light':'dark')}catch(e){}})()`

export function getThemeChoice(): ThemeChoice {
  try {
    const t = localStorage.getItem(THEME_KEY)
    return t === 'light' || t === 'system' ? t : 'dark'
  } catch {
    return 'dark'
  }
}

export function applyTheme(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, choice)
  } catch {}
  const light = choice === 'light' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches)
  document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark')
}
