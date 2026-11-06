package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type updateTransport func(*http.Request) (*http.Response, error)

func (f updateTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

type updateFixture struct {
	u                    *releaseUpdater
	release              map[string]any
	data                 []byte
	sum                  string
	version, name        string
	probeCalls, requests int
	status               int
	downloadError        error
	contentLength        int64
}

func newUpdateFixture(t *testing.T) *updateFixture {
	t.Helper()
	f := &updateFixture{version: "1.20.0", data: []byte("a test installer supplied by the local transport"), status: 200, contentLength: -1}
	f.name = appName + "-" + f.version + ".exe"
	digest := sha256.Sum256(f.data)
	f.sum = hex.EncodeToString(digest[:]) + "  " + f.name + "\n"
	base := updateDownload + "v" + f.version + "/"
	f.release = map[string]any{"tag_name": "v" + f.version, "assets": []updateAsset{{Name: f.name, URL: base + f.name, Size: int64(len(f.data))}, {Name: f.name + ".sha256", URL: base + f.name + ".sha256", Size: int64(len(f.sum))}}}
	client := &http.Client{Transport: updateTransport(func(r *http.Request) (*http.Response, error) {
		f.requests++
		if r.Method != http.MethodGet || r.Header.Get("User-Agent") == "" {
			t.Error("missing read-only request identity")
		}
		var body []byte
		switch r.URL.String() {
		case updateAPI:
			body, _ = json.Marshal(f.release)
		case base + f.name + ".sha256":
			body = []byte(f.sum)
		case base + f.name:
			if f.downloadError != nil {
				return nil, f.downloadError
			}
			body = f.data
		default:
			t.Fatalf("unexpected network request: %s", r.URL)
		}
		return &http.Response{StatusCode: f.status, Body: io.NopCloser(bytes.NewReader(body)), Header: make(http.Header), ContentLength: f.contentLength, Request: r}, nil
	})}
	f.u = newReleaseUpdater("1.19.0", client, func(_ context.Context, path string) (installerInfo, error) {
		f.probeCalls++
		data, err := os.ReadFile(path)
		if err != nil || !bytes.Equal(data, f.data) {
			t.Error("unverified data reached the launch probe")
		}
		return installerInfo{Product: appName, Version: f.version, Protocol: updateProtocol}, nil
	})
	return f
}

func TestUpdateVersions(t *testing.T) {
	for _, x := range []struct {
		a, b string
		want int
	}{{"1.10.0", "1.9.9", 1}, {"v2.0.0", "1.99.9", 1}, {"1.19.0", "v1.19.0", 0}, {"1.19.0", "1.20.0", -1}} {
		got, err := compareVersions(x.a, x.b)
		if err != nil || got != x.want {
			t.Fatalf("%+v: %d %v", x, got, err)
		}
	}
	for _, s := range []string{"1.2", "01.2.3", "1.2.3-beta", "1.2.3/evil", "999999999999.0.0", "1.2.3\n"} {
		if _, err := compareVersions(s, "1.0.0"); err == nil {
			t.Errorf("accepted %q", s)
		}
	}
}

func TestUpdateAcceptsOnlyNewStableReleaseAndItsOwnAssets(t *testing.T) {
	for _, mode := range []string{"same", "older", "draft", "prerelease", "new"} {
		t.Run(mode, func(t *testing.T) {
			f := newUpdateFixture(t)
			switch mode {
			case "same":
				f.u.current = f.version
			case "older":
				f.u.current = "1.99.0"
			case "draft":
				f.release["draft"] = true
			case "prerelease":
				f.release["prerelease"] = true
			}
			r, err := f.u.latest(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			if (r != nil) != (mode == "new") {
				t.Fatalf("unexpected release: %+v", r)
			}
			if f.requests != 1 || f.probeCalls != 0 {
				t.Fatal("version check downloaded or ran an installer")
			}
		})
	}
	for _, mode := range []string{"foreign", "missing", "duplicate", "huge", "bad-tag"} {
		t.Run(mode, func(t *testing.T) {
			f := newUpdateFixture(t)
			assets := f.release["assets"].([]updateAsset)
			switch mode {
			case "foreign":
				assets[0].URL = "https://example.org/" + f.name
			case "missing":
				assets = assets[:1]
			case "duplicate":
				assets = append(assets, assets[0])
			case "huge":
				assets[0].Size = maxUpdateSize + 1
			case "bad-tag":
				f.release["tag_name"] = "v1.20.0-beta"
			}
			f.release["assets"] = assets
			if _, err := f.u.latest(context.Background()); err == nil {
				t.Fatal("accepted invalid metadata")
			}
			if f.requests != 1 {
				t.Fatal("bad release caused additional requests")
			}
		})
	}
}

func TestUpdateDownloadChecksIntegrityBeforeExecuting(t *testing.T) {
	f := newUpdateFixture(t)
	r, err := f.u.latest(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	var progress int
	ready, err := f.u.download(context.Background(), r, root, func(n int) { progress = n })
	if err != nil {
		t.Fatal(err)
	}
	if progress != 100 || f.probeCalls != 1 || f.requests != 3 {
		t.Fatalf("incomplete verified download: %d %d %d", progress, f.probeCalls, f.requests)
	}
	digest, _ := fileSHA256(ready.EXE)
	if digest != ready.SHA256 || ready.Version != f.version {
		t.Fatal("incorrect prepared update")
	}
	if !strings.HasPrefix(ready.Dir, root+string(os.PathSeparator)) {
		t.Fatal("download escaped cache")
	}
}

func TestBrokenUpdatesNeverReachProbeAndCleanTheirTemporaryFiles(t *testing.T) {
	for _, mode := range []string{"hash", "filename", "truncated", "oversize", "network", "content-length", "digest"} {
		t.Run(mode, func(t *testing.T) {
			f := newUpdateFixture(t)
			r, err := f.u.latest(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			switch mode {
			case "hash":
				f.sum = strings.Repeat("0", 64) + "  " + f.name + "\n"
			case "filename":
				f.sum = strings.ReplaceAll(f.sum, f.name, "other.exe")
			case "truncated":
				f.data = f.data[:len(f.data)-1]
			case "oversize":
				f.data = append(f.data, 1)
			case "network":
				f.downloadError = errors.New("connection lost")
			case "content-length":
				f.contentLength = 1
			case "digest":
				r.Executable.Digest = "sha256:" + strings.Repeat("0", 64)
			}
			root := t.TempDir()
			if _, err = f.u.download(context.Background(), r, root, nil); err == nil {
				t.Fatal("accepted corrupted download")
			}
			if f.probeCalls != 0 {
				t.Fatal("launched an unchecked executable")
			}
			files, _ := os.ReadDir(root)
			if len(files) != 0 {
				t.Fatal("failed download left files behind")
			}
		})
	}
}

func TestUpdateRejectsWrongProductProtocolAndFailedLaunch(t *testing.T) {
	for _, mode := range []string{"product", "version", "protocol", "launch"} {
		t.Run(mode, func(t *testing.T) {
			f := newUpdateFixture(t)
			r, _ := f.u.latest(context.Background())
			f.u.probe = func(context.Context, string) (installerInfo, error) {
				v := installerInfo{Product: appName, Version: f.version, Protocol: updateProtocol}
				switch mode {
				case "product":
					v.Product = "other"
				case "version":
					v.Version = "1.18.0"
				case "protocol":
					v.Protocol = 999
				case "launch":
					return v, errors.New("cannot launch")
				}
				return v, nil
			}
			root := t.TempDir()
			if _, err := f.u.download(context.Background(), r, root, nil); err == nil {
				t.Fatal("accepted incompatible executable")
			}
			files, _ := os.ReadDir(root)
			if len(files) != 0 {
				t.Fatal("failed probe left files behind")
			}
		})
	}
}

func TestUpdateNetworkFailureAndRedirectPolicy(t *testing.T) {
	f := newUpdateFixture(t)
	f.status = 403
	if _, err := f.u.latest(context.Background()); err == nil {
		t.Fatal("accepted rate limit")
	}
	for _, address := range []string{"http://github.com/file", "https://example.org/file", "https://github.com:444/file", "https://user@github.com/file"} {
		req, _ := http.NewRequest("GET", address, nil)
		if f.u.client.CheckRedirect(req, nil) == nil {
			t.Errorf("accepted redirect %s", address)
		}
	}
	req, _ := http.NewRequest("GET", "https://release-assets.githubusercontent.com/file", nil)
	if err := f.u.client.CheckRedirect(req, nil); err != nil {
		t.Fatal(err)
	}
	if err := f.u.client.CheckRedirect(req, make([]*http.Request, 5)); err == nil {
		t.Fatal("accepted redirect loop")
	}
}

func TestUpdateCancellationStopsDownload(t *testing.T) {
	u := newReleaseUpdater("1.19.0", &http.Client{Transport: updateTransport(func(r *http.Request) (*http.Response, error) { <-r.Context().Done(); return nil, r.Context().Err() })}, nil)
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, err := u.latest(ctx); err == nil {
		t.Fatal("ignored cancellation")
	}
}

func TestUpdateTargetPreparationIsSameVolumeAndNeverChangesOldFile(t *testing.T) {
	root := t.TempDir()
	target := filepath.Join(root, "portable.exe")
	stage := filepath.Join(t.TempDir(), "update.exe")
	os.WriteFile(target, []byte("old"), 0600)
	os.WriteFile(stage, []byte("new"), 0600)
	old, _ := fileSHA256(target)
	next, _ := fileSHA256(stage)
	p := updatePlan{Target: target, Download: stage, OldSHA256: old, SHA256: next}
	if err := prepareUpdateTarget(&p); err != nil {
		t.Fatal(err)
	}
	defer os.Remove(p.Incoming)
	if filepath.Dir(p.Incoming) != filepath.Dir(target) || filepath.Dir(p.Backup) != filepath.Dir(target) {
		t.Fatal("cross-volume replacement")
	}
	data, _ := os.ReadFile(target)
	if string(data) != "old" {
		t.Fatal("changed executable before parent exit")
	}
	data, _ = os.ReadFile(p.Incoming)
	if string(data) != "new" {
		t.Fatal("wrong prepared file")
	}
	os.WriteFile(target, []byte("someone else updated it"), 0600)
	if err := prepareUpdateTarget(&p); err == nil {
		t.Fatal("overwrote a newer or changed executable")
	}
}

func TestUpdatePlanIsBoundToPrivateCacheAndKnownFiles(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "update-123")
	os.Mkdir(dir, 0700)
	path := filepath.Join(dir, "plan.json")
	p := updatePlan{UserApproved: true, Product: appName, Protocol: updateProtocol, Target: filepath.Join(t.TempDir(), "portable.exe"), Download: filepath.Join(dir, "update.exe"), Version: "1.20.0", FromVersion: "1.19.0", SHA256: strings.Repeat("a", 64), OldSHA256: strings.Repeat("b", 64), ParentPID: 123}
	if err := writeUpdateJSON(path, p); err != nil {
		t.Fatal(err)
	}
	if _, err := loadUpdatePlan(path, root); err != nil {
		t.Fatal(err)
	}
	if _, err := loadUpdatePlan(path, t.TempDir()); err == nil {
		t.Fatal("accepted foreign plan")
	}
	p.UserApproved = false
	writeUpdateJSON(path, p)
	if _, err := loadUpdatePlan(path, root); err == nil {
		t.Fatal("accepted an unapproved update")
	}
	p.UserApproved = true
	p.Protocol = 1
	writeUpdateJSON(path, p)
	if _, err := loadUpdatePlan(path, root); err == nil {
		t.Fatal("accepted silent legacy update protocol")
	}
	p.Protocol = updateProtocol
	p.Incoming = filepath.Join(t.TempDir(), "unrelated.exe")
	writeUpdateJSON(path, p)
	if _, err := loadUpdatePlan(path, root); err == nil {
		t.Fatal("accepted foreign incoming file")
	}
	p.Incoming = ""
	p.Version = p.FromVersion
	writeUpdateJSON(path, p)
	if _, err := loadUpdatePlan(path, root); err == nil {
		t.Fatal("accepted a downgrade/replay")
	}
}

func TestUpdateResumePreservesAllPendingChoices(t *testing.T) {
	saved := map[string]bool{"ru": false, "marks": true, "nearbyLoot": false, "dungeons": true, "itemCards": false, "fonts": false, "onlyVisited": false}
	choices := resumeChoices(saved, defaults())
	for _, feature := range features {
		if choices[feature.ID] != saved[feature.Key] {
			t.Error("lost pending choice", feature.Key)
		}
	}
	if choices[idVisited] {
		t.Error("lost onlyVisited")
	}
	delete(saved, "fonts")
	if !resumeChoices(saved, defaults())[idFonts] {
		t.Error("missing fonts choice lost the new default")
	}
}

func TestUpdateResultWaitDoesNotAcceptPartialJSON(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ready.json")
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	go func() { time.Sleep(10 * time.Millisecond); _ = writeUpdateJSON(path, updateResult{State: "ready"}) }()
	r, err := awaitUpdateResult(ctx, path)
	if err != nil || r.State != "ready" {
		t.Fatalf("%+v %v", r, err)
	}
	os.WriteFile(path, []byte(`{"state":`), 0600)
	if _, err = awaitUpdateResult(ctx, path); err == nil {
		t.Fatal("accepted incomplete result")
	}
}

func TestUpdateCacheCleanupKeepsRecentActiveAndUnrelatedFiles(t *testing.T) {
	root := t.TempDir()
	var paths []string
	for i := 0; i < 6; i++ {
		path := filepath.Join(root, fmt.Sprintf("update-%d", i))
		os.Mkdir(path, 0700)
		writeUpdateJSON(filepath.Join(path, "owner.json"), installerInfo{Product: appName, Protocol: updateProtocol})
		when := time.Now().Add(-time.Duration(i+1) * time.Hour)
		os.Chtimes(path, when, when)
		paths = append(paths, path)
	}
	unrelated := filepath.Join(root, "update-not-ours")
	os.Mkdir(unrelated, 0700)
	os.WriteFile(filepath.Join(unrelated, "notes.txt"), []byte("keep"), 0600)
	pruneUpdateCache(root, filepath.Join(paths[5], "update.exe"))
	for _, i := range []int{0, 1, 2, 5} {
		if _, err := os.Stat(paths[i]); err != nil {
			t.Fatal("removed recent/running update", i)
		}
	}
	for _, i := range []int{3, 4} {
		if _, err := os.Stat(paths[i]); !os.IsNotExist(err) {
			t.Fatal("did not prune old cache", i)
		}
	}
	if _, err := os.Stat(filepath.Join(unrelated, "notes.txt")); err != nil {
		t.Fatal("removed unrelated files")
	}
}

func Example_compareVersions() {
	c, _ := compareVersions("1.20.0", "1.9.0")
	fmt.Println(c) // Output: 1
}
