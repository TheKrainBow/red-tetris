import React, { useEffect, useState } from 'react'
import {
  adjustSpawnRates,
  balanceSpawnRates,
  sumSpawnRates,
  SPAWN_MATERIALS,
  sanitizeSpawnRates,
  SPAWN_CAP_DEFAULTS,
} from '../utils/spawnConfig'
import { useShopState } from '../context/ShopStateContext'
import {
  RESOURCE_ICONS,
  getResourceIcon,
  getResourceName,
  formatNumber,
  describeCraftEffects,
} from '../utils/shopLogic'
import { RESOURCES, SHOP_ITEMS, CRAFT_ITEMS, formatResourceId } from '../utils/shopData'

const DOCK_TAB_KEY = 'utilityDock.activeTab'
const CRAFT_BY_OUTPUT = CRAFT_ITEMS.reduce((acc, craft) => {
  Object.keys(craft.outputs || {}).forEach((resId) => {
    acc[formatResourceId(resId)] = craft
  })
  return acc
}, {})
const UTILITY_BUTTONS = [
  { id: 'inventory', icon: '/ui/Backpack.png', label: 'Inventory' },
  { id: 'spawn', icon: '/ui/Pickaxe.webp', label: 'Spawn Rate' },
  { id: 'stats', icon: '/ui/Stats.png', label: 'Statistics' },
]

export default function UtilityDock({ hidden }) {
  const { inventory, spawnCaps, purchases, craftCounts, spawnRates, persistSpawnRates } = useShopState()
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(DOCK_TAB_KEY)
  })
  const [draftRates, setDraftRates] = useState(() => sanitizeSpawnRates(spawnRates, spawnCaps))
  const [spawnAutoDistrib, setSpawnAutoDistrib] = useState(true)
  const [editingKey, setEditingKey] = useState(null)
  const [draftInput, setDraftInput] = useState('')

  useEffect(() => {
    const sanitized = sanitizeSpawnRates(spawnRates, spawnCaps)
    setDraftRates(sanitized)
  }, [spawnCaps, spawnRates])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (activeTab) window.localStorage.setItem(DOCK_TAB_KEY, activeTab)
      else window.localStorage.removeItem(DOCK_TAB_KEY)
    }
  }, [activeTab])

  if (hidden) return null

  const toggleTab = (id) => {
    setActiveTab((prev) => (prev === id ? null : id))
  }

  const handleSpawnChange = (key, value) => {
    setDraftRates((prev) => adjustSpawnRates(prev, spawnCaps, key, value, spawnAutoDistrib))
  }

  const handleAutoDistribChange = (checked) => {
    setSpawnAutoDistrib(checked)
    if (checked) setDraftRates((prev) => balanceSpawnRates(prev, spawnCaps))
  }

  const handleCancelDraft = () => {
    const stored = sanitizeSpawnRates(spawnRates, spawnCaps)
    setDraftRates(stored)
    setEditingKey(null)
    setDraftInput('')
    setSpawnAutoDistrib(true)
  }

  const handleSaveDraft = () => {
    const total = sumSpawnRates(draftRates)
    if (Math.abs(total - 1) > 0.0001) return
    persistSpawnRates(draftRates)
    setEditingKey(null)
    setDraftInput('')
  }

  const storedRates = sanitizeSpawnRates(spawnRates, spawnCaps)
  const draftMatchesStored = JSON.stringify(storedRates) === JSON.stringify(draftRates)
  const draftSumValid = Math.abs(sumSpawnRates(draftRates) - 1) <= 0.0001

  return (
    <div className="shop-utility">
      <div className="shop-utility-buttons">
        {UTILITY_BUTTONS.map((btn) => (
          <button
            key={btn.id}
            className={`shop-utility-button ${activeTab === btn.id ? 'active' : ''}`}
            onClick={() => toggleTab(btn.id)}
            aria-pressed={activeTab === btn.id}
            aria-label={btn.label}
          >
            <img src={btn.icon} alt={btn.label} />
          </button>
        ))}
      </div>
      {activeTab && (
        <div className={`shop-utility-modal shop-inventory-modal utility-panel-${activeTab}`}>
          {activeTab === 'inventory' && <InventoryPanel inv={inventory} />}
          {activeTab === 'spawn' && (
            <SpawnRatePanel
              rates={draftRates}
              caps={spawnCaps}
              autoDistrib={spawnAutoDistrib}
              onChange={handleSpawnChange}
              onAutoDistribChange={handleAutoDistribChange}
              editingKey={editingKey}
              draftInput={draftInput}
              onStartEdit={(key, value) => {
                setEditingKey(key)
                setDraftInput(value.toFixed(2))
              }}
              onInputChange={(value) => setDraftInput(value)}
              onCommitEdit={(key) => {
                const val = parseFloat(draftInput)
                if (!isNaN(val)) handleSpawnChange(key, val)
                setEditingKey(null)
              }}
              onCancel={handleCancelDraft}
              onSave={handleSaveDraft}
              disableCancel={draftMatchesStored}
              disableSave={!draftSumValid || draftMatchesStored}
            />
          )}
          {activeTab === 'stats' && (
            <StatsPanel
              purchases={purchases}
              spawnCaps={spawnCaps}
              inventory={inventory}
              craftCounts={craftCounts}
            />
          )}
        </div>
      )}
    </div>
  )
}

function computeFortuneFromUpgrades(purchases = {}) {
  let total = 0
  for (const item of SHOP_ITEMS) {
    if (item.effect_type !== 'fortune_multiplier') continue
    const level = purchases[item.id] || 0
    if (!level) continue
    const perLevel = Number(item.effect_per_level) || 0
    const growth = Number(item.effect_growth_multiplier) || 1
    const stacked = computeStackedEffect(perLevel, growth, level)
    total += stacked * 100
  }
  return total
}

function computeFortuneFromCrafts(craftCounts = {}, inventory) {
  let total = 0
  for (const craft of CRAFT_ITEMS) {
    const crafted = getCraftCount(craft, inventory, craftCounts)
    if (!crafted) continue
    const bonusPercent = getFortuneEffectPercent(craft.effects)
    if (!bonusPercent) continue
    total += bonusPercent * crafted
  }
  return total
}

function getFortuneEffectPercent(effects = {}) {
  if (!effects) return 0
  if (effects.fortune_multiplier_percent != null) {
    return Number(effects.fortune_multiplier_percent) || 0
  }
  if (effects.fortune_multiplier != null) {
    return (Number(effects.fortune_multiplier) || 0) * 100
  }
  return 0
}

function computeStackedEffect(perLevel, growth, level) {
  if (!level || level <= 0) return 0
  if (!perLevel) return 0
  if (growth === 1) return perLevel * level
  return perLevel * ((1 - Math.pow(growth, level)) / (1 - growth))
}

function computeLineBonus(item, level) {
  if (!item || level <= 0) return 0
  const base = Number(item.effect_base) || 0
  const growth = Number(item.effect_growth_multiplier) || 1
  return base * Math.pow(growth, Math.max(level - 1, 0))
}

function getCraftCount(craft, inventory, craftCounts) {
  if (craftCounts && typeof craftCounts[craft.id] === 'number') {
    return craftCounts[craft.id]
  }
  if (!craft?.outputs) return 0
  const [key, amount] = Object.entries(craft.outputs)[0] || []
  if (!key) return 0
  const have = inventory?.[key] || 0
  const perCraft = Number(amount) || 1
  if (perCraft <= 0) return 0
  return Math.floor(have / perCraft)
}

function InventoryPanel({ inv }) {
  const resourceIds = RESOURCES.map((res) => res.id)
  const items = Object.entries(inv || {})
    .filter(([key, value]) => CRAFT_BY_OUTPUT[key] && Number(value) > 0)
  return (
    <div className="shop-panel shop-inventory-panel">
      <div className="shop-panel-header">
        <h4 className="shop-panel-title">Inventory</h4>
      </div>
      <div className="shop-inventory-section">
        <div className="shop-inventory-heading">Leaderboard</div>
        <div className="shop-inventory-entry">
          <span className="shop-inventory-label">
            <img src={RESOURCE_ICONS.emerald} alt="Emeralds" className="shop-inventory-icon" />
            Emeralds
          </span>
          <span className="shop-inventory-value">{formatNumber(inv?.emerald || 0)}</span>
        </div>
      </div>
      <div className="shop-inventory-section">
        <div className="shop-inventory-heading">Resources</div>
        {resourceIds.filter((id) => id !== 'emerald').map((id) => (
          <div key={id} className="shop-inventory-entry">
            <span className="shop-inventory-label">
              <img src={getResourceIcon(id)} alt={getResourceName(id)} className="shop-inventory-icon" />
              {getResourceName(id)}
            </span>
            <span className="shop-inventory-value">{formatNumber(inv?.[id] || 0)}</span>
          </div>
        ))}
      </div>
      <div className="shop-inventory-section">
        <div className="shop-inventory-heading">Items</div>
        {items.length ? items.map(([key, value]) => {
          const craft = CRAFT_BY_OUTPUT[key]
          const effectLines = craft ? describeCraftEffects(craft) : []
          const tooltip = effectLines.length ? effectLines.join('\n') : undefined
          return (
            <div key={key} className="shop-inventory-entry" title={tooltip}>
              <span className="shop-inventory-label">
                <img src={RESOURCE_ICONS.default} alt={getResourceName(key)} className="shop-inventory-icon" />
                {getResourceName(key)}
              </span>
              <span className="shop-inventory-value">{formatNumber(value)}</span>
            </div>
          )
        }) : <div className="shop-inventory-empty">You don't own any items yet.</div>}
      </div>
    </div>
  )
}

function SpawnRatePanel({ rates, caps, autoDistrib, onChange, onAutoDistribChange, editingKey, draftInput, onStartEdit, onInputChange, onCommitEdit, onCancel, onSave, disableCancel, disableSave }) {
  const total = sumSpawnRates(rates)
  return (
    <div className="shop-panel" style={{ position: 'relative' }}>
      <div>
        <div className="shop-panel-header">
          <h4 className="shop-panel-title">Spawn Rates</h4>
          <span className="shop-panel-total">{total.toFixed(2)}</span>
        </div>
        <p className="shop-panel-caption">Tune how frequently each resource appears.</p>
        <div className="shop-rate-stack">
          {SPAWN_MATERIALS.map((mat) => {
            const absolute = Math.max(0, Math.min(1, Number(rates[mat.key] || 0)))
            const cap = Math.max(0, Math.min(1, caps?.[mat.key] || 0))
            const clampedValue = Math.min(cap, absolute)
            return (
              <div key={mat.key} className="shop-rate-card">
                <div className="shop-rate-head">
                  <span className="shop-rate-name">
                    <img src={getResourceIcon(mat.key)} alt={mat.label} className="shop-inventory-icon" />
                    {mat.label}
                  </span>
                  <span className="shop-rate-max">Max {cap.toFixed(2)}</span>
                </div>
                <div className="gc-prob-row shop-prob-row">
                  <div className="gc-slider">
                    <div className="gc-cap" style={{ left: `${cap * 100}%` }} />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={clampedValue}
                      style={{ '--gc-marker': `${cap * 100}%`, '--gc-value': `${clampedValue * 100}%` }}
                      onChange={(e) => {
                        const next = Math.min(Number(e.target.value), cap)
                        onChange(mat.key, next)
                      }}
                  />
                </div>
                <div className="gc-prob-val" onClick={() => onStartEdit(mat.key, clampedValue)}>
                  {editingKey === mat.key ? (
                      <input
                        type="number"
                        min={0}
                        max={cap}
                        step="0.01"
                        value={draftInput}
                        autoFocus
                        onChange={(e) => onInputChange(e.target.value)}
                        onBlur={() => onCommitEdit(mat.key)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onCommitEdit(mat.key)
                          if (e.key === 'Escape') { onInputChange(clampedValue.toFixed(2)); onCommitEdit(mat.key) }
                        }}
                        style={{ width: 60, textAlign: 'right' }}
                      />
                    ) : (
                      clampedValue.toFixed(2)
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="gc-dist-wrap shop-dist-wrap">
          <div className="gc-dist-row">
            <div className="gc-dist">
              {(() => {
                let rem = 100
                const parts = []
                for (const mat of SPAWN_MATERIALS) {
                  const width = Math.min(rem, Math.max(0, (rates[mat.key] || 0) * 100))
                  rem -= width
                  if (width > 0) {
                    parts.push(
                      <div key={mat.key} className="gc-seg" style={{ width: `${width}%`, backgroundImage: `url(${mat.texture})` }} />
                    )
                  }
                }
                if (rem > 0) parts.push(<div key="empty" className="gc-seg gc-empty" style={{ width: `${rem}%` }} />)
                return parts
              })()}
            </div>
            <label className="gc-auto">
              <input
                type="checkbox"
                checked={autoDistrib}
                onChange={(e) => onAutoDistribChange(e.target.checked)}
              />
              Auto-distrib
            </label>
          </div>
          <div className="gc-dist-legend">Distribution (sum: {total.toFixed(2)})</div>
        </div>
        <div className="shop-panel-buttons">
          <button className="ui-btn" onClick={onCancel} disabled={disableCancel}>Cancel</button>
          <button className="ui-btn" onClick={onSave} disabled={disableSave}>Save</button>
        </div>
      </div>
    </div>
  )
}

function StatsPanel({ purchases, spawnCaps, inventory, craftCounts }) {
  const resourceCaps = SPAWN_MATERIALS.map((mat) => {
    const key = mat.key
    const cap = typeof spawnCaps?.[key] === 'number' ? spawnCaps[key] : SPAWN_CAP_DEFAULTS[key] || 0
    return { label: mat.label, value: `${(cap * 100).toFixed(2)}%`, icon: getResourceIcon(key), rawValue: cap, alwaysShow: true }
  })
  const lineBonuses = SPAWN_MATERIALS.map((mat) => {
    const item = SHOP_ITEMS.find((it) => it.effect_type === 'line_break_bonus' && formatResourceId(it.affects) === mat.key)
    const level = item ? (purchases?.[item.id] || 0) : 0
    const bonus = computeLineBonus(item, level)
    return { label: mat.label, value: bonus.toFixed(2), icon: getResourceIcon(mat.key), rawValue: bonus }
  })
  const fortuneFromUpgrades = computeFortuneFromUpgrades(purchases)
  const fortuneFromCrafts = computeFortuneFromCrafts(craftCounts, inventory)
  const sections = [
    {
      heading: 'Resources Spawn rates:',
      entries: resourceCaps,
    },
    {
      heading: 'Collected line bonuses:',
      entries: lineBonuses,
    },
    {
      heading: 'Fortune Multiplier:',
      entries: [
        { label: 'Per line break', value: '+1.00%', icon: '/ui/clover.png', rawValue: 1 },
        { label: 'From upgrades', value: `+${fortuneFromUpgrades.toFixed(2)}%`, icon: '/ui/clover.png', rawValue: fortuneFromUpgrades },
        { label: 'From crafts', value: `+${fortuneFromCrafts.toFixed(2)}%`, icon: '/ui/clover.png', rawValue: fortuneFromCrafts },
      ],
    },
    {
      heading: 'Shop reductions:',
      entries: [
        { label: 'From upgrades', value: '-0.00%', icon: RESOURCE_ICONS.emerald, rawValue: 0 },
      ],
    },
  ]
  const isZeroStat = (value) => typeof value === 'number' && Math.abs(value) < 1e-6
  const visibleSections = sections
    .map((section) => {
      const entries = section.entries.filter((entry) => entry.alwaysShow || !isZeroStat(entry.rawValue))
      return { ...section, entries }
    })
    .filter((section) => section.entries.length > 0)

  return (
    <div className="shop-panel">
      <div className="shop-panel-header">
        <h4 className="shop-panel-title">Statistics</h4>
      </div>
      <div className="shop-stat-sections">
        {visibleSections.map((section) => (
          <div key={section.heading} className="shop-stat-section">
            <div className="shop-stat-heading">{section.heading}</div>
            <ul className="shop-stat-list">
              {section.entries.map(({ label, value, icon }) => (
                <li key={section.heading + label} className="shop-stat-row">
                  <span className="shop-stat-label">
                    {icon && <img src={icon} alt={label} className="shop-stat-icon" />}
                    {label}
                  </span>
                  <span className="shop-stat-value">{value}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
