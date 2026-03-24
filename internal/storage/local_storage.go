package storage

import (
	"io"
	"os"
	"path/filepath"
)

type LocalStorage struct {
	BasePath string
}

func NewLocalStorage(path string) *LocalStorage {
	os.MkdirAll(path, 0o755)

	return &LocalStorage{
		BasePath: path,
	}
}

func (s *LocalStorage) List() ([]os.DirEntry, error) {
	return os.ReadDir(s.BasePath)
}

func (s *LocalStorage) Open(name string) (*os.File, error) {
	return os.Open(filepath.Join(s.BasePath, name))
}

func (s *LocalStorage) Delete(name string) error {
	path := filepath.Join(s.BasePath, name)

	
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return err
	}

	return os.Remove(path)
}

func (s *LocalStorage) Save(name string, data io.Reader) error {
	path := filepath.Join(s.BasePath, name)

	out, err := os.Create(path)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, data)
	return err
}
