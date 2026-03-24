package main

import (
	"log"
	"os"

	"fileserver/internal/app"
)

func main() {
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = "supersecret"
	}

	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./uploads"
	}

	addr := os.Getenv("SERVER_ADDR")
	if addr == "" {
		addr = ":9999"
	}

	log.Printf("starting server on %s\n", addr)
	log.Fatal(app.RunServer(addr, uploadDir, jwtSecret))
}
