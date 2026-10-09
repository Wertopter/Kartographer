declare const WebSocketPair: {
  new (): { 0: WebSocket; 1: WebSocket }
}

const INVITE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const SESSION_MS = 8 * 60 * 60 * 1000
const TURN_TTL = 28_800
const MAX_GUESTS = 8

export interface Env {
  ROOMS: DurableObjectNamespace
  TURN_KEY_ID?: string
  TURN_KEY_API_TOKEN?: string
}

type GuestRecord = { token: string; peerId: string; name: string }
type RoomRecord = { hostToken: string; hostPeerId: string; createdAt: number; guests: GuestRecord[] }
type Attachment = { peerId: string; role: 'host' | 'guest'; name: string }
type IceServer = { urls: string | string[]; username?: string; credential?: string }

interface RoomState {
  storage: {
    get<T>(key: string): Promise<T | undefined>
    put<T>(key: string, value: T): Promise<void>
    deleteAll(): Promise<void>
    setAlarm(time: number): Promise<void>
  }
  acceptWebSocket(socket: WebSocket): void
  getWebSockets(): WebSocket[]
}

interface RoomNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): { fetch(request: Request): Promise<Response> }
}

interface DurableObjectId {
  toString(): string
}

interface DurableObjectNamespace extends RoomNamespace {}

function createInviteCode(bytes: Uint8Array): string {
  let raw = ''
  for (let index = 0; index < 12; index += 1) raw += INVITE_ALPHABET[bytes[index] % INVITE_ALPHABET.length]
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

function normalizeInviteCode(input: string): string | null {
  const raw = input.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (raw.length !== 12) return null
  if ([...raw].some((char) => !INVITE_ALPHABET.includes(char))) return null
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`
}

function randomHex(bytes: number): string {
  const data = new Uint8Array(bytes)
  crypto.getRandomValues(data)
  return [...data].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function attachment(socket: WebSocket): Attachment | null {
  const value = (socket as WebSocket & { deserializeAttachment?: () => unknown }).deserializeAttachment?.()
  if (!value || typeof value !== 'object') return null
  const record = value as Attachment
  if ((record.role !== 'host' && record.role !== 'guest') || typeof record.peerId !== 'string') return null
  return record
}

function isPort53(url: string): boolean {
  return /:53(?![0-9])/.test(url)
}

async function iceServers(env: Env): Promise<IceServer[]> {
  const fallback: IceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }]
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return fallback
  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ttl: TURN_TTL })
      }
    )
    if (!response.ok) return fallback
    const body = (await response.json()) as { iceServers?: { urls?: string[]; username?: string; credential?: string } }
    const urls = (body.iceServers?.urls ?? []).filter((url) => !isPort53(url))
    const stun = urls.filter((url) => url.startsWith('stun:'))
    const turn = urls.filter((url) => url.startsWith('turn:') || url.startsWith('turns:'))
    const servers: IceServer[] = []
    if (stun.length > 0) servers.push({ urls: stun })
    if (turn.length > 0 && body.iceServers?.username && body.iceServers.credential) {
      servers.push({ urls: turn, username: body.iceServers.username, credential: body.iceServers.credential })
    }
    return servers.length > 0 ? servers : fallback
  } catch {
    return fallback
  }
}

export class Room {
  constructor(
    private readonly ctx: RoomState,
    private readonly env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/create' && request.method === 'POST') return this.create()
    if (url.pathname === '/join' && request.method === 'POST') return this.join(request)
    if (url.pathname === '/socket' && request.headers.get('Upgrade') === 'websocket') return this.connect(request)
    return json({ error: 'not-found' }, 404)
  }

  async alarm(): Promise<void> {
    this.closeRoom()
    await this.ctx.storage.deleteAll()
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const sender = attachment(socket)
    if (!sender || typeof raw !== 'string') return
    let message: { type?: unknown; to?: unknown; payload?: unknown }
    try {
      message = JSON.parse(raw) as { type?: unknown; to?: unknown; payload?: unknown }
    } catch {
      return
    }
    if (message.type !== 'signal' || typeof message.to !== 'string') return
    const payload = message.payload
    if (!payload || typeof payload !== 'object') return
    const target = this.ctx.getWebSockets().find((item) => attachment(item)?.peerId === message.to)
    target?.send(JSON.stringify({ type: 'signal', from: sender.peerId, payload }))
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    const sender = attachment(socket)
    if (!sender) return
    if (sender.role === 'host') {
      this.closeRoom()
      await this.ctx.storage.deleteAll()
      return
    }
    this.hostSocket()?.send(JSON.stringify({ type: 'peer', action: 'left', peerId: sender.peerId, name: sender.name }))
  }

  private async create(): Promise<Response> {
    const existing = await this.ctx.storage.get<RoomRecord>('room')
    if (existing && Date.now() - existing.createdAt < SESSION_MS) return json({ error: 'exists' }, 409)
    const room: RoomRecord = {
      hostToken: randomHex(32),
      hostPeerId: randomHex(16),
      createdAt: Date.now(),
      guests: []
    }
    await this.ctx.storage.put('room', room)
    await this.ctx.storage.setAlarm(Date.now() + SESSION_MS)
    return json({ hostToken: room.hostToken, peerId: room.hostPeerId })
  }

  private async join(request: Request): Promise<Response> {
    const room = await this.liveRoom()
    if (!room) return json({ error: 'not-found' }, 404)
    if (room.guests.length >= MAX_GUESTS) return json({ error: 'full' }, 409)
    let name = 'Player'
    try {
      const body = (await request.json()) as { name?: unknown }
      if (typeof body.name === 'string') {
        const trimmed = body.name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24)
        if (trimmed) name = trimmed
      }
    } catch {
      name = 'Player'
    }
    const guest = { token: randomHex(32), peerId: randomHex(16), name }
    room.guests.push(guest)
    await this.ctx.storage.put('room', room)
    return json({ guestToken: guest.token, peerId: guest.peerId })
  }

  private async connect(request: Request): Promise<Response> {
    const room = await this.liveRoom()
    if (!room) return json({ error: 'not-found' }, 404)
    const token = new URL(request.url).searchParams.get('token') ?? ''
    const role = token === room.hostToken ? 'host' : 'guest'
    const guest = room.guests.find((item) => item.token === token)
    if (role === 'guest' && !guest) return json({ error: 'not-found' }, 404)
    const peerId = role === 'host' ? room.hostPeerId : guest!.peerId
    const name = role === 'host' ? 'GM' : guest!.name
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    this.replacePeer(peerId)
    this.ctx.acceptWebSocket(server)
    const record: Attachment = { peerId, role, name }
    ;(server as WebSocket & { serializeAttachment?: (value: unknown) => void }).serializeAttachment?.(record)
    const servers = await iceServers(this.env)
    const hostReady = this.hostSocket() != null
    server.send(
      JSON.stringify({
        type: 'hello',
        peerId,
        role,
        hostPeerId: room.hostPeerId,
        hostReady: role === 'host' ? true : hostReady,
        iceServers: servers
      })
    )
    if (role === 'guest') {
      this.hostSocket()?.send(JSON.stringify({ type: 'peer', action: 'joined', peerId, name }))
    } else {
      for (const socket of this.ctx.getWebSockets()) {
        const item = attachment(socket)
        if (!item || item.role !== 'guest') continue
        server.send(JSON.stringify({ type: 'peer', action: 'joined', peerId: item.peerId, name: item.name }))
        socket.send(JSON.stringify({ type: 'host-ready' }))
      }
    }
    return new Response(null, { status: 101, webSocket: client })
  }

  private async liveRoom(): Promise<RoomRecord | null> {
    const room = await this.ctx.storage.get<RoomRecord>('room')
    if (!room) return null
    if (Date.now() - room.createdAt >= SESSION_MS) {
      await this.ctx.storage.deleteAll()
      return null
    }
    return room
  }

  private hostSocket(): WebSocket | null {
    return this.ctx.getWebSockets().find((socket) => attachment(socket)?.role === 'host') ?? null
  }

  private replacePeer(peerId: string): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (attachment(socket)?.peerId === peerId) socket.close(4000, 'replaced')
    }
  }

  private closeRoom(): void {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(JSON.stringify({ type: 'room-closed' }))
      } catch {
        // The socket may already be closing.
      }
      socket.close(1000, 'closed')
    }
  }
}

function cors(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return new Response(response.body, { status: response.status, headers })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }))
    const url = new URL(request.url)
    if (request.method === 'POST' && url.pathname === '/rooms') {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const bytes = new Uint8Array(12)
        crypto.getRandomValues(bytes)
        const code = createInviteCode(bytes)
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code))
        const response = await stub.fetch(new Request('https://room/create', { method: 'POST' }))
        if (response.status === 409) continue
        const payload = (await response.json()) as { hostToken?: string; peerId?: string; error?: string }
        if (!response.ok || !payload.hostToken || !payload.peerId) return cors(json({ error: 'unavailable' }, 503))
        return cors(json({ code, hostToken: payload.hostToken, peerId: payload.peerId }))
      }
      return cors(json({ error: 'unavailable' }, 503))
    }
    const join = url.pathname.match(/^\/rooms\/([a-z0-9-]+)\/join$/)
    if (request.method === 'POST' && join) {
      const code = normalizeInviteCode(join[1])
      if (!code) return cors(json({ error: 'not-found' }, 404))
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code))
      const response = await stub.fetch(new Request('https://room/join', request))
      return cors(response)
    }
    const socket = url.pathname.match(/^\/rooms\/([a-z0-9-]+)\/socket$/)
    if (socket && request.headers.get('Upgrade') === 'websocket') {
      const code = normalizeInviteCode(socket[1])
      if (!code) return json({ error: 'not-found' }, 404)
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code))
      const forwarded = new Request(`https://room/socket?token=${encodeURIComponent(url.searchParams.get('token') ?? '')}`, request)
      return stub.fetch(forwarded)
    }
    return cors(json({ error: 'not-found' }, 404))
  }
}
