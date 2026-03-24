package peer

import (
	"sync"
	"time"
)

type Peer struct {
	IP       string    `json:"ip"`
	Port     string    `json:"port"`
	Name     string    `json:"name"`
	LastSeen time.Time `json:"last_seen"`
}

type Manager struct {
	mu    sync.RWMutex
	peers map[string]*Peer
}

func NewManager() *Manager {
	return &Manager{
		peers: make(map[string]*Peer),
	}
}

func (m *Manager) AddOrUpdate(ip, port, name string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	key := ip + ":" + port

	if existing, ok := m.peers[key]; ok {
		existing.LastSeen = time.Now()
		existing.Name = name
		return
	}

	m.peers[key] = &Peer{
		IP:       ip,
		Port:     port,
		Name:     name,
		LastSeen: time.Now(),
	}
}

func (m *Manager) GetAll() []*Peer {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var list []*Peer
	for _, p := range m.peers {
		list = append(list, p)
	}
	return list
}

func (m *Manager) Cleanup(expiration time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	for k, p := range m.peers {
		if now.Sub(p.LastSeen) > expiration {
			delete(m.peers, k)
		}
	}
}
