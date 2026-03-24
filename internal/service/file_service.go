package service

import (
	"context"
	"io"
	"os"

	"fileserver/internal/domain"
	"fileserver/internal/storage"
)

type FileService struct {
	storage storage.Storage
}

func NewFileService(st storage.Storage) *FileService {
	return &FileService{storage: st}
}

func (s *FileService) ListFiles(ctx context.Context) ([]domain.File, error) {
	entries, err := s.storage.List()
	if err != nil {
		return nil, err
	}

	files := make([]domain.File, 0, len(entries))

	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}

		files = append(files, domain.File{
			Name: e.Name(),
			Size: info.Size(),
		})
	}

	return files, nil
}

func (s *FileService) UploadFile(ctx context.Context, name string, file io.Reader) error {
	return s.storage.Save(name, file)
}

func (s *FileService) GetFile(ctx context.Context, name string) (*os.File, error) {
	return s.storage.Open(name)
}

func (s *FileService) DeleteFile(ctx context.Context, name string) error {
	return s.storage.Delete(name)
}
