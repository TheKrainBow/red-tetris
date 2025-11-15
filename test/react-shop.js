const React = require('react')
const { act, create } = require('react-test-renderer')
const proxyquire = require('proxyquire').noCallThru()
const chai = require('chai')
const { setupDom } = require('./helpers/dom')

chai.should()

function makeVector() {
  return {
    x: 0,
    y: 0,
    z: 0,
    set(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; return this },
    clone() { const v = makeVector(); v.set(this.x, this.y, this.z); return v },
    sub() { return this },
    add() { return this },
    normalize() { return this },
    multiplyScalar() { return this },
    crossVectors() { return this },
  }
}

const { ShopStateProvider } = require('../frontend/src/context/ShopStateContext')

const Shop = proxyquire('../frontend/src/pages/Shop', {
  '@react-three/fiber': {
    Canvas: ({ children }) => React.createElement('canvas', {}, children),
    useFrame: () => {},
    useThree: () => ({
      camera: {
        position: makeVector(),
        rotation: { x: 0, y: 0, z: 0 },
        fov: 45,
        updateProjectionMatrix() {},
        lookAt() {},
      },
      gl: { domElement: {} },
      size: { width: 800, height: 600 },
    }),
  },
  'three/examples/jsm/loaders/GLTFLoader.js': {
    GLTFLoader: class {
      setMeshoptDecoder() {}
      register() {}
      load(_url, onLoad) {
        setTimeout(() => onLoad({ scene: null }), 0)
      }
    },
  },
  'three/examples/jsm/libs/meshopt_decoder.module.js': {
    MeshoptDecoder: {},
  },
  '../three/KHR_materials_pbrSpecularGlossiness': () => {},
  'three/examples/jsm/controls/OrbitControls.js': {
    OrbitControls: class {
      constructor() {
        this.target = { set() {} }
      }
      addEventListener() {}
      dispose() {}
      update() {}
    },
  },
}).default

describe('Shop page', function () {
  let cleanup = null
  let renderer = null

  beforeEach(function () {
    global.Audio = function () {
      this.play = () => Promise.resolve()
      this.setAttribute = () => {}
    }
  })

  afterEach(function () {
    if (renderer) renderer.unmount()
    renderer = null
    if (cleanup) cleanup()
    cleanup = null
    delete global.Audio
  })

function renderPage(storageData = {}) {
    const env = setupDom({ storageData })
    cleanup = env.cleanup
    act(() => {
      renderer = create(
        React.createElement(ShopStateProvider, null, React.createElement(Shop))
      )
    })
    return env
  }

function buttonWithLabel(label, exact = false) {
  return renderer.root.findAllByType('button').find((btn) => {
    const text = Array.isArray(btn.children) ? btn.children.join('') : btn.children
    if (typeof text !== 'string') return false
    return exact ? text.trim() === label : text.includes(label)
  })
}

function flushAsync() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function collectText(nodes) {
  const arr = Array.isArray(nodes) ? nodes : [nodes]
  const out = []
  arr.forEach((node) => {
    if (typeof node === 'string') out.push(node)
    else if (node && node.props && node.props.children) out.push(...collectText(node.props.children))
  })
  return out
}

  it('renders root container and Cancel navigates home', function () {
    const env = renderPage()
    const rootDiv = renderer.root.findByProps({ className: 'shop-root' })
    chai.expect(rootDiv).to.exist
    env.window.location.hash = '#/shop'
    act(() => buttonWithLabel('Back').props.onClick())
    env.window.location.hash.should.equal('#/')
  })

  it('Reset button restores default inventory', function () {
    const env = renderPage({ 'shop.inv': JSON.stringify({ Dirt: 1, Stone: 0, Iron: 0, Diamond: 0, Emerald: 0 }) })
    act(() => buttonWithLabel('Reset', true).props.onClick())
    const inv = JSON.parse(env.storage.getItem('shop.inv'))
    inv.should.deep.equal({ dirt: 1000, stone: 1000, iron: 1000, diamond: 1000, emerald: 0 })
    chai.expect(JSON.parse(env.storage.getItem('shop.purchases'))).to.deep.equal({})
  })

  it('buying an upgrade spends resources and records purchase', async function () {
    const env = renderPage()
    const upgradeEntry = renderer.root.findAll((node) => node.props && node.props.className === 'shop-item').find((node) => {
      try {
        const nameNode = node.find((child) => child.props && child.props.className === 'shop-item-name')
        const text = Array.isArray(nameNode.children) ? nameNode.children.join('') : nameNode.children
        return typeof text === 'string' && text.includes('Rock detector')
      } catch (_) {
        return false
      }
    })
    const buyBtn = upgradeEntry.findAllByType('button').find((btn) => {
      const text = Array.isArray(btn.children) ? btn.children.join('') : btn.children
      return text === 'Buy'
    })
    await act(async () => {
      buyBtn.props.onClick()
      await flushAsync()
    })
    await flushAsync()
    const inv = JSON.parse(env.storage.getItem('shop.inv'))
    inv.dirt.should.equal(975)
    const status = upgradeEntry.find((child) => child.props && child.props.className === 'shop-item-status')
    const textLines = collectText(status.props.children || [])
    chai.expect(textLines.some((txt) => txt.includes('Level 1'))).to.equal(false)
  })

  it('Emerald trade spends resources and grants emeralds', async function () {
    const env = renderPage({ 'shop.inv': JSON.stringify({ Dirt: 256, Stone: 0, Iron: 0, Diamond: 0, Emerald: 0 }) })
    act(() => buttonWithLabel('Trades').props.onClick())
    const tradeBtn = renderer.root.findAllByType('button').find((btn) => {
      const text = Array.isArray(btn.children) ? btn.children.join('') : btn.children
      return text === 'Trade'
    })
    await act(async () => {
      tradeBtn.props.onClick()
      await flushAsync()
    })
    const inv = JSON.parse(env.storage.getItem('shop.inv'))
    inv.dirt.should.equal(128)
    inv.emerald.should.equal(1)
  })

  it('Max trade spends all available resources for emeralds', async function () {
    const env = renderPage({ 'shop.inv': JSON.stringify({ Dirt: 512, Stone: 0, Iron: 0, Diamond: 0, Emerald: 0 }) })
    act(() => buttonWithLabel('Trades').props.onClick())
    const trades = renderer.root.findAll((node) => node.props && node.props.className === 'shop-item shop-item-trade')
    const dirtTrade = trades[0]
    const maxBtn = dirtTrade.findAllByType('button')[1]
    await act(async () => {
      maxBtn.props.onClick()
      await flushAsync()
    })
    const inv = JSON.parse(env.storage.getItem('shop.inv'))
    inv.dirt.should.equal(0)
    inv.emerald.should.equal(4)
  })
})
