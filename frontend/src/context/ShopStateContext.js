import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { CRAFT_ITEMS } from '../utils/shopData'
import { createDefaultInventory, sanitizeInventory, canCraft } from '../utils/shopLogic'
import {
  computeCapsFromPurchases,
  saveSpawnCaps,
  getStoredSpawnRates,
} from '../utils/spawnConfig'

const ShopStateContext = createContext(null)

const INVENTORY_KEY = 'shop.inv'
const PURCHASES_KEY = 'shop.purchases'
const CRAFT_UNLOCK_KEY = 'shop.craftsUnlocked'
const CRAFT_PROGRESS_KEY = 'shop.craftCounts'

const loadJSON = (key, fallback) => {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch (_) {}
  return fallback
}

function loadInventory() {
  const saved = loadJSON(INVENTORY_KEY, null)
  return sanitizeInventory(saved)
}

export function ShopStateProvider({ children }) {
  const [inventory, setInventory] = useState(() => loadInventory())
  const [purchases, setPurchases] = useState(() => loadJSON(PURCHASES_KEY, {}))
  const [craftUnlocks, setCraftUnlocks] = useState(() => loadJSON(CRAFT_UNLOCK_KEY, {}))
  const [craftCounts, setCraftCounts] = useState(() => loadJSON(CRAFT_PROGRESS_KEY, {}))
  const [spawnCaps, setSpawnCaps] = useState(() => computeCapsFromPurchases(loadJSON(PURCHASES_KEY, {})))

  useEffect(() => {
    try { localStorage.setItem(INVENTORY_KEY, JSON.stringify(inventory)) } catch (_) {}
  }, [inventory])

  useEffect(() => {
    try { localStorage.setItem(PURCHASES_KEY, JSON.stringify(purchases)) } catch (_) {}
  }, [purchases])

  useEffect(() => {
    const caps = computeCapsFromPurchases(purchases)
    setSpawnCaps(caps)
    saveSpawnCaps(caps)
    getStoredSpawnRates(caps) // ensures stored spawn rates clamp to new caps
  }, [purchases])

  useEffect(() => {
    try { localStorage.setItem(CRAFT_UNLOCK_KEY, JSON.stringify(craftUnlocks)) } catch (_) {}
  }, [craftUnlocks])

  useEffect(() => {
    try { localStorage.setItem(CRAFT_PROGRESS_KEY, JSON.stringify(craftCounts)) } catch (_) {}
  }, [craftCounts])

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

  const resetShopState = () => {
    setInventory(createDefaultInventory())
    setPurchases({})
    setCraftUnlocks({})
    setCraftCounts({})
  }

  const value = useMemo(() => ({
    inventory,
    setInventory,
    purchases,
    setPurchases,
    craftUnlocks,
    setCraftUnlocks,
    craftCounts,
    setCraftCounts,
    spawnCaps,
    resetShopState,
  }), [inventory, purchases, craftUnlocks, craftCounts, spawnCaps])

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

export { INVENTORY_KEY, PURCHASES_KEY, CRAFT_UNLOCK_KEY, CRAFT_PROGRESS_KEY }
