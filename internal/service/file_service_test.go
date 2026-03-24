package service

import (
	"context"
	"errors"
	"io"
	"os"
	"testing"
)

type mockStorage struct {
	listErr error
}

func (m *mockStorage) List() ([]os.DirEntry, error) {
	if m.listErr != nil {
		return nil, m.listErr
	}
	return []os.DirEntry{}, nil
}

func (m *mockStorage) Open(name string) (*os.File, error) {
	return nil, nil
}

func (m *mockStorage) Delete(name string) error {
	return nil
}

func (m *mockStorage) Save(name string, src io.Reader) error {
	return nil
}

func TestListFiles(t *testing.T) {

	tests := []struct {
		name    string
		listErr error
		wantErr bool
	}{
		{"success", nil, false},
		{"storage error", errors.New("fail"), true},
	}

	for _, tt := range tests {

		t.Run(tt.name, func(t *testing.T) {

			st := &mockStorage{
				listErr: tt.listErr,
			}

			service := NewFileService(st)

			files, err := service.ListFiles(context.Background())

			if (err != nil) != tt.wantErr {
				t.Fatalf("expected error=%v got=%v", tt.wantErr, err)
			}

			if err == nil && files == nil {
				t.Fatal("expected slice, got nil")
			}
		})
	}
}
