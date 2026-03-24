// ================= SIGNAL TYPES =================
 
type SignalOffer = {
  type: "offer"
  sdp: RTCSessionDescriptionInit
}
 
type SignalAnswer = {
  type: "answer"
  sdp: RTCSessionDescriptionInit
}
 
type SignalCandidate = {
  type: "candidate"
  candidate: RTCIceCandidateInit
}
 
type SignalData = SignalOffer | SignalAnswer | SignalCandidate
 
export type SignalEnvelope = {
  type: "signal"
  from?: string
  target?: string
  data?: SignalData
}
 
// ================= FILE CONTROL =================
 
type FileMetaMessage = {
  kind: "file-meta"
  id: string
  name: string
  size: number
  mime: string
}
 
type FileEndMessage = {
  kind: "file-end"
  id: string
}
 
type ControlMessage = FileMetaMessage | FileEndMessage
 
// ================= INTERNAL =================
 
type IncomingTransfer = {
  id: string
  name: string
  size: number
  mime: string
  receivedBytes: number
  chunks: BlobPart[]
}
 
type PeerContext = {
  pc: RTCPeerConnection
  dc: RTCDataChannel | null
  pendingCandidates: RTCIceCandidateInit[]
  incoming: IncomingTransfer | null
}
 
// ================= CALLBACKS =================
 
export type WebRTCCallbacks = {
  onPeerStateChange?: (peerId: string, connected: boolean) => void
  onSendProgress?: (
    peerId: string,
    fileName: string,
    sent: number,
    total: number
  ) => void
  onReceiveProgress?: (
    peerId: string,
    fileName: string,
    received: number,
    total: number
  ) => void
  onFileReceived?: (peerId: string, file: File) => void
  onError?: (msg: string) => void
}
 
// ================= ICE CONFIG =================
 
const ICE_SERVERS: RTCIceServer[] = [
  // STUN — определяет публичный IP
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  // TURN — бесплатный публичный relay (нужен для телефон <-> ПК через разные сети/NAT)
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
]
 
// ================= MAIN =================
 
export class WebRTCManager {
  private ws: WebSocket
  private selfId: string
  private callbacks: WebRTCCallbacks
  private peers = new Map<string, PeerContext>()
  private makingOffer = new Map<string, boolean>()
 
  constructor(ws: WebSocket, selfId: string, cb: WebRTCCallbacks = {}) {
    this.ws = ws
    this.selfId = selfId
    this.callbacks = cb
  }
 
  // ================= POLITE PEER =================
 
  private isPolite(peerId: string): boolean {
    return this.selfId < peerId
  }
 
  // ================= PEER =================
 
  private getOrCreatePeer(peerId: string): PeerContext {
    const existing = this.peers.get(peerId)
 
    if (existing) {
      const state = existing.pc.connectionState
      if (state !== "failed" && state !== "closed") {
        return existing
      }
      existing.pc.close()
      this.peers.delete(peerId)
    }
 
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
 
    const ctx: PeerContext = {
      pc,
      dc: null,
      pendingCandidates: [],
      incoming: null,
    }
 
    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      this.sendSignal(peerId, {
        type: "candidate",
        candidate: e.candidate.toJSON(),
      })
    }
 
    pc.onconnectionstatechange = () => {
      const connected = pc.connectionState === "connected"
      const failed =
        pc.connectionState === "failed" || pc.connectionState === "closed"
 
      if (connected) {
        this.callbacks.onPeerStateChange?.(peerId, true)
      } else if (failed) {
        this.callbacks.onPeerStateChange?.(peerId, false)
      }
    }
 
    pc.ondatachannel = (e) => {
      ctx.dc = e.channel
      this.setupDC(peerId, ctx, e.channel)
    }
 
    this.peers.set(peerId, ctx)
    return ctx
  }
 
  // ================= DATA CHANNEL =================
 
  private setupDC(peerId: string, ctx: PeerContext, dc: RTCDataChannel) {
    dc.binaryType = "arraybuffer"
 
    dc.onopen = () => {
      this.callbacks.onPeerStateChange?.(peerId, true)
    }
 
    dc.onclose = () => {
      this.callbacks.onPeerStateChange?.(peerId, false)
    }
 
    dc.onerror = () => {
      this.callbacks.onError?.(`DC error: ${peerId}`)
    }
 
    dc.onmessage = async (e) => {
      const data = e.data
 
      if (typeof data === "string") {
        let msg: ControlMessage
 
        try {
          msg = JSON.parse(data)
        } catch {
          return
        }
 
        if (msg.kind === "file-meta") {
          ctx.incoming = {
            id: msg.id,
            name: msg.name,
            size: msg.size,
            mime: msg.mime,
            receivedBytes: 0,
            chunks: [],
          }
          this.callbacks.onReceiveProgress?.(peerId, msg.name, 0, msg.size)
          return
        }
 
        if (msg.kind === "file-end" && ctx.incoming) {
          const inc = ctx.incoming
          const blob = new Blob(inc.chunks, { type: inc.mime })
          const file = new File([blob], inc.name)
          this.callbacks.onFileReceived?.(peerId, file)
          ctx.incoming = null
          return
        }
      }
 
      if (!ctx.incoming) return
 
      let buf: ArrayBuffer | null = null
      if (data instanceof ArrayBuffer) buf = data
      else if (data instanceof Blob) buf = await data.arrayBuffer()
      if (!buf) return
 
      ctx.incoming.chunks.push(buf)
      ctx.incoming.receivedBytes += buf.byteLength
 
      this.callbacks.onReceiveProgress?.(
        peerId,
        ctx.incoming.name,
        ctx.incoming.receivedBytes,
        ctx.incoming.size
      )
    }
  }
 
  // ================= SIGNAL =================
 
  private sendSignal(target: string, data: SignalData) {
    if (this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify({ type: "signal", target, data }))
  }
 
  // ================= FLUSH CANDIDATES =================
 
  private async flushCandidates(_peerId: string, ctx: PeerContext) {
    for (const candidate of ctx.pendingCandidates) {
      try {
        await ctx.pc.addIceCandidate(candidate)
      } catch {
        // ignore stale candidates
      }
    }
    ctx.pendingCandidates = []
  }
 
  // ================= CONNECT =================
 
  async connect(peerId: string) {
    const ctx = this.getOrCreatePeer(peerId)
 
    if (!ctx.dc) {
      const dc = ctx.pc.createDataChannel("file")
      ctx.dc = dc
      this.setupDC(peerId, ctx, dc)
    }
 
    try {
      this.makingOffer.set(peerId, true)
      const offer = await ctx.pc.createOffer()
      await ctx.pc.setLocalDescription(offer)
      this.sendSignal(peerId, { type: "offer", sdp: offer })
    } catch (err) {
      this.callbacks.onError?.(`Offer failed: ${peerId}`)
      throw err
    } finally {
      this.makingOffer.set(peerId, false)
    }
  }
 
  // ================= HANDLE SIGNAL =================
 
  async handleSignal(msg: SignalEnvelope) {
    if (!msg.from || !msg.data) return
    if (msg.from === this.selfId) return
 
    const peerId = msg.from
    const ctx = this.getOrCreatePeer(peerId)
    const d = msg.data
 
    if (d.type === "offer") {
      const polite = this.isPolite(peerId)
      const makingOffer = this.makingOffer.get(peerId) ?? false
      const offerCollision = makingOffer || ctx.pc.signalingState !== "stable"
 
      if (!polite && offerCollision) return
 
      if (offerCollision) {
        await ctx.pc.setLocalDescription({ type: "rollback" })
      }
 
      await ctx.pc.setRemoteDescription(new RTCSessionDescription(d.sdp))
      await this.flushCandidates(peerId, ctx)
 
      const answer = await ctx.pc.createAnswer()
      await ctx.pc.setLocalDescription(answer)
      this.sendSignal(peerId, { type: "answer", sdp: answer })
      return
    }
 
    if (d.type === "answer") {
      if (ctx.pc.signalingState === "stable") return
      await ctx.pc.setRemoteDescription(new RTCSessionDescription(d.sdp))
      await this.flushCandidates(peerId, ctx)
      return
    }
 
    if (d.type === "candidate") {
      if (ctx.pc.remoteDescription) {
        try {
          await ctx.pc.addIceCandidate(d.candidate)
        } catch {
          // ignore stale candidates
        }
      } else {
        ctx.pendingCandidates.push(d.candidate)
      }
    }
  }
 
  // ================= SEND FILE =================
 
  async sendFile(peerId: string, file: File) {
    const ctx = this.peers.get(peerId)
 
    if (!ctx?.dc || ctx.dc.readyState !== "open") {
      throw new Error("Peer not connected")
    }
 
    const id = crypto.randomUUID()
 
    ctx.dc.send(
      JSON.stringify({
        kind: "file-meta",
        id,
        name: file.name,
        size: file.size,
        mime: file.type,
      })
    )
 
    const buffer = await file.arrayBuffer()
    const chunkSize = 64 * 1024
    let sent = 0
 
    while (sent < buffer.byteLength) {
      const chunk = buffer.slice(sent, sent + chunkSize)
      ctx.dc.send(chunk)
      sent += chunk.byteLength
      this.callbacks.onSendProgress?.(peerId, file.name, sent, file.size)
 
      if (ctx.dc.bufferedAmount > 1024 * 1024) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
    }
 
    ctx.dc.send(JSON.stringify({ kind: "file-end", id }))
  }
 
  // ================= UTILS =================
 
  isPeerConnected(peerId: string) {
    return this.peers.get(peerId)?.dc?.readyState === "open"
  }
 
  hasPeer(peerId: string): boolean {
    return this.peers.has(peerId)
  }
}