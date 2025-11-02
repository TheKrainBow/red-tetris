import fs from 'fs'
import path from 'path'
import debug from 'debug'

const logerror = debug('tetris:error')
  , loginfo = debug('tetris:info')

const initApp = (app, params, cb) => {
  const { host, port } = params
  const handler = (req, res) => {
    const filePath = req.url === '/bundle.js'
      ? path.resolve(__dirname, '../../frontend/dist/bundle.js')
      : path.resolve(__dirname, '../../frontend/public/index.html')

    fs.readFile(filePath, (err, data) => {
      if (err) {
        logerror(err)
        res.writeHead(500)
        return res.end('Error loading file')
      }
      res.writeHead(200)
      res.end(data)
    })
  }

  app.on('request', handler)

  app.listen({ host, port }, () => {
    loginfo(`tetris listen on ${params.url}`)
    cb()
  })
}

const initEngine = io => {
  io.on('connection', function (socket) {
    loginfo('Socket connected: ' + socket.id)
    socket.on('action', (action) => {
      if (action.type === 'server/ping') {
        socket.emit('action', { type: 'pong' })
      }
    })
  })
}

export function create(params) {
  const promise = new Promise((resolve, reject) => {
    const app = require('http').createServer()
    app.on('error', reject)
    initApp(app, params, () => {
      const io = require('socket.io')(app)
      const stop = (cb) => {
        io.close()
        app.close(() => {
          app.unref()
        })
        loginfo('Engine stopped.')
        cb()
      }

      initEngine(io)
      const address = app.address()
      const actualPort = address && address.port ? address.port : params.port
      const actualHost = params.host
      const url = `http://${actualHost}:${actualPort}`
      resolve({ stop, port: actualPort, url })
    })
  })
  return promise
}

