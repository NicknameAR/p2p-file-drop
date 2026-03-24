package app

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"

	httpdelivery "fileserver/internal/delivery/http"
	"fileserver/internal/delivery/http/handlers"
	"fileserver/internal/discovery"
	"fileserver/internal/service"
	"fileserver/internal/storage"
)

func New(uploadDir string, jwtSecret string) http.Handler {
	st := storage.NewLocalStorage(uploadDir)
	fileService := service.NewFileService(st)
	fileHandler := handlers.NewFileHandler(fileService)

	router := httpdelivery.NewRouter(fileHandler)

	port := "9999"
	if addr := os.Getenv("SERVER_ADDR"); addr != "" {
		port = strings.TrimPrefix(addr, ":")
	}

	dm := discovery.NewManager("FileServer-"+port, port)
	dm.Start()

	mux := http.NewServeMux()

	// API routes
	mux.Handle("/", router)

	// Devices endpoint
	mux.HandleFunc("/devices", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		devices := dm.List()

		if len(devices) == 0 {
			
			devices = append(devices, discovery.Device{
				Name: "Self-" + port,
				IP:   discovery.GetLocalIP(),
				Port: port,
			})
		}

		_ = json.NewEncoder(w).Encode(devices)
	})

	return mux
}
