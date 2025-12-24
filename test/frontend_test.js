import './setup'
import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
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

const renderInDom = (node) => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = ReactDOM.createRoot(container)
  root.render(node)
  return { root, container }
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

const tutorialComponents = require('../frontend/src/components/TutorialOverlays.jsx')
const { TutorialOverlay, TutorialHighlightOverlay } = tutorialComponents

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

  it('renders SpectatePreview page with stubbed game', () => {
    const Component = proxyquire('../frontend/src/pages/SpectatePreview.js', {
      ...sharedStubs,
      './Game': compatModule(() => React.createElement('div', null, 'game')),
      './Game.js': compatModule(() => React.createElement('div', null, 'game'))
    }).default
    mountSync(renderWithProvider(Component))
  })
})

const flattenNodeText = (value) => {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(flattenNodeText).join('')
  return flattenNodeText(value.children || value.props?.children)
}

const getTextFromNode = (node) => flattenNodeText(node?.children || node?.props?.children)

const createSingleplayerModule = (historyEntries = []) => {
  const username = 'Tester'
  const navigationStub = {
    navigateCalls: [],
    replace: () => {}
  }
  navigationStub.navigate = (path) => navigationStub.navigateCalls.push(path)
  const socketClientStub = {
    fetchPlayerHistory: async () => ({ data: { history: historyEntries } })
  }
  const storageStub = { getLocalStorageItem: () => username }
  const shopLogicStub = {
    getResourceIcon: () => '/icons/default.png',
    getResourceName: (id) => `${id}`,
    formatNumber: (value = 0) => String(value)
  }
  const modulePath = require.resolve('../frontend/src/pages/Singleplayer.js')
  delete require.cache[modulePath]
  const module = proxyquire('../frontend/src/pages/Singleplayer.js', {
    '../utils/storage': storageStub,
    '../utils/storage.js': storageStub,
    '../utils/navigation': navigationStub,
    '../utils/navigation.js': navigationStub,
    '../utils/socketClient': socketClientStub,
    '../utils/socketClient.js': socketClientStub,
    '../utils/shopLogic': shopLogicStub,
    '../utils/shopLogic.js': shopLogicStub,
  })
  return { module, navigationStub, socketClientStub, username }
}

const loadShopModule = (dataOverrides = {}, logicOverrides = {}) => {
  const defaults = {
    SHOP_ITEMS: [],
    TRADE_ITEMS: [],
    CRAFT_ITEMS: [],
    RESOURCE_ICONS: { emerald: '/ui/Emerald.png' },
    formatResourceId: (value) => value,
  }
  const shopDataStub = { ...defaults, ...dataOverrides }
  const logicDefaults = {
    RESOURCE_ICONS: shopDataStub.RESOURCE_ICONS,
    getResourceIcon: (id) => `/icons/${id}.png`,
    getResourceName: (id) => `${id}`,
    formatNumber: (value = 0) => String(value),
    computeShopPrice: () => 10,
    describeEffect: () => ({ current: 'current', next: 'next' }),
    computeMaxTimes: () => 0,
    hasTradeRequirements: () => true,
    applyTradeMultipliers: (trade) => trade,
    computeTradeMultipliers: () => ({}),
    canCraft: () => true,
    describeCraftEffects: () => ['effect'],
    computeShopReduction: () => 0,
  }
  const shopLogicStub = { ...logicDefaults, ...logicOverrides }
  const modulePath = require.resolve('../frontend/src/pages/Shop.js')
  delete require.cache[modulePath]
  const module = proxyquire('../frontend/src/pages/Shop.js', {
    '../utils/shopData': shopDataStub,
    '../utils/shopData.js': shopDataStub,
    '../utils/shopLogic': shopLogicStub,
    '../utils/shopLogic.js': shopLogicStub,
  })
  return { module, shopDataStub, shopLogicStub }
}

describe('Singleplayer page behavior', () => {
  const historyEntry = {
    id: 'game-1',
    room_name: 'Room of Fire',
    gamemode: 'Singleplayer',
    started_at: '2024-01-01T10:00:00Z',
    ended_at: '2024-01-01T10:03:30Z',
    resources: { Tester: { dirt: 8, stone: 4, iron: 2, diamond: 1 } },
    boards: { Tester: { Board: [[1, 0], [0, 1]] } },
    players: [{ name: 'Tester' }]
  }

  it('loads history and shows the modal when View Game is clicked', async () => {
    const { module } = createSingleplayerModule([historyEntry])
    const Singleplayer = module.default
    const renderer = await mountAsync(React.createElement(Singleplayer))
    await act(async () => { await flush() })
    const nameNodes = renderer.root.findAll((node) => node.props.className === 'mp-name')
    const hasHistory = nameNodes.some((node) => getTextFromNode(node).includes('Room of Fire'))
    expect(hasHistory).to.be.true
    const viewButton = renderer.root.find((node) => node.type === 'button' && node.props.children === 'View Game')
    await act(async () => {
      viewButton.props.onClick()
      await flush()
    })
    expect(renderer.root.findAll((node) => node.props.className === 'game-modal')).to.have.length(1)
    const closeButton = renderer.root.find((node) => node.type === 'button' && node.props.children === 'Close')
    await act(async () => {
      closeButton.props.onClick()
      await flush()
    })
    expect(renderer.root.findAll((node) => node.props.className === 'game-modal')).to.have.length(0)
  })

  it('navigates to the creation route using the cached username', async () => {
    const { module, navigationStub, username } = createSingleplayerModule([historyEntry])
    const Singleplayer = module.default
    const renderer = await mountAsync(React.createElement(Singleplayer))
    await act(async () => { await flush() })
    const createButton = renderer.root.find((node) => node.type === 'button' && node.props.children === 'Create New Game')
    await act(async () => {
      createButton.props.onClick()
      await flush()
    })
    const expected = `/${encodeURIComponent(username)}_singleplayer/${encodeURIComponent(username)}?gamemode=singleplayer`
    expect(navigationStub.navigateCalls).to.include(expected)
  })
})

describe('Shop helper components', () => {
  it('shows the upgrade placeholder when no shop items exist', () => {
    const { module } = loadShopModule({ SHOP_ITEMS: [] })
    const renderer = mountSync(React.createElement(module.ShopList, {
      inv: {},
      purchases: {},
      craftCounts: {},
      reduction: 0,
      onBuy: () => {},
      onDeny: () => {}
    }))
    const emptyNode = renderer.root.find((node) => node.props.className === 'shop-empty')
    expect(getTextFromNode(emptyNode)).to.equal('No shop upgrades configured.')
  })

  it('disables buys when the player lacks resources and calls onDeny shields', () => {
    const { module } = loadShopModule({
      SHOP_ITEMS: [{ id: 'dirt', name: 'Dirt Upgrade', resource_cost: 'dirt', max_level: 2 }]
    })
    const denials = []
    const renderer = mountSync(React.createElement(module.ShopList, {
      inv: { dirt: 0 },
      purchases: {},
      craftCounts: {},
      reduction: 0,
      onBuy: () => { throw new Error('should not buy') },
      onDeny: () => denials.push('deny')
    }))
    const buyButton = renderer.root.find((node) => node.type === 'button' && node.props.children === 'Buy')
    expect(buyButton.props.disabled).to.be.true
    const shield = renderer.root.findAll((node) => node.props.className === 'shop-btn-shield')[0]
    act(() => { shield.props.onClick() })
    expect(denials).to.have.lengthOf(1)
  })

  it('renders the trade placeholder when no trades are available', () => {
    const { module } = loadShopModule({ TRADE_ITEMS: [] })
    const renderer = mountSync(React.createElement(module.TradeList, {
      inv: {},
      craftCounts: {},
      onTrade: () => {},
      onDeny: () => {}
    }))
    const emptyNode = renderer.root.find((node) => node.props.className === 'shop-empty')
    expect(getTextFromNode(emptyNode)).to.equal('Craft special items to unlock more trades.')
  })

  it('renders a disabled trade card when costs cannot be met', () => {
    const { module } = loadShopModule({
      TRADE_ITEMS: [{ id: 'trade', cost: { dirt: 1 }, give: { stone: 1 } }]
    }, {
      computeMaxTimes: () => 0,
      hasTradeRequirements: () => true
    })
    const denials = []
    const renderer = mountSync(React.createElement(module.TradeList, {
      inv: { dirt: 0 },
      craftCounts: {},
      onTrade: () => { throw new Error('should not trade') },
      onDeny: () => denials.push('trade-denied')
    }))
    const tradeButtons = renderer.root.findAll((node) => node.type === 'button' && node.props.children === 'Trade')
    expect(tradeButtons[0].props.disabled).to.be.true
    const shield = renderer.root.findAll((node) => node.props.className === 'shop-btn-shield')[0]
    act(() => { shield.props.onClick() })
    expect(denials).to.have.length.greaterThan(0)
  })

  it('shows the craft placeholder when no crafts are configured', () => {
    const { module } = loadShopModule({ CRAFT_ITEMS: [] })
    const renderer = mountSync(React.createElement(module.CraftList, {
      inv: {},
      unlocks: {},
      craftCounts: {},
      onCraft: () => {},
      onDeny: () => {}
    }))
    const emptyNode = renderer.root.find((node) => node.props.className === 'shop-empty')
    expect(getTextFromNode(emptyNode)).to.equal('Earn more resources to discover new crafts.')
  })

  it('renders a disabled craft card when resources are missing', () => {
    const { module } = loadShopModule({
      CRAFT_ITEMS: [{
        id: 'craft',
        name: 'Craft 1',
        cost: { dirt: 1 },
        outputs: { stone: 1 },
        max_crafts: 1
      }]
    }, {
      canCraft: () => false,
      describeCraftEffects: (craft) => [`${craft.name}-effect`]
    })
    const denials = []
    const renderer = mountSync(React.createElement(module.CraftList, {
      inv: { dirt: 0 },
      unlocks: { craft: true },
      craftCounts: {},
      onCraft: () => { throw new Error('should not craft') },
      onDeny: () => denials.push('craft-denied')
    }))
    const craftButton = renderer.root.find((node) => node.type === 'button' && getTextFromNode(node) === 'Craft')
    expect(craftButton.props.disabled).to.be.true
    const shield = renderer.root.find((node) => node.props.className === 'shop-btn-shield')
    act(() => { shield.props.onClick() })
    expect(denials).to.have.lengthOf(1)
  })

  it('renders resource chips with icon and label text', () => {
    const { module } = loadShopModule()
    const chip = mountSync(React.createElement(module.ResourceChip, { resourceId: 'dirt', amount: 3 }))
    const chipSpan = chip.root.find((node) => node.type === 'span')
    expect(chipSpan.props.className).to.include('shop-chip-text')
    const textNode = Array.isArray(chipSpan.props.children)
      ? chipSpan.props.children.find((child) => typeof child === 'string')
      : ''
    expect(textNode).to.equal('3 dirt')
  })
})

describe('Game page', () => {
  it('renders with mocked socket interactions', async () => {
    const socketStub = {
      handlers: {},
      on(event, handler) {
        this.handlers[event] = handler
        return () => { delete this.handlers[event] }
      },
      emit: () => {},
      kickPlayer: async () => ({ success: true }),
      updateRoomSettings: async () => ({ success: true }),
      fetchRoomSettings: () => {},
      sendKeyPress: async () => ({ success: true }),
      joinRoom: async () => ({ success: true }),
      sendCommand: async () => ({ data: {} }),
      getStatus: () => ({ state: 'connected' }),
      leaveRoom: async () => ({ success: true }),
      startGame: async () => ({ success: true })
    }

    const navigationStub = { navigate: () => {}, replace: () => {} }
    const shopStub = {
      useShopState: () => ({
        inventory: { dirt: 1, stone: 1, iron: 1, diamond: 1 },
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
      })
    }

    const Game = proxyquire('../frontend/src/pages/Game.js', {
      '../utils/socketClient.js': socketClientStub,
      '../utils/socketClient': socketClientStub,
      '../utils/navigation': navigationStub,
      '../context/ShopStateContext': contextModule,
      '../context/ShopStateContext.js': contextModule,
      'react-dom': { createPortal: (node) => node }
    }).default

    await mountAsync(
      React.createElement(
        contextModule.ShopStateProvider,
        null,
        React.createElement(Game, { room: 'alpha', player: 'Tester', forceSpectator: true })
      )
    )
  })

  it('responds to player socket events', async () => {
    window.localStorage.setItem('username', 'Tester')
    window.sessionStorage.clear()
    const navigationCalls = []
    const navigationStub = {
      navigate(path) {
        navigationCalls.push(path)
      },
      replace: () => {}
    }
    const timers = []
    const originalSetTimeout = global.setTimeout
    global.setTimeout = (fn, delay, ...args) => {
      const id = originalSetTimeout(fn, 0, ...args)
      timers.push(id)
      return id
    }
    const Game = proxyquire('../frontend/src/pages/Game.js', {
      '../utils/socketClient.js': socketClientStub,
      '../utils/socketClient': socketClientStub,
      '../utils/navigation': navigationStub,
      '../context/ShopStateContext': contextModule,
      '../context/ShopStateContext.js': contextModule,
      'react-dom': { createPortal: (node) => node }
    }).default

    try {
      await mountAsync(
        React.createElement(
          contextModule.ShopStateProvider,
          null,
          React.createElement(Game, { room: 'alpha', player: 'Tester', forceSpectator: false })
        )
      )

      const triggerEvent = async (name, payload) => {
        const handler = socketClientStub.handlers[name]
        if (typeof handler !== 'function') return
        await act(async () => {
          handler(payload)
        })
        await flush()
      }

      await triggerEvent('room_settings', { data: { gamemode: 'singleplayer', player_limit: 5, success: false, error: 'oops' } })
      await triggerEvent('player_list', { players: [{ name: 'Tester', status: 'playing', host: true }] })
      await triggerEvent('room_boards', {
        Board: [[0, 0, 0], [0, 1, 0]],
        player_name: 'Tester',
        CurrentPiece: { shape: [[1]], pos: [0, 0], material: 2 },
        NextPiece: { Shape: [[1, 1], [1, 1]] },
        fortuneMultiplier: 2,
        resources_total: [5, 3, 2, 1],
        resources_awarded: [1, 0, 1, 0],
        line_multiplier: 2,
        line_bonus_total: [1, 0, 0, 0],
        Opponents: [{ name: 'Other', spectrum: [1, 2, 3, 4] }]
      })
      await triggerEvent('player_list', { players: [{ name: 'Tester', status: 'spectating', host: false }] })
      await triggerEvent('room_boards', {
        board: [[1]],
        playerName: 'Tester',
        currentPiece: { shape: [], pos: [0, 0], material: 1 },
        nextPiece: { shape: [] },
        opponents: { leader: { name: 'Leader', spectrum: { 0: 2, 1: 3 } } },
        resources_total: [2, 2, 2, 2],
        fortune_multiplier: 1.2,
        line_multiplier: 1
      })
      await triggerEvent('game_start', { data: { starting_time: Date.now() } })
      await triggerEvent('player_eliminated', { player_name: 'Tester' })
      await triggerEvent('game_end', { data: { winner: 'Tester' } })
      await triggerEvent('player_kick', { data: { success: true, player_name: 'Tester', kicked_by: 'Admin', room: 'alpha' } })

      expect(navigationCalls).to.include('/')
      expect(window.sessionStorage.getItem('kick.notice')).to.include('kicked')
    } finally {
      global.setTimeout = originalSetTimeout
      timers.forEach(clearTimeout)
      window.localStorage.removeItem('username')
    }
  })

  it('runs cleared block animations against DOM refs', async () => {
    const navigationStub = { navigate: () => {}, replace: () => {} }
    const Game = proxyquire('../frontend/src/pages/Game.js', {
      '../utils/socketClient.js': socketClientStub,
      '../utils/socketClient': socketClientStub,
      '../utils/navigation': navigationStub,
      '../context/ShopStateContext': contextModule,
      '../context/ShopStateContext.js': contextModule,
      'react-dom': { createPortal: (node) => node }
    }).default

    const inventoryPanel = document.createElement('div')
    inventoryPanel.className = 'utility-panel-inventory'
    const icon = document.createElement('img')
    icon.setAttribute('alt', 'Inventory')
    inventoryPanel.appendChild(icon)
    document.body.appendChild(inventoryPanel)

    const originalAudio = global.Audio
    global.Audio = class {
      constructor() {}
      play() {}
    }

    const { root, container } = renderInDom(
      React.createElement(
        contextModule.ShopStateProvider,
        null,
        React.createElement(Game, { room: 'alpha', player: 'Tester', forceSpectator: false })
      )
    )

    const triggerEvent = async (name, payload) => {
      const handler = socketClientStub.handlers[name]
      if (typeof handler !== 'function') return
      await act(async () => {
        handler(payload)
      })
      await flush()
    }

    try {
      await triggerEvent('player_list', { players: [{ name: 'Tester', status: 'playing', host: true }] })
      await triggerEvent('cleared_blocks', {
        player_name: 'Tester',
        blocks: [
          { Material: 2, position: { x: 1, y: 1 } },
          { Material: 1, position: { x: 0, y: 0 } }
        ],
        line_multiplier: 2.5,
        line_bonus_total: [1, 0, 0, 0],
        resources_total: [2, 2, 0, 0],
        resources_awarded: [1, 0, 0, 0]
      })
    } finally {
      global.Audio = originalAudio
      root.unmount()
      container.remove()
      inventoryPanel.remove()
    }
  })
})

describe('CreateServer page interactions', () => {
  const createComponent = (navigationStub, storageVal = 'Tester') => {
    const createServer = proxyquire('../frontend/src/pages/CreateServer.js', {
      '../utils/storage': { getLocalStorageItem: () => storageVal },
      '../utils/navigation': navigationStub
    }).default
    const renderer = mountSync(React.createElement(createServer))
    return renderer
  }

  it('cycles modes and toggles the help panel', () => {
    window.location.search = '?gamemode=multiplayer_coop'
    const navigationStub = { navigate: () => {}, replace: () => {} }
    const renderer = createComponent(navigationStub, 'Tester')
    const modeButton = renderer.root.find((node) => node.props.className === 'srv-mode-btn')
    const modeLabel = renderer.root.find((node) => node.props.className?.startsWith('mp-mode') && typeof node.props.children === 'string')
    const initialLabel = modeLabel.props.children
    modeButton.props.onClick()
    expect(modeLabel.props.children).to.not.equal(initialLabel)
    const helpBtn = renderer.root.find((node) => node.props.className === 'srv-mode-help-btn')
    helpBtn.props.onClick()
  })

  it('navigates to the encoded server URL', () => {
    window.location.search = ''
    window.localStorage.setItem('username', 'Tester')
    const navigationCalls = []
    const navigationStub = {
      navigate(path) {
        navigationCalls.push(path)
      },
      replace: () => {}
    }
    const renderer = createComponent(navigationStub, 'Tester')
    const input = renderer.root.find((node) => node.props.id === 'serverName')
    input.props.onChange({ target: { value: 'Fun Server' } })
    const createBtn = renderer.root.findAll((node) => node.type === 'button' && node.props.children && node.props.children.includes('Create Server'))[0]
    createBtn.props.onClick()
    expect(navigationCalls[0]).to.include('Fun%20Server')
    expect(navigationCalls[0]).to.include('Tester')
  })
})

describe('socket client utils', () => {
  const createFakeSocket = () => {
    const handlers = {}
    const anyHandlers = []
    return {
      connected: true,
      lastEmit: null,
      on(event, handler) {
        handlers[event] = handler
        if (event === 'connect') {
          handler()
        }
      },
      onAny(handler) {
        anyHandlers.push(handler)
      },
      emit(event, payload, cb) {
        this.lastEmit = { event, payload }
        if (cb) {
          cb({ ok: true, event, data: payload })
        }
      },
      removeAllListeners() {
        Object.keys(handlers).forEach((key) => delete handlers[key])
      },
      disconnect() {
        this.connected = false
      },
      trigger(event, payload) {
        const handler = handlers[event]
        if (typeof handler === 'function') handler(payload)
        anyHandlers.forEach((fn) => fn(event, payload))
      }
    }
  }

  const loadSocketClient = () => {
    const fakeSocket = createFakeSocket()
    const module = proxyquire('../frontend/src/utils/socketClient.js', {
      'socket.io-client': { io: () => fakeSocket }
    })
    return { client: module.default, socket: fakeSocket }
  }

  afterEach(() => {
    delete window.tetrisSocket
  })

  it('parses incoming event payloads and emits message notifications', () => {
    const { client, socket } = loadSocketClient()
    expect(() => {
      socket.trigger('room_boards', {
        Board: [[0, 1], [1, 0]],
        player_name: 'Tester',
        CurrentPiece: { shape: [[1]], pos: [0, 0], material: 2 },
        NextPiece: { Shape: [[1, 1]] },
        fortuneMultiplier: 2,
        Opponents: [{ name: 'Side', spectrum: [1, 2] }]
      })
      socket.trigger('player_list', [{ name: 'Tester' }])
      socket.trigger('room_list', { rooms: ['alpha'] })
      socket.trigger('lobby_rooms', { rooms: ['beta'] })
      socket.trigger('room_settings', { gamemode: 'pvp', room_gamemode: 'coop', player_limit: 5 })
      socket.trigger('game_history', { games: [1, 2, 3] })
      socket.trigger('get_history_by_player_name', { history: [{ id: 1 }] })
    }).to.not.throw()
    client.disconnect()
  })

  it('normalizes sendCommand responses', async () => {
    const { client, socket } = loadSocketClient()
    const response = await client.sendCommand('join_room', { room: 'alpha' }, { expectEvent: 'room_list_response' })
    expect(response.event).to.equal('join_room')
    expect(response.raw.ok).to.equal(true)
    expect(response.data.room).to.equal('alpha')
    client.disconnect()
  })
})

describe('Leaderboard interactions', () => {
  it('loads data, filters entries, and responds to UI controls', async () => {
    const leaderboardUsers = [
      {
        player_name: 'Alpha',
        dirt_owned: 5,
        stone_owned: 2,
        dirt_collected: 8,
        time_played: 90_000,
      },
      {
        player_name: 'Beta',
        dirt_owned: 2,
        stone_owned: 6,
        stone_collected: 7,
        time_played: 120_000,
      }
    ]

    const navigationCalls = []
    const sendCommands = []
    const LeaderboardModule = proxyquire('../frontend/src/pages/Leaderboard.js', {
      '../utils/navigation': { navigate: (path) => navigationCalls.push(path) },
      '../utils/navigation.js': { navigate: () => {}, replace: () => {} },
      '../utils/socketClient': {
        sendCommand: async (event) => {
          sendCommands.push(event)
          if (event === 'get_all_users') {
            return { data: { users_list: leaderboardUsers } }
          }
          return { data: {} }
        }
      },
      '../utils/storage': { getLocalStorageItem: () => 'Tester' }
    })

    const Leaderboard = LeaderboardModule.default || LeaderboardModule
    let root = null
    let container = null
    await act(async () => {
      const rendered = renderInDom(React.createElement(Leaderboard))
      root = rendered.root
      container = rendered.container
      await flush()
    })

    const searchInput = container.querySelector('.lb-search')
    expect(searchInput).to.exist

    await act(async () => {
      searchInput.value = 'Beta'
      searchInput.dispatchEvent(new Event('input', { bubbles: true }))
      await flush()
      const tableBody = container.querySelector('.lb-table-body')
      if (tableBody && typeof tableBody.scrollTo !== 'function') {
        tableBody.scrollTo = () => {}
      }
      const enterEvent = new Event('keydown', { bubbles: true })
      enterEvent.key = 'Enter'
      searchInput.dispatchEvent(enterEvent)
      await flush()
    })

    const dropdownButton = container.querySelector('.lb-dd-button')
    expect(dropdownButton).to.exist

    await act(async () => {
      dropdownButton.click()
      await flush()
    })

    const stoneOption = Array.from(container.querySelectorAll('.lb-dd-item')).find((item) => item.textContent.includes('Stone'))
    expect(stoneOption).to.exist

    await act(async () => {
      stoneOption.click()
      await flush()
    })

    const rows = container.querySelectorAll('.lb-row')
    expect(rows.length).to.equal(leaderboardUsers.length)
    expect(sendCommands).to.include('get_all_users')


    const backButton = container.querySelector('.ui-btn-slim')
    expect(backButton).to.exist
    await act(async () => {
      backButton.click()
      await flush()
    })

    root.unmount()
    container.remove()
  })
})

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
  const stubMathRandom = (fn) => {
    const original = Math.random
    Math.random = fn
    return () => { Math.random = original }
  }

  const stubAnimationFrame = () => {
    const globalRef = typeof globalThis !== 'undefined'
      ? globalThis
      : (typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : {}))
    const originalRaf = globalRef.requestAnimationFrame
    const originalCancel = globalRef.cancelAnimationFrame
    globalRef.requestAnimationFrame = () => 1
    globalRef.cancelAnimationFrame = () => {}
    return () => {
      globalRef.requestAnimationFrame = originalRaf
      globalRef.cancelAnimationFrame = originalCancel
    }
  }

  const buildBounds = (left, right, height = 400) => ({
    left,
    right,
    width: right - left,
    height,
  })

  it('renders Button variations', () => {
    const Button = require('../frontend/src/components/Button.jsx').default
    const btn = mountSync(React.createElement(Button, { size: 'small', disabled: true }, 'Click')).toJSON()
    expect(btn.props.className).to.include('ui-btn-small')
  })

  it('renders FallingField', () => {
    const FallingField = require('../frontend/src/components/FallingField.jsx').default
    mountSync(React.createElement(FallingField, { rows: [[0, 1]], textures: { 1: '/tex.png' } }))
  })

  it('anchors falling blocks inside the left lane when targeting an element', async () => {
    const containerBounds = buildBounds(0, 320)
    const targetBounds = buildBounds(120, 220)
    const containerRef = { current: { getBoundingClientRect: () => containerBounds } }
    const targetRef = { current: { getBoundingClientRect: () => targetBounds } }
    const expectedLaneStart = containerBounds.left
    const FallingField = require('../frontend/src/components/FallingField.jsx').default
    const restoreRandom = stubMathRandom(() => 0)
    const restoreRaf = stubAnimationFrame()
    try {
      const renderer = await mountAsync(React.createElement(FallingField, { side: 'left', containerRef, targetRef }))
      const laneItems = renderer.root.findAll((node) => node.props.className === 'mp-fall-item')
      expect(laneItems).to.have.length.greaterThan(0)
      expect(laneItems.every((item) => item.props.style.left === expectedLaneStart)).to.be.true
    } finally {
      restoreRandom()
      restoreRaf()
    }
  })

  it('aligns pieces with the right lane and forwards block props', async () => {
    const containerBounds = buildBounds(0, 400)
    const targetBounds = buildBounds(150, 320)
    const containerRef = { current: { getBoundingClientRect: () => containerBounds } }
    const targetRef = { current: { getBoundingClientRect: () => targetBounds } }
    const laneWidth = Math.max(0, containerBounds.right - targetBounds.right)
    const expectedLaneStart = containerBounds.width - laneWidth
    const FallingField = require('../frontend/src/components/FallingField.jsx').default
    const Tetromino = require('../frontend/src/components/Tetromino.jsx').default
    const restoreRandom = stubMathRandom(() => 0)
    const restoreRaf = stubAnimationFrame()
    try {
      const renderer = await mountAsync(React.createElement(FallingField, { side: 'right', containerRef, targetRef }))
      const laneItems = renderer.root.findAll((node) => node.props.className === 'mp-fall-item')
      expect(laneItems).to.have.length.greaterThan(0)
      expect(laneItems.every((item) => item.props.style.left === expectedLaneStart)).to.be.true
      expect(laneItems[0].props.style.filter).to.equal('brightness(0.6)')
      const tetrominoInstances = renderer.root.findAllByType(Tetromino)
      expect(tetrominoInstances).to.have.length.greaterThan(0)
      const tetrominoProps = tetrominoInstances[0].props
      expect(tetrominoProps).to.include({
        type: 'I',
        texture: '/blocks/Dirt.jpg',
        rotation: 0,
        size: 16,
      })
    } finally {
      restoreRandom()
      restoreRaf()
    }
  })

  it('renders Tetromino', () => {
    const Tetromino = require('../frontend/src/components/Tetromino.jsx').default
    mountSync(React.createElement(Tetromino, { matrix: [[1, 0], [0, 1]] }))
  })
})

describe('UtilityDock component', () => {
  const storageKey = 'utilityDock.activeTab'
  const storageData = {}
  const localStorageStub = {
    getItem: (key) => storageData[key] ?? null,
    setItem: (key, value) => { storageData[key] = value },
    removeItem: (key) => { delete storageData[key] }
  }

  before(() => {
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'localStorage', { value: localStorageStub, configurable: true })
    }
  })

  beforeEach(() => {
    Object.keys(storageData).forEach((key) => { delete storageData[key] })
  })

  // it('cycles tabs, adjusts spawn rates, and renders stats', async () => {
  //   const spawnConfigStub = {
  //     adjustSpawnRates: (prev, caps, key, value) => {
  //       const next = { ...prev, [key]: Number(value) }
  //       const total = Object.values(next).reduce((sum, v) => sum + (Number(v) || 0), 0)
  //       if (!total) return next
  //       return Object.fromEntries(Object.keys(next).map((k) => [k, Number(next[k] || 0) / total]))
  //     },
  //     balanceSpawnRates: (prev) => {
  //       const keys = Object.keys(prev)
  //       if (!keys.length) return prev
  //       const share = 1 / keys.length
  //       return Object.fromEntries(keys.map((k) => [k, share]))
  //     },
  //     sumSpawnRates: (rates) => Object.values(rates).reduce((sum, v) => sum + (Number(v) || 0), 0),
  //     SPAWN_MATERIALS: [
  //       { key: 'dirt', label: 'Dirt', texture: '/blocks/Dirt.jpg' },
  //       { key: 'stone', label: 'Stone', texture: '/blocks/Stone.jpeg' },
  //     ],
  //     sanitizeSpawnRates: (rates) => Object.fromEntries(Object.entries(rates).map(([key, value]) => [key, Number(value) || 0])),
  //     SPAWN_CAP_DEFAULTS: { dirt: 0.6, stone: 0.4 }
  //   }
  //   const shopLogicStub = {
  //     RESOURCE_ICONS: { emerald: '/icons/emerald.png', default: '/icons/default.png' },
  //     getResourceIcon: (id) => `/icons/${id}.png`,
  //     getResourceName: (id) => (id ? `${id.charAt(0).toUpperCase()}${id.slice(1)}` : ''),
  //     formatNumber: (value = 0) => String(Math.max(0, Number(value) || 0)),
  //     describeCraftEffects: (craft) => craft ? [`${craft.id}-effect`] : [],
  //     computeShopReduction: () => 0.25
  //   }
  //   const shopDataStub = {
  //     RESOURCES: [
  //       { id: 'emerald' },
  //       { id: 'dirt' },
  //       { id: 'stone' },
  //       { id: 'iron' },
  //       { id: 'diamond' }
  //     ],
  //     SHOP_ITEMS: [
  //       { id: 'fortune_up', effect_type: 'fortune_multiplier', effect_per_level: 0.1, effect_growth_multiplier: 1 },
  //       { id: 'line_bonus', effect_type: 'line_break_bonus', effect_base: 1, effect_growth_multiplier: 1.2, affects: 'dirt' }
  //     ],
  //     CRAFT_ITEMS: [
  //       { id: 'craft_dirt', outputs: { dirt: 2 }, effects: { fortune_multiplier_percent: 1 } }
  //     ],
  //     formatResourceId: (key) => key
  //   }
  //   const sharedShopState = {
  //     inventory: { emerald: 3, dirt: 5, stone: 2, iron: 1, diamond: 1, craft_dirt: 1 },
  //     spawnCaps: { dirt: 0.8, stone: 0.5 },
  //     purchases: { fortune_up: 2, line_bonus: 1 },
  //     craftCounts: { craft_dirt: 1 },
  //     spawnRates: { dirt: 0.65, stone: 0.35 },
  //     persistSpawnRates: async () => ({ success: true })
  //   }
  //   const shopStateStub = {
  //     useShopState: () => sharedShopState
  //   }

  //   const dockModule = proxyquire('../frontend/src/components/UtilityDock.jsx', {
  //     '../utils/spawnConfig': spawnConfigStub,
  //     '../utils/shopLogic': shopLogicStub,
  //     '../utils/shopData': shopDataStub,
  //     '../context/ShopStateContext': shopStateStub
  //   })
  //   const UtilityDock = dockModule.default || dockModule
  //   const renderer = mountSync(React.createElement(UtilityDock))

  //   const iconButtons = renderer.root.findAll((node) => node.props.className?.includes('shop-utility-button'))
  //   await act(async () => {
  //     iconButtons[0].props.onClick()
  //     await flush()
  //   })
  //   expect(storageData[storageKey]).to.equal('inventory')

  //   await act(async () => {
  //     iconButtons[1].props.onClick()
  //     await flush()
  //   })
  //   expect(storageData[storageKey]).to.equal('spawn')

  //   const rangeInput = renderer.root.find((node) => node.type === 'input' && node.props.type === 'range')
  //   await act(async () => {
  //     rangeInput.props.onChange({ target: { value: '0.2' } })
  //     await flush()
  //   })

  //   await act(async () => {
  //     iconButtons[2].props.onClick()
  //     await flush()
  //   })
  //   const statsTitle = renderer.root.find((node) => node.props.className === 'shop-panel-title')
  //   expect(statsTitle.props.children).to.equal('Statistics')
  // })
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

describe('tutorial overlays', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the modal overlay and forwards actions', async () => {
    const nextCalls = []
    const skipCalls = []
    const { root: overlayRoot } = renderInDom(
      React.createElement(TutorialOverlay, {
        stepNumber: 4,
        title: 'Guided step',
        message: 'Follow the story',
        nextLabel: 'Forward',
        onNext: () => nextCalls.push('next'),
        onSkip: () => skipCalls.push('skip'),
      })
    )
    await act(async () => {
      await flush()
    })

    const nextButton = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent.trim() === 'Forward'
    )
    expect(nextButton).to.exist
    await act(async () => {
      nextButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await flush()
    })

    const skipButton = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent.includes('Skip Tutorial')
    )
    expect(skipButton).to.exist
    await act(async () => {
      skipButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(nextCalls).to.have.lengthOf(1)
    expect(skipCalls).to.have.lengthOf(1)
    overlayRoot.unmount()
  })

  it('renders the highlight overlay for an anchor and handles next', async () => {
    const anchor = document.createElement('div')
    anchor.className = 'highlight-anchor'
    document.body.appendChild(anchor)
    anchor.getBoundingClientRect = () => ({
      left: 320,
      top: 180,
      width: 120,
      height: 56,
      right: 440,
      bottom: 236,
    })

    const nextCalls = []
    const { root: highlightRoot } = renderInDom(
      React.createElement(TutorialHighlightOverlay, {
        stepNumber: 6,
        anchorSelector: '.highlight-anchor',
        title: 'Anchor tip',
        message: 'Click the highlighted area',
        onNext: () => nextCalls.push('next'),
        onSkip: () => {},
      })
    )
    await act(async () => {
      await flush()
    })

    const tooltip = Array.from(document.body.querySelectorAll('div')).find(
      (node) => node.textContent?.includes('Click the highlighted area')
    )
    expect(tooltip).to.exist

    const nextButton = Array.from(document.body.querySelectorAll('button')).find(
      (btn) => btn.textContent.trim() === 'Next'
    )
    expect(nextButton).to.exist
    await act(async () => {
      nextButton.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await flush()
    })

    expect(nextCalls).to.have.lengthOf(1)
    anchor.remove()
    highlightRoot.unmount()
  })
})
