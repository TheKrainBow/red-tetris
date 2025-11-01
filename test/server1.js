const chai = require('chai')
const { startServer, configureStore } = require('./helpers/server')
const rootReducer = require('../src/client/reducers').default
const { ping } = require('../src/client/actions/server')
const io = require('socket.io-client')
const params = require('../params')

chai.should()

describe('Fake server test', function(){
  let tetrisServer
  before(function(cb){
    if (process.env.SKIP_SERVER_TESTS) {
      this.skip()
      return cb()
    }
    startServer(params.server, (err, server) => {
      if (err) {
        // Likely cannot bind to port in this environment; skip suite
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
    const socket = io(params.server.url)
    const store =  configureStore(rootReducer, socket, initialState, {
      'pong': () =>  done()
    })
    store.dispatch(ping())
  });
});
