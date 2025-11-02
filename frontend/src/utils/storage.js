export function getLocalStorageItem(key, fallback = null) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const v = window.localStorage.getItem(key)
      return v !== null ? v : fallback
    }
  } catch (_) {}
  return fallback
}

export function setLocalStorageItem(key, value) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value)
      return true
    }
  } catch (_) {}
  return false
}

export function removeLocalStorageItem(key) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key)
      return true
    }
  } catch (_) {}
  return false
}

