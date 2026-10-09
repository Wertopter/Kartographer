import { parseDataMessage, projectionAssets, type SignalPayload } from '@shared/remote'
import type { RemotePeer } from '@shared/types'
import { sendAsset } from '@renderer/remote/bytes'
import { browserIceServers, createRoom, openRoomSocket, parseServerMessage } from '@renderer/remote/signaling'

const CONNECT_MS = 20_000
const BLOCKED = 'This network may be blocking the connection.'

type Link = {
  id: string
  name: string
  pc: RTCPeerConnection
  channel: RTCDataChannel | null
  pendingIce: RTCIceCandidateInit[]
  sent: Set<string>
  inflight: Set<string>
  timer: number
}

export type HostListener = {
  onCode: (code: string) => void
  onPeers: (peers: RemotePeer[]) => void
  onStatus: (message: string | null) => void
  onFailed: (message: string) => void
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
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
}

export class HostRoom {
  private socket: WebSocket | null = null
  private readonly peers = new Map<string, Link>()
  private iceServers: RTCIceServer[] = []
  private sawHello = false
  private readonly queued: Array<{ from: string; payload: SignalPayload } | { action: 'joined' | 'left'; peerId: string; name: string }> = []
  private closed = false
  private pushGeneration = 0
  private pushTimer = 0

  constructor(private readonly listener: HostListener) {}

  async start(): Promise<void> {
    const ticket = await createRoom()
    if (this.closed) return
    this.listener.onCode(ticket.code)
    this.listener.onStatus('Waiting for a player to join.')
    await this.connect(ticket.code, ticket.token)
  }

  stop(): void {
    this.closed = true
    window.clearTimeout(this.pushTimer)
    this.socket?.close()
    this.socket = null
    for (const link of this.peers.values()) this.destroy(link)
    this.peers.clear()
    void window.kartographer.setRemotePeers([])
    this.listener.onPeers([])
  }

  schedulePush(): void {
    window.clearTimeout(this.pushTimer)
    this.pushTimer = window.setTimeout(() => {
      void this.push()
    }, 50)
  }

  private async connect(code: string, token: string): Promise<void> {
    const socket = openRoomSocket(code, token)
    this.socket = socket
    await waitForOpen(socket)
    if (this.closed || this.socket !== socket) return
    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return
      const message = parseServerMessage(event.data)
      if (!message || this.closed) return
      if (message.type === 'hello') {
        this.iceServers = browserIceServers(message.iceServers)
        this.sawHello = true
        const queued = this.queued.splice(0)
        for (const item of queued) {
          if ('payload' in item) void this.onSignal(item.from, item.payload)
          else this.onPeer(item.action, item.peerId, item.name)
        }
        return
      }
      if (!this.sawHello) {
        if (message.type === 'peer') this.queued.push(message)
        if (message.type === 'signal') this.queued.push({ from: message.from, payload: message.payload })
        return
      }
      if (message.type === 'peer') {
        this.onPeer(message.action, message.peerId, message.name)
        return
      }
      if (message.type === 'signal') {
        void this.onSignal(message.from, message.payload)
      }
    }
    socket.onclose = () => {
      if (this.closed || this.socket !== socket) return
      this.listener.onFailed('The share could not reach the connection service.')
    }
  }

  private onPeer(action: 'joined' | 'left', peerId: string, name: string): void {
    if (action === 'left') {
      const link = this.peers.get(peerId)
      if (link) this.destroy(link)
      this.peers.delete(peerId)
      this.publishPeers()
      return
    }
    const existing = this.peers.get(peerId)
    if (existing) existing.name = name
    else this.peers.set(peerId, this.createLink(peerId, name))
    this.publishPeers()
    this.listener.onStatus(null)
  }

  private createLink(peerId: string, name: string): Link {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers })
    const link: Link = {
      id: peerId,
      name,
      pc,
      channel: null,
      pendingIce: [],
      sent: new Set(),
      inflight: new Set(),
      timer: 0
    }
    link.timer = window.setTimeout(() => {
      if (link.channel?.readyState !== 'open') {
        this.listener.onStatus(`Could not open a connection to ${link.name}. ${BLOCKED}`)
      }
    }, CONNECT_MS)
    pc.onicecandidate = (event) => {
      if (event.candidate) this.sendSignal(peerId, { kind: 'ice', candidate: event.candidate.toJSON() })
    }
    pc.ondatachannel = (event) => {
      link.channel = event.channel
      event.channel.onopen = () => {
        window.clearTimeout(link.timer)
        this.schedulePush()
      }
      event.channel.onmessage = (message) => {
        if (typeof message.data !== 'string') return
        const parsed = parseDataMessage(message.data)
        if (!parsed || this.closed) return
        if (parsed.type === 'command') void window.kartographer.applyRemoteCommand(peerId, parsed.command)
        if (parsed.type === 'need') void this.sendAssets(peerId, parsed.hashes)
      }
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') {
        this.listener.onStatus(`Could not open a connection to ${link.name}. ${BLOCKED}`)
      }
    }
    return link
  }

  private async onSignal(peerId: string, payload: SignalPayload): Promise<void> {
    let link = this.peers.get(peerId)
    if (!link) {
      link = this.createLink(peerId, 'Player')
      this.peers.set(peerId, link)
      this.publishPeers()
    }
    if (payload.kind === 'ice') {
      if (!link.pc.remoteDescription) link.pendingIce.push(payload.candidate)
      else await link.pc.addIceCandidate(payload.candidate)
      return
    }
    if (payload.kind !== 'offer') return
    await link.pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp })
    for (const candidate of link.pendingIce) await link.pc.addIceCandidate(candidate)
    link.pendingIce = []
    const answer = await link.pc.createAnswer()
    await link.pc.setLocalDescription(answer)
    this.sendSignal(peerId, { kind: 'answer', sdp: answer.sdp ?? '' })
  }

  private sendSignal(to: string, payload: SignalPayload): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return
    this.socket.send(JSON.stringify({ type: 'signal', to, payload }))
  }

  private async push(): Promise<void> {
    const generation = ++this.pushGeneration
    for (const link of this.peers.values()) {
      if (link.channel?.readyState !== 'open') continue
      const projection = await window.kartographer.getRemoteProjection(link.id)
      if (this.closed || generation !== this.pushGeneration) return
      if (!projection || link.channel.readyState !== 'open') continue
      link.channel.send(JSON.stringify({ type: 'projection', projection }))
      await this.sendAssets(link.id, projectionAssets(projection), generation)
    }
  }

  private async sendAssets(peerId: string, hashes: string[], generation = this.pushGeneration): Promise<void> {
    const link = this.peers.get(peerId)
    if (!link?.channel) return
    for (const hash of hashes) {
      if (link.sent.has(hash) || link.inflight.has(hash)) continue
      link.inflight.add(hash)
      const channel = link.channel
      const ok = channel ? await sendAsset(channel, hash) : false
      link.inflight.delete(hash)
      if (ok) link.sent.add(hash)
      if (this.closed || generation !== this.pushGeneration) return
    }
  }

  private publishPeers(): void {
    const peers = [...this.peers.values()].map((link) => ({ id: link.id, name: link.name }))
    void window.kartographer.setRemotePeers(peers)
    this.listener.onPeers(peers)
  }

  private destroy(link: Link): void {
    window.clearTimeout(link.timer)
    link.channel?.close()
    link.pc.close()
  }
}
