package app

import (
	"fmt"
	"net/http"
)

func RunServer(addr string, uploadDir string, jwtSecret string) error {
	fmt.Println("🚀 HTTP SERVER LISTENING ON", addr)

	handler := New(uploadDir, jwtSecret)

	// Оборачиваем ВСЁ в CORS middleware
	handler = withCORS(handler)

	return http.ListenAndServe(addr, handler)
}

func MustRunServer(addr string, uploadDir string, jwtSecret string) {
	err := RunServer(addr, uploadDir, jwtSecret)
	if err != nil {
		panic(fmt.Errorf("server failed: %w", err))
	}
}

// 🔥 ГЛОБАЛЬНЫЙ CORS (самый важный фикс)
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "*")

		// preflight
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
