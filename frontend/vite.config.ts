import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    // Слушаем на всех интерфейсах — нужно чтобы телефон и другие
    // устройства в сети могли открыть сайт по IP компьютера
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      // Проксируем API и WebSocket на Go бэкенд
      "/api": {
        target: "http://127.0.0.1:9999",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://127.0.0.1:9999",
        ws: true,
      },
      "/devices": {
        target: "http://127.0.0.1:9999",
        changeOrigin: true,
      },
    },
  },
})