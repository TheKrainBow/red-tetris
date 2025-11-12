const defaultDoc = {
  addEventListener: () => {},
  removeEventListener: () => {},
}

function createStorage(initial = {}) {
  const store = { ...initial }
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null
    },
    setItem(key, value) {
      store[key] = String(value)
    },
    removeItem(key) {
      delete store[key]
    },
    clear() {
      Object.keys(store).forEach((k) => delete store[k])
    },
    _dump() {
      return { ...store }
    },
  }
}

function setupDom({ storageData = {}, windowOverrides = {}, documentOverrides = {} } = {}) {
  const prevWindow = global.window
  const prevDocument = global.document
  const prevStorage = global.localStorage
  const listeners = {}
  const storage = createStorage(storageData)
  const windowMock = {
    location: { hash: '' },
    addEventListener(type, handler) {
      if (!listeners[type]) listeners[type] = new Set()
      listeners[type].add(handler)
    },
    removeEventListener(type, handler) {
      if (listeners[type]) listeners[type].delete(handler)
    },
    dispatchEvent(event) {
      const subs = listeners[event.type]
      if (!subs) return
      subs.forEach((fn) => fn(event))
    },
    matchMedia: () => ({ matches: false, addListener() {}, removeListener() {} }),
    ...windowOverrides,
  }
  const documentMock = {
    ...defaultDoc,
    ...documentOverrides,
  }

  global.window = windowMock
  global.document = documentMock
  global.localStorage = storage
  windowMock.localStorage = storage
  const ResizeObserverStub = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  global.ResizeObserver = windowMock.ResizeObserver || ResizeObserverStub
  windowMock.ResizeObserver = global.ResizeObserver
  if (!global.requestAnimationFrame) {
    global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
  }
  if (!global.cancelAnimationFrame) {
    global.cancelAnimationFrame = (id) => clearTimeout(id)
  }
  if (!global.performance) {
    global.performance = { now: () => Date.now() }
  }

  return {
    window: windowMock,
    storage,
    cleanup() {
      if (typeof prevWindow === 'undefined') delete global.window
      else global.window = prevWindow
      if (typeof prevDocument === 'undefined') delete global.document
      else global.document = prevDocument
      if (typeof prevStorage === 'undefined') delete global.localStorage
      else global.localStorage = prevStorage
    },
  }
}

module.exports = {
  setupDom,
  createStorage,
}
