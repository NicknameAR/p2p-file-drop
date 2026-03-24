package discovery

import (
	"encoding/json"
	"log"
	"net"
	"os"
	"strconv"
	"sync"
	"time"
)

const ttl = 6 * time.Second

type Device struct {
	Name string `json:"name"`
	IP   string `json:"ip"`
	Port string `json:"port"`
}

type deviceEntry struct {
	device Device
	last   time.Time
}

type Manager struct {
	mu      sync.Mutex
	self    Device
	devices map[string]deviceEntry
	port    int
}

func NewManager(name, httpPort string) *Manager {
	return &Manager{
		self: Device{
			Name: name,
			IP:   GetLocalIP(),
			Port: httpPort,
		},
		devices: make(map[string]deviceEntry),
		port:    getDiscoveryPort(),
	}
}

func (m *Manager) Start() {
	go m.listen()
	go m.broadcastLoop()
	go m.cleanupLoop()
}

func (m *Manager) List() []Device {
	m.mu.Lock()
	defer m.mu.Unlock()

	out := make([]Device, 0, len(m.devices))
	for _, d := range m.devices {
		out = append(out, d.device)
	}
	return out
}

func (m *Manager) broadcastLoop() {
	for {
		payload, _ := json.Marshal(m.self)

		// Получаем актуальные broadcast-адреса при каждой итерации
		// (интерфейсы могут меняться)
		targets := getBroadcastAddresses(m.port)

		for _, addr := range targets {
			udpAddr, err := net.ResolveUDPAddr("udp4", addr)
			if err != nil {
				continue
			}

			conn, err := net.DialUDP("udp4", nil, udpAddr)
			if err != nil {
				continue
			}

			_, _ = conn.Write(payload)
			conn.Close()
		}

		time.Sleep(2 * time.Second)
	}
}

func (m *Manager) listen() {
	addr := &net.UDPAddr{
		IP:   net.IPv4zero,
		Port: m.port,
	}

	conn, err := net.ListenUDP("udp4", addr)
	if err != nil {
		log.Println("❌ listen error:", err)
		return
	}
	defer conn.Close()

	log.Println("👂 listening on UDP", m.port)

	buf := make([]byte, 2048)

	for {
		n, remote, err := conn.ReadFromUDP(buf)
		if err != nil {
			continue
		}

		var d Device
		if err := json.Unmarshal(buf[:n], &d); err != nil {
			continue
		}

		if d.Name == "" || d.Port == "" {
			continue
		}

		d.IP = remote.IP.String()

		// Игнорируем пакеты от самого себя
		if d.IP == m.self.IP && d.Port == m.self.Port {
			continue
		}

		key := d.IP + ":" + d.Port

		m.mu.Lock()
		m.devices[key] = deviceEntry{
			device: d,
			last:   time.Now(),
		}
		m.mu.Unlock()

		log.Println("📥 discovered:", key, d.Name)
	}
}

func (m *Manager) cleanupLoop() {
	for {
		time.Sleep(3 * time.Second)

		m.mu.Lock()
		for k, v := range m.devices {
			if time.Since(v.last) > ttl {
				delete(m.devices, k)
			}
		}
		m.mu.Unlock()
	}
}

// getBroadcastAddresses возвращает broadcast-адреса всех активных
// сетевых интерфейсов + порт discovery.
func getBroadcastAddresses(port int) []string {
	portStr := strconv.Itoa(port)
	var addrs []string

	ifaces, err := net.Interfaces()
	if err != nil {
		// Fallback: глобальный broadcast
		return []string{"255.255.255.255:" + portStr}
	}

	for _, iface := range ifaces {
		// Пропускаем выключенные и loopback интерфейсы
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}

		ifaceAddrs, err := iface.Addrs()
		if err != nil {
			continue
		}

		for _, a := range ifaceAddrs {
			ipNet, ok := a.(*net.IPNet)
			if !ok {
				continue
			}

			ip := ipNet.IP.To4()
			if ip == nil {
				continue // только IPv4
			}

			// Вычисляем broadcast: IP | (~mask)
			mask := ipNet.Mask
			broadcast := make(net.IP, 4)
			for i := range broadcast {
				broadcast[i] = ip[i] | ^mask[i]
			}

			addrs = append(addrs, broadcast.String()+":"+portStr)
		}
	}

	if len(addrs) == 0 {
		addrs = []string{"255.255.255.255:" + portStr}
	}

	return addrs
}

// getLocalIP возвращает реальный IP этой машины в локальной сети.
func GetLocalIP() string {
	// Пробуем подключиться к внешнему адресу (без реальной отправки данных)
	// чтобы ОС выбрала правильный исходящий интерфейс.
	conn, err := net.Dial("udp4", "8.8.8.8:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()

	return conn.LocalAddr().(*net.UDPAddr).IP.String()
}

func getDiscoveryPort() int {
	if p := os.Getenv("DISCOVERY_PORT"); p != "" {
		if v, err := strconv.Atoi(p); err == nil {
			return v
		}
	}
	return 9998
}
