import { useEffect, useMemo, useRef, useState } from "react"
import { WebRTCManager, type SignalEnvelope } from "../lib/webrtc"

type FileItem = {
  name: string
  size: number
}

type Device = {
  name: string
  ip: string
  port: string
}

type ToastItem = {
  id: number
  text: string
}

type TransferProgress = {
  fileName: string
  current: number
  total: number
  direction: "send" | "receive"
  peerId: string
}

// Относительные пути — Vite proxy перенаправляет на Go бэкенд.
// Работает одинаково на localhost И на телефоне через 192.168.x.x:5173
const API = ""
const WS_URL = `ws://${window.location.hostname}:9999/ws`

const ext = (name: string) => name.split(".").pop()?.toLowerCase() || ""

const isImage = (name: string) =>
  ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext(name))

const icon = (name: string) => {
  if (isImage(name)) return "🖼️"
  if (["mp4", "mov", "avi", "mkv"].includes(ext(name))) return "🎬"
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext(name))) return "🗜️"
  if (["pdf", "doc", "docx", "txt", "rtf", "xls", "xlsx", "csv"].includes(ext(name)))
    return "📄"
  return "📁"
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

export default function Files() {
  const inputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const rtcRef = useRef<WebRTCManager | null>(null)
  const myName = useRef("client-" + Math.floor(Math.random() * 10000))

  const [files, setFiles] = useState<FileItem[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [peers, setPeers] = useState<string[]>([])
  const [connectedPeers, setConnectedPeers] = useState<Record<string, boolean>>({})
  const [wsConnected, setWsConnected] = useState(false)

  const [search, setSearch] = useState("")
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const [uploading, setUploading] = useState(false)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [busyFile, setBusyFile] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const [progress, setProgress] = useState<TransferProgress | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  // ── Toast ────────────────────────────────────────────────────────────────
  const pushToast = (text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((prev) => [...prev, { id, text }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 2600)
  }

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadFiles = async () => {
    try {
      setLoadingFiles(true)
      const res = await fetch(`${API}/api/v1/files`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setFiles(Array.isArray(data) ? data : [])
    } catch {
      pushToast("Files load failed")
    } finally {
      setLoadingFiles(false)
    }
  }

  const loadDevices = async () => {
    try {
      const res = await fetch(`${API}/devices`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      setDevices(Array.isArray(data) ? data : [])
    } catch {
      // тихо — не спамим тостами при каждом тике
    }
  }

  useEffect(() => {
    loadFiles()
    loadDevices()
    const timer = window.setInterval(loadDevices, 3000)
    return () => window.clearInterval(timer)
  }, [])

  // ── WebSocket + WebRTC с автореконнектом ─────────────────────────────────
  useEffect(() => {
    let destroyed = false
    let reconnectTimer: number

    const connect = () => {
      if (destroyed) return

      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setWsConnected(true)
        ws.send(JSON.stringify({ type: "join", name: myName.current }))
      }

      const rtc = new WebRTCManager(ws, myName.current, {
        onPeerStateChange: (peerId, connected) => {
          setConnectedPeers((prev) => ({ ...prev, [peerId]: connected }))
        },
        onSendProgress: (peerId, fileName, current, total) => {
          setProgress({ fileName, current, total, direction: "send", peerId })
          if (current >= total) window.setTimeout(() => setProgress(null), 800)
        },
        onReceiveProgress: (peerId, fileName, current, total) => {
          setProgress({ fileName, current, total, direction: "receive", peerId })
          if (current >= total) window.setTimeout(() => setProgress(null), 800)
        },
        onFileReceived: (peerId, file) => {
          const url = URL.createObjectURL(file)
          const a = document.createElement("a")
          a.href = url
          a.download = file.name
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
          pushToast(`✅ Received ${file.name} from ${peerId}`)
        },
        onError: (message) => pushToast(message),
      })

      rtcRef.current = rtc

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as
            | { type: "devices"; list: string[] }
            | SignalEnvelope

          if (data.type === "devices") {
            const list = Array.isArray(data.list) ? data.list : []
            const nextPeers = list.filter((name) => name !== myName.current)
            setPeers(nextPeers)

            nextPeers.forEach((peerId) => {
              if (!rtcRef.current?.hasPeer(peerId)) {
                rtcRef.current?.connect(peerId).catch(() => {})
              }
            })
            return
          }

          if (data.type === "signal") {
            rtc.handleSignal(data)
          }
        } catch {
          // ignore parse errors
        }
      }

      ws.onerror = () => {
        // onerror всегда перед onclose — не дублируем toast
      }

      ws.onclose = () => {
        if (destroyed) return
        setWsConnected(false)
        setPeers([])
        setConnectedPeers({})
        reconnectTimer = window.setTimeout(connect, 2000)
      }
    }

    connect()

    return () => {
      destroyed = true
      window.clearTimeout(reconnectTimer)
      wsRef.current?.close()
      rtcRef.current = null
      wsRef.current = null
    }
  }, [])

  // ── File actions ─────────────────────────────────────────────────────────
  const uploadFiles = async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList)
    if (!arr.length) return
    try {
      setUploading(true)
      for (const file of arr) {
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch(`${API}/api/v1/files`, { method: "POST", body: fd })
        if (!res.ok) throw new Error()
      }
      await loadFiles()
      pushToast(`✅ Uploaded ${arr.length} file${arr.length > 1 ? "s" : ""}`)
    } catch {
      pushToast("Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const downloadFile = async (name: string) => {
    try {
      setBusyFile(name)
      const res = await fetch(`${API}/api/v1/files/${encodeURIComponent(name)}/stream?download=1`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      pushToast(`⬇️ Downloaded ${name}`)
    } catch {
      pushToast("Download failed")
    } finally {
      setBusyFile(null)
    }
  }

  const deleteFile = async (name: string) => {
    try {
      setBusyFile(name)
      const res = await fetch(`${API}/api/v1/files/${encodeURIComponent(name)}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error()
      await loadFiles()
      if (selectedFile === name) setSelectedFile(null)
      pushToast(`🗑️ Deleted ${name}`)
    } catch {
      pushToast("Delete failed")
    } finally {
      setBusyFile(null)
    }
  }

  // ── P2P ──────────────────────────────────────────────────────────────────
  const connectPeer = async (peerId: string) => {
    try {
      await rtcRef.current?.connect(peerId)
      setSelectedPeer(peerId)
      pushToast(`🔗 Connecting to ${peerId}`)
    } catch {
      pushToast("Peer connect failed")
    }
  }

  const sendSelectedFile = async () => {
    if (!selectedPeer) return pushToast("Select a peer first")
    if (!selectedFile) return pushToast("Select a file first")
    if (!rtcRef.current?.isPeerConnected(selectedPeer))
      return pushToast("Peer not connected yet, wait...")

    try {
      setSending(true)
      const res = await fetch(
        `${API}/api/v1/files/${encodeURIComponent(selectedFile)}/stream?download=1`
      )
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const file = new File([blob], selectedFile, {
        type: blob.type || "application/octet-stream",
      })
      await rtcRef.current?.sendFile(selectedPeer, file)
      pushToast(`📤 Sent ${selectedFile} to ${selectedPeer}`)
    } catch {
      pushToast("P2P send failed")
    } finally {
      setSending(false)
    }
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase()
    return files.filter((f) => f.name.toLowerCase().includes(q))
  }, [files, search])

  const totalSize = useMemo(
    () => files.reduce((sum, f) => sum + f.size, 0),
    [files]
  )

  const progressPercent = progress
    ? Math.min(100, Math.round((progress.current / Math.max(progress.total, 1)) * 100))
    : 0

  const canSend = !!selectedPeer && !!selectedFile && !sending &&
    connectedPeers[selectedPeer] === true

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: 24,
        background: `
          radial-gradient(circle at 18% 12%, rgba(255,0,255,0.20), transparent 28%),
          radial-gradient(circle at 85% 8%, rgba(0,255,255,0.16), transparent 22%),
          radial-gradient(circle at 50% 100%, rgba(255,0,153,0.10), transparent 28%),
          linear-gradient(135deg, #050816 0%, #070b1f 48%, #020617 100%)
        `,
        color: "#fff",
        fontFamily: "Orbitron, Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 1440, margin: "0 auto" }}>

        {/* ── Header ── */}
        <div
          style={{
            marginBottom: 24,
            padding: 28,
            borderRadius: 28,
            background: "rgba(9, 12, 26, 0.72)",
            border: "1px solid rgba(255,255,255,0.08)",
            backdropFilter: "blur(18px)",
            boxShadow: "0 0 50px rgba(255,0,255,0.10), 0 0 70px rgba(0,255,255,0.08)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 14px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.04)",
                color: "#c4b5fd",
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 0.8,
                textTransform: "uppercase",
              }}
            >
              <span>✦</span>
              <span>Vapor P2P Workspace</span>
            </div>

            {/* WS статус */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 999,
                background: wsConnected ? "rgba(134,239,172,0.10)" : "rgba(239,68,68,0.10)",
                border: `1px solid ${wsConnected ? "rgba(134,239,172,0.3)" : "rgba(239,68,68,0.3)"}`,
                fontSize: 12,
                fontWeight: 700,
                color: wsConnected ? "#86efac" : "#f87171",
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: wsConnected ? "#86efac" : "#f87171",
                boxShadow: wsConnected ? "0 0 6px #86efac" : "none",
              }} />
              {wsConnected ? "Connected" : "Reconnecting..."}
            </div>
          </div>

          <h1
            style={{
              margin: "18px 0 10px 0",
              fontSize: 54,
              fontWeight: 900,
              letterSpacing: -1.5,
              background: "linear-gradient(90deg,#ff00ff,#00ffff,#ffffff)",
              WebkitBackgroundClip: "text",
              color: "transparent",
              textShadow: "0 0 24px rgba(255,0,255,0.25)",
            }}
          >
            P2P FILE DROP
          </h1>

          <p style={{ margin: 0, color: "rgba(255,255,255,0.70)", fontSize: 15, lineHeight: 1.6, maxWidth: 760 }}>
            LAN discovery · WebSocket signaling · WebRTC P2P transfer · TURN relay fallback
          </p>

          <div
            style={{
              marginTop: 18,
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(120px, 1fr))",
              gap: 14,
              maxWidth: 760,
            }}
          >
            {[
              { label: "Client ID", value: myName.current },
              { label: "Files", value: String(files.length) },
              { label: "Storage", value: formatSize(totalSize) },
              { label: "Peers", value: String(peers.length) },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  borderRadius: 18,
                  padding: 16,
                  background: "linear-gradient(180deg, rgba(23,30,58,0.94), rgba(10,14,28,0.90))",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ color: "#94a3b8", fontSize: 12 }}>{item.label}</div>
                <div style={{ marginTop: 8, fontSize: item.label === "Client ID" ? 14 : 24, fontWeight: 900, wordBreak: "break-word" }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 3 columns ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.3fr 1.8fr", gap: 20, alignItems: "start" }}>

          {/* LAN Devices */}
          <div style={{ padding: 22, borderRadius: 24, background: "rgba(9, 12, 26, 0.72)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(16px)", boxShadow: "0 0 40px rgba(255,0,255,0.08)" }}>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>LAN Devices</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", marginBottom: 16 }}>Go серверы в локальной сети</div>

            <div style={{ display: "grid", gap: 10 }}>
              {devices.length === 0
                ? <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 13 }}>No devices found yet</div>
                : devices.map((d) => (
                  <div key={`${d.ip}:${d.port}`} style={{ padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ fontWeight: 800 }}>{d.name}</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{d.ip}:{d.port}</div>
                  </div>
                ))
              }
            </div>

            <div style={{ marginTop: 20 }}>
              <input ref={inputRef} type="file" hidden multiple onChange={(e) => { if (e.target.files) uploadFiles(e.target.files) }} />
              <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                style={{
                  width: "100%",
                  padding: "13px 18px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,0,255,0.36)",
                  background: uploading ? "rgba(255,0,255,0.2)" : "linear-gradient(90deg,#ff00ff,#00ffff)",
                  color: uploading ? "#fff" : "#000",
                  fontWeight: 900,
                  cursor: uploading ? "not-allowed" : "pointer",
                  boxShadow: uploading ? "none" : "0 0 24px rgba(255,0,255,0.28)",
                  fontFamily: "inherit",
                  fontSize: 14,
                }}
              >
                {uploading ? "Uploading..." : "⬆ Upload files"}
              </button>
            </div>
          </div>

          {/* P2P Peers */}
          <div style={{ padding: 22, borderRadius: 24, background: "rgba(9, 12, 26, 0.72)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(16px)", boxShadow: "0 0 40px rgba(0,255,255,0.08)" }}>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>Online P2P Peers</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.50)", marginBottom: 16 }}>Браузеры подключённые к сигналингу</div>

            <div style={{ display: "grid", gap: 10 }}>
              {peers.length === 0
                ? <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 13 }}>No online peers yet</div>
                : peers.map((peerId) => {
                  const connected = connectedPeers[peerId] === true
                  const active = selectedPeer === peerId
                  return (
                    <div
                      key={peerId}
                      style={{
                        padding: 14,
                        borderRadius: 14,
                        background: active ? "rgba(255,0,255,0.08)" : "rgba(255,255,255,0.03)",
                        border: active ? "1px solid rgba(255,0,255,0.36)" : "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>{peerId}</div>
                          <div style={{ marginTop: 4, fontSize: 12, color: connected ? "#86efac" : "#fcd34d" }}>
                            {connected ? "● P2P connected" : "○ Signal only"}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => connectPeer(peerId)} style={{ padding: "7px 11px", borderRadius: 9, border: "1px solid rgba(0,255,255,0.22)", background: "rgba(0,255,255,0.08)", color: "#67e8f9", fontWeight: 800, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                            Connect
                          </button>
                          <button onClick={() => setSelectedPeer(peerId)} style={{ padding: "7px 11px", borderRadius: 9, border: active ? "1px solid rgba(255,0,255,0.4)" : "1px solid rgba(255,255,255,0.10)", background: active ? "rgba(255,0,255,0.12)" : "rgba(255,255,255,0.04)", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                            {active ? "✓ Selected" : "Select"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })
              }
            </div>

            <button
              onClick={sendSelectedFile}
              disabled={!canSend}
              style={{
                marginTop: 18,
                width: "100%",
                padding: "13px 18px",
                borderRadius: 14,
                border: "1px solid rgba(0,255,255,0.26)",
                background: canSend ? "linear-gradient(90deg,#00ffff,#67e8f9)" : "rgba(0,255,255,0.08)",
                color: canSend ? "#000" : "rgba(255,255,255,0.3)",
                fontWeight: 900,
                cursor: canSend ? "pointer" : "not-allowed",
                fontFamily: "inherit",
                fontSize: 14,
              }}
            >
              {sending ? "Sending..." : "📤 Send selected file via P2P"}
            </button>

            {selectedPeer && !connectedPeers[selectedPeer] && (
              <div style={{ marginTop: 10, fontSize: 12, color: "#fcd34d", textAlign: "center" }}>
                ⚠ Waiting for P2P connection...
              </div>
            )}
          </div>

          {/* Files */}
          <div style={{ padding: 22, borderRadius: 24, background: "rgba(9, 12, 26, 0.72)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(16px)", boxShadow: "0 0 40px rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 24, fontWeight: 900 }}>Files</div>
                <div style={{ marginTop: 4, fontSize: 13, color: "rgba(255,255,255,0.50)" }}>
                  {selectedFile ? `Selected: ${selectedFile}` : "Click a file to select it"}
                </div>
              </div>
              <button
                onClick={loadFiles}
                disabled={loadingFiles}
                style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(148,163,184,0.16)", background: "rgba(30,41,59,0.92)", color: "#fff", fontWeight: 700, cursor: loadingFiles ? "not-allowed" : "pointer", fontFamily: "inherit", fontSize: 13 }}
              >
                {loadingFiles ? "..." : "↻ Refresh"}
              </button>
            </div>

            <input
              placeholder="Search files..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: 16, padding: 13, width: "100%", borderRadius: 14, border: "1px solid rgba(148,163,184,0.14)", background: "rgba(30, 41, 59, 0.85)", color: "#fff", outline: "none", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit" }}
            />

            <div>
              {filteredFiles.length === 0 && (
                <div style={{ color: "rgba(255,255,255,0.40)", fontSize: 14 }}>No files found</div>
              )}

              {filteredFiles.map((f) => {
                const isSelected = selectedFile === f.name
                const isBusy = busyFile === f.name

                return (
                  <div
                    key={f.name}
                    onClick={() => setSelectedFile(isSelected ? null : f.name)}
                    style={{
                      padding: 16,
                      marginBottom: 12,
                      borderRadius: 16,
                      background: isSelected
                        ? "linear-gradient(145deg,rgba(255,0,255,0.12),rgba(10,14,28,0.94))"
                        : "linear-gradient(145deg,#1e293b,#020617)",
                      border: isSelected ? "1px solid rgba(255,0,255,0.40)" : "1px solid rgba(148,163,184,0.12)",
                      transition: "all 0.15s ease",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {icon(f.name)} {f.name}
                        </div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "rgba(255,255,255,0.50)" }}>
                          {formatSize(f.size)}
                          {isSelected && <span style={{ marginLeft: 8, color: "#ff00ff" }}>✓ selected</span>}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadFile(f.name) }}
                          disabled={isBusy}
                          style={{ padding: "7px 11px", borderRadius: 9, border: "none", background: "#3b82f6", color: "#fff", cursor: isBusy ? "not-allowed" : "pointer", fontWeight: 700, opacity: isBusy ? 0.6 : 1, fontSize: 12, fontFamily: "inherit" }}
                        >
                          {isBusy ? "..." : "⬇"}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteFile(f.name) }}
                          disabled={isBusy}
                          style={{ padding: "7px 11px", borderRadius: 9, border: "none", background: "rgba(239,68,68,0.18)", color: "#f87171", cursor: isBusy ? "not-allowed" : "pointer", fontWeight: 700, opacity: isBusy ? 0.6 : 1, fontSize: 12, fontFamily: "inherit" }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>

                    {isImage(f.name) && (
                      <img
                        src={`${API}/api/v1/files/${encodeURIComponent(f.name)}/stream`}
                        onClick={(e) => { e.stopPropagation(); setPreview(f.name) }}
                        style={{ width: 100, marginTop: 10, borderRadius: 10, cursor: "zoom-in", border: "1px solid rgba(148,163,184,0.14)", display: "block" }}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Image preview */}
      {preview && (
        <div
          onClick={() => setPreview(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, cursor: "zoom-out" }}
        >
          <img
            src={`${API}/api/v1/files/${encodeURIComponent(preview)}/stream`}
            style={{ maxWidth: "90%", maxHeight: "90%", borderRadius: 16, boxShadow: "0 0 60px rgba(0,0,0,0.8)" }}
          />
          <div style={{ position: "absolute", top: 20, right: 24, fontSize: 28, color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>✕</div>
        </div>
      )}

      {/* Transfer progress */}
      {progress && (
        <div
          style={{
            position: "fixed", left: 24, right: 24, bottom: 24, zIndex: 1001,
            borderRadius: 18, padding: 18,
            background: "rgba(9, 12, 26, 0.92)",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(16px)",
            boxShadow: "0 0 40px rgba(255,0,255,0.15)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 800 }}>
              {progress.direction === "send" ? "📤 Sending" : "📥 Receiving"} {progress.fileName}
            </div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.60)" }}>{progressPercent}%</div>
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.50)", marginBottom: 10 }}>
            {progress.peerId} · {formatSize(progress.current)} / {formatSize(progress.total)}
          </div>
          <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
            <div
              style={{
                width: `${progressPercent}%`, height: "100%",
                background: "linear-gradient(90deg,#ff00ff,#00ffff)",
                boxShadow: "0 0 18px rgba(255,0,255,0.5)",
                transition: "width 0.1s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* Toasts */}
      <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 1002, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: "rgba(20, 27, 45, 0.97)",
              padding: "10px 16px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
              fontSize: 14,
              maxWidth: 320,
              animation: "fadeIn 0.2s ease",
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  )
}
