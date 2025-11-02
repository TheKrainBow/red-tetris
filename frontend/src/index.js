import React from 'react'
import { createRoot } from 'react-dom/client'
import { createLogger } from 'redux-logger'
import thunk from 'redux-thunk'
import { createStore, applyMiddleware } from 'redux'
import { Provider } from 'react-redux'
import { storeStateMiddleWare } from './middleware/storeStateMiddleWare'
import reducer from './reducers'
import Router from './Router'
import { loadSkyboxCube } from './three/Skybox.jsx'

const initialState = {}

const store = createStore(
  reducer,
  initialState,
  applyMiddleware(thunk, createLogger())
)

// Preload the skybox cube ASAP to avoid flashes when first visiting main menu
loadSkyboxCube().catch(() => {})

const container = document.getElementById('tetris')
const root = createRoot(container)
root.render(
  <Provider store={store}>
    <Router />
  </Provider>
)
