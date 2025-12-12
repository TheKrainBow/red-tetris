import React, { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import KHRMaterialsPbrSpecularGlossiness from '../three/KHR_materials_pbrSpecularGlossiness'
import { OrbitControls as ThreeOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
// Note: We keep OrbitControls available, but use a gentle parallax camera instead
// for this screen to give depth without full user control.
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
  canCraft,
  describeCraftEffects,
} from '../utils/shopLogic'
import { useShopState } from '../context/ShopStateContext'
import { navigate } from '../utils/navigation'

// Camera spawn from latest console snapshot
const CAM_POS = [-0.800, 2.038, -2.262]
const CAM_TARGET = [-0.839, 1.816, 0.104]
const CAM_FOV = 45

const VILLAGER = {
  distance: 0,      // not used when LOCK_TO_GROUND, kept for fallback
  yOffset: -1.7,         // vertical offset
  yawOffset: Math.PI, // extra rotation around Y (Math.PI = 180°)
}

// Offset to apply from camera position at spawn (world X/Z)
const VILLAGER_OFFSET = [0.483, 0, 0.982]

// Ground settings for villager placement
// Set your ground plane height here
const GROUND_Y = 0
const LOCK_TO_GROUND = true

// Sky-blue background is set via <color attach="background" /> in the Canvas

function FitGLTF({ url, rotationSpeed = 0.002, scaleMultiplier = 1, position, rotation, alignBottom = false, baseYOffset = 0, outerRef = null }) {
  const inner = useRef()
  const groupRef = outerRef || inner
  const didInit = useRef(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let disposed = false
    const loader = new GLTFLoader()
    try { loader.setMeshoptDecoder(MeshoptDecoder) } catch (_) {}
    try { loader.register((parser) => KHRMaterialsPbrSpecularGlossiness(parser)) } catch (e) { console.warn('[shop] failed to register spec-gloss extension', e) }
    loader.load(
      url,
      (gltf) => {
        if (disposed) return
        if (!groupRef.current || !gltf?.scene) return
        try {
          const scene = gltf.scene.clone(true)
          let meshCount = 0
          scene.traverse((obj) => {
            if (!obj.isMesh) return
            meshCount++
            // Prefer original materials; just ensure colorSpace is correct
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
            for (const m of mats) {
              if (!m) continue
              if (m.map) {
                try { m.map.colorSpace = THREE.SRGBColorSpace } catch (_) {}
              }
              if (m.emissiveMap) {
                try { m.emissiveMap.colorSpace = THREE.SRGBColorSpace } catch (_) {}
              }
              m.needsUpdate = true
            }
            if (!obj.material) {
              obj.material = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0, roughness: 0.8 })
            }
            obj.castShadow = false
            obj.receiveShadow = false
          })
          const box = new THREE.Box3().setFromObject(scene)
          const size = new THREE.Vector3(); box.getSize(size)
          const center = new THREE.Vector3(); box.getCenter(center)
          scene.position.x -= center.x
          scene.position.y -= center.y
          scene.position.z -= center.z
          const maxAxis = Math.max(size.x, size.y, size.z) || 1
          const scale = (2.2 / maxAxis) * (scaleMultiplier || 1)
          scene.scale.setScalar(scale)
          if (alignBottom) {
            // After recentering, lift so the model's bottom sits at y=0
            scene.position.y += (size.y * scale) / 2 + baseYOffset
          } else if (baseYOffset) {
            scene.position.y += baseYOffset
          }
          groupRef.current.clear()
          groupRef.current.add(scene)
          setLoaded(true)
          console.log('[shop] gltf loaded; meshes=', meshCount, 'bounds=', { x: size.x, y: size.y, z: size.z, maxAxis })
        } catch (e) {
          console.error('[shop] failed to prepare gltf', e)
        }
      },
      undefined,
      (err) => {
        if (disposed) return
        console.error('[shop] gltf load error', err)
        setLoaded(false)
      }
    )
    return () => { disposed = true }
  }, [url])

  // Subtle idle rotation for presentation (optional)
  useFrame(() => {
    if (!groupRef.current) return
    if (!didInit.current) {
      if (rotationSpeed) groupRef.current.rotation.y = 0.35
      didInit.current = true
    }
    if (rotationSpeed) groupRef.current.rotation.y += rotationSpeed
  })

  return <group ref={groupRef} position={position} rotation={rotation} />
}

function CameraRig() {
  const { camera } = useThree()
  const init = useRef(false)
  useFrame(() => {
    if (!init.current) {
      // Spawn camera at the requested pose
      camera.position.set(CAM_POS[0], CAM_POS[1], CAM_POS[2])
      camera.fov = CAM_FOV
      camera.updateProjectionMatrix()
      camera.lookAt(CAM_TARGET[0], CAM_TARGET[1], CAM_TARGET[2])
      init.current = true
    }
  })
  return null
}

function OrbitControls({ log = true, target = [0, 1.0, 0] }) {
  const { camera, gl } = useThree()
  const controlsRef = useRef(null)
  useEffect(() => {
    const controls = new ThreeOrbitControls(camera, gl.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.target.set(target[0], target[1], target[2])
    controls.minDistance = 1
    controls.maxDistance = 20
    controlsRef.current = controls
    let last = 0
    const round = (n) => Number(n.toFixed(3))
    const report = () => {
      if (!log) return
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
      if (now - last < 150) return
      last = now
      const p = camera.position
      const r = camera.rotation
      const t = controls.target
      console.log('[shop] camera ->', {
        pos: { x: round(p.x), y: round(p.y), z: round(p.z) },
        rotRad: { x: round(r.x), y: round(r.y), z: round(r.z) },
        target: { x: round(t.x), y: round(t.y), z: round(t.z) },
        fov: round(camera.fov),
      })
    }
    controls.addEventListener('change', report)
    // initial snapshot
    report()
    return () => controls.dispose()
  }, [camera, gl])
  useFrame(() => { controlsRef.current && controlsRef.current.update() })
  return null
}

// Subtle mouse-parallax camera movement around the initial pose.
function CameraParallax({ amount = 0.12, targetAmount = 0.06 }) {
  const { camera, size } = useThree()
  const basePos = useMemo(() => new THREE.Vector3(...CAM_POS), [])
  const baseTarget = useMemo(() => new THREE.Vector3(...CAM_TARGET), [])
  const desired = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (e) => {
      const x = (e.clientX / size.width) * 2 - 1
      const y = (e.clientY / size.height) * 2 - 1
      desired.current.x = THREE.MathUtils.clamp(x, -1, 1)
      desired.current.y = THREE.MathUtils.clamp(y, -1, 1)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [size.width, size.height])

  useFrame(() => {
    // Build a basis from initial forward/right/up
    const forward = baseTarget.clone().sub(basePos).normalize()
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward).normalize()
    // Smoothly interpolate towards desired offsets
    const dx = desired.current.x
    const dy = desired.current.y
    const pos = basePos.clone()
      .add(right.clone().multiplyScalar(dx * amount))
      .add(up.clone().multiplyScalar(-dy * amount))
    const tgt = baseTarget.clone()
      .add(right.clone().multiplyScalar(dx * targetAmount))
      .add(up.clone().multiplyScalar(-dy * targetAmount))
    camera.position.lerp(pos, 0.15)
    const curTgt = new THREE.Vector3()
    // derive current look target from camera and forward vector; then lerp
    // Instead, directly lookAt interpolated target for smoothness
    camera.lookAt(tgt)
  })
  return null
}

function VillagerActor({ url, pos, yawOffset = 0, scaleMultiplier = 1 }) {
  const { camera } = useThree()
  const ref = useRef()
  useFrame(() => {
    if (!ref.current) return
    const p = ref.current.position
    const toCam = camera.position.clone().sub(p)
    const rotY = Math.atan2(toCam.x, toCam.z) + yawOffset
    ref.current.rotation.y = rotY
  })
  return (
    <FitGLTF
      url={url}
      position={pos}
      rotationSpeed={0}
      scaleMultiplier={scaleMultiplier}
      alignBottom
      outerRef={ref}
    />
  )
}

export default function Shop() {
  // Temporarily use the villager model to validate pipeline
  const modelUrl = useMemo(() => '/models/villager.glb', [])
  const villageUrl = useMemo(() => '/models/village.glb', [])
  const [villagePos] = useState([2.9, 0, -19.7])
  const {
    inventory: inv,
    purchases,
    craftUnlocks,
    craftCounts,
    setCraftUnlocks,
    buyItem,
    tradeItem,
    craftItem,
    resetShopState,
  } = useShopState()

  // --- sounds ---
  const sounds = useRef({ trade: [], deny: [], dirt: [], stone: [] })

  // Load sounds once
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
    // Purchase SFX
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
    // refresh volume per click to reflect any setting change
    try {
      const v = Number(localStorage.getItem('sfx.volume'))
      if (Number.isFinite(v)) pick.volume = Math.max(0, Math.min(1, v))
    } catch (_) {}
    try { pick.currentTime = 0 } catch(_) {}
    const p = pick.play()
    if (p && typeof p.then === 'function') p.catch(() => {})
  }

  // Play a random trade sound when arriving
  useEffect(() => {
    // small delay to increase chance gesture-permitted audio
    const t = setTimeout(() => playFrom(sounds.current.trade), 150)
    return () => clearTimeout(t)
  }, [])

  // Removed villager idle sounds per request

  // Spawn villager at the earlier coordinates (x=0.483, z=0.982), using camera Y for visibility
  const villagerInitial = useMemo(() => {
    const y = CAM_POS[1] + VILLAGER.yOffset
    const spawn = [0.483, y, 0.982]
    console.log('[shop] villager spawn ->', { x: spawn[0], y: spawn[1], z: spawn[2] })
    return spawn
  }, [])
  const [villagerPos, setVillagerPos] = useState(villagerInitial)

  // Arrow keys move the villager on X/Z; Y follows camera height for visibility
  useEffect(() => {
    const step = 0.05
    const onKey = (e) => {
      let dx = 0, dz = 0
      switch (e.key) {
        case 'ArrowUp': dx = step; break
        case 'ArrowDown': dx = -step; break
        case 'ArrowLeft': dz = -step; break
        case 'ArrowRight': dz = step; break
        default: return
      }
      e.preventDefault()
      setVillagerPos((prev) => {
        const next = [prev[0] + dx, CAM_POS[1] + VILLAGER.yOffset, prev[2] + dz]
        console.log('[shop] villager position ->', {
          x: Number(next[0].toFixed(3)),
          y: Number(next[1].toFixed(3)),
          z: Number(next[2].toFixed(3)),
        })
        return next
      })
    }
    window.addEventListener('keydown', onKey, { passive: false })
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onBack = () => { navigate('/') }
  const [activeTab, setActiveTab] = useState('shops')

  function resetShop() {
    resetShopState()
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
    const price = computeShopPrice(item, level)
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
      {/* Top half: 3D view with sky-blue background */}
      <div className="shop-3d">
        <Canvas
          camera={{ position: CAM_POS, fov: CAM_FOV, near: 0.1, far: 1000 }}
          dpr={[1, 1.5]}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <CameraRig />
          <CameraParallax amount={0.03} targetAmount={0.015} />
          <color attach="background" args={[0.53, 0.81, 0.92]} />
          <ambientLight intensity={0.6} />
          <hemisphereLight intensity={0.9} groundColor={new THREE.Color('#223')} />
          <directionalLight position={[5, 8, 5]} intensity={1.1} />
          <directionalLight position={[-6, 4, -3]} intensity={0.5} />

          {/* OrbitControls disabled to keep subtle parallax only */}
          <Suspense fallback={null}>
            <VillagerActor url={modelUrl} pos={villagerPos} yawOffset={VILLAGER.yawOffset} scaleMultiplier={1} />
            <FitGLTF url={villageUrl} scaleMultiplier={40} position={villagePos} rotationSpeed={0} />
          </Suspense>
        </Canvas>
      </div>

      {/* Right-side modal over 3D (rounded, with margins) */}
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
              onBuy={handleBuy}
              onDeny={() => playFrom(sounds.current.deny)}
            />
          )}
          {activeTab === 'trades' && (
            <TradeList
              inv={inv}
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
        <Button size="small" className="ui-btn shop-reset" onClick={resetShop}>Reset</Button>
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

function ShopList({ inv, purchases, onBuy, onDeny }) {
  if (!SHOP_ITEMS.length) {
    return <div className="shop-empty">No shop upgrades configured.</div>
  }
  return (
    <div className="shop-list">
      {SHOP_ITEMS.map((item) => {
        const level = purchases[item.id] || 0
        const maxLevel = item.max_level ?? Infinity
        const price = computeShopPrice(item, level)
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

function TradeList({ inv, onTrade, onDeny }) {
  if (!TRADE_ITEMS.length) {
    return <div className="shop-empty">No trades configured.</div>
  }
  return (
    <div className="shop-list">
      {TRADE_ITEMS.map((trade) => {
        const maxTimes = computeMaxTimes(inv, trade.cost)
        const disabled = maxTimes <= 0 || !Number.isFinite(maxTimes)
        const maxLabel = Number.isFinite(maxTimes) ? maxTimes : '∞'
        const costEntries = Object.entries(trade.cost || {})
        const giveEntries = Object.entries(trade.give || {})
        return (
          <div className="shop-item shop-item-trade" key={trade.id}>
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
                <Button className="ui-btn-slim" disabled={disabled} onClick={() => onTrade(trade, 1)}>
                  Trade
                </Button>
                {disabled && <div className="shop-btn-shield" onClick={() => onDeny && onDeny()} />}
              </div>
              <div className="shop-btn-wrap">
                <Button className="ui-btn-slim" disabled={disabled}
                  onClick={() => onTrade(trade, maxTimes)}>
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
