package main

import (
	"context"
	"log"
	"os"

	"fileserver/internal/app"
)

type App struct {
	ctx context.Context
}

func NewApp() *App {
	return &App{}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	go func() {
		log.Println("🔥 BACKEND STARTING...")

		addr := os.Getenv("SERVER_ADDR")
		if addr == "" {
			addr = "127.0.0.1:9999"
		}

		upload := os.Getenv("UPLOAD_DIR")
		if upload == "" {
			upload = "./uploads"
		}

		err := app.RunServer(addr, upload, "")

		if err != nil {
			log.Println("❌ BACKEND ERROR:", err)
		}
	}()
}
