package main

import (
	"archive/zip"
	"bytes"
	_ "embed"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Produced by tools/build.sh; the installer carries the complete trusted payload.
//
//go:embed payload_windows.zip
var embeddedPayload []byte

func unpackPayload() (string, error) {
	z, err := zip.NewReader(bytes.NewReader(embeddedPayload), int64(len(embeddedPayload)))
	if err != nil {
		return "", err
	}
	dir, err := os.MkdirTemp("", appName+"-")
	if err != nil {
		return "", err
	}
	ok := false
	defer func() {
		if !ok {
			os.RemoveAll(dir)
		}
	}()
	for _, f := range z.File {
		rel := filepath.FromSlash(f.Name)
		if filepath.IsAbs(rel) || strings.Contains(rel, ":") || rel == ".." || strings.HasPrefix(filepath.Clean(rel), ".."+string(os.PathSeparator)) {
			return "", fmt.Errorf("некорректный путь компонента")
		}
		p := filepath.Join(dir, rel)
		if f.FileInfo().IsDir() {
			if err = os.MkdirAll(p, 0700); err != nil {
				return "", err
			}
			continue
		}
		if f.UncompressedSize64 > 64*1024*1024 {
			return "", fmt.Errorf("некорректный размер компонента")
		}
		if err = os.MkdirAll(filepath.Dir(p), 0700); err != nil {
			return "", err
		}
		r, e := f.Open()
		if e != nil {
			return "", e
		}
		w, e := os.OpenFile(p, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if e != nil {
			r.Close()
			return "", e
		}
		_, copyErr := io.Copy(w, r)
		closeErr := w.Close()
		r.Close()
		if copyErr != nil {
			return "", copyErr
		}
		if closeErr != nil {
			return "", closeErr
		}
	}
	ok = true
	return dir, nil
}
