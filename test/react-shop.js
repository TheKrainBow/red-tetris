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
      renderer = create(React.createElement(Shop))
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

  it('renders root container and Cancel navigates home', function () {
    const env = renderPage()
    const rootDiv = renderer.root.findByProps({ className: 'shop-root' })
    chai.expect(rootDiv).to.exist
    env.window.location.hash = '#/shop'
    act(() => buttonWithLabel('Cancel').props.onClick())
    env.window.location.hash.should.equal('#/')
  })

  it('Reset button restores default inventory', function () {
    const env = renderPage({ 'shop.inv': JSON.stringify({ Dirt: 1, Stone: 0, Iron: 0, Diamond: 0, Emerald: 0 }) })
    act(() => buttonWithLabel('Reset', true).props.onClick())
    const inv = JSON.parse(env.storage.getItem('shop.inv'))
    inv.should.deep.equal({ Dirt: 1000, Stone: 1000, Iron: 1000, Diamond: 1000, Emerald: 0 })
    chai.expect(JSON.parse(env.storage.getItem('shop.purchases'))).to.deep.equal({})
  })

  it('buying an upgrade spends resources and records purchase', function () {
    const env = renderPage()
    const buyBtn = renderer.root.findAllByType('button').find((btn) => {
      const text = Array.isArray(btn.children) ? btn.children.join('') : btn.children
      return text === 'Buy'
    })
    act(() => buyBtn.props.onClick())
    const inv = JSON.parse(env.storage.getItem('shop.inv'))
    inv.Dirt.should.equal(990)
    const purchases = JSON.parse(env.storage.getItem('shop.purchases'))
    purchases.should.have.property('p_dirt_1', 1)
  })

  it('Emerald trade spends resources and grants emeralds', function () {
    const env = renderPage({ 'shop.inv': JSON.stringify({ Dirt: 256, Stone: 0, Iron: 0, Diamond: 0, Emerald: 0 }) })
    act(() => buttonWithLabel('Emeralds').props.onClick())
    const tradeBtn = renderer.root.findAllByType('button').find((btn) => {
      const text = Array.isArray(btn.children) ? btn.children.join('') : btn.children
      return text === 'Trade'
    })
    act(() => tradeBtn.props.onClick())
    const inv = JSON.parse(env.storage.getItem('shop.inv'))
    inv.Dirt.should.equal(128)
    inv.Emerald.should.equal(1)
  })

  it('Max trade spends all available resources for emeralds', function () {
    const env = renderPage({ 'shop.inv': JSON.stringify({ Dirt: 512, Stone: 0, Iron: 0, Diamond: 0, Emerald: 0 }) })
    act(() => buttonWithLabel('Emeralds').props.onClick())
    const trades = renderer.root.findAll((node) => node.props && node.props.className === 'shop-item shop-item-trade')
    const dirtTrade = trades[0]
    const maxBtn = dirtTrade.findAllByType('button')[1]
    act(() => maxBtn.props.onClick())
    const inv = JSON.parse(env.storage.getItem('shop.inv'))
    inv.Dirt.should.equal(0)
    inv.Emerald.should.equal(4)
  })
})
