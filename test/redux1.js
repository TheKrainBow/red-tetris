const { configureStore } = require('./helpers/server')
const rootReducer = require('../src/client/reducers').default
const { ALERT_POP, alert } = require('../src/client/actions/alert')
const chai = require('chai')

const MESSAGE = "message"

chai.should()

describe('Fake redux test', function(){
  it('alert it', function(done){
    const initialState = {}
    const store =  configureStore(rootReducer, null, initialState, {
      ALERT_POP: ({dispatch, getState}) =>  {
        const state = getState()
        state.message.should.equal(MESSAGE)
        done()
      }
    })
    store.dispatch(alert(MESSAGE))
  });

});
