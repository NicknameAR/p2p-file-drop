package storage

import (
	"io"
	"os"
)

type Storage interface {
	List() ([]os.DirEntry, error)
	Open(name string) (*os.File, error)
	Delete(name string) error
	Save(name string, file io.Reader) error
}
