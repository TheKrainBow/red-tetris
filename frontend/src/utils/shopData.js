import YAML from 'js-yaml'

function loadRawShop() {
  try {
    const mod = require('../../shop.yml')
    if (typeof mod === 'string') return mod
    if (mod && typeof mod.default === 'string') return mod.default
  } catch (err) {
    try {
      const nodeRequire = eval('require')
      const fs = nodeRequire('fs')
      const path = nodeRequire('path')
      const file = path.resolve(process.cwd(), 'frontend/shop.yml')
      return fs.readFileSync(file, 'utf8')
    } catch (nodeErr) {
      console.error('[shop] failed to load shop.yml', nodeErr)
    }
  }
  return ''
}

const rawShopData = loadRawShop()
try {
  const parsed = YAML.load(rawShopData) || {}
  console.log('[shop] loaded', Object.keys(parsed).length, 'sections from shop.yml')
  console.log('[shop] resources:', parsed?.game?.resources?.length || 0)
  console.log('[shop] shops:', parsed?.shops?.length || 0)
  console.log('[shop] trades:', parsed?.trades?.length || 0)
  console.log('[shop] crafts:', parsed?.crafts?.length || 0)
  var SHOP_CONFIG = parsed
} catch (err) {
  console.error('[shop] failed to parse shop.yml', err)
  var SHOP_CONFIG = {}
}

const RESOURCES = SHOP_CONFIG.game?.resources || []
const RESOURCE_BY_ID = Object.fromEntries(RESOURCES.map((r) => [r.id, r]))

const SHOP_ITEMS = SHOP_CONFIG.shops || []
const TRADE_ITEMS = SHOP_CONFIG.trades || []
const CRAFT_ITEMS = SHOP_CONFIG.crafts || []
const SPAWN_START = SHOP_CONFIG.game?.spawn_probabilities_start || {}

const RESOURCE_DISPLAY = {}
RESOURCES.forEach((res) => {
  RESOURCE_DISPLAY[res.id] = res.display_name || startCase(res.id)
})

function startCase(str = '') {
  return str
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function formatResourceId(id = '') {
  return String(id || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

export {
  SHOP_CONFIG,
  RESOURCES,
  RESOURCE_BY_ID,
  SHOP_ITEMS,
  TRADE_ITEMS,
  CRAFT_ITEMS,
  SPAWN_START,
  RESOURCE_DISPLAY,
  formatResourceId,
  startCase,
}
