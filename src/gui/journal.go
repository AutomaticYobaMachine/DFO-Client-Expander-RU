package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime/debug"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const installerLogName = "dfo-mod-installer.log"

// The file is authoritative; the window only displays the end of this session.
// Keep the session in memory too so export/rehome works after an I/O failure.
type sessionJournal struct {
	mu   sync.Mutex
	text strings.Builder
	file *os.File
	path string
	err  error
}

func newSessionJournal(dirs ...string) *sessionJournal {
	j := &sessionJournal{}
	for _, dir := range dirs {
		if dir == "" {
			continue
		}
		if err := j.move(dir); err == nil {
			break
		} else {
			j.err = err
		}
	}
	return j
}

func (j *sessionJournal) move(dir string) error {
	j.mu.Lock()
	defer j.mu.Unlock()
	path := filepath.Join(dir, installerLogName)
	if path == j.path && j.file != nil {
		return nil
	}
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	if _, err = io.WriteString(f, j.text.String()); err == nil {
		err = f.Sync()
	}
	if err != nil {
		f.Close()
		return err
	}
	if j.file != nil {
		j.file.Close()
	}
	j.file, j.path, j.err = f, path, nil
	return nil
}

func logText(s string) string {
	s = strings.ToValidUTF8(strings.ReplaceAll(s, "\x00", `\0`), "�")
	return strings.ReplaceAll(strings.ReplaceAll(s, "\r\n", "\n"), "\n", "\r\n")
}

func diagnosticStage(s string) string {
	s = logText(s)
	if len(s) > 512 {
		s = s[:512]
		for !utf8.ValidString(s) {
			s = s[:len(s)-1]
		}
		s += "…"
	}
	return s
}

func (j *sessionJournal) append(s string) {
	j.mu.Lock()
	defer j.mu.Unlock()
	s = time.Now().Format("2006-01-02 15:04:05.000 -0700") + " " + logText(s)
	if !strings.HasSuffix(s, "\n") {
		s += "\r\n"
	}
	j.text.WriteString(s)
	if j.file != nil {
		if _, err := io.WriteString(j.file, s); err != nil {
			j.err = err
			j.file.Close()
			j.file = nil
			j.text.WriteString("ОШИБКА записи полного журнала: " + logText(err.Error()) + "\r\n")
		}
	}
}

func (j *sessionJournal) snapshot(limit int) string {
	j.mu.Lock()
	defer j.mu.Unlock()
	s := j.text.String()
	if limit > 0 && len(s) > limit {
		s = s[len(s)-limit:]
		for len(s) > 0 && !utf8.RuneStart(s[0]) {
			s = s[1:]
		}
		s = "… Предыдущие строки сохранены в полном журнале.\r\n" + s
	}
	return s
}

func (j *sessionJournal) location() (string, error) {
	j.mu.Lock()
	defer j.mu.Unlock()
	return j.path, j.err
}
func (j *sessionJournal) sync() {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.file != nil {
		j.err = j.file.Sync()
	}
}
func (j *sessionJournal) captureCrashes() error {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.file == nil {
		return j.err
	}
	return debug.SetCrashOutput(j.file, debug.CrashOptions{})
}
func (j *sessionJournal) close() {
	j.mu.Lock()
	defer j.mu.Unlock()
	if j.file != nil {
		j.file.Sync()
		j.file.Close()
		j.file = nil
	}
}

// Unlike Scanner, this accepts arbitrarily long diagnostic lines. Always wait
// for the child, including failures; never cancel an archive write for a timeout.
func runLoggedCommand(c *exec.Cmd, line func(string)) error {
	r, w, err := os.Pipe()
	if err != nil {
		return fmt.Errorf("канал вывода патчера: %w", err)
	}
	c.Stdout, c.Stderr = w, w
	err = c.Start()
	w.Close()
	if err != nil {
		r.Close()
		return fmt.Errorf("запуск патчера: %w", err)
	}
	reader := bufio.NewReader(r)
	var readErr error
	for {
		s, err := reader.ReadString('\n')
		if s != "" {
			line(strings.TrimSuffix(strings.TrimSuffix(s, "\n"), "\r"))
		}
		if err != nil {
			if !errors.Is(err, io.EOF) {
				readErr = err
			}
			break
		}
	}
	r.Close()
	waitErr := c.Wait()
	return errors.Join(waitErr, readErr)
}
