import {
  parseDataMessage,
  presentRemoteProjection,
  projectionAssets,
  type RemoteCommand,
  type RemoteProjection,
  type SignalPayload
} from '@shared/remote'
import type { PlayerProjection } from '@shared/types'
import { base64ToBytes } from '@renderer/remote/bytes'
import { browserIceServers, joinRoom, openRoomSocket, parseServerMessage } from '@renderer/remote/signaling'

const CONNECT_MS = 20_000
const BLOCKED = 'Could not open a connection. This network may be blocking it.'

type Incoming = { mime: string; count: number; chunks: Array<Uint8Array | null> }

export type GuestSnapshot = {
  projection: PlayerProjection | null
  controlledTokenIds: string[]
  status: string
  live: boolean
}

export class GuestRoom {
  private socket: WebSocket | null = null
  private pc: RTCPeerConnection | null = null
  private channel: RTCDataChannel | null = null
  private iceServers: RTCIceServer[] = []
  private hostPeerId = ''
  private pendingIce: RTCIceCandidateInit[] = []
  private offered = false
  private closed = false
  private remote: RemoteProjection | null = null
  private readonly ready = new Set<string>()
  private readonly incoming = new Map<string, Incoming>()
  private timer = 0

  constructor(private readonly onChange: (snapshot: GuestSnapshot) => void) {}

  async start(code: string, name: string): Promise<void> {
    this.emit('Joining the game.', false)
    const ticket = await joinRoom(code, name)
    if (this.closed) return
    const socket = openRoomSocket(ticket.code, ticket.token)
    this.socket = socket
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const fail = (): void => {
        if (settled) return
        settled = true
        reject(new Error('The share could not reach the connection service.'))
      }
      const opened = (): void => {
        if (settled) return
        settled = true
        socket.removeEventListener('error', fail)
        socket.removeEventListener('close', fail)
        resolve()
      }
      socket.addEventListener('open', opened, { once: true })
      socket.addEventListener('error', fail)
      socket.addEventListener('close', fail)
    })
    if (this.closed || this.socket !== socket) return
    this.timer = window.setTimeout(() => {
      if (this.channel?.readyState !== 'open') this.fail(BLOCKED)
    }, CONNECT_MS)
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return
      const message = parseServerMessage(event.data)
      if (!message || this.closed) return
      if (message.type === 'hello') {
        this.iceServers = browserIceServers(message.iceServers)
        this.hostPeerId = message.hostPeerId
        if (message.hostReady) void this.offer()
        return
      }
      if (message.type === 'host-ready') {
        void this.offer()
        return
      }
      if (message.type === 'room-closed') {
        this.fail('The GM stopped sharing.')
        return
      }
      if (message.type === 'signal' && message.from === this.hostPeerId) void this.onSignal(message.payload)
    }
    socket.onclose = () => {
      if (this.closed || this.socket !== socket) return
      this.fail('The GM stopped sharing.')
    }
  }

  stop(): void {
    this.closed = true
    window.clearTimeout(this.timer)
    this.channel?.close()
    this.pc?.close()
    this.socket?.close()
    this.socket = null
  }

  send(command: RemoteCommand): void {
    if (this.channel?.readyState !== 'open') return
    this.channel.send(JSON.stringify({ type: 'command', command }))
  }

  private async offer(): Promise<void> {
    if (this.offered || !this.hostPeerId || this.closed) return
    this.offered = true
    const pc = new RTCPeerConnection({ iceServers: this.iceServers })
    this.pc = pc
    const channel = pc.createDataChannel('kartographer')
    this.channel = channel
    channel.onopen = () => {
      window.clearTimeout(this.timer)
      this.emit(this.remote?.scene ? '' : 'Receiving the map…', true)
    }
    channel.onmessage = (event) => {
      if (typeof event.data === 'string') void this.onData(event.data)
    }
    pc.onicecandidate = (event) => {
      if (event.candidate) this.sendSignal({ kind: 'ice', candidate: event.candidate.toJSON() })
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') this.fail(BLOCKED)
    }
    const offer = await pc.createOffer()
    if (this.closed) return
    await pc.setLocalDescription(offer)
    this.sendSignal({ kind: 'offer', sdp: offer.sdp ?? '' })
  }

  private async onSignal(payload: SignalPayload): Promise<void> {
    const pc = this.pc
    if (!pc) return
    if (payload.kind === 'ice') {
      if (!pc.remoteDescription) this.pendingIce.push(payload.candidate)
      else await pc.addIceCandidate(payload.candidate)
      return
    }
    if (payload.kind !== 'answer') return
    await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp })
    for (const candidate of this.pendingIce) await pc.addIceCandidate(candidate)
    this.pendingIce = []
  }

  private sendSignal(payload: SignalPayload): void {
    if (this.socket?.readyState !== WebSocket.OPEN || !this.hostPeerId) return
    this.socket.send(JSON.stringify({ type: 'signal', to: this.hostPeerId, payload }))
  }

  private async onData(raw: string): Promise<void> {
    const message = parseDataMessage(raw)
    if (!message || this.closed) return
    if (message.type === 'projection') {
      this.remote = message.projection
      const missing = projectionAssets(message.projection).filter((hash) => !this.ready.has(hash) && !this.incoming.has(hash))
      if (missing.length > 0 && this.channel?.readyState === 'open') {
        this.channel.send(JSON.stringify({ type: 'need', hashes: missing }))
      }
      this.emit(missing.length > 0 ? 'Receiving the map…' : '', true)
      return
    }
    if (message.type !== 'asset') return
    let entry = this.incoming.get(message.hash)
    if (!entry) {
      entry = { mime: message.mime, count: message.count, chunks: Array.from({ length: message.count }, () => null) }
      this.incoming.set(message.hash, entry)
    }
    if (message.index >= entry.chunks.length) return
    entry.chunks[message.index] = base64ToBytes(message.data)
    if (entry.chunks.some((chunk) => chunk == null)) return
    const parts = entry.chunks as Uint8Array[]
    const size = parts.reduce((total, chunk) => total + chunk.byteLength, 0)
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of parts) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    this.incoming.delete(message.hash)
    const wrote = await window.kartographer.writeRemoteAsset(message.hash, bytes, entry.mime)
    if (wrote) this.ready.add(message.hash)
    this.emit(wrote ? '' : 'The map could not be saved.', true)
  }

  private fail(status: string): void {
    if (this.closed) return
    this.emit(status, false)
  }

  private emit(status: string, live: boolean): void {
    const projection = live && this.remote ? presentRemoteProjection(this.remote, this.ready) : null
    this.onChange({
      projection,
      controlledTokenIds: this.remote?.controlledTokenIds ?? [],
      status: projection?.scene ? '' : status || (live ? 'Receiving the map…' : status),
      live
    })
  }
}
