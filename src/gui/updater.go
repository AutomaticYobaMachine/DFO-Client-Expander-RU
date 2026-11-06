package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const updateAPI = "https://api.github.com/repos/AutomaticYobaMachine/DFO-Client-Expander-RU/releases/latest"
const updateDownload = "https://github.com/AutomaticYobaMachine/DFO-Client-Expander-RU/releases/download/"

// Protocol 1 installers updated silently. They must not silently migrate to this policy.
const updateProtocol = 2
const maxUpdateSize = 128 << 20

var releaseVersion = regexp.MustCompile(`^v?(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$`)

func compareVersions(a, b string) (int, error) {
	read := func(s string) ([3]uint64, error) {
		var out [3]uint64
		m := releaseVersion.FindStringSubmatch(s)
		if m == nil {
			return out, fmt.Errorf("неизвестный формат версии %q", s)
		}
		for i := range out {
			n, err := strconv.ParseUint(m[i+1], 10, 32)
			if err != nil {
				return out, err
			}
			out[i] = n
		}
		return out, nil
	}
	x, err := read(a)
	if err != nil {
		return 0, err
	}
	y, err := read(b)
	if err != nil {
		return 0, err
	}
	for i := range x {
		if x[i] < y[i] {
			return -1, nil
		}
		if x[i] > y[i] {
			return 1, nil
		}
	}
	return 0, nil
}

type updateAsset struct {
	Name   string `json:"name"`
	Size   int64  `json:"size"`
	URL    string `json:"browser_download_url"`
	Digest string `json:"digest"`
}
type updateRelease struct {
	Version              string
	Executable, Checksum updateAsset
}
type installerInfo struct {
	Product  string `json:"product"`
	Version  string `json:"version"`
	Protocol int    `json:"protocol"`
}
type downloadedUpdate struct{ Dir, EXE, Version, SHA256 string }
type releaseUpdater struct {
	current string
	client  *http.Client
	probe   func(context.Context, string) (installerInfo, error)
}

func newReleaseUpdater(current string, client *http.Client, probe func(context.Context, string) (installerInfo, error)) *releaseUpdater {
	if client == nil {
		client = &http.Client{}
	}
	copy := *client
	copy.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("слишком много перенаправлений")
		}
		u := req.URL
		allowed := u.Host == "github.com" || u.Host == "api.github.com" || u.Host == "release-assets.githubusercontent.com" || u.Host == "objects.githubusercontent.com"
		if u.Scheme != "https" || u.User != nil || !allowed {
			return errors.New("недопустимый адрес перенаправления обновления")
		}
		return nil
	}
	return &releaseUpdater{current: current, client: &copy, probe: probe}
}

func (u *releaseUpdater) get(ctx context.Context, address string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", appName+"/"+u.current)
	req.Header.Set("Accept", "application/vnd.github+json")
	if address != updateAPI {
		req.Header.Set("Accept", "application/octet-stream")
	}
	res, err := u.client.Do(req)
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		res.Body.Close()
		return nil, fmt.Errorf("GitHub вернул HTTP %d", res.StatusCode)
	}
	return res, nil
}

func (u *releaseUpdater) latest(ctx context.Context) (*updateRelease, error) {
	res, err := u.get(ctx, updateAPI)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(io.LimitReader(res.Body, (2<<20)+1))
	if err != nil || len(data) > 2<<20 {
		return nil, errors.New("не удалось прочитать описание релиза")
	}
	var release struct {
		Tag        string        `json:"tag_name"`
		Draft      bool          `json:"draft"`
		Prerelease bool          `json:"prerelease"`
		Assets     []updateAsset `json:"assets"`
	}
	if err = json.Unmarshal(data, &release); err != nil {
		return nil, err
	}
	if release.Draft || release.Prerelease {
		return nil, nil
	}
	comparison, err := compareVersions(release.Tag, u.current)
	if err != nil {
		return nil, err
	}
	if comparison <= 0 {
		return nil, nil
	}
	version := strings.TrimPrefix(release.Tag, "v")
	if release.Tag != "v"+version {
		return nil, errors.New("неверный тег релиза")
	}
	name := appName + "-" + version + ".exe"
	found := map[string]updateAsset{}
	for _, asset := range release.Assets {
		if asset.Name != name && asset.Name != name+".sha256" {
			continue
		}
		if _, exists := found[asset.Name]; exists {
			return nil, errors.New("повторяющийся файл релиза")
		}
		if asset.URL != updateDownload+release.Tag+"/"+asset.Name {
			return nil, errors.New("файл обновления находится вне репозитория программы")
		}
		if asset.Size <= 0 || asset.Size > maxUpdateSize {
			return nil, errors.New("некорректный размер обновления")
		}
		found[asset.Name] = asset
	}
	exe, ok := found[name]
	sum, haveSum := found[name+".sha256"]
	if !ok || !haveSum || sum.Size > 4096 {
		return nil, errors.New("в релизе нет EXE или его контрольной суммы")
	}
	return &updateRelease{Version: version, Executable: exe, Checksum: sum}, nil
}

func fileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err = io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func (u *releaseUpdater) download(ctx context.Context, release *updateRelease, root string, progress func(int)) (_ *downloadedUpdate, err error) {
	if release == nil || !validUpdateURL(release.Executable.URL) || !validUpdateURL(release.Checksum.URL) {
		return nil, errors.New("недопустимый источник обновления")
	}
	if u.probe == nil {
		return nil, errors.New("проверка программы обновления недоступна")
	}
	res, err := u.get(ctx, release.Checksum.URL)
	if err != nil {
		return nil, err
	}
	data, readErr := io.ReadAll(io.LimitReader(res.Body, 4097))
	res.Body.Close()
	fields := strings.Fields(string(data))
	if readErr != nil || len(data) > 4096 || len(fields) != 2 || strings.TrimPrefix(fields[1], "*") != release.Executable.Name {
		return nil, errors.New("неверный файл контрольной суммы")
	}
	digest, err := hex.DecodeString(fields[0])
	if err != nil || len(digest) != sha256.Size {
		return nil, errors.New("неверная контрольная сумма")
	}
	expected := hex.EncodeToString(digest)
	if release.Executable.Digest != "" && release.Executable.Digest != "sha256:"+expected {
		return nil, errors.New("контрольная сумма метаданных не совпадает с файлом")
	}
	if !filepath.IsAbs(root) {
		return nil, errors.New("недоступен каталог обновлений пользователя")
	}
	if err = os.MkdirAll(root, 0700); err != nil {
		return nil, err
	}
	dir, err := os.MkdirTemp(root, "update-")
	if err != nil {
		return nil, err
	}
	ok := false
	defer func() {
		if !ok {
			os.RemoveAll(dir)
		}
	}()
	if err = writeUpdateJSON(filepath.Join(dir, "owner.json"), installerInfo{Product: appName, Protocol: updateProtocol}); err != nil {
		return nil, err
	}
	res, err = u.get(ctx, release.Executable.URL)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.ContentLength >= 0 && res.ContentLength != release.Executable.Size {
		return nil, errors.New("размер загрузки отличается от релиза")
	}
	path := filepath.Join(dir, "update.exe")
	f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return nil, err
	}
	h := sha256.New()
	var n int64
	reader := io.LimitReader(res.Body, release.Executable.Size+1)
	buf := make([]byte, 64<<10)
	last := -1
	for {
		var count int
		count, err = reader.Read(buf)
		if count > 0 {
			if _, e := f.Write(buf[:count]); e != nil {
				err = e
				break
			}
			h.Write(buf[:count])
			n += int64(count)
			p := int(n * 100 / release.Executable.Size)
			if progress != nil && p != last {
				progress(p)
				last = p
			}
		}
		if err != nil {
			if err == io.EOF {
				err = nil
			}
			break
		}
	}
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return nil, err
	}
	if n != release.Executable.Size || hex.EncodeToString(h.Sum(nil)) != expected {
		return nil, errors.New("загрузка повреждена: размер или SHA-256 не совпадает")
	}
	info, err := u.probe(ctx, path)
	if err != nil {
		return nil, fmt.Errorf("проверка запуска новой программы: %w", err)
	}
	if info.Product != appName || info.Version != release.Version || info.Protocol != updateProtocol {
		return nil, errors.New("скачанный EXE не соответствует версии или формату обновления")
	}
	ok = true
	return &downloadedUpdate{Dir: dir, EXE: path, Version: release.Version, SHA256: expected}, nil
}

func writeUpdateJSON(path string, value any) error {
	f, err := os.CreateTemp(filepath.Dir(path), ".update-json-")
	if err != nil {
		return err
	}
	tmp := f.Name()
	defer os.Remove(tmp)
	err = json.NewEncoder(f).Encode(value)
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func readUpdateJSON(path string, value any) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	d := json.NewDecoder(io.LimitReader(f, 64<<10))
	if err = d.Decode(value); err != nil {
		return err
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return errors.New("лишние данные в файле обновления")
	}
	return nil
}

type updateResume struct {
	LogDir     string          `json:"logDir,omitempty"`
	Game       string          `json:"game"`
	Choices    map[string]bool `json:"choices"`
	LootKey    string          `json:"lootKey"`
	DungeonKey string          `json:"dungeonKey"`
	Dirty      bool            `json:"dirty"`
	Background bool            `json:"background"`
}
type updatePlan struct {
	UserApproved bool         `json:"userApproved"`
	Product      string       `json:"product"`
	Protocol     int          `json:"protocol"`
	Target       string       `json:"target"`
	Download     string       `json:"download"`
	Incoming     string       `json:"incoming"`
	Backup       string       `json:"backup"`
	Version      string       `json:"version"`
	FromVersion  string       `json:"fromVersion"`
	SHA256       string       `json:"sha256"`
	OldSHA256    string       `json:"oldSha256"`
	ParentPID    int          `json:"parentPID"`
	Resume       updateResume `json:"resume"`
}
type updateResult struct {
	State string `json:"state"`
	Error string `json:"error,omitempty"`
}

func loadUpdatePlan(path, root string) (*updatePlan, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	rel, err := filepath.Rel(root, abs)
	if err != nil || !filepath.IsAbs(root) || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || filepath.IsAbs(rel) || filepath.Base(abs) != "plan.json" || !strings.HasPrefix(filepath.Base(filepath.Dir(abs)), "update-") {
		return nil, errors.New("план обновления находится вне кеша программы")
	}
	var p updatePlan
	if err = readUpdateJSON(abs, &p); err != nil {
		return nil, err
	}
	if !p.UserApproved || p.Product != appName || p.Protocol != updateProtocol || p.ParentPID <= 0 || !filepath.IsAbs(p.Target) || !strings.EqualFold(filepath.Ext(p.Target), ".exe") || p.Download != filepath.Join(filepath.Dir(abs), "update.exe") {
		return nil, errors.New("неверный план обновления")
	}
	if p.Resume.LogDir != "" && !filepath.IsAbs(p.Resume.LogDir) {
		return nil, errors.New("неверный путь журнала обновления")
	}
	comparison, err := compareVersions(p.Version, p.FromVersion)
	if err != nil || comparison <= 0 {
		return nil, errors.New("обновление не новее текущей версии")
	}
	for _, digest := range []string{p.SHA256, p.OldSHA256} {
		b, e := hex.DecodeString(digest)
		if e != nil || len(b) != sha256.Size {
			return nil, errors.New("неверный отпечаток программы")
		}
	}
	for _, pair := range [][2]string{{p.Incoming, ".dfo-update-"}, {p.Backup, ".dfo-backup-"}} {
		if pair[0] != "" && (filepath.Dir(pair[0]) != filepath.Dir(p.Target) || !strings.HasPrefix(filepath.Base(pair[0]), pair[1])) {
			return nil, errors.New("неверный путь временной копии")
		}
	}
	return &p, nil
}

// Copy beside the destination, so replacement and its backup stay on the same
// volume even when the portable EXE is on another drive than LocalAppData.
func prepareUpdateTarget(p *updatePlan) (err error) {
	old, err := fileSHA256(p.Target)
	if err != nil || old != p.OldSHA256 {
		return errors.New("текущий EXE уже изменился; повторите проверку обновлений")
	}
	actual, err := fileSHA256(p.Download)
	if err != nil || actual != p.SHA256 {
		return errors.New("файл обновления изменился после проверки")
	}
	f, err := os.CreateTemp(filepath.Dir(p.Target), ".dfo-update-*.exe")
	if err != nil {
		return err
	}
	p.Incoming = f.Name()
	ok := false
	defer func() {
		f.Close()
		if !ok {
			os.Remove(p.Incoming)
		}
	}()
	source, err := os.Open(p.Download)
	if err != nil {
		return err
	}
	_, err = io.Copy(f, source)
	source.Close()
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	actual, err = fileSHA256(p.Incoming)
	if err != nil || actual != p.SHA256 {
		return errors.New("копия обновления повреждена")
	}
	backup, err := os.CreateTemp(filepath.Dir(p.Target), ".dfo-backup-*.previous")
	if err != nil {
		return err
	}
	p.Backup = backup.Name()
	backup.Close()
	if err = os.Remove(p.Backup); err != nil {
		return err
	}
	ok = true
	return nil
}

func awaitUpdateResult(ctx context.Context, path string) (updateResult, error) {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()
	for {
		var r updateResult
		if err := readUpdateJSON(path, &r); err == nil {
			return r, nil
		} else {
			// Windows scanners and another process's atomic rename can briefly
			// deny opening a marker. Retry file access within the deadline, but
			// reject malformed JSON immediately rather than accepting partial data.
			var fileErr *os.PathError
			if !os.IsNotExist(err) && !errors.As(err, &fileErr) {
				return r, err
			}
		}
		select {
		case <-ctx.Done():
			return r, ctx.Err()
		case <-ticker.C:
		}
	}
}

// Reuse canonical names when handing settings to a future installer. Numeric
// Win32 control IDs are internal and may change independently of these keys.
func resumeChoices(saved map[string]bool, defaults map[int]bool) map[int]bool {
	out := make(map[int]bool, len(defaults))
	for id, on := range defaults {
		out[id] = on
	}
	for _, f := range features {
		if on, ok := saved[f.Key]; ok {
			out[f.ID] = on
		}
	}
	if on, ok := saved["onlyVisited"]; ok {
		out[idVisited] = on
	}
	return out
}

func validUpdateURL(address string) bool {
	u, err := url.Parse(address)
	return err == nil && u.Scheme == "https" && u.User == nil && u.Host == "github.com" && strings.HasPrefix(u.Path, "/AutomaticYobaMachine/DFO-Client-Expander-RU/releases/download/") && u.RawQuery == "" && u.Fragment == ""
}

func pruneUpdateCache(root, running string) {
	if !filepath.IsAbs(root) {
		return
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	type candidate struct {
		path string
		at   time.Time
	}
	var owned []candidate
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(entry.Name(), "update-") {
			continue
		}
		path := filepath.Join(root, entry.Name())
		if rel, e := filepath.Rel(path, running); e == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
			continue
		}
		var owner installerInfo
		if readUpdateJSON(filepath.Join(path, "owner.json"), &owner) != nil || owner.Product != appName || owner.Protocol != updateProtocol {
			continue
		}
		if info, e := entry.Info(); e == nil {
			owned = append(owned, candidate{path, info.ModTime()})
		}
	}
	sort.Slice(owned, func(i, j int) bool { return owned[i].at.After(owned[j].at) })
	for i, c := range owned {
		if i >= 3 && time.Since(c.at) > 10*time.Minute {
			_ = os.RemoveAll(c.path)
		}
	}
}
