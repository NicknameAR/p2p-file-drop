package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port      string
	JWTSecret string
	UploadDir string
}

func Load() *Config {

	cfg := &Config{
		Port:      getEnv("PORT", "9999"),
		JWTSecret: getEnv("JWT_SECRET", ""),
		UploadDir: getEnv("UPLOAD_DIR", "uploads"),
	}

	validate(cfg)

	return cfg
}

func validate(cfg *Config) {

	if cfg.JWTSecret == "" {
		panic("JWT_SECRET must be set")
	}

	if cfg.UploadDir == "" {
		panic("UPLOAD_DIR must be set")
	}
}

func getEnv(key, fallback string) string {

	v := os.Getenv(key)

	if v == "" {
		return fallback
	}

	return v
}

func MustEnv(key string) string {

	v := os.Getenv(key)

	if v == "" {
		panic(fmt.Sprintf("%s env variable required", key))
	}

	return v
}
