package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"syscall"
	"testing"
	"time"
)

func TestMain(m *testing.M) {
	// A rollback may restore this test parent instead of the normal product.
	// The exact same main/helper/resume code is exercised in either binary.
	for _, arg := range os.Args[1:] {
		if strings.HasPrefix(arg, "--dfo-") {
			main()
			return
		}
	}
	os.Exit(m.Run())
}

func TestNativeSelfUpdateStartup(t *testing.T) {
	path, game := os.Getenv("DFO_TEST_UPDATE_EXE"), os.Getenv("DFO_TEST_GAME_EXE")
	if path == "" || game == "" {
		t.Skip("native updater fixture not configured")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256(data)
	hash := hex.EncodeToString(digest[:])
	version := os.Getenv("DFO_TEST_UPDATE_VERSION")
	name := appName + "-" + version + ".exe"
	base := updateDownload + "v" + version + "/"
	sum := []byte(hash + "  " + name + "\n")
	if os.Getenv("DFO_TEST_UPDATE_FAILURE") == "checksum" {
		sum = []byte(strings.Repeat("a", 64) + "  " + name + "\n")
	}
	metadata, _ := json.Marshal(map[string]any{"tag_name": "v" + version, "assets": []updateAsset{{Name: name, URL: base + name, Size: int64(len(data)), Digest: "sha256:" + hash}, {Name: name + ".sha256", URL: base + name + ".sha256", Size: int64(len(sum))}}})
	var downloads atomic.Int32
	installerUpdater = func() *releaseUpdater {
		client := &http.Client{Transport: updateTransport(func(r *http.Request) (*http.Response, error) {
			var body io.Reader
			switch r.URL.String() {
			case updateAPI:
				body = bytes.NewReader(metadata)
			case base + name + ".sha256":
				downloads.Add(1)
				body = bytes.NewReader(sum)
			case base + name:
				downloads.Add(1)
				// Keep the old UI visible long enough to exercise pending input.
				select {
				case <-r.Context().Done():
					return nil, r.Context().Err()
				case <-time.After(5 * time.Second):
				}
				body = bytes.NewReader(data)
			default:
				t.Errorf("unexpected external request: %s", r.URL)
				return nil, context.Canceled
			}
			return &http.Response{StatusCode: 200, Body: io.NopCloser(body), ContentLength: -1, Header: make(http.Header), Request: r}, nil
		})}
		return newReleaseUpdater(appVersion, client, probeUpdateInstaller)
	}
	os.Args = []string{os.Args[0], "--game", game}
	main()
	wantHandoff := os.Getenv("DFO_TEST_EXPECT_HANDOFF") != "false"
	if A.handedOff != wantHandoff {
		t.Fatalf("update handoff did not finish; log: %s", A.logbook.snapshot(0))
	}
	if os.Getenv("DFO_TEST_EXPECT_NO_DOWNLOAD") == "true" && downloads.Load() != 0 {
		t.Fatal("downloaded an update without consent")
	}
}

func TestNativeGameWatcher(t *testing.T) {
	if os.Getenv("DFO_TEST_UPDATE_EXE") == "" {
		t.Skip("native fixture not configured")
	}
	want := os.Getenv("DFO_TEST_EXPECT_GAME_RUNNING") == "true"
	if got := nativeGameRunning(); got != want {
		t.Fatalf("game process watcher: got %v want %v", got, want)
	}
}

func TestNativeUpdateResultWaitRetriesSharingViolation(t *testing.T) {
	path := filepath.Join(t.TempDir(), "started.json")
	if err := writeUpdateJSON(path, updateResult{State: "started"}); err != nil {
		t.Fatal(err)
	}
	h, err := syscall.CreateFile(u16(path), syscall.GENERIC_READ, 0, nil, syscall.OPEN_EXISTING, syscall.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		t.Fatal(err)
	}
	locked := true
	defer func() {
		if locked {
			syscall.CloseHandle(h)
		}
	}()
	if _, err := os.Open(path); err == nil {
		t.Fatal("test did not acquire an exclusive file lock")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	type result struct {
		value updateResult
		err   error
	}
	done := make(chan result, 1)
	go func() { value, err := awaitUpdateResult(ctx, path); done <- result{value, err} }()
	select {
	case r := <-done:
		t.Fatalf("temporary sharing violation aborted the wait: %+v", r)
	case <-time.After(150 * time.Millisecond):
	}
	syscall.CloseHandle(h)
	locked = false
	r := <-done
	if r.err != nil || r.value.State != "started" {
		t.Fatalf("marker was not read after unlocking: %+v", r)
	}
}
