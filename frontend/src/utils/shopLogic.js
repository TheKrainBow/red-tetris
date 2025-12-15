import { RESOURCES, RESOURCE_DISPLAY, formatResourceId, startCase, SHOP_ITEMS, CRAFT_ITEMS } from './shopData'

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

export function computeShopPrice(item, level, reductionPercent = 0) {
  const base = Number(item?.starting_price) || 0
  const growth = Number(item?.price_growth_multiplier) || 1
  const raw = base * Math.pow(growth, level)
  const factor = Math.max(0, 1 - (Number(reductionPercent) || 0) / 100)
  return Math.max(0, Math.round(raw * factor))
}

export function computeShopReduction(purchases = {}, craftCounts = {}) {
  let total = 0
  // From upgrades (if any carry shop_reduction)
  for (const item of SHOP_ITEMS) {
    const level = purchases?.[item.id] || 0
    if (!level) continue
    const eff = item.effects || {}
    const per = Number(eff.shop_reduction || 0)
    if (per) total += per * level
  }
  // From crafts that grant shop_reduction
  for (const craft of CRAFT_ITEMS) {
    const count = craftCounts?.[craft.id] || 0
    if (!count) continue
    const per = Number(craft.effects?.shop_reduction || 0)
    if (per) total += per * count
  }
  return total
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
    const bonusAtLevel = (n) => {
      if (n <= 0) return 0
      if (growth === 1) return base * Math.pow(growth, n - 1)
      return base * Math.pow(growth, n - 1)
    }
    const total = bonusAtLevel(level)
    const nextIncrement = bonusAtLevel(level + 1) - total
    const targetName = (getResourceName(item.affects || '') || '').toLowerCase() || 'resource'
    return {
      current: `${total.toFixed(2)} bonus ${targetName} per collected lines`,
      next: `+${nextIncrement.toFixed(2)} bonus ${targetName} per collected lines`,
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

export function hasTradeRequirements(inv, trade) {
  const reqs = Array.isArray(trade?.requires) ? trade.requires : []
  if (!reqs.length) return true
  return reqs.every((reqId) => (inv[formatResourceId(reqId)] || 0) > 0)
}

export function computeTradeMultipliers(craftCounts = {}) {
  const multipliers = { dirt: 1, stone: 1, iron: 1, diamond: 1 }
  for (const craft of CRAFT_ITEMS) {
    const count = craftCounts?.[craft.id] || 0
    if (!count) continue
    const effects = craft.effects || {}
    for (const [key, raw] of Object.entries(effects)) {
      if (!key.endsWith('_trade_multiplier')) continue
      const res = key.replace('_trade_multiplier', '')
      if (!(res in multipliers)) continue
      const mult = Math.max(0, Number(raw) || 1)
      multipliers[res] *= mult ** count
    }
  }
  return multipliers
}

export function applyTradeMultipliers(trade, multipliers = {}) {
  const scaleMap = (obj = {}) => {
    const next = {}
    for (const [key, value] of Object.entries(obj)) {
      const mult = key in multipliers ? Math.max(0, Number(multipliers[key]) || 1) : 1
      const adjusted = Math.max(1, Math.round((Number(value) || 0) * mult))
      next[key] = adjusted
    }
    return next
  }
  return {
    ...trade,
    cost: scaleMap(trade?.cost || {}),
    give: scaleMap(trade?.give || {}),
  }
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
