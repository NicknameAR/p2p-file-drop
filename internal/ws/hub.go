package ws

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

type Client struct {
	conn *websocket.Conn
	name string
}

type Hub struct {
	mu      sync.Mutex
	clients map[string]*Client
}

func NewHub() *Hub {
	return &Hub{
		clients: make(map[string]*Client),
	}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func (h *Hub) HandleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WS upgrade error:", err)
		return
	}

	defer conn.Close()

	var myName string

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			log.Println("WS read error:", err)

			h.mu.Lock()
			delete(h.clients, myName)
			h.mu.Unlock()

			h.broadcastDevices()
			return
		}

		var data map[string]interface{}
		if err := json.Unmarshal(msg, &data); err != nil {
			continue
		}

		switch data["type"] {
		case "join":
			name, ok := data["name"].(string)
			if !ok || name == "" {
				continue
			}

			myName = name

			h.mu.Lock()
			h.clients[myName] = &Client{
				conn: conn,
				name: myName,
			}
			h.mu.Unlock()

			log.Println("✅ ws connected:", myName)
			h.broadcastDevices()

		case "signal":
			target, ok := data["target"].(string)
			if !ok || target == "" {
				continue
			}

			data["from"] = myName
			payload, _ := json.Marshal(data)

			h.mu.Lock()
			if c, ok := h.clients[target]; ok {
				_ = c.conn.WriteMessage(websocket.TextMessage, payload)
			}
			h.mu.Unlock()
		}
	}
}

func (h *Hub) broadcastDevices() {
	h.mu.Lock()
	defer h.mu.Unlock()

	list := []string{}
	for name := range h.clients {
		list = append(list, name)
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"type": "devices",
		"list": list,
	})

	for _, c := range h.clients {
		_ = c.conn.WriteMessage(websocket.TextMessage, payload)
	}
}
