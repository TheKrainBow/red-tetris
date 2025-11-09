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
  // Mock inventory to test purchases
  // Inventory is persisted to localStorage so it survives navigation
  const [inv, setInv] = useState(() => {
    try {
      const raw = localStorage.getItem('shop.inv')
      if (raw) {
        const parsed = JSON.parse(raw)
        return { Dirt: 0, Stone: 0, Iron: 0, Diamond: 0, Emerald: 0, ...parsed }
      }
    } catch (_) {}
    // Default starting values (useful for demo/dev)
    return { Dirt: 1000, Stone: 1000, Iron: 1000, Diamond: 1000, Emerald: 0 }
  })
  const [purchases, setPurchases] = useState(() => {
    try {
      const raw = localStorage.getItem('shop.purchases')
      if (raw) return JSON.parse(raw)
    } catch (_) {}
    return {}
  })

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

  const onBack = () => { window.location.hash = '#/' }
  const [activeTab, setActiveTab] = useState('upgrades') // 'upgrades' | 'emeralds'

  function resetShop() {
    const base = { Dirt: 1000, Stone: 1000, Iron: 1000, Diamond: 1000, Emerald: 0 }
    setPurchases({})
    setInv(base)
    try { localStorage.setItem('shop.inv', JSON.stringify(base)) } catch (_) {}
    try { localStorage.removeItem('shop.purchases') } catch (_) {}
  }

  function handleBuy(item) {
    // Decide using current state; then update and play SFX synchronously
    const have = inv[item.cost.type] || 0
    const bought = purchases[item.id] || 0
    const overCap = (item.kind === 'single' && bought >= 1) ||
                    (item.kind === 'passive' && bought >= (item.max || 100))
    const affordable = have >= item.cost.amount
    if (!affordable || overCap) return
    // Apply updates
    setInv({ ...inv, [item.cost.type]: have - item.cost.amount })
    setPurchases({ ...purchases, [item.id]: bought + 1 })
    // Play a resource SFX based on cost type
    const t = item.cost.type
    if (t === 'Dirt') playFrom(sounds.current.dirt)
    else playFrom(sounds.current.stone)
  }

  // Persist inventory whenever it changes
  useEffect(() => {
    try { localStorage.setItem('shop.inv', JSON.stringify(inv)) } catch (_) {}
  }, [inv])

  // Persist purchases whenever they change
  useEffect(() => {
    try { localStorage.setItem('shop.purchases', JSON.stringify(purchases)) } catch (_) {}
  }, [purchases])

  return (
    <div className="shop-root">
      {/* Standalone Inventory modal (outside the Trading Outpost modal) */}
      <div className="shop-inventory-modal">
        <InventoryBar inv={inv} />
      </div>
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
            <button className={`shop-tab ${activeTab === 'upgrades' ? 'active' : ''}`} onClick={() => setActiveTab('upgrades')}>
              <img className="shop-tab-icon" src="/ui/Hammer.webp" alt="Upgrades" />
              Upgrades
            </button>
            <button className={`shop-tab ${activeTab === 'emeralds' ? 'active' : ''}`} onClick={() => setActiveTab('emeralds')}>
              <img className="shop-tab-icon" src={COST_ICONS.Emerald} alt="Emeralds" />
              Emeralds
            </button>
          </div>
          {activeTab === 'upgrades' ? (
            <ShopList
              inv={inv}
              purchases={purchases}
              onBuy={handleBuy}
              onDeny={() => playFrom(sounds.current.deny)}
            />
          ) : (
            <EmeraldTradeList
              inv={inv}
              onTrade={(res, amount) => {
                // SFX based on resource used
                if (res === 'Dirt') playFrom(sounds.current.dirt)
                else playFrom(sounds.current.stone)
                // Update inventory: spend resource, gain 1 emerald
                setInv((cur) => {
                  const have = cur[res] || 0
                  if (have < amount) return cur
                  return { ...cur, [res]: have - amount, Emerald: (cur.Emerald||0) + 1 }
                })
              }}
              onTradeMany={(res, amount, times) => {
                if (!times || times <= 0) return
                if (res === 'Dirt') playFrom(sounds.current.dirt)
                else playFrom(sounds.current.stone)
                setInv((cur) => {
                  const have = cur[res] || 0
                  const maxTimes = Math.min(times, Math.floor(have / amount))
                  if (maxTimes <= 0) return cur
                  return {
                    ...cur,
                    [res]: have - amount * maxTimes,
                    Emerald: (cur.Emerald || 0) + maxTimes,
                  }
                })
              }}
              onDeny={() => playFrom(sounds.current.deny)}
            />
          )}
        </div>
        <Button className="ui-btn-wide shop-cancel" onClick={onBack}>Cancel</Button>
      </div>

      {/* Debug reset button */}
      <Button size="small" className="shop-debug" onClick={resetShop}>Reset</Button>
    </div>
  )
}

// ---- Simple mock shop list ----
const COST_ICONS = {
  Dirt: '/blocks/Dirt.jpg',
  Stone: '/blocks/Stone.jpeg',
  Iron: '/blocks/IronItem.png',
  Diamond: '/blocks/DiamondItem.png',
  Emerald: '/blocks/EmeraldItem.png',
}

// Passive item factory (stackable up to 100 levels)
function passive(id, name, costType, amount, perLevelPct = 1) {
  return { kind: 'passive', id, name, cost: { type: costType, amount }, perLevelPct, max: 100 }
}
// One-time item factory
function single(id, name, costType, amount, desc) {
  return { kind: 'single', id, name, cost: { type: costType, amount }, desc }
}

const SHOP_ITEMS = [
  // Passive % upgrades
  passive('p_dirt_1', 'Increase Dirt spawning by 1%', 'Dirt', 10, 1),
  passive('p_dirt_2', 'Increase Dirt spawning by 1%', 'Stone', 8, 1),
  passive('p_stone_1', 'Increase Stone spawning by 1%', 'Stone', 12, 1),
  passive('p_stone_2', 'Increase Stone spawning by 1%', 'Iron', 6, 1),
  passive('p_iron_1', 'Increase Iron spawning by 1%', 'Iron', 10, 1),
  passive('p_iron_2', 'Increase Iron spawning by 1%', 'Diamond', 2, 1),
  passive('p_diamond_1', 'Increase Diamond spawning by 1%', 'Diamond', 3, 1),
  passive('p_luck', 'Increase Luck by 1%', 'Iron', 7, 1),
  passive('p_speed', 'Mine Speed +1%', 'Stone', 9, 1),
  passive('p_storage', 'Chest Capacity +1%', 'Dirt', 14, 1),
  passive('p_trade', 'Better Trades +1%', 'Iron', 11, 1),
  passive('p_village', 'Village Growth +1%', 'Stone', 13, 1),
  passive('p_smelt', 'Smelting Efficiency +1%', 'Diamond', 1, 1),
  passive('p_beacon', 'Beacon Range +1%', 'Stone', 15, 1),
  passive('p_cart', 'Cart Speed +1%', 'Iron', 8, 1),
  passive('p_mender', 'Tool Durability +1%', 'Diamond', 2, 1),

  // One-time fun items
  single('s_hat', 'Villager Hat', 'Dirt', 50, 'A very fashionable pile of blocks.'),
  single('s_music', 'Jukebox Unlocked', 'Iron', 60, 'Dance while you craft.'),
  single('s_portal', 'Mini Nether Portal', 'Diamond', 10, 'Absolutely safe. Trust me.'),
  single('s_banner', 'Custom Banner', 'Stone', 80, 'Your village, your banner.'),
  single('s_torch', 'Infinite Torch', 'Iron', 30, 'Never dark, always moody.'),
  single('s_pet', 'Pet Slime', 'Stone', 40, 'It follows you, mostly.'),
]

function InventoryBar({ inv }) {
  return (
    <div className="shop-item shop-inventory">
      <div className="shop-item-title">Inventory</div>
      <div className="shop-inv">
        {Object.entries(inv).map(([k,v]) => (
          <div key={k} className="shop-inv-chip">
            <img className="shop-chip-img" src={COST_ICONS[k]} alt={k} />
            <span className="shop-chip-text">{v} {k}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ShopList({ inv, purchases, onBuy, onDeny }) {
  return (
    <div className="shop-list">
      {SHOP_ITEMS.map((it) => {
        const bought = purchases[it.id] || 0
        const affordable = (inv[it.cost.type] || 0) >= it.cost.amount
        let disabled = false
        let status = null
        let purchased = false
        if (it.kind === 'passive') {
          const cur = Math.min(bought, it.max) * (it.perLevelPct || 1)
          status = `Current: ${cur}%`
          disabled = !affordable || bought >= (it.max || 100)
        } else {
          disabled = !affordable || bought >= 1
          purchased = bought >= 1
          status = purchased ? 'Purchased' : ''
        }
        return (
          <div className="shop-item" key={it.id}>
            <div className="shop-item-name">{it.name}</div>
            {status && (
              <div className={`shop-item-status ${purchased ? 'shop-status-purchased' : ''}`}>
                {status}
              </div>
            )}
            <div className="shop-cost">
              <img className="shop-chip-img" src={COST_ICONS[it.cost.type]} alt={it.cost.type} />
              <span className="shop-chip-text">{it.cost.amount} {it.cost.type}</span>
            </div>
            <div className="shop-btn-wrap">
              <Button className="ui-btn-narrow" disabled={disabled} onClick={() => onBuy(it)}>
                {it.kind === 'single'
                  ? ((purchases[it.id] || 0) >= 1 ? 'Bought' : 'Buy')
                  : ((purchases[it.id] || 0) >= (it.max || 100) ? 'Max' : 'Buy')}
              </Button>
              {disabled && (
                <div
                  className="shop-btn-shield"
                  onClick={() => onDeny && onDeny()}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EmeraldTradeList({ inv, onTrade, onTradeMany, onDeny }) {
  const trades = [
    { id: 'e_dirt', label: '128 Dirt for 1 Emerald', res: 'Dirt', amount: 128 },
    { id: 'e_stone', label: '64 Stone for 1 Emerald', res: 'Stone', amount: 64 },
    { id: 'e_iron', label: '32 Iron for 1 Emerald', res: 'Iron', amount: 32 },
    { id: 'e_diamond', label: '16 Diamond for 1 Emerald', res: 'Diamond', amount: 16 },
  ]
  return (
    <div className="shop-list">
      {trades.map(t => {
        const have = inv[t.res] || 0
        const disabled = have < t.amount
        const maxTimes = Math.floor(have / t.amount)
        return (
          <div className="shop-item shop-item-trade" key={t.id}>
            <div className="shop-item-name">
              <div className="shop-trade">
                <div className="shop-cost">
                  <img className="shop-chip-img" src={COST_ICONS[t.res]} alt={t.res} />
                  <span className="shop-chip-text">{t.amount} {t.res}</span>
                </div>
                <span className="shop-trade-arrow">→</span>
                <div className="shop-cost">
                  <img className="shop-chip-img" src={COST_ICONS.Emerald} alt="Emerald" />
                  <span className="shop-chip-text">1 Emerald</span>
                </div>
              </div>
            </div>
            <div className="shop-cost" />
            <div className="shop-btns">
              <div className="shop-btn-wrap">
                <Button className="ui-btn-narrow" disabled={disabled} onClick={() => onTrade && onTrade(t.res, t.amount)}>
                  Trade
                </Button>
                {disabled && <div className="shop-btn-shield" onClick={() => onDeny && onDeny()} />}
              </div>
              <div className="shop-btn-wrap">
                <Button className="ui-btn-slim" disabled={maxTimes <= 0}
                  onClick={() => onTradeMany && onTradeMany(t.res, t.amount, maxTimes)}>
                  Max (+{maxTimes})
                </Button>
                {maxTimes <= 0 && <div className="shop-btn-shield" onClick={() => onDeny && onDeny()} />}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
