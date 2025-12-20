/* eslint-disable no-undef */
const { JSDOM } = require('jsdom')
const React = require('react')
const Module = require('module')
const THREE = require('three')

const dom = new JSDOM('<!doctype html><html><body><div id="tetris"></div></body></html>', {
  url: 'http://localhost/'
})

const createStorage = () => {
  const store = new Map()
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  }
}

const pushLog = []
const replaceLog = []
const originalPushState = dom.window.history.pushState.bind(dom.window.history)
const originalReplaceState = dom.window.history.replaceState.bind(dom.window.history)
dom.window.history.pushState = (...args) => {
  pushLog.push(args[2])
  return originalPushState(...args)
}
dom.window.history.replaceState = (...args) => {
  replaceLog.push(args[2])
  return originalReplaceState(...args)
}
dom.window.history.pushed = pushLog
dom.window.history.replaced = replaceLog

global.window = dom.window
global.document = dom.window.document
global.navigator = dom.window.navigator
global.CustomEvent = dom.window.CustomEvent
global.Event = dom.window.Event
global.HTMLElement = dom.window.HTMLElement
global.HTMLCanvasElement = dom.window.HTMLCanvasElement
const localStorageMock = createStorage()
const sessionStorageMock = createStorage()
Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true })
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock, configurable: true })
global.localStorage = localStorageMock
global.sessionStorage = sessionStorageMock
try {
  window.localStorage.setItem('username', 'Tester')
} catch (_) {}

const raf = () => 0
const caf = () => {}
global.requestAnimationFrame = raf
global.cancelAnimationFrame = caf
window.requestAnimationFrame = raf
window.cancelAnimationFrame = caf

const origError = console.error
console.error = (...args) => {
  const msg = String(args[0] || '')
  if (msg.includes('Not implemented: navigation to another Document')) return
  origError(...args)
}

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock
window.ResizeObserver = ResizeObserverMock

class FakeAudio {
  constructor() {
    this.volume = 1
    this.preload = 'auto'
  }
  play() {
    return Promise.resolve()
  }
}
global.Audio = FakeAudio
global.Image = class {
  constructor() {
    this.width = 1
    this.height = 1
    this.crossOrigin = 'anonymous'
  }
  set src(value) {
    this._src = value
    setTimeout(() => {
      if (typeof this.onload === 'function') this.onload()
    }, 0)
  }
}

const canvasProto = window.HTMLCanvasElement && window.HTMLCanvasElement.prototype
if (canvasProto) {
  canvasProto.getContext = () => ({
    fillRect() {},
    clearRect() {},
    getImageData() { return { data: [] } },
    putImageData() {},
    createImageData() { return [] },
    setTransform() {},
    drawImage() {},
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    translate() {},
    rotate() {},
    scale() {},
    measureText() { return { width: 0 } },
    getContextAttributes() { return {} },
  })
}

const fiberStub = {
  Canvas: ({ children }) => React.createElement('div', { className: 'canvas-stub' }, children),
  useFrame: () => {},
  useLoader: () => ({}),
  useThree: () => {
    return {
      camera: {
        position: { set() {} },
        rotation: { set() {} },
        lookAt() {},
        updateProjectionMatrix() {},
        fov: 45,
      },
      gl: {
        domElement: {
          addEventListener() {},
          removeEventListener() {},
          style: {},
        },
      },
      size: { width: 1024, height: 768 },
      scene: { add() {}, remove() {}, background: null },
    }
  },
}

const measureStub = () => [() => {}, { width: 0, height: 0 }]
measureStub.default = measureStub

class GLTFStub {
  setMeshoptDecoder() {}
  register() {}
  load(url, onLoad) {
    const scene = new THREE.Group()
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()))
    onLoad && onLoad({ scene })
  }
}

class OrbitControlsStub {
  constructor(camera, domElement) {
    this.camera = camera
    this.domElement = domElement
    this.target = { set() {} }
  }
  addEventListener() {}
  dispose() {}
  update() {}
}

const originalLoad = Module._load
Module._load = function patchedLoader(request, parent, isMain) {
  if (request === '@react-three/fiber') return fiberStub
  if (request === 'react-use-measure') return measureStub
  if (request === 'three/examples/jsm/loaders/GLTFLoader.js') return { GLTFLoader: GLTFStub }
  if (request === 'three/examples/jsm/controls/OrbitControls.js') return { OrbitControls: OrbitControlsStub }
  if (request === 'three/examples/jsm/libs/meshopt_decoder.module.js') return {}
  return originalLoad(request, parent, isMain)
}
