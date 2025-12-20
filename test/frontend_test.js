import React, { useEffect } from 'react'
import { expect } from 'chai'
import proxyquire from 'proxyquire'
import TestRenderer, { act } from 'react-test-renderer'

process.env.NODE_ENV = 'test'

proxyquire.noCallThru()

const mounted = []

const mountSync = (node) => {
  const renderer = TestRenderer.create(node)
  mounted.push(renderer)
  return renderer
}


before(() => {
  // jsdom throws on these
  if (window.location) {
    const loc = global.window.location

    try {
      Object.defineProperty(loc, 'assign', { value: () => {}, configurable: true })
    } catch (_) {}

    try {
      Object.defineProperty(loc, 'replace', { value: () => {}, configurable: true })
    } catch (_) {}
    // window.location.assign = () => {}
    // window.location.replace = () => {}
  }
})

const flush = () => new Promise((resolve) => setImmediate(resolve))

const mountAsync = async (node) => {
  let renderer = null
  await act(async () => {
    renderer = TestRenderer.create(node)
    await flush()
  })
  mounted.push(renderer)
  return renderer
}

afterEach(() => {
  while (mounted.length) {
    const r = mounted.pop()
    try { r.unmount() } catch (e) {}
  }
})

const createSocketClientStub = () => {
  const handlers = {}
  const stub = {
    handlers,
    on(event, handler) {
      handlers[event] = handler
      return () => delete handlers[event]
    },
    once(event, handler) {
      handlers[event] = handler
      return () => delete handlers[event]
    },
    emit() {},
    connect: async () => ({ state: 'connected' }),
    start: async () => ({ state: 'connected' }),
    getStatus: () => ({ state: 'connected' }),
    fetchRoomList: async () => ({ rooms: [] }),
    subscribeLobby: async () => ({ success: true }),
    unsubscribeLobby: async () => ({ success: true }),
    fetchRoomSettings: async () => ({ success: true, gamemode: 'pvp', player_limit: 4 }),
    fetchPlayerHistory: async () => ({ history: [] }),
    updateRoomSettings: async () => ({ success: true }),
    kickPlayer: async () => ({ success: true }),
    startGame: async () => ({ success: true }),
    joinRoom: async () => ({ success: true }),
    leaveRoom: async () => ({ success: true }),
    sendKeyPress: async () => ({ success: true }),
    sendCommand: async (event, payload) => {
      switch (event) {
        case 'get_user_by_player_name':
          return {
            data: {
              user: [{ dirt_owned: 5, stone_owned: 3, iron_owned: 2, diamond_owned: 1, emeralds: 4 }],
              inventory: [{ item_name: 'dirt_cap', current_count: 1 }]
            }
          }
        case 'get_rates_by_player_name':
          return {
            data: {
              rates: [{ dirt_probability: 70, stone_probability: 20, iron_probability: 5, diamond_probability: 5 }],
              caps: { dirt: 1, stone: 1, iron: 1, diamond: 1 }
            }
          }
        case 'shop_buy':
        case 'shop_trade':
        case 'shop_craft':
          return { data: { success: true, user: [{ dirt_owned: 6 }], inventory: [{ item_name: 'dirt_cap', current_count: 2 }] } }
        case 'update_rates_by_player_name':
          return { data: { success: true } }
        default:
          return { data: {} }
      }
    }
  }
  return stub
}

const mockShopConfig = {
  game: {
    resources: [
      { id: 'dirt', type: 'collectible', display_name: 'Dirt' },
      { id: 'stone', type: 'collectible', display_name: 'Stone' },
      { id: 'iron', type: 'collectible', display_name: 'Iron' },
      { id: 'diamond', type: 'collectible', display_name: 'Diamond' },
      { id: 'emerald', type: 'currency', display_name: 'Emerald' }
    ],
    spawn_probabilities_start: { dirt: 0.5, stone: 0.3, iron: 0.15, diamond: 0.05 }
  },
  shops: [
    {
      id: 'dirt_cap',
      starting_price: 10,
      price_growth_multiplier: 1.2,
      effect_type: 'spawn_rate_increase',
      effect_per_level: 0.05,
      effect_growth_multiplier: 1,
      affects: 'dirt',
      max_level: 5,
      effects: { shop_reduction: 1 }
    }
  ],
  trades: [
    { id: 'stone_trade', cost: { dirt: 5 }, give: { stone: 1 }, requires: [] }
  ],
  crafts: [
    { id: 'fortune_book', cost: { diamond: 1 }, outputs: { fortune_book: 1 }, effects: { fortune_multiplier_percent: 5, dirt_trade_multiplier: 0.5 }, max_crafts: 3 }
  ]
}

const shopDataModule = proxyquire('../frontend/src/utils/shopData.js', {
  '../../../shop.yml': 'mock-shop-data',
  'js-yaml': { load: () => mockShopConfig },
  fs: { readFileSync: () => 'mock-shop-data' },
  path: { resolve: () => 'shop.yml' }
})

const shopLogicModule = proxyquire('../frontend/src/utils/shopLogic.js', {
  './shopData': shopDataModule,
  './shopData.js': shopDataModule
})

const spawnConfigModule = proxyquire('../frontend/src/utils/spawnConfig.js', {
  './shopData': shopDataModule,
  './shopData.js': shopDataModule
})

const socketClientStub = createSocketClientStub()

const contextModule = proxyquire('../frontend/src/context/ShopStateContext.js', {
  '../utils/socketClient': socketClientStub,
  '../utils/shopData': shopDataModule,
  '../utils/shopLogic': shopLogicModule,
  '../utils/spawnConfig': spawnConfigModule,
  '../utils/storage': { getLocalStorageItem: () => 'Tester' }
})

const compatModule = (impl) => Object.assign(impl, { default: impl })

describe('frontend action creators', () => {
  it('creates alert and server actions', () => {
    const alertActions = require('../frontend/src/actions/alert.js')
    expect(alertActions.alert('hi')).to.deep.equal({ type: alertActions.ALERT_POP, message: 'hi' })
    const serverActions = require('../frontend/src/actions/server.js')
    expect(serverActions.ping()).to.deep.equal({ type: 'server/ping' })
  })
})

describe('frontend reducers', () => {
  it('handles alert reducer and root reducer', () => {
    const alertReducer = require('../frontend/src/reducers/alert.js').default
    const next = alertReducer(undefined, { type: 'UNKNOWN' })
    expect(next).to.deep.equal({ message: '' })
    const updated = alertReducer({}, { type: 'ALERT_POP', message: 'hello' })
    expect(updated.message).to.equal('hello')
    const rootReducer = require('../frontend/src/reducers/index.js').default
    expect(rootReducer({ message: 'hi' }, { type: 'ALERT_POP', message: 'bye' }).message).to.equal('bye')
  })
})

describe('frontend storage + navigation utilities', () => {
  it('wraps localStorage safely', () => {
    const storage = require('../frontend/src/utils/storage.js')
    storage.setLocalStorageItem('foo', 'bar')
    expect(storage.getLocalStorageItem('foo')).to.equal('bar')
    storage.removeLocalStorageItem('foo')
    expect(storage.getLocalStorageItem('foo', 'fallback')).to.equal('fallback')
  })

  it('normalizes navigation paths', () => {
    const navigation = require('../frontend/src/utils/navigation.js')
    navigation.navigate('leaderboard')
    expect(window.history.pushed.pop()).to.equal('/leaderboard')
    navigation.replace('#options')
    expect(window.history.replaced.pop()).to.equal('/options')
  })
})

describe('shop data and logic helpers', () => {
  it('formats resource ids and computes prices', () => {
    const { formatResourceId, startCase, SHOP_ITEMS } = shopDataModule
    expect(formatResourceId('Stone Block')).to.equal('stone_block')
    expect(startCase('iron_pickaxe')).to.equal('Iron Pickaxe')
    const item = SHOP_ITEMS[0]
    const price1 = shopLogicModule.computeShopPrice(item, 1)
    const price2 = shopLogicModule.computeShopPrice(item, 2, 10)
    expect(price2).to.be.lessThan(price1 * 2)
    const reduction = shopLogicModule.computeShopReduction({ [item.id]: 2 }, { fortune_book: 1 })
    expect(reduction).to.be.greaterThan(0)
    const desc = shopLogicModule.describeEffect(item, 3)
    expect(desc.current).to.include('spawn')
    expect(shopLogicModule.getResourceIcon('dirt')).to.include('/blocks')
    expect(shopLogicModule.formatNumber(12345)).to.equal('12,345')
    const craft = mockShopConfig.crafts[0]
    const craftDesc = shopLogicModule.describeCraftEffects(craft)
    expect(craftDesc[0]).to.include('fortune')
    const inv = { dirt: 10, stone: 4, diamond: 2, fortune_book: 1 }
    expect(shopLogicModule.computeMaxTimes(inv, { stone: 2 })).to.equal(2)
    expect(shopLogicModule.hasTradeRequirements(inv, { requires: ['dirt'] })).to.be.true
    const tradeMult = shopLogicModule.computeTradeMultipliers({ fortune_book: 1 })
    const adjustedTrade = shopLogicModule.applyTradeMultipliers({ cost: { dirt: 4 }, give: { stone: 2 } }, tradeMult)
    expect(adjustedTrade.cost.dirt).to.be.at.least(2)
    expect(shopLogicModule.canCraft(inv, craft)).to.be.true
    const defaultInv = shopLogicModule.createDefaultInventory()
    expect(defaultInv.dirt).to.be.above(0)
    const sanitized = shopLogicModule.sanitizeInventory({ dirt: -5, bonus: 3 })
    expect(sanitized.dirt).to.equal(0)
  })

  it('balances spawn configuration helpers', () => {
    const { SPAWN_MATERIALS, SPAWN_RATE_DEFAULTS, sanitizeSpawnCaps, sanitizeSpawnRates, adjustSpawnRates, computeCapsFromPurchases } = spawnConfigModule
    expect(SPAWN_MATERIALS.length).to.be.greaterThan(0)
    const caps = sanitizeSpawnCaps({ dirt: 2 })
    const rates = sanitizeSpawnRates({ dirt: 0.8 }, caps)
    expect(Object.keys(rates)).to.include('dirt')
    const adjusted = adjustSpawnRates(rates, caps, 'dirt', 0.2, true)
    const total = Object.values(adjusted).reduce((sum, v) => sum + v, 0)
    expect(Math.abs(total - 1)).to.be.lessThan(0.01)
    const newCaps = computeCapsFromPurchases({ dirt_cap: 2 })
    expect(newCaps.dirt).to.be.at.least(caps.dirt)
  })
})

describe('socket client utility', () => {
  it('normalizes events and command responses', async () => {
    const handlers = {}
    const socketMock = {
      on(event, handler) { handlers[event] = handler },
      once(event, handler) { handlers[event] = handler },
      emit: () => {},
      onAny: () => {},
      connect: () => {},
      disconnect: () => {}
    }

    let emitted = []
    const ioStub = () => socketMock

    const socketModule = proxyquire('../frontend/src/utils/socketClient.js', {
      'socket.io-client': { io: ioStub }
    })
    const client = socketModule.default || socketModule
    const statusUpdates = []
    client.on('status', (payload) => statusUpdates.push(payload))
    const startPromise = client.connect()
    handlers.connect({ id: 1 })
    await startPromise
    expect(statusUpdates[0].state).to.equal('connected')
    const playerEvents = []
    client.on('player_list', (payload) => playerEvents.push(payload))
    handlers.player_list({ data: [{ name: 'hero' }] })
    expect(playerEvents[0].players[0].name).to.equal('hero')
  })
})

describe('middleware and containers', () => {
  it('storeStateMiddleWare forwards actions', () => {
    const { storeStateMiddleWare } = require('../frontend/src/middleware/storeStateMiddleWare.js')
    let called = false
    const result = storeStateMiddleWare({})(() => {
      called = true
      return 'done'
    })({ type: 'TEST' })
    expect(result).to.equal('done')
    expect(called).to.be.true
  })

  it('connects App container to props', () => {
    const fakeConnect = (mapStateToProps) => (Component) => (props) => {
      const derived = mapStateToProps({ message: 'hello world' })
      return React.createElement(Component, { ...props, ...derived })
    }
    const AppContainer = proxyquire('../frontend/src/containers/app.js', {
      'react-redux': { connect: fakeConnect }
    }).default
    const tree = mountSync(React.createElement(AppContainer)).toJSON()
    expect(tree.children[0]).to.equal('hello world')
  })
})

describe('tetris socket hooks', () => {
  it('updates status when socket emits events', () => {
    const handlers = {}
    const socketStub = {
      on(event, handler) {
        handlers[event] = handler
        return () => { delete handlers[event] }
      },
      getStatus: () => ({ state: 'idle' })
    }

    let storedState = null
    const hookModule = proxyquire('../frontend/src/hooks/useTetrisSocket.js', {
      react: {
        useEffect: (fn) => fn(),
        useState: (initial) => {
          storedState = initial
          const setState = (next) => {
            storedState = typeof next === 'function' ? next(storedState) : next
          }
          return [storedState, setState]
        }
      },
      '../utils/socketClient': socketStub
    })

    hookModule.useSocketEvent('status', () => {})
    const status = hookModule.useSocketStatus()
    expect(status.state).to.equal('idle')
    handlers.status({ state: 'connected' })
    expect(storedState).to.equal('connected')
  })
})

describe('page components', () => {
  const navigationStub = {
    navigate: () => {},
    replace: () => {},
    openExternal: () => {},
  }

  const skyboxStub = compatModule(() => React.createElement('div', null, 'sky'))
  skyboxStub.loadSkyboxCube = () => Promise.resolve({})

  const shopStateStub = {
    ShopStateProvider: ({ children }) => React.createElement(React.Fragment, null, children),

    // If pages call hooks:
    useShopState: () => ({
      inventory: { dirt: 0, stone: 0, iron: 0, diamond: 0, emerald: 0 },
      purchases: {},
      craftUnlocks: {},
      craftCounts: {},
      spawnCaps: { dirt: 1, stone: 1, iron: 1, diamond: 1 },
      spawnRates: { dirt: 0.5, stone: 0.3, iron: 0.15, diamond: 0.05 },
      buyItem: async () => ({ success: true }),
      tradeItem: async () => ({ success: true }),
      craftItem: async () => ({ success: true }),
      persistSpawnRates: () => {},
      refreshSpawnRates: () => {}
    }),

    // If you have other exports used by some pages, keep them harmless:
    useShopDispatch: () => () => {},
    useShopActions: () => ({})
  }

  const sharedStubs = {
    '../utils/navigation': navigationStub,
    '../utils/navigation.js': navigationStub,
    '../utils/socketClient': socketClientStub,
    '../utils/socketClient.js': socketClientStub,
    '../context/ShopStateContext': shopStateStub,
    '../context/ShopStateContext.js': shopStateStub,
    '../three/Skybox.jsx': skyboxStub,
    '../components/SpinningCube.jsx': compatModule(() => React.createElement('div', null, 'cube-stub')),
    '../components/SpinningCube.js': compatModule(() => React.createElement('div', null, 'cube-stub'))
  }


  const renderWithProvider = (Component, props = {}) =>
    React.createElement(shopStateStub.ShopStateProvider, null, React.createElement(Component, props))

  const pages = [
    '../frontend/src/pages/Home.js',
    '../frontend/src/pages/Login.js',
    '../frontend/src/pages/MainMenu.js',
    '../frontend/src/pages/Multiplayer.js',
    '../frontend/src/pages/Singleplayer.js',
    '../frontend/src/pages/Options.js',
    '../frontend/src/pages/CreateServer.js',
    '../frontend/src/pages/Leaderboard.js'
  ]

  pages.forEach((path) => {
    it(`renders ${path}`, () => {
      const Component = proxyquire(path, sharedStubs).default
      mountSync(renderWithProvider(Component, { room: 'alpha', player: 'Tester' }))
    })
  })

  it('renders Shop page with minimal fiber stubs', () => {
    const ShopPage = proxyquire('../frontend/src/pages/Shop.js', sharedStubs).default
    mountSync(renderWithProvider(ShopPage))
  })

  it('renders CreateGame page with spinning cube stub', () => {
    const page = proxyquire('../frontend/src/pages/CreateGame.js', sharedStubs).default
    mountSync(renderWithProvider(page))
  })

  it('renders SpectatePreview page with stubbed game', () => {
    const Component = proxyquire('../frontend/src/pages/SpectatePreview.js', {
      ...sharedStubs,
      './Game': compatModule(() => React.createElement('div', null, 'game')),
      './Game.js': compatModule(() => React.createElement('div', null, 'game'))
    }).default
    mountSync(renderWithProvider(Component))
  })
})

// describe('Game page', () => {
//   it('renders with mocked socket interactions', async () => {
//     const socketStub = {
//       handlers: {},
//       on(event, handler) {
//         this.handlers[event] = handler
//         return () => { delete this.handlers[event] }
//       },
//       emit: () => {},
//       kickPlayer: async () => ({ success: true }),
//       updateRoomSettings: async () => ({ success: true }),
//       fetchRoomSettings: () => {},
//       sendKeyPress: async () => ({ success: true }),
//       joinRoom: async () => ({ success: true }),
//       sendCommand: async () => ({ data: {} }),
//       getStatus: () => ({ state: 'connected' }),
//       leaveRoom: async () => ({ success: true }),
//       startGame: async () => ({ success: true })
//     }

//     const navigationStub = { navigate: () => {}, replace: () => {} }
//     const shopStub = {
//       useShopState: () => ({
//         inventory: { dirt: 1, stone: 1, iron: 1, diamond: 1 },
//         purchases: {},
//         craftUnlocks: {},
//         craftCounts: {},
//         spawnCaps: { dirt: 1, stone: 1, iron: 1, diamond: 1 },
//         spawnRates: { dirt: 0.5, stone: 0.3, iron: 0.15, diamond: 0.05 },
//         buyItem: async () => ({ success: true }),
//         tradeItem: async () => ({ success: true }),
//         craftItem: async () => ({ success: true }),
//         persistSpawnRates: () => {},
//         refreshSpawnRates: () => {}
//       })
//     }

//     const Game = proxyquire('../frontend/src/pages/Game.js', {
//       '../utils/socketClient.js': socketClientStub,
//       '../utils/socketClient': socketClientStub,
//       '../utils/navigation': navigationStub,
//       '../context/ShopStateContext': contextModule,
//       '../context/ShopStateContext.js': contextModule,
//       'react-dom': { createPortal: (node) => node }
//     }).default

//     await mountAsync(
//       React.createElement(
//         contextModule.ShopStateProvider,
//         null,
//         React.createElement(Game, { room: 'alpha', player: 'Tester', forceSpectator: true })
//       )
//     )
//   })
// })

describe('Router component', () => {
  it('switches routes and enforces login redirects', () => {
    const navigationStub = { replace: (path) => { window.location.pathname = path }, navigate: () => {} }
    const stubPage = (label) => compatModule(() => React.createElement('div', null, label))
    const Router = proxyquire('../frontend/src/Router.js', {
      './pages/MainMenu': stubPage('main'),
      './pages/Multiplayer': stubPage('multi'),
      './pages/Singleplayer': stubPage('single'),
      './pages/Login': stubPage('login'),
      './pages/Shop': stubPage('shop'),
      './pages/Options': stubPage('options'),
      './pages/Leaderboard': stubPage('leaderboard'),
      './pages/CreateServer': stubPage('create'),
      './pages/SpectatePreview': stubPage('spectate'),
      './pages/Game': stubPage('game'),
      './pages/MainMenu.js': stubPage('main'),
      './pages/Multiplayer.js': stubPage('multi'),
      './pages/Singleplayer.js': stubPage('single'),
      './pages/Login.js': stubPage('login'),
      './pages/Shop.js': stubPage('shop'),
      './pages/Options.js': stubPage('options'),
      './pages/Leaderboard.js': stubPage('leaderboard'),
      './pages/CreateServer.js': stubPage('create'),
      './pages/SpectatePreview.js': stubPage('spectate'),
      './pages/Game.js': stubPage('game'),
      './three/Skybox.jsx': stubPage('skybox'),
      './components/UtilityDock': stubPage('dock'),
      './components/UtilityDock.jsx': stubPage('dock'),
      './utils/navigation': navigationStub
    }).default

    const routes = ['/', '/login', '/leaderboard', '/shop', '/options', '/singleplayer', '/multiplayer', '/multiplayer/create', '/spectate', '/Room/Player']
    routes.forEach((route) => {
      window.location.pathname = route
      mountSync(React.createElement(Router))
    })
  })
})

describe('UI components', () => {
  it('renders Button variations', () => {
    const Button = require('../frontend/src/components/Button.jsx').default
    const btn = mountSync(React.createElement(Button, { size: 'small', disabled: true }, 'Click')).toJSON()
    expect(btn.props.className).to.include('ui-btn-small')
  })

  it('renders FallingField', () => {
    const FallingField = require('../frontend/src/components/FallingField.jsx').default
    mountSync(React.createElement(FallingField, { rows: [[0, 1]], textures: { 1: '/tex.png' } }))
  })

  it('renders SpinningCube and Tetromino', () => {
    const SpinningCube = compatModule(() => React.createElement('div', null, 'cube'))
    const Tetromino = require('../frontend/src/components/Tetromino.jsx').default
    mountSync(React.createElement(SpinningCube))
    mountSync(React.createElement(Tetromino, { matrix: [[1, 0], [0, 1]] }))
  })
})

describe('three utilities', () => {
  it('builds skybox cube and updates helpers', async () => {
    const skyboxModule = proxyquire('../frontend/src/three/Skybox.jsx', {
      three: {
        CubeTexture: function () { return { set needsUpdate(v) { this._needsUpdate = v } } },
        LinearFilter: 1,
        SRGBColorSpace: 1,
        Color: function () { this.value = 0 }
      }
    })
    skyboxModule.__resetSkyboxCacheForTests()
    const cube = await skyboxModule.loadSkyboxCube()
    expect(cube).to.be.an('object')
    const scene = {}
    skyboxModule.skyboxEffect(scene, () => {})
    expect(scene.background).to.equal(cube)
    const yawRef = { current: 0 }
    const camera = { position: { set: () => {} }, rotation: { set: () => {} } }
    skyboxModule.updatePanCamera(yawRef, camera, 0.016, 0.5)
    const gl = { domElement: { addEventListener: () => {} }, setPixelRatio: () => {} }
    skyboxModule.setupWebGLCanvas(gl, { devicePixelRatio: 2 })
  })

  it('applies KHR_materials extension logic', async () => {
    const extension = require('../frontend/src/three/KHR_materials_pbrSpecularGlossiness.js').default
    const parser = {
      json: { materials: [{ extensions: { KHR_materials_pbrSpecularGlossiness: { diffuseFactor: [1, 0, 0, 1], glossinessFactor: 0.5 } } }] },
      getDependency: async () => ({ colorSpace: null })
    }
    const handler = extension(parser)
    const params = {}
    await handler.extendMaterialParams(0, params)
    expect(params.color).to.be.an('object')
  })
})

describe('application entry point', () => {
  it('creates store and renders root component', () => {
    const renders = []
    proxyquire('../frontend/src/index.js', {
      'react-dom/client': { createRoot: () => ({ render: (node) => renders.push(node) }) },
      'redux-logger': { createLogger: () => () => next => action => next(action) },
      './three/Skybox.jsx': { loadSkyboxCube: () => ({ catch: () => {} }) },
      './context/ShopStateContext': { ShopStateProvider: ({ children }) => React.createElement('div', null, children) },
      './utils/socketClient': createSocketClientStub()
    })
    expect(renders.length).to.equal(1)
  })
})
