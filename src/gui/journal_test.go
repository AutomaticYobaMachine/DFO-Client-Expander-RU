package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"unicode/utf8"
)

func TestJournalPersistsFullOutputAndRehomesWithoutLosingConcurrentLines(t *testing.T) {
	first, actual := t.TempDir(), t.TempDir()
	j := newSessionJournal(first)
	defer j.close()
	j.append("Запуск\x00установщика")
	large := strings.Repeat("Диагностика", 90000)
	j.append(large)
	var wg sync.WaitGroup
	for n := 0; n < 5; n++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			for i := 0; i < 50; i++ {
				j.append(fmt.Sprintf("worker %d line %d", n, i))
			}
		}(n)
	}
	if err := j.move(actual); err != nil {
		t.Fatal(err)
	}
	wg.Wait()
	j.append("Последняя ошибка видна")
	j.sync()
	data, err := os.ReadFile(filepath.Join(actual, installerLogName))
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != j.snapshot(0) {
		t.Fatal("disk log lost or duplicated session output")
	}
	if !strings.Contains(string(data), large) || strings.ContainsRune(string(data), 0) {
		t.Fatal("large/UTF8/NUL output damaged")
	}
	for n := 0; n < 5; n++ {
		for i := 0; i < 50; i++ {
			if strings.Count(string(data), fmt.Sprintf("worker %d line %d\r\n", n, i)) != 1 {
				t.Fatal("lost/duplicated concurrent entry", n, i)
			}
		}
	}
	tail := j.snapshot(65 << 10)
	if !utf8.ValidString(tail) || !strings.Contains(tail, "Последняя ошибка видна") || len(tail) > 66<<10 {
		t.Fatal("window tail hides latest error")
	}
	// Reopening the same destination must not replay/duplicate the session.
	j.move(actual)
	after, _ := os.ReadFile(filepath.Join(actual, installerLogName))
	if string(after) != string(data) {
		t.Fatal("duplicate journal on status refresh")
	}
}

func TestJournalFallbackAndFailedRehomePreserveExistingLog(t *testing.T) {
	blocked := filepath.Join(t.TempDir(), "file")
	os.WriteFile(blocked, []byte("not a directory"), 0600)
	fallback := t.TempDir()
	j := newSessionJournal(blocked, fallback)
	defer j.close()
	j.append("before")
	if err := j.move(blocked); err == nil {
		t.Fatal("accepted a file as cache directory")
	}
	j.append("after")
	path, err := j.location()
	if err != nil || path != filepath.Join(fallback, installerLogName) {
		t.Fatal(path, err)
	}
	data, _ := os.ReadFile(path)
	if string(data) != j.snapshot(0) {
		t.Fatal("fallback lost diagnostics")
	}
	other := newSessionJournal(blocked)
	defer other.close()
	other.append("in memory")
	if _, err := other.location(); err == nil || !strings.Contains(other.snapshot(0), "in memory") {
		t.Fatal("unwritable log must remain exportable")
	}
}

func TestBackendOutputFixture(t *testing.T) {
	if os.Getenv("DFO_TEST_BACKEND_OUTPUT") != "yes" {
		return
	}
	fmt.Fprintln(os.Stdout, strings.Repeat("Long diagnostic ", 80000))
	fmt.Fprintln(os.Stderr, "specific failure: archive access denied")
	os.Exit(17)
}

func TestFailedBackendDrainsLongLinesAndReportsExitWithoutStoppingParent(t *testing.T) {
	c := exec.Command(os.Args[0], "-test.run=^TestBackendOutputFixture$")
	c.Env = append(os.Environ(), "DFO_TEST_BACKEND_OUTPUT=yes")
	var output strings.Builder
	err := runLoggedCommand(c, func(s string) { output.WriteString(s); output.WriteByte('\n') })
	if err == nil || c.ProcessState == nil || c.ProcessState.ExitCode() != 17 {
		t.Fatal("lost backend failure", err)
	}
	if !strings.Contains(output.String(), "archive access denied") || !strings.Contains(output.String(), strings.Repeat("Long diagnostic ", 80000)) {
		t.Fatal("lost long stdout or stderr")
	}
	// A fresh command still works after the failed child exited.
	c = exec.Command(os.Args[0], "-test.run=^TestBackendOutputFixture$")
	if err := runLoggedCommand(c, func(string) {}); err != nil {
		t.Fatal("failed command prevented retry", err)
	}
}

func TestStartupLegacyFlagsCannotRequestArchiveWrites(t *testing.T) {
	for _, flag := range []string{"--auto-install", "--auto-uninstall"} {
		opts := parseStartup([]string{flag, "--game", "C:/game/DFO Online.exe"})
		if !opts.legacyAuto || opts.game != "C:/game/DFO Online.exe" || opts.resume != "" {
			t.Fatalf("%+v", opts)
		}
	}
	opts := parseStartup([]string{"--game", "--auto-install", "--no-self-update"})
	if opts.legacyAuto || !opts.noUpdate {
		t.Fatal("interpreted an argument value as an operation")
	}
}
