import { normalizeInviteCode, signalHttp, signalWebSocket, type IceServer, type SignalServerMessage } from '@shared/remote'

const UNREACHABLE = 'The share could not reach the connection service.'

export type RoomTicket = {
  code: string
  token: string
  peerId: string
}

export async function createRoom(): Promise<RoomTicket> {
  let response: Response
  try {
    response = await fetch(signalHttp('/rooms'), { method: 'POST' })
  } catch {
    throw new Error(UNREACHABLE)
  }
  if (!response.ok) throw new Error(UNREACHABLE)
  const body = (await response.json()) as { code?: unknown; hostToken?: unknown; peerId?: unknown }
  if (typeof body.code !== 'string' || typeof body.hostToken !== 'string' || typeof body.peerId !== 'string') {
    throw new Error(UNREACHABLE)
  }
  return { code: body.code, token: body.hostToken, peerId: body.peerId }
}

export async function joinRoom(code: string, name: string): Promise<RoomTicket> {
  const normalized = normalizeInviteCode(code)
  if (!normalized) throw new Error('That code was not found.')
  let response: Response
  try {
    response = await fetch(signalHttp(`/rooms/${normalized}/join`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
  } catch {
    throw new Error(UNREACHABLE)
  }
  if (response.status === 404) throw new Error('That code was not found.')
  if (response.status === 409) throw new Error('That game is full.')
  if (!response.ok) throw new Error(UNREACHABLE)
  const body = (await response.json()) as { guestToken?: unknown; peerId?: unknown }
  if (typeof body.guestToken !== 'string' || typeof body.peerId !== 'string') throw new Error(UNREACHABLE)
  return { code: normalized, token: body.guestToken, peerId: body.peerId }
}

export function browserIceServers(servers: IceServer[]): RTCIceServer[] {
  return servers
    .map((server) => {
      const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((url) => !/:53(?![0-9])/.test(url))
      return { ...server, urls }
    })
    .filter((server) => server.urls.length > 0)
}

export function openRoomSocket(code: string, token: string): WebSocket {
  return new WebSocket(signalWebSocket(code, token))
}

export function parseServerMessage(raw: string): SignalServerMessage | null {
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (!value || typeof value !== 'object') return null
  const message = value as SignalServerMessage
  if (message.type === 'host-ready' || message.type === 'room-closed') return { type: message.type }
  if (message.type === 'peer' && (message.action === 'joined' || message.action === 'left')) {
    if (typeof message.peerId !== 'string' || typeof message.name !== 'string') return null
    return { type: 'peer', action: message.action, peerId: message.peerId, name: message.name.slice(0, 24) }
  }
  if (message.type === 'hello') {
    if (typeof message.peerId !== 'string' || typeof message.hostPeerId !== 'string') return null
    if (message.role !== 'host' && message.role !== 'guest') return null
    if (!Array.isArray(message.iceServers)) return null
    return message
  }
  if (message.type === 'signal' && typeof message.from === 'string' && message.payload && typeof message.payload === 'object') {
    const payload = message.payload
    if (payload.kind === 'offer' || payload.kind === 'answer') {
      if (typeof payload.sdp !== 'string') return null
      return { type: 'signal', from: message.from, payload: { kind: payload.kind, sdp: payload.sdp } }
    }
    if (payload.kind === 'ice' && payload.candidate && typeof payload.candidate === 'object') {
      return { type: 'signal', from: message.from, payload: { kind: 'ice', candidate: payload.candidate } }
    }
  }
  return null
}
