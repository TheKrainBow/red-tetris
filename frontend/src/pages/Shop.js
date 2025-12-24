import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
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
import { getLocalStorageItem } from '../utils/storage'
import socketClient from '../utils/socketClient'
import { getTutorialStep, setTutorialStep as setGlobalTutorialStep, onTutorialStepChange } from '../utils/tutorialStepState'
import { TutorialHighlightOverlay } from '../components/TutorialOverlays'

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
  const username = useMemo(() => getLocalStorageItem('username', '') || '', [])
  const [tutorialStep, setShopTutorialStep] = useState(() => getTutorialStep())
  useEffect(() => {
    const unsubscribe = onTutorialStepChange(setShopTutorialStep)
    return unsubscribe
  }, [])

  useEffect(() => {
    if (tutorialStep === 8) {
      setGlobalTutorialStep(9)
    }
  }, [tutorialStep])

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

  const shopReduction = computeShopReduction(purchases, craftCounts)
  const shopMenuRef = useRef(null)
  const disableShopScroll = tutorialStep === 10
  const handleTabClick = useCallback((tabId) => {
    setActiveTab(tabId)
    if (tutorialStep === 11 && tabId === 'trades') {
      setGlobalTutorialStep(12)
    } else if (tutorialStep === 13 && tabId === 'crafts') {
      setGlobalTutorialStep(14)
    }
  }, [tutorialStep])

  useEffect(() => {
    if (tutorialStep === 10 || tutorialStep === 11) {
      setActiveTab('shops')
    } else if (tutorialStep === 12 || tutorialStep === 13) {
      setActiveTab('trades')
    } else if (tutorialStep === 14 || tutorialStep === 15) {
      setActiveTab('crafts')
    }
  }, [tutorialStep])

  useEffect(() => {
    if (tutorialStep !== 10) return
    if (!shopMenuRef.current) return
    shopMenuRef.current.scrollTop = 0
  }, [tutorialStep])

  const onBack = () => {
    if (tutorialStep === 15) {
      setGlobalTutorialStep(16)
    }
    navigate('/')
  }

  const handleSkipTutorial = async () => {
    if (username) {
      try {
        await socketClient.setHasSeenTutorial(username, true)
      } catch (err) {
        console.error('Failed to skip tutorial', err)
      }
    }
    setGlobalTutorialStep(0)
    navigate('/')
  }

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

  const showStepNineHighlight = tutorialStep === 9
  const showStepTenHighlight = tutorialStep === 10
  const showStepElevenHighlight = tutorialStep === 11 && activeTab === 'shops'
  const showStepTwelveOverlay = tutorialStep === 12 && activeTab === 'trades'
  const showStepThirteenHighlight = tutorialStep === 13
  const showStepFourteenOverlay = tutorialStep === 14 && activeTab === 'crafts'
  const showStepFifteenHighlight = tutorialStep === 15

  const goToStepTen = () => {
    if (shopMenuRef.current) {
      shopMenuRef.current.scrollTop = 0
    }
    setGlobalTutorialStep(10)
  }
  const goToStepEleven = () => setGlobalTutorialStep(11)
  const goToStepThirteen = () => setGlobalTutorialStep(13)
  const goToStepFifteen = () => {
    setActiveTab('shops')
    setGlobalTutorialStep(15)
  }

  return (
    <div className="shop-root">
      <div className="shop-bg" aria-hidden="true" />
      <div className="shop-modal">
        <div
          className="shop-menu"
          ref={shopMenuRef}
          style={{ overflowY: disableShopScroll ? 'hidden' : 'auto' }}
        >
          <h3 className="shop-title">Trading Outpost</h3>
          <div className="shop-tabs">
            {SHOP_TABS.map((tab) => (
              <button
                key={tab.id}
                className={`shop-tab ${activeTab === tab.id ? 'active' : ''}`}
                data-tutorial-tab={tab.id}
                onClick={() => handleTabClick(tab.id)}
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
      {showStepNineHighlight && (
        <TutorialHighlightOverlay
          anchorSelector=".shop-modal"
          title="Trading Outpost"
          message="This panel is the Trading Outpost where you browse upgrades, trades, and crafts."
          onSkip={handleSkipTutorial}
          onNext={goToStepTen}
          stepNumber={9}
          tooltipAdjust={{ left: -440, top: -640 }}
        />
      )}
      {showStepTenHighlight && (
        <TutorialHighlightOverlay
          anchorSelector=".shop-upgrade-card"
          title="Upgrade cards"
          message="To buy your first Rock Detector you will need 25 dirt."
          onSkip={handleSkipTutorial}
          onNext={goToStepEleven}
          stepNumber={10}
        />
      )}
      {showStepElevenHighlight && (
        <TutorialHighlightOverlay
          anchorSelector='.shop-tab[data-tutorial-tab="trades"]'
          title="Trade Menu Intro"
          message="Let's take a look to the trades. Click the highlighted button to continue the tutorial."
          onSkip={handleSkipTutorial}
          stepNumber={11}
        />
      )}
      {showStepTwelveOverlay && (
        <TutorialHighlightOverlay
          anchorSelector=".shop-modal"
          title="Trade Menu"
          message="In here, you can trade your ressources for emeralds. You will get more trades later on in your adventure."
          onSkip={handleSkipTutorial}
          onNext={goToStepThirteen}
          stepNumber={12}
          tooltipAdjust={{ left: -440, top: -640 }}
        />
      )}
      {showStepThirteenHighlight && (
        <TutorialHighlightOverlay
          anchorSelector='.shop-tab[data-tutorial-tab="crafts"]'
          title="Craft Menu Intro"
          message="Finally, let's looks at your crafts. Click craft button to continue tutorial."
          onSkip={handleSkipTutorial}
          stepNumber={13}
        />
      )}
      {showStepFourteenOverlay && (
        <TutorialHighlightOverlay
          anchorSelector=".shop-modal"
          title="Craft Menu"
          message="You will discover new crafts later on, when collecting enough ressources. Don't forget to check if you have new craft after each games!"
          onSkip={handleSkipTutorial}
          onNext={goToStepFifteen}
          stepNumber={14}
          tooltipAdjust={{ left: -440, top: -640 }}
        />
      )}
      {showStepFifteenHighlight && (
        <TutorialHighlightOverlay
          anchorSelector=".shop-back"
          title="Back to the menu"
          message="Let's play a game to earn that dirt! Click the highlighted Back button to return to the main menu and continue the tutorial."
          onSkip={handleSkipTutorial}
          stepNumber={15}
          tooltipAdjust={{ top: -60 }}
        />
      )}
    </div>
  )
}

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
