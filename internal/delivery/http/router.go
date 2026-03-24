package httpdelivery

import (
	"net/http"

	"fileserver/internal/delivery/http/handlers"
	"fileserver/internal/ws"

	"github.com/go-chi/cors"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func NewRouter(fileHandler *handlers.FileHandler) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	hub := ws.NewHub()
	r.Use(cors.Handler(cors.Options{
    AllowedOrigins:   []string{"*"},
    AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
    AllowedHeaders:   []string{"*"},
    AllowCredentials: true,
	}))
	r.Get("/health", fileHandler.Health)
	r.Get("/ws", hub.HandleWS)

	r.Route("/api/v1/files", func(r chi.Router) {
		r.Get("/", fileHandler.List)
		r.Post("/", fileHandler.Upload)
		r.Get("/{name}/stream", fileHandler.Stream)
		r.Delete("/{name}", fileHandler.Delete)
	})

	return r
}
