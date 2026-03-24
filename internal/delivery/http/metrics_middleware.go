package httpdelivery

import (
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

var requestDuration = prometheus.NewHistogramVec(
	prometheus.HistogramOpts{
		Name: "http_request_duration_seconds",
		Help: "HTTP request latency.",
	},
	[]string{"path", "method"},
)

func init() {
	prometheus.MustRegister(requestDuration)
}

func MetricsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		duration := time.Since(start).Seconds()

		requestDuration.
			WithLabelValues(r.URL.Path, r.Method).
			Observe(duration)
	})
}
