import React, { useEffect, useMemo, useRef, useState } from 'react'
import Button from '../components/Button'
import {
  SHOP_ITEMS,
  TRADE_ITEMS,
  CRAFT_ITEMS,
  formatResourceId,
} from '../utils/shopData'
import {
  RESOURCE_ICONS,
  getResourceIcon,
  getResourceName,
  formatNumber,
  computeShopPrice,
  describeEffect,
  computeMaxTimes,
  hasTradeRequirements,
  applyTradeMultipliers,
  computeTradeMultipliers,
  canCraft,
  describeCraftEffects,
  computeShopReduction,
} from '../utils/shopLogic'
import { useShopState } from '../context/ShopStateContext'
import { navigate } from '../utils/navigation'

export default function Shop() {
  const {
    inventory: inv,
    purchases,
    craftUnlocks,
    craftCounts,
    setCraftUnlocks,
    buyItem,
    tradeItem,
    craftItem,
  } = useShopState()

  const [activeTab, setActiveTab] = useState('shops')
  const sounds = useRef({ trade: [], deny: [], dirt: [], stone: [] })

  useEffect(() => {
    const clamp01 = (n) => Math.max(0, Math.min(1, Number(n)))
    const getSfxVol = () => {
      const v = Number(localStorage.getItem('sfx.volume'))
      return Number.isFinite(v) ? clamp01(v) : 0.5
    }
    const mk = (path) => {
      const a = new Audio(path)
      a.preload = 'auto'
      a.volume = getSfxVol()
      return a
    }
    sounds.current.trade = [
      mk('/sounds/villager/Villager_trade1.ogg'),
      mk('/sounds/villager/Villager_trade2.ogg'),
      mk('/sounds/villager/Villager_trade3.ogg'),
    ]
    sounds.current.deny = [
      mk('/sounds/villager/Villager_deny1.ogg'),
      mk('/sounds/villager/Villager_deny2.ogg'),
      mk('/sounds/villager/Villager_deny3.ogg'),
    ]
    sounds.current.dirt = [
      mk('/sounds/dirt/Dirt1.mp3'),
      mk('/sounds/dirt/Dirt2.mp3'),
      mk('/sounds/dirt/Dirt3.mp3'),
      mk('/sounds/dirt/Dirt4.mp3'),
      mk('/sounds/dirt/Dirt5.mp3'),
      mk('/sounds/dirt/Dirt6.mp3'),
    ]
    sounds.current.stone = [
      mk('/sounds/stone/Stone1.ogg'),
      mk('/sounds/stone/Stone2.ogg'),
      mk('/sounds/stone/Stone3.ogg'),
      mk('/sounds/stone/Stone4.ogg'),
    ]
  }, [])

  const playFrom = (arr) => {
    if (!arr || !arr.length) return
    const pick = arr[Math.floor(Math.random() * arr.length)]
    try {
      const v = Number(localStorage.getItem('sfx.volume'))
      if (Number.isFinite(v)) pick.volume = Math.max(0, Math.min(1, v))
    } catch (_) {}
    try { pick.currentTime = 0 } catch(_) {}
    const p = pick.play()
    if (p && typeof p.then === 'function') p.catch(() => {})
  }

  useEffect(() => {
    const t = setTimeout(() => playFrom(sounds.current.trade), 150)
    return () => clearTimeout(t)
  }, [])

  const onBack = () => { navigate('/') }
  const shopReduction = computeShopReduction(purchases, craftCounts)

  const playSpendSound = (resourceId) => {
    if (resourceId === 'dirt') playFrom(sounds.current.dirt)
    else playFrom(sounds.current.stone)
  }

  function handleBuy(item) {
    if (!item) return
    const level = purchases[item.id] || 0
    const maxLevel = item.max_level ?? Infinity
    if (level >= maxLevel) {
      playFrom(sounds.current.deny)
      return
    }
    const costId = formatResourceId(item.resource_cost)
    const price = computeShopPrice(item, level, shopReduction)
    const have = inv[costId] || 0
    if (have < price) {
      playFrom(sounds.current.deny)
      return
    }
    playSpendSound(costId)
    buyItem(item.id)
  }

  function handleTrade(trade, requestedTimes = 1) {
    if (!trade || !requestedTimes) return
    const maxTimes = computeMaxTimes(inv, trade.cost)
    const times = Math.min(requestedTimes, maxTimes)
    if (!times || times <= 0 || !Number.isFinite(times)) {
      playFrom(sounds.current.deny)
      return
    }
    const costEntries = Object.entries(trade.cost || {})
    if (costEntries.length) playSpendSound(formatResourceId(costEntries[0][0]))
    tradeItem(trade.id, times)
  }

  function handleCraft(craft) {
    if (!craft) return
    const rawMax = Number(craft.max_crafts)
    const maxCrafts = Number.isFinite(rawMax) && rawMax >= 0 ? rawMax : Infinity
    const craftedTimes = craftCounts?.[craft.id] || 0
    if (craftedTimes >= maxCrafts) {
      playFrom(sounds.current.deny)
      return
    }
    if (!canCraft(inv, craft)) {
      playFrom(sounds.current.deny)
      return
    }
    const costEntries = Object.entries(craft.cost || {})
    if (costEntries.length) playSpendSound(formatResourceId(costEntries[0][0]))
    craftItem(craft.id, 1)
    setCraftUnlocks((prev) => (prev[craft.id] ? prev : { ...prev, [craft.id]: true }))
  }

  return (
    <div className="shop-root">
      <div className="shop-bg" aria-hidden="true" />
      <div className="shop-modal">
        <div className="shop-menu">
          <h3 className="shop-title">Trading Outpost</h3>
          <div className="shop-tabs">
            {SHOP_TABS.map((tab) => (
              <button
                key={tab.id}
                className={`shop-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <img className="shop-tab-icon" src={tab.icon} alt={tab.label} />
                {tab.label}
              </button>
            ))}
          </div>
          {activeTab === 'shops' && (
            <ShopList
              inv={inv}
              purchases={purchases}
              craftCounts={craftCounts}
              reduction={shopReduction}
              onBuy={handleBuy}
              onDeny={() => playFrom(sounds.current.deny)}
            />
          )}
          {activeTab === 'trades' && (
            <TradeList
              inv={inv}
              craftCounts={craftCounts}
              onTrade={handleTrade}
              onDeny={() => playFrom(sounds.current.deny)}
            />
          )}
          {activeTab === 'crafts' && (
            <CraftList
              inv={inv}
              unlocks={craftUnlocks}
              craftCounts={craftCounts}
              onCraft={handleCraft}
              onDeny={() => playFrom(sounds.current.deny)}
            />
          )}
        </div>
      </div>

      <div className="shop-nav">
        <Button className="ui-btn shop-back" onClick={onBack}>Back</Button>
      </div>
    </div>
  )
}

// ---- Shop config-driven data ----
const SHOP_TABS = [
  { id: 'shops', label: 'Upgrades', icon: '/ui/Hammer.webp' },
  { id: 'trades', label: 'Trades', icon: RESOURCE_ICONS.emerald },
  { id: 'crafts', label: 'Crafts', icon: '/ui/Backpack.png' },
]

function ShopList({ inv, purchases, craftCounts, reduction = 0, onBuy, onDeny }) {
  if (!SHOP_ITEMS.length) {
    return <div className="shop-empty">No shop upgrades configured.</div>
  }
  const computedReduction = reduction || computeShopReduction(purchases, craftCounts)
  return (
    <div className="shop-list">
      {SHOP_ITEMS.map((item) => {
        const level = purchases[item.id] || 0
        const maxLevel = item.max_level ?? Infinity
        const price = computeShopPrice(item, level, computedReduction)
        const costId = formatResourceId(item.resource_cost)
        const have = inv[costId] || 0
        const affordable = have >= price
        const atCap = level >= maxLevel
        const effect = describeEffect(item, level)
        return (
          <div className="shop-item shop-upgrade-card" key={item.id}>
            <div className="shop-upgrade-icon">
              <img src="/ui/Hammer.webp" alt="Upgrade" />
            </div>
            <div className="shop-upgrade-main">
              <div className="shop-upgrade-header">
                <div className="shop-upgrade-title">{item.name}</div>
                <div className="shop-upgrade-level">Lv {level}/{maxLevel === Infinity ? '∞' : maxLevel}</div>
              </div>
              <div className="shop-upgrade-effect">{effect.next || effect.current}</div>
              <div className="shop-upgrade-total">{effect.current}</div>
              <div className="shop-upgrade-costs">
                <div className={`shop-craft-cost-chip ${affordable ? '' : 'insufficient'}`}>
                  <span className="amount">{formatNumber(price)}</span>
                  <img src={getResourceIcon(costId)} alt={getResourceName(costId)} />
                </div>
              </div>
            </div>
            <div className="shop-btn-wrap">
              <Button className="ui-btn-narrow" disabled={!affordable || atCap} onClick={() => (affordable && !atCap ? onBuy(item) : onDeny && onDeny())}>
                {atCap ? 'Max' : 'Buy'}
              </Button>
              {(!affordable || atCap) && <div className="shop-btn-shield" onClick={() => onDeny && onDeny()} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TradeList({ inv, craftCounts, onTrade, onDeny }) {
  const tradeMultipliers = useMemo(() => computeTradeMultipliers(craftCounts), [craftCounts])
  const visibleTrades = TRADE_ITEMS.filter((trade) => hasTradeRequirements(inv, trade))
  if (!visibleTrades.length) {
    return <div className="shop-empty">Craft special items to unlock more trades.</div>
  }
  return (
    <div className="shop-list">
      {visibleTrades.map((trade) => {
        const adjustedTrade = applyTradeMultipliers(trade, tradeMultipliers)
        const maxTimes = computeMaxTimes(inv, adjustedTrade.cost)
        const disabled = maxTimes <= 0 || !Number.isFinite(maxTimes)
        const maxLabel = Number.isFinite(maxTimes) ? maxTimes : '∞'
        const costEntries = Object.entries(adjustedTrade.cost || {})
        const giveEntries = Object.entries(adjustedTrade.give || {})
        return (
          <div className="shop-item shop-item-trade" key={adjustedTrade.id}>
              <div className="shop-trade">
                <div className="shop-cost">
                  {costEntries.map(([resId, amount]) => (
                    <ResourceChip key={resId} resourceId={resId} amount={amount} />
                  ))}
                </div>
                <span className="shop-arrow" aria-hidden="true" />
                <div className="shop-cost">
                  {giveEntries.map(([resId, amount]) => (
                    <ResourceChip key={resId} resourceId={resId} amount={amount} />
                  ))}
                </div>
            </div>
            <div className="shop-btns">
              <div className="shop-btn-wrap">
                <Button className="ui-btn-slim" disabled={disabled} onClick={() => onTrade(adjustedTrade, 1)}>
                  Trade
                </Button>
                {disabled && <div className="shop-btn-shield" onClick={() => onDeny && onDeny()} />}
              </div>
              <div className="shop-btn-wrap">
                <Button className="ui-btn-slim" disabled={disabled}
                  onClick={() => onTrade(adjustedTrade, maxTimes)}>
                  Max (+{maxLabel})
                </Button>
                {disabled && <div className="shop-btn-shield" onClick={() => onDeny && onDeny()} />}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CraftList({ inv, unlocks, craftCounts = {}, onCraft, onDeny }) {
  const visibleCrafts = CRAFT_ITEMS.filter((craft) => {
    const craftedTimes = craftCounts?.[craft.id] || 0
    return unlocks[craft.id] || craftedTimes > 0 || canCraft(inv, craft)
  })
  if (!visibleCrafts.length) {
    return <div className="shop-empty">Earn more resources to discover new crafts.</div>
  }
  return (
    <div className="shop-list">
      {visibleCrafts.map((craft) => {
        const craftedTimes = craftCounts?.[craft.id] || 0
        const rawMax = Number(craft.max_crafts)
        const maxCrafts = Number.isFinite(rawMax) && rawMax >= 0 ? rawMax : Infinity
        const hasLimit = Number.isFinite(rawMax) && rawMax >= 0
        const maxed = craftedTimes >= maxCrafts
        const canMake = !maxed && canCraft(inv, craft)
        const effectLines = describeCraftEffects(craft)
        const progressLabel = hasLimit
          ? `Crafted ${Math.min(craftedTimes, maxCrafts)}/${maxCrafts}`
          : `Crafted ${craftedTimes}`
        return (
          <div className="shop-item shop-craft-card" key={craft.id}>
            <div className="shop-craft-icon-block">
              {Object.entries(craft.outputs || {}).slice(0, 1).map(([resId, amount]) => (
                <ResourceChip key={resId} resourceId={resId} amount={amount} showLabel={false} className="shop-chip-output shop-craft-icon" />
              ))}
            </div>
            <div className="shop-craft-main">
              <div className="shop-craft-header">
                <div className="shop-craft-title">{craft.name}</div>
                <div className={`shop-craft-progress ${maxed ? 'maxed' : ''}`}>{progressLabel}</div>
              </div>
              {effectLines.length > 0 && (
                <ul className="shop-craft-effects-list">
                  {effectLines.map((line, idx) => (
                    <li key={`${craft.id}-effect-${idx}`}>{line}</li>
                  ))}
                </ul>
              )}
              <div className="shop-craft-costs">
                <span className="shop-craft-label">Costs</span>
                <div className="shop-craft-cost-list">
                  {Object.entries(craft.cost || {}).map(([res, amt]) => {
                    const key = formatResourceId(res)
                    const have = inv[key] || 0
                    const enough = have >= (Number(amt) || 0)
                    return (
                      <div className={`shop-craft-cost-chip ${enough ? '' : 'insufficient'}`} key={res}>
                        <span className="amount">{formatNumber(amt)}</span>
                        <img src={getResourceIcon(res)} alt={getResourceName(res)} />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="shop-btn-wrap">
              <Button className="ui-btn-narrow" disabled={!canMake} onClick={() => (canMake ? onCraft(craft) : onDeny && onDeny())}>
                {maxed ? 'Maxed' : 'Craft'}
              </Button>
              {!canMake && <div className="shop-btn-shield" onClick={() => onDeny && onDeny()} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ResourceChip({ resourceId, amount, className = '', showLabel = true }) {
  const classes = ['shop-chip-text', className, showLabel ? '' : 'shop-chip-no-label'].filter(Boolean).join(' ')
  return (
    <span className={classes}>
      <img className="shop-chip-img" src={getResourceIcon(resourceId)} alt={getResourceName(resourceId)} />
      {showLabel && `${formatNumber(amount)} ${getResourceName(resourceId)}`}
    </span>
  )
}

export { ShopList, TradeList, CraftList, ResourceChip }
