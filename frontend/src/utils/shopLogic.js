import { RESOURCES, RESOURCE_DISPLAY, formatResourceId, startCase } from './shopData'

export const RESOURCE_ICONS = {
  dirt: '/blocks/Dirt.jpg',
  stone: '/blocks/Stone.jpeg',
  iron: '/blocks/IronItem.png',
  diamond: '/blocks/DiamondItem.png',
  emerald: '/blocks/EmeraldItem.png',
  default: '/ui/Backpack.png',
}

export function getResourceName(id) {
  const key = formatResourceId(id)
  return RESOURCE_DISPLAY[key] || startCase(key)
}

export function getResourceIcon(id) {
  return RESOURCE_ICONS[formatResourceId(id)] || RESOURCE_ICONS.default
}

export function formatNumber(value) {
  const n = Number(value) || 0
  return n.toLocaleString()
}

export function computeShopPrice(item, level) {
  const base = Number(item?.starting_price) || 0
  const growth = Number(item?.price_growth_multiplier) || 1
  return Math.max(0, Math.round(base * Math.pow(growth, level)))
}

export function describeEffect(item, level) {
  if (!item) return { current: 'No effect', next: null }
  if (item.effect_type === 'spawn_rate_increase') {
    const perLevel = Number(item.effect_per_level) || 0
    const growth = Number(item.effect_growth_multiplier) || 1
    const total = perLevel * level
    const nextGain = perLevel * Math.pow(growth, level)
    const targetName = (getResourceName(item.affects || '') || '').toLowerCase() || 'resource'
    return {
      current: `+${formatPercent(total)} ${targetName} spawn`,
      next: `+${formatPercent(nextGain)} ${targetName} spawn`,
    }
  }
  if (item.effect_type === 'line_break_bonus') {
    const base = Number(item.effect_base) || 0
    const growth = Number(item.effect_growth_multiplier) || 1
    const current = level > 0 ? base * Math.pow(growth, Math.max(level - 1, 0)) : 0
    const nextValue = base * Math.pow(growth, level)
    const targetName = (getResourceName(item.affects || '') || '').toLowerCase() || 'resource'
    return {
      current: `${current.toFixed(2)} bonus ${targetName} per collected lines`,
      next: `${nextValue.toFixed(2)} bonus ${targetName} per collected lines`,
    }
  }
  return { current: 'Effect TBD', next: null }
}

export function formatPercent(value) {
  return `${(value * 100).toFixed(2)}%`
}

export function describeCraftEffects(craft) {
  const effects = craft?.effects
  if (!effects || typeof effects !== 'object') return []
  const lines = []
  const handled = new Set()

  if (effects.fortune_multiplier_percent != null) {
    const amt = Number(effects.fortune_multiplier_percent) || 0
    lines.push(`+${amt.toFixed(2)}% fortune multiplier`)
    handled.add('fortune_multiplier_percent')
  }
  if (effects.fortune_multiplier != null) {
    const amt = Number(effects.fortune_multiplier) || 0
    lines.push(`+${formatPercent(amt)} fortune multiplier`)
    handled.add('fortune_multiplier')
  }

  for (const [key, raw] of Object.entries(effects)) {
    if (handled.has(key)) continue
    const label = startCase(key)
    if (typeof raw === 'number') {
      lines.push(`${label}: ${raw}`)
    } else if (typeof raw === 'string') {
      lines.push(`${label}: ${raw}`)
    } else if (raw && typeof raw === 'object') {
      const nested = Object.entries(raw)
        .map(([subKey, value]) => `${startCase(subKey)} ${value}`)
        .join(', ')
      lines.push(`${label}: ${nested}`)
    }
  }

  return lines
}

export function computeMaxTimes(inv, cost = {}) {
  const entries = Object.entries(cost)
  if (!entries.length) return 0
  return Math.min(
    ...entries.map(([resId, amount]) => {
      const need = Number(amount) || 0
      if (need <= 0) return Infinity
      const have = inv[formatResourceId(resId)] || 0
      return Math.floor(have / need)
    })
  )
}

export function canCraft(inv, craft) {
  const costEntries = Object.entries(craft?.cost || {})
  if (!costEntries.length) return false
  return costEntries.every(([resId, amount]) => {
    const need = Number(amount) || 0
    if (need <= 0) return true
    const have = inv[formatResourceId(resId)] || 0
    return have >= need
  })
}

export function createDefaultInventory() {
  const base = {}
  for (const res of RESOURCES) {
    base[res.id] = res.id === 'emerald' ? 0 : 1000
  }
  return base
}

export function sanitizeInventory(src) {
  const base = createDefaultInventory()
  if (!src || typeof src !== 'object') return base
  for (const [key, value] of Object.entries(src)) {
    const id = formatResourceId(key)
    if (!id) continue
    const amount = Number(value)
    base[id] = Number.isFinite(amount) ? Math.max(0, amount) : base[id] || 0
  }
  return base
}
