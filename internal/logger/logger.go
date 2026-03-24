package logger

import "go.uber.org/zap"

var Log *zap.Logger

func New() (*zap.Logger, error) {
	return zap.NewProduction()
}
