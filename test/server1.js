const chai = require('chai')
const { startServer, configureStore } = require('./helpers/server')
const rootReducer = require('../frontend/src/reducers').default
const { ping } = require('../frontend/src/actions/server')
const io = require('socket.io-client')
const params = require('../backend/params')

chai.should()

describe('Fake server test', function(){
  let tetrisServer
  before(function(cb){
    const localParams = { host: '127.0.0.1', port: 0 }
    startServer(localParams, (err, server) => {
      if (err) {
        this.skip()
        return cb()
      }
      tetrisServer = server
      cb()
    })
  })

  after(function(done){
    if (tetrisServer && tetrisServer.stop) return tetrisServer.stop(done)
    done()
  })

  it('should pong', function(done){
    const initialState = {}
    const socket = io(tetrisServer.url)
    const store =  configureStore(rootReducer, socket, initialState, {
      'pong': () => { try { socket.close() } catch(e) {} done() }
    })
    store.dispatch(ping())
  });
});
