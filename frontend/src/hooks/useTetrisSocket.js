import { useEffect, useState } from 'react'
import socketClient from '../utils/socketClient'

export function useSocketEvent(type, handler) {
  useEffect(() => {
    if (typeof handler !== 'function') return undefined
    const off = socketClient.on(type, handler)
    return () => off && off()
  }, [type, handler])
}

export function useSocketStatus() {
  const [status, setStatus] = useState(socketClient.getStatus())
  useEffect(() => {
    const off = socketClient.on('status', (next) => setStatus(next?.state || socketClient.getStatus()))
    return () => off && off()
  }, [])
  return status
}

export default socketClient
