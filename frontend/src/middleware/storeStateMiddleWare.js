export const storeStateMiddleWare = store => next => action => {
  const result = next(action)
  return result
}

