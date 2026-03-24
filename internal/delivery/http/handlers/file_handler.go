package handlers

import (
	"fileserver/internal/service"
	httpdelivery "fileserver/internal/transport"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
)

type FileHandler struct {
	service *service.FileService
}

func NewFileHandler(s *service.FileService) *FileHandler {
	return &FileHandler{
		service: s,
	}
}

func validateFilename(name string) (string, bool) {
	name = filepath.Clean(strings.TrimSpace(name))

	if name == "." || name == "" {
		return "", false
	}

	if strings.Contains(name, "..") {
		return "", false
	}

	if strings.ContainsRune(name, '/') || strings.ContainsRune(name, '\\') {
		return "", false
	}

	return name, true
}

// ===================== LIST =====================

func (h *FileHandler) List(w http.ResponseWriter, r *http.Request) {
	files, err := h.service.ListFiles(r.Context())
	if err != nil {
		httpdelivery.WriteError(w, http.StatusInternalServerError, "internal error")
		return
	}

	httpdelivery.WriteJSON(w, http.StatusOK, files)
}

// ===================== DELETE =====================

func (h *FileHandler) Delete(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	decodedName, err := url.QueryUnescape(name)
	if err != nil {
		httpdelivery.WriteError(w, http.StatusBadRequest, "invalid filename")
		return
	}

	name, ok := validateFilename(decodedName)
	if !ok {
		httpdelivery.WriteError(w, http.StatusBadRequest, "invalid filename")
		return
	}

	if err := h.service.DeleteFile(r.Context(), name); err != nil {
		if os.IsNotExist(err) {
			httpdelivery.WriteError(w, http.StatusNotFound, "file not found")
			return
		}

		httpdelivery.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ===================== STREAM =====================

func (h *FileHandler) Stream(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")

	decodedName, err := url.QueryUnescape(name)
	if err != nil {
		httpdelivery.WriteError(w, http.StatusBadRequest, "invalid filename")
		return
	}

	name, ok := validateFilename(decodedName)
	if !ok {
		httpdelivery.WriteError(w, http.StatusBadRequest, "invalid filename")
		return
	}

	file, err := h.service.GetFile(r.Context(), name)
	if err != nil {
		httpdelivery.WriteError(w, http.StatusNotFound, "file not found")
		return
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		httpdelivery.WriteError(w, http.StatusInternalServerError, "cannot stat file")
		return
	}

	if r.URL.Query().Get("download") == "1" {
		w.Header().Set("Content-Disposition", "attachment; filename=\""+filepath.Base(name)+"\"")
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "public, max-age=3600")

	http.ServeContent(w, r, name, info.ModTime(), file)
}

// ===================== UPLOAD =====================

func (h *FileHandler) Upload(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(100 << 20) // 100MB
	if err != nil {
		httpdelivery.WriteError(w, http.StatusBadRequest, "invalid multipart form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		httpdelivery.WriteError(w, http.StatusBadRequest, "file not found in form")
		return
	}
	defer file.Close()

	filename, ok := validateFilename(header.Filename)
	if !ok {
		httpdelivery.WriteError(w, http.StatusBadRequest, "invalid filename")
		return
	}

	err = h.service.UploadFile(r.Context(), filename, file)
	if err != nil {
		httpdelivery.WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	httpdelivery.WriteJSON(w, http.StatusOK, map[string]string{
		"status": "uploaded",
		"name":   filename,
	})
}

// ===================== HEALTH =====================

func (h *FileHandler) Health(w http.ResponseWriter, r *http.Request) {
	httpdelivery.WriteJSON(w, http.StatusOK, map[string]string{
		"status": "ok",
	})
}