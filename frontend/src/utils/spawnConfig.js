import { SPAWN_START, RESOURCES, SHOP_ITEMS, formatResourceId, startCase } from './shopData'

const SPAWN_RATES_KEY = 'shop.spawnRates'
const SPAWN_CAPS_KEY = 'shop.spawnCaps'

const TEXTURES = {
  dirt: '/blocks/Dirt.jpg',
  stone: '/blocks/Stone.jpeg',
  iron: '/blocks/Iron.jpeg',
  diamond: '/blocks/Diamond.jpg',
}

const ABSOLUTE_MAX_DEFAULTS = {
  dirt: 1.0,
  stone: 0.5,
  iron: 0.2,
  diamond: 0.03,
}

export const SPAWN_MATERIALS = RESOURCES
  .filter((res) => res.type === 'collectible' && res.id !== 'emerald')
  .map((res) => ({
    key: res.id,
    label: res.display_name || startCase(res.id),
    texture: TEXTURES[res.id] || TEXTURES.dirt,
    tint: res.id,
    absoluteMax: ABSOLUTE_MAX_DEFAULTS[res.id] ?? 1,
    max: ABSOLUTE_MAX_DEFAULTS[res.id] ?? 1,
  }))

export const SPAWN_RATE_DEFAULTS = SPAWN_MATERIALS.reduce((acc, mat) => {
  const start = typeof SPAWN_START[mat.key] === 'number' ? SPAWN_START[mat.key] : 0
  acc[mat.key] = Math.min(mat.absoluteMax, Math.max(0, start))
  return acc
}, {})

export const SPAWN_CAP_DEFAULTS = { ...SPAWN_RATE_DEFAULTS }

export const SPAWN_LOW_TO_HIGH = SPAWN_MATERIALS.map((m) => m.key)
export const SPAWN_HIGH_TO_LOW = [...SPAWN_LOW_TO_HIGH].reverse()

export function roundSpawn(num) {
  return Math.round(num * 100) / 100
}

export function sumSpawnRates(rates) {
  return SPAWN_MATERIALS.reduce((acc, mat) => acc + (rates?.[mat.key] || 0), 0)
}

export function sumSpawnCaps(caps) {
  return SPAWN_MATERIALS.reduce((acc, mat) => acc + (caps?.[mat.key] || 0), 0)
}

export function sanitizeSpawnCaps(src = SPAWN_CAP_DEFAULTS) {
  const out = {}
  for (const mat of SPAWN_MATERIALS) {
    const raw = typeof src?.[mat.key] === 'number' ? src[mat.key] : SPAWN_CAP_DEFAULTS[mat.key]
    out[mat.key] = roundSpawn(Math.min(mat.absoluteMax, Math.max(0, Number(raw) || 0)))
  }
  return out
}

export function getStoredSpawnCaps() {
  if (typeof window === 'undefined') return { ...SPAWN_CAP_DEFAULTS }
  try {
    const raw = window.localStorage.getItem(SPAWN_CAPS_KEY)
    const caps = sanitizeSpawnCaps(raw ? JSON.parse(raw) : SPAWN_CAP_DEFAULTS)
    window.localStorage.setItem(SPAWN_CAPS_KEY, JSON.stringify(caps))
    return caps
  } catch (_) {
    return { ...SPAWN_CAP_DEFAULTS }
  }
}

export function saveSpawnCaps(caps) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SPAWN_CAPS_KEY, JSON.stringify(sanitizeSpawnCaps(caps)))
  } catch (_) {}
}

export function sanitizeSpawnRates(src = SPAWN_RATE_DEFAULTS, caps = null) {
  const safeCaps = caps || getStoredSpawnCaps()
  const out = {}
  for (const mat of SPAWN_MATERIALS) {
    const cap = safeCaps[mat.key] || 0
    const raw = typeof src?.[mat.key] === 'number' ? src[mat.key] : SPAWN_RATE_DEFAULTS[mat.key]
    out[mat.key] = roundSpawn(Math.min(cap, Math.max(0, Number(raw) || 0)))
  }
  return balanceSpawnRates(out, safeCaps)
}

export function getStoredSpawnRates(caps = null) {
  if (typeof window === 'undefined') return sanitizeSpawnRates(SPAWN_RATE_DEFAULTS, caps)
  try {
    const raw = window.localStorage.getItem(SPAWN_RATES_KEY)
    const parsed = raw ? JSON.parse(raw) : SPAWN_RATE_DEFAULTS
    const sanitized = sanitizeSpawnRates(parsed, caps)
    window.localStorage.setItem(SPAWN_RATES_KEY, JSON.stringify(sanitized))
    return sanitized
  } catch (_) {
    return sanitizeSpawnRates(SPAWN_RATE_DEFAULTS, caps)
  }
}

export function saveSpawnRates(rates) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SPAWN_RATES_KEY, JSON.stringify(rates))
  } catch (_) {}
}

export function balanceSpawnRates(src, caps, skipKey = null) {
  const safeCaps = caps || sanitizeSpawnCaps()
  const out = { ...src }
  const capFor = (key) => safeCaps[key] || 0

  let total = sumSpawnRates(out)
  let excess = roundSpawn(total - 1)
  if (excess > 0) {
    for (const key of SPAWN_LOW_TO_HIGH) {
      if (key === skipKey) continue
      if (excess <= 0) break
      const cur = out[key] || 0
      const dec = Math.min(cur, excess)
      out[key] = roundSpawn(Math.max(0, cur - dec))
      excess = roundSpawn(excess - dec)
    }
    if (excess > 0 && skipKey) {
      const cur = out[skipKey] || 0
      const dec = Math.min(cur, excess)
      out[skipKey] = roundSpawn(Math.max(0, cur - dec))
    }
  }

  total = sumSpawnRates(out)
  let deficit = roundSpawn(1 - total)
  const capSum = sumSpawnCaps(safeCaps)
  if (deficit > 0 && capSum > total) {
    for (const key of SPAWN_HIGH_TO_LOW) {
      if (key === skipKey) continue
      if (deficit <= 0) break
      const cap = capFor(key)
      const cur = out[key] || 0
      const available = roundSpawn(Math.max(0, cap - cur))
      if (available <= 0) continue
      const inc = Math.min(available, deficit)
      out[key] = roundSpawn(cur + inc)
      deficit = roundSpawn(deficit - inc)
    }
    if (deficit > 0 && skipKey) {
      const cap = capFor(skipKey)
      const cur = out[skipKey] || 0
      const available = roundSpawn(Math.max(0, cap - cur))
      if (available > 0) {
        const inc = Math.min(available, deficit)
        out[skipKey] = roundSpawn(cur + inc)
        deficit = roundSpawn(deficit - inc)
      }
    }
  }

  return out
}

export function adjustSpawnRates(rates, caps, key, value, autoDistrib) {
  const safeCaps = caps || sanitizeSpawnCaps()
  const cap = safeCaps[key] || 0
  const next = { ...rates }
  const clamped = roundSpawn(Math.min(cap, Math.max(0, Number(value) || 0)))
  next[key] = clamped
  if (!autoDistrib) return next

  const balanced = balanceSpawnRates(next, safeCaps, key)
  const total = sumSpawnRates(balanced)
  const capSum = sumSpawnCaps(safeCaps)
  if (capSum >= 1) {
    const diff = roundSpawn(1 - total)
    if (Math.abs(diff) >= 0.01 - 1e-6) {
      const cur = balanced[key] || 0
      const available = roundSpawn(Math.max(0, (safeCaps[key] || 0) - cur))
      if (diff > 0 && available > 0) {
        balanced[key] = roundSpawn(cur + Math.min(diff, available))
      }
    }
  }
  return balanced
}

export {
  SPAWN_RATES_KEY,
  SPAWN_CAPS_KEY,
}

export function computeCapsFromPurchases(purchases = {}) {
  const caps = {}
  for (const mat of SPAWN_MATERIALS) {
    caps[mat.key] = mat.key === 'dirt' ? 1 : 0
  }
  for (const item of SHOP_ITEMS) {
    if (item.effect_type !== 'spawn_rate_increase') continue
    const target = formatResourceId(item.affects)
    if (!target || !(target in caps)) continue
    const level = purchases[item.id] || 0
    if (!level || level <= 0) continue
    const gain = totalSpawnGain(item, level)
    const max = ABSOLUTE_MAX_DEFAULTS[target] ?? 1
    caps[target] = roundSpawn(Math.min(max, (caps[target] || 0) + gain))
  }
  return sanitizeSpawnCaps(caps)
}

function totalSpawnGain(item, level) {
  if (!level || level <= 0) return 0
  const per = Number(item.effect_per_level) || 0
  const growth = Number(item.effect_growth_multiplier) || 1
  if (growth === 1) return per * level
  return per * ((1 - Math.pow(growth, level)) / (1 - growth))
}
