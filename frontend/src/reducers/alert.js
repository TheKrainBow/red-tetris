import { ALERT_POP } from '../actions/alert'

const defaultState = {
  message: ''
}

export default (state = defaultState, action) => {
  switch (action.type) {
    case ALERT_POP:
      return { ...state, message: action.message }
    default:
      return state
  }
}

