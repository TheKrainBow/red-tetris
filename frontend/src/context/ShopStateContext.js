import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { CRAFT_ITEMS, SHOP_ITEMS, formatResourceId } from '../utils/shopData'
import { createDefaultInventory, sanitizeInventory, canCraft } from '../utils/shopLogic'
import {
  computeCapsFromPurchases,
  saveSpawnCaps,
  sanitizeSpawnRates,
  sumSpawnRates,
  sanitizeSpawnCaps,
} from '../utils/spawnConfig'
import { getLocalStorageItem } from '../utils/storage'
import socketClient from '../utils/socketClient'

const ShopStateContext = createContext(null)
const USERNAME_KEY = 'username'

const ZERO_INV = createDefaultInventory()
Object.keys(ZERO_INV).forEach((k) => { ZERO_INV[k] = 0 })

const parseGamePath = () => {
  if (typeof window === 'undefined') return null
  const path = window.location?.pathname || ''
  if (!path) return null
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return null
  return { room: decodeURIComponent(parts[0]), player: decodeURIComponent(parts[1]) }
}

function normalizeInventory(userRow, invRows) {
  const base = { ...ZERO_INV }
  if (userRow) {
    base.dirt = userRow.dirt_owned || 0
    base.stone = userRow.stone_owned || 0
    base.iron = userRow.iron_owned || 0
    base.diamond = userRow.diamond_owned || 0
    base.emerald = userRow.emeralds || 0
  }
  if (Array.isArray(invRows)) {
    for (const item of invRows) {
      const key = formatResourceId(item.item_name || item.item || '')
      if (!key) continue
      base[key] = Number(item.current_count) || 0
    }
  }
  return sanitizeInventory(base)
}

function derivePurchases(inv) {
  const next = {}
  for (const item of SHOP_ITEMS) {
    const key = formatResourceId(item.id)
    next[item.id] = inv[key] || 0
  }
  return next
}

function deriveCraftCounts(inv) {
  const next = {}
  for (const craft of CRAFT_ITEMS) {
    const key = formatResourceId(craft.id)
    if (inv[key]) next[craft.id] = inv[key]
  }
  return next
}

export function ShopStateProvider({ children }) {
  const username = useMemo(() => getLocalStorageItem(USERNAME_KEY, '') || '', [])
  const [inventory, setInventory] = useState({ ...ZERO_INV })
  const [purchases, setPurchases] = useState({})
  const [craftUnlocks, setCraftUnlocks] = useState({})
  const [craftCounts, setCraftCounts] = useState({})
  const [spawnCaps, setSpawnCaps] = useState(() => computeCapsFromPurchases({}))
  const [spawnRates, setSpawnRates] = useState({})
  const loadingRef = useRef(false)

  useEffect(() => {
    const caps = computeCapsFromPurchases(purchases)
    setSpawnCaps(caps)
    saveSpawnCaps(caps)
    setSpawnRates((prev) => sanitizeSpawnRates(prev, caps))
  }, [purchases])

  useEffect(() => {
    setCraftUnlocks((prev) => {
      let changed = false
      const next = { ...prev }
      for (const craft of CRAFT_ITEMS) {
        if (!next[craft.id] && canCraft(inventory, craft)) {
          next[craft.id] = true
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [inventory])

  useEffect(() => {
    if (!username || loadingRef.current) return
    loadingRef.current = true
    const load = async () => {
      try {
        const res = await socketClient.sendCommand('get_user_by_player_name', { playerName: username })
        const userRow = res?.data?.user?.[0] || null
        const invRows = res?.data?.inventory || []
        applyServerInventory(userRow, invRows)
        await refreshSpawnRates()
      } catch (err) {
        console.error('[shop] failed to load remote state', err)
      } finally {
        loadingRef.current = false
      }
    }
    load()
    const offInventory = socketClient.on('player_inventory', (payload = {}) => {
      if (payload.player_name && payload.player_name !== username) return
      applyServerInventory(payload.user, payload.inventory)
    })
    return () => {
      offInventory && offInventory()
    }
  }, [username])

  useEffect(() => {
    // no-op: rates can be updated anytime now; tracking play state not required
  }, [])

  const applyServerInventory = (userRow, invRows) => {
    const next = normalizeInventory(userRow, invRows)
    setInventory(next)
    const derivedPurchases = derivePurchases(next)
    setPurchases(derivedPurchases)
    setCraftCounts(deriveCraftCounts(next))
  }

  const refreshSpawnRates = async () => {
    if (!username) return null
    try {
      const res = await socketClient.sendCommand('get_rates_by_player_name', { playerName: username })
      const row = Array.isArray(res?.data?.rates) ? res.data.rates[0] : null
      if (!row) return
      const normalized = {
        dirt: (row.dirt_probability || 0) / 100,
        stone: (row.stone_probability || 0) / 100,
        iron: (row.iron_probability || 0) / 100,
        diamond: (row.diamond_probability || 0) / 100,
      }
      const caps = sanitizeSpawnCaps(res?.data?.caps || computeCapsFromPurchases(purchases))
      setSpawnCaps(caps)
      saveSpawnCaps(caps)
      setSpawnRates(sanitizeSpawnRates(normalized, caps))
      return normalized
    } catch (err) {
      console.error('[shop] failed to refresh spawn rates', err)
      return null
    }
  }

  const persistSpawnRates = async (rates) => {
    const total = sumSpawnRates(rates)
    if (Math.abs(total - 1) > 0.001) return
    if (!username) return
    const payload = {
      playerName: username,
      dirt_probability: Math.round((rates.dirt || 0) * 100),
      stone_probability: Math.round((rates.stone || 0) * 100),
      iron_probability: Math.round((rates.iron || 0) * 100),
      diamond_probability: Math.round((rates.diamond || 0) * 100),
    }
    try {
      await socketClient.sendCommand('update_rates_by_player_name', payload)
      // Do not clamp to caps here; caps come from shop effects
      setSpawnRates({
        dirt: rates.dirt || 0,
        stone: rates.stone || 0,
        iron: rates.iron || 0,
        diamond: rates.diamond || 0,
      })
    } catch (err) {
      console.error('[shop] failed to save spawn rates', err)
    }
  }

  const buyItem = async (itemId) => {
    if (!username) return { success: false }
    try {
      const res = await socketClient.sendCommand('shop_buy', { playerName: username, itemId })
      applyServerInventory(res?.data?.user, res?.data?.inventory)
      return res?.data || res
    } catch (err) {
      console.error('[shop] failed to buy item', err)
      return { success: false }
    }
  }

  const tradeItem = async (tradeId, times = 1) => {
    if (!username) return { success: false }
    try {
      const res = await socketClient.sendCommand('shop_trade', { playerName: username, tradeId, times })
      applyServerInventory(res?.data?.user, res?.data?.inventory)
      return res?.data || res
    } catch (err) {
      console.error('[shop] failed to trade', err)
      return { success: false }
    }
  }

  const craftItem = async (craftId, times = 1) => {
    if (!username) return { success: false }
    try {
      const res = await socketClient.sendCommand('shop_craft', { playerName: username, craftId, times })
      applyServerInventory(res?.data?.user, res?.data?.inventory)
      return res?.data || res
    } catch (err) {
      console.error('[shop] failed to craft', err)
      return { success: false }
    }
  }

  const resetShopState = () => {
    // Not implemented server-side; noop to avoid client desync
  }

  const value = useMemo(() => ({
    inventory,
    purchases,
    craftUnlocks,
    craftCounts,
    setCraftUnlocks,
    spawnCaps,
    spawnRates,
    persistSpawnRates,
    buyItem,
    tradeItem,
    craftItem,
    refreshSpawnRates,
    resetShopState,
  }), [inventory, purchases, craftUnlocks, craftCounts, spawnCaps, spawnRates])

  return (
    <ShopStateContext.Provider value={value}>
      {children}
    </ShopStateContext.Provider>
  )
}

export function useShopState() {
  const ctx = useContext(ShopStateContext)
  if (!ctx) throw new Error('useShopState must be used within ShopStateProvider')
  return ctx
}
