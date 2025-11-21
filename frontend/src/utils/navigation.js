export function navigate(path = '/') {
  if (typeof window === 'undefined') return
  const clean = path.startsWith('/') ? path : `/${String(path || '').replace(/^#*/, '')}`
  window.history.pushState({}, '', clean)
  window.dispatchEvent(new Event('popstate'))
}

export function replace(path = '/') {
  if (typeof window === 'undefined') return
  const clean = path.startsWith('/') ? path : `/${String(path || '').replace(/^#*/, '')}`
  window.history.replaceState({}, '', clean)
  window.dispatchEvent(new Event('popstate'))
}
