package main

import (
	"archive/zip"
	"bytes"
	"crypto/rand"
	"crypto/subtle"
	"embed"
	"encoding/hex"
	"encoding/json"
	"io"
	"mime"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unsafe"
)

//go:embed ui_assets/* ui_assets/dungeon/*.png
var webUIAssets embed.FS

//go:embed assets/launcher-theme.mp3
var launcherThemeMP3 []byte

const (
	boostySupportURL = "https://boosty.to/auto_yoba"
	vkLButton        = 0x01
	timerDrag        = 2
)

type webAction struct {
	Cmd    string `json:"cmd"`
	Key    string `json:"key,omitempty"`
	Target string `json:"target,omitempty"`
	Code   string `json:"code,omitempty"`
	Slot   string `json:"slot,omitempty"`
	URL    string `json:"url,omitempty"`
}

type webFontSlotView struct {
	ID        string `json:"id"`
	BaseLabel string `json:"baseLabel"`
	Custom    bool   `json:"custom"`
	Label     string `json:"label,omitempty"`
	File      string `json:"file,omitempty"`
	SHA256    string `json:"sha256,omitempty"`
}

type webUIState struct {
	Name               string                       `json:"name"`
	Version            string                       `json:"version"`
	Author             string                       `json:"author"`
	Lang               string                       `json:"lang"`
	Locales            map[string]map[string]string `json:"locales,omitempty"`
	ExePath            string                       `json:"exePath"`
	PathHintText       string                       `json:"pathHintText"`
	Searching          bool                         `json:"searching"`
	Querying           bool                         `json:"querying"`
	HasStatus          bool                         `json:"hasStatus"`
	Installed          bool                         `json:"installed"`
	ModVersion         string                       `json:"modVersion"`
	Running            bool                         `json:"running"`
	Busy               bool                         `json:"busy"`
	Operation          string                       `json:"operation"`
	Progress           int                          `json:"progress"`
	Stage              string                       `json:"stage"`
	NoteText           string                       `json:"noteText"`
	NoteTone           string                       `json:"noteTone"`
	HasJournalError    bool                         `json:"hasJournalError"`
	UpdateChecking     bool                         `json:"updateChecking"`
	UpdateDownloading  bool                         `json:"updateDownloading"`
	UpdateHandoff      bool                         `json:"updateHandoff"`
	UpdateProgress     int                          `json:"updateProgress"`
	UpdateAvailableVer string                       `json:"updateAvailableVer"`
	UpdateText         string                       `json:"updateText"`
	UpdatesDisabled    bool                         `json:"updatesDisabled"`
	ResumePending      bool                         `json:"resumePending"`
	Toggles            map[string]bool              `json:"toggles"`
	LootKey            string                       `json:"lootKey"`
	DungeonKey         string                       `json:"dungeonKey"`
	LootKeyLabel       string                       `json:"lootKeyLabel"`
	DungeonKeyLabel    string                       `json:"dungeonKeyLabel"`
	FontSlots          []webFontSlotView            `json:"fontSlots"`
	LogText            string                       `json:"logText"`
}

type webUIServer struct {
	app      *app
	token    string
	listener net.Listener
	server   *http.Server
	url      string

	subMu sync.Mutex
	subs  map[chan []byte]struct{}
}

func newWebToken() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

func (a *app) startWebServer() (*webUIServer, error) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}
	s := &webUIServer{
		app:      a,
		token:    newWebToken(),
		listener: ln,
		subs:     map[chan []byte]struct{}{},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleRoot)
	mux.HandleFunc("/favicon.ico", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
	mux.HandleFunc("/ui/", s.handleUI)
	mux.HandleFunc("/assets/", s.handleAssets)
	mux.HandleFunc("/fonts/", s.handleBaseFonts)
	mux.HandleFunc("/api/user-font/", s.handleUserFont)
	mux.HandleFunc("/api/state", s.handleState)
	mux.HandleFunc("/api/events", s.handleEvents)
	mux.HandleFunc("/api/action", s.handleAction)

	s.server = &http.Server{Handler: mux}
	s.url = "http://" + ln.Addr().String() + "/?token=" + s.token
	go func() {
		_ = s.server.Serve(ln)
	}()
	return s, nil
}

func (s *webUIServer) close() {
	if s == nil {
		return
	}
	s.subMu.Lock()
	for ch := range s.subs {
		close(ch)
		delete(s.subs, ch)
	}
	s.subMu.Unlock()
	if s.server != nil {
		_ = s.server.Close()
	}
}

func (s *webUIServer) tokenOK(r *http.Request) bool {
	got := r.Header.Get("X-DFO-Token")
	if got == "" {
		got = r.URL.Query().Get("token")
	}
	return len(got) == len(s.token) && subtle.ConstantTimeCompare([]byte(got), []byte(s.token)) == 1
}

func (s *webUIServer) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	if !s.tokenOK(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	data, err := webUIAssets.ReadFile("ui_assets/index.html")
	if err != nil {
		http.Error(w, "missing ui", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(data)
}

func (s *webUIServer) handleUI(w http.ResponseWriter, r *http.Request) {
	name := path.Base(r.URL.Path)
	if name == "" || name == "." || strings.Contains(name, "..") {
		http.NotFound(w, r)
		return
	}
	data, err := webUIAssets.ReadFile("ui_assets/" + name)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	ct := mime.TypeByExtension(filepath.Ext(name))
	if strings.HasSuffix(name, ".js") {
		ct = "text/javascript; charset=utf-8"
	} else if strings.HasSuffix(name, ".css") {
		ct = "text/css; charset=utf-8"
	}
	if ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(data)
}

func (s *webUIServer) handleAssets(w http.ResponseWriter, r *http.Request) {
	rel := strings.TrimPrefix(r.URL.Path, "/assets/")
	if rel == "" || strings.Contains(rel, "..") || strings.Contains(rel, "\\") {
		http.NotFound(w, r)
		return
	}
	if rel == "launcher-theme.mp3" {
		w.Header().Set("Content-Type", "audio/mpeg")
		w.Header().Set("Cache-Control", "public, max-age=3600")
		http.ServeContent(w, r, "launcher-theme.mp3", time.Unix(0, 0), bytes.NewReader(launcherThemeMP3))
		return
	}
	data, err := webUIAssets.ReadFile("ui_assets/" + rel)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if ct := mime.TypeByExtension(filepath.Ext(rel)); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Set("Cache-Control", "public, max-age=3600")
	_, _ = w.Write(data)
}

func fontMimeType(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".ttf":
		return "font/ttf"
	case ".otf":
		return "font/otf"
	case ".woff2":
		return "font/woff2"
	case ".woff":
		return "font/woff"
	default:
		return ""
	}
}

func readFontFromPayloadZip(name string) []byte {
	zr, err := zip.NewReader(bytes.NewReader(embeddedPayload), int64(len(embeddedPayload)))
	if err != nil {
		return nil
	}
	target := "mod/fonts/" + name
	for _, f := range zr.File {
		if f.Name == target {
			rc, err := f.Open()
			if err != nil {
				return nil
			}
			b, _ := io.ReadAll(rc)
			_ = rc.Close()
			return b
		}
	}
	return nil
}

func (s *webUIServer) handleBaseFonts(w http.ResponseWriter, r *http.Request) {
	name := path.Base(r.URL.Path)
	ct := fontMimeType(name)
	if ct == "" || !safeStoredFontName(name) {
		http.NotFound(w, r)
		return
	}
	var data []byte
	if s.app.payloadDir != "" {
		data, _ = os.ReadFile(filepath.Join(s.app.payloadDir, "mod", "fonts", name))
	}
	if len(data) == 0 {
		data = readFontFromPayloadZip(name)
	}
	if len(data) == 0 {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	_, _ = w.Write(data)
}

func (s *webUIServer) handleUserFont(w http.ResponseWriter, r *http.Request) {
	if !s.tokenOK(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	name := path.Base(r.URL.Path)
	ct := fontMimeType(name)
	if ct == "" || !safeStoredFontName(name) {
		http.NotFound(w, r)
		return
	}
	ud := s.app.activeUserData()
	if ud == "" {
		http.NotFound(w, r)
		return
	}
	data, err := os.ReadFile(filepath.Join(fontFilesDir(ud), name))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", ct)
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(data)
}

func (s *webUIServer) handleState(w http.ResponseWriter, r *http.Request) {
	if !s.tokenOK(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	b := s.app.marshalWebState(true)
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(b)
}

func (s *webUIServer) handleEvents(w http.ResponseWriter, r *http.Request) {
	if !s.tokenOK(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch := make(chan []byte, 8)
	s.subMu.Lock()
	s.subs[ch] = struct{}{}
	s.subMu.Unlock()
	defer func() {
		s.subMu.Lock()
		if _, exists := s.subs[ch]; exists {
			delete(s.subs, ch)
			close(ch)
		}
		s.subMu.Unlock()
	}()

	initPayload := s.app.marshalWebState(true)
	_, _ = w.Write([]byte("data: "))
	_, _ = w.Write(initPayload)
	_, _ = w.Write([]byte("\n\n"))
	flusher.Flush()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, open := <-ch:
			if !open {
				return
			}
			_, _ = w.Write([]byte("data: "))
			_, _ = w.Write(msg)
			_, _ = w.Write([]byte("\n\n"))
			flusher.Flush()
		}
	}
}

func (s *webUIServer) broadcast(payload []byte) {
	if s == nil {
		return
	}
	s.subMu.Lock()
	for ch := range s.subs {
		select {
		case ch <- payload:
		default:
			// Replace stale snapshot with latest
			select {
			case <-ch:
			default:
			}
			select {
			case ch <- payload:
			default:
			}
		}
	}
	s.subMu.Unlock()
}

func (s *webUIServer) handleAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if !s.tokenOK(r) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	var act webAction
	if err := json.NewDecoder(io.LimitReader(r.Body, 16<<10)).Decode(&act); err != nil {
		http.Error(w, "bad json", http.StatusBadRequest)
		return
	}
	s.app.enqueueWebAction(act)
	w.WriteHeader(http.StatusNoContent)
}

func (a *app) marshalWebState(includeLocales bool) []byte {
	a.mu.Lock()
	toggles := map[string]bool{
		"ru":          a.toggles[idRu],
		"marks":       a.toggles[idMarks],
		"nearbyLoot":  a.toggles[idLoot],
		"dungeons":    a.toggles[idDungeons],
		"dungeonNav":  a.toggles[idDungeonNav],
		"enhancedUi":  true,
		"onlyVisited": a.toggles[idVisited],
	}
	exePath := a.exe
	pathHintText := ""
	if a.pathHint != "" {
		pathHintText = T(a.pathHint)
	}
	searching, querying := a.searching, a.querying
	hasStatus := a.status != nil
	installed, running := false, false
	modVer := ""
	if a.status != nil {
		installed = a.status.Installed
		running = a.status.Running
		if a.status.ModVersion != nil {
			modVer = *a.status.ModVersion
		}
	}
	busy, operation, progress, stage := a.busy, a.operation, a.progress, a.stage
	noteText := a.note.String()
	noteTone := "dim"
	switch a.noteCol {
	case colGreen:
		noteTone = "green"
	case colRed:
		noteTone = "red"
	case colBrass:
		noteTone = "brass"
	}
	hasJournalErr := a.startupError != nil ||
		(a.noteCol == colRed && (a.note.key == "installer.note.failed" || a.note.key == "installer.note.checkFailed" || a.note.key == "installer.note.payloadFailed")) ||
		a.updateText.key == "installer.update.notDone" || a.updateText.key == "installer.update.replaceFailed"
	updateChecking := a.updateChecking
	updateDownloading := a.updateDownloading
	updateHandoff := a.updateHandoff || a.handedOff
	updateProgress := a.updateProgress
	updateAvailableVer := ""
	if a.updateAvailable != nil {
		updateAvailableVer = a.updateAvailable.Version
	}
	updateText := a.updateText.String()
	updatesDisabled := a.updatesDisabled
	resumePending := a.resumePath != "" && !a.resumeCommitted
	lootKey, dungeonKey := a.lootKey, a.dungeonKey
	preset := a.fontPreset
	a.mu.Unlock()

	if preset == nil {
		preset = defaultFontPreset()
	}
	slots := make([]webFontSlotView, 0, len(fontSlots))
	for _, meta := range fontSlots {
		cfg := preset.Slots[meta.ID]
		slots = append(slots, webFontSlotView{
			ID:        meta.ID,
			BaseLabel: meta.BaseLabel,
			Custom:    cfg.Mode == "custom" && cfg.File != "",
			Label:     cfg.Label,
			File:      cfg.File,
			SHA256:    cfg.SHA256,
		})
	}
	logText := ""
	if a.logbook != nil {
		logText = a.logbook.snapshot(64 << 10)
	}

	st := webUIState{
		Name:               appName,
		Version:            appVersion,
		Author:             appAuthor,
		Lang:               lang(),
		ExePath:            exePath,
		PathHintText:       pathHintText,
		Searching:          searching,
		Querying:           querying,
		HasStatus:          hasStatus,
		Installed:          installed,
		ModVersion:         modVer,
		Running:            running,
		Busy:               busy,
		Operation:          operation,
		Progress:           progress,
		Stage:              stage,
		NoteText:           noteText,
		NoteTone:           noteTone,
		HasJournalError:    hasJournalErr,
		UpdateChecking:     updateChecking,
		UpdateDownloading:  updateDownloading,
		UpdateHandoff:      updateHandoff,
		UpdateProgress:     updateProgress,
		UpdateAvailableVer: updateAvailableVer,
		UpdateText:         updateText,
		UpdatesDisabled:    updatesDisabled,
		ResumePending:      resumePending,
		Toggles:            toggles,
		LootKey:            lootKey,
		DungeonKey:         dungeonKey,
		LootKeyLabel:       lootKeyLabel(lootKey),
		DungeonKeyLabel:    lootKeyLabel(dungeonKey),
		FontSlots:          slots,
		LogText:            logText,
	}
	if includeLocales {
		st.Locales = loadPacks()
	}
	b, _ := json.Marshal(st)
	return b
}

func (a *app) pushWebState() {
	if !a.webMode || a.webSrv == nil {
		return
	}
	a.webSrv.broadcast(a.marshalWebState(false))
}

func (a *app) enqueueWebAction(act webAction) {
	a.mu.Lock()
	a.lastUserInput = time.Now()
	a.webQueue = append(a.webQueue, act)
	a.mu.Unlock()
	if a.hwnd != 0 {
		pPostMessageW.Call(a.hwnd, wmWebAction, 0, 0)
	}
}

func (a *app) drainWebActions() {
	a.mu.Lock()
	pending := a.webQueue
	a.webQueue = nil
	a.mu.Unlock()
	for _, act := range pending {
		a.handleWebActionOnUIThread(act)
	}
}

func featureIDByKey(key string) (int, bool) {
	for _, f := range features {
		if f.Key == key && !f.Locked {
			return f.ID, true
		}
	}
	return 0, false
}

func fontSlotIndexByID(slotID string) int {
	for i, s := range fontSlots {
		if s.ID == slotID {
			return i
		}
	}
	return -1
}

func (a *app) startWebDrag() {
	if a.hwnd == 0 || !a.webMode {
		return
	}
	ks, _, _ := pGetAsyncKeyState.Call(vkLButton)
	if ks&0x8000 == 0 {
		a.stopWebDrag()
		return
	}
	var pt point
	var wr rect
	pGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
	pGetWindowRect.Call(a.hwnd, uintptr(unsafe.Pointer(&wr)))
	if !a.dragging {
		a.dragging = true
		a.mu.Lock()
		a.modalDepth++
		a.mu.Unlock()
	}
	a.dragStartPt = pt
	a.dragStartWin = wr
	pSetTimer.Call(a.hwnd, timerDrag, 10, 0)
}

func (a *app) stepWebDrag() {
	if !a.dragging || a.hwnd == 0 {
		a.stopWebDrag()
		return
	}
	ks, _, _ := pGetAsyncKeyState.Call(vkLButton)
	if ks&0x8000 == 0 {
		a.stopWebDrag()
		return
	}
	var pt point
	pGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
	nx := a.dragStartWin.left + (pt.x - a.dragStartPt.x)
	ny := a.dragStartWin.top + (pt.y - a.dragStartPt.y)
	// SWP_NOSIZE (0x01) | SWP_NOZORDER (0x04) | SWP_NOACTIVATE (0x10) = 0x15
	pSetWindowPos.Call(a.hwnd, 0, signed(nx), signed(ny), 0, 0, 0x15)
}

func (a *app) stopWebDrag() {
	if !a.dragging {
		return
	}
	a.dragging = false
	if a.hwnd != 0 {
		pKillTimer.Call(a.hwnd, timerDrag)
	}
	a.mu.Lock()
	if a.modalDepth > 0 {
		a.modalDepth--
	}
	a.lastUserInput = time.Now()
	a.mu.Unlock()
}

func (a *app) handleWebActionOnUIThread(act webAction) {
	switch act.Cmd {
	case "drag":
		a.startWebDrag()
	case "dragEnd":
		a.stopWebDrag()
	case "minimize":
		a.stopWebDrag()
		if a.hwnd != 0 {
			pShowWindow.Call(a.hwnd, swMinimize)
		}
	case "close":
		a.stopWebDrag()
		if a.hwnd != 0 {
			pPostMessageW.Call(a.hwnd, wmClose, 0, 0)
		}
	case "toggleLang":
		a.switchLang()
	case "toggleFeature":
		if a.fontsActionBusy() {
			return
		}
		if id, ok := featureIDByKey(act.Key); ok {
			a.mu.Lock()
			a.toggles[id] = !a.toggles[id]
			a.choiceRevision++
			if a.note.key == "installer.note.sameKeysFound" && !(a.toggles[idLoot] && a.toggles[idDungeons] && a.lootKey == a.dungeonKey) {
				a.note = say{}
			}
			a.mu.Unlock()
			a.syncControls()
		}
	case "toggleVisited":
		if a.fontsActionBusy() {
			return
		}
		a.mu.Lock()
		if a.toggles[idMarks] {
			a.toggles[idVisited] = !a.toggles[idVisited]
			a.choiceRevision++
		}
		a.mu.Unlock()
		a.syncControls()
	case "setKey":
		if a.fontsActionBusy() || !validLootKey(act.Code) {
			return
		}
		a.mu.Lock()
		hasStatus := a.status != nil
		enabled := (act.Target == "dungeon" && a.toggles[idDungeons]) || (act.Target != "dungeon" && a.toggles[idLoot])
		if !hasStatus || !enabled {
			a.mu.Unlock()
			return
		}
		if act.Target == "dungeon" {
			a.dungeonKey = act.Code
			a.dungeonKeyDirty = true
		} else {
			a.lootKey = act.Code
			a.lootKeyDirty = true
		}
		if a.toggles[idLoot] && a.toggles[idDungeons] && a.lootKey == a.dungeonKey {
			a.note = sayKey("installer.note.sameKeysFound")
			a.noteCol = colRed
		} else if a.note.key == "installer.note.sameKeysFound" {
			a.note = say{}
		}
		a.mu.Unlock()
		a.syncControls()
	case "browse":
		if !a.fontsActionBusy() {
			a.browse()
		}
	case "refresh":
		a.mu.Lock()
		have := a.exe != ""
		a.mu.Unlock()
		if have {
			a.requestStatus(false)
		} else {
			a.startSearch()
		}
	case "install":
		a.run("install")
	case "uninstall":
		a.run("uninstall")
	case "checkUpdates":
		a.mu.Lock()
		a.note = say{}
		a.mu.Unlock()
		a.startSelfUpdate()
	case "acceptUpdate":
		a.mu.Lock()
		rel := a.updateAvailable
		a.updateAvailable = nil
		a.mu.Unlock()
		if rel != nil {
			a.downloadSelfUpdate(rel)
		}
	case "dismissUpdate":
		a.mu.Lock()
		rel := a.updateAvailable
		a.updateAvailable = nil
		if rel != nil {
			a.updateText = sayKey("installer.update.postponed")
		}
		a.mu.Unlock()
		if rel != nil {
			a.appendLog(T("installer.log.postponed", "version", rel.Version))
			a.syncControls()
		}
	case "reloadFonts":
		a.reloadFontPreset()
		a.pushWebState()
	case "fontPick":
		if idx := fontSlotIndexByID(act.Slot); idx >= 0 {
			a.pickFontForSlot(idx)
		}
	case "fontReset":
		if idx := fontSlotIndexByID(act.Slot); idx >= 0 {
			a.resetSingleFontSlot(idx)
		}
	case "fontApplyAll":
		a.applyFontToAllSlots()
	case "fontResetAll":
		a.resetAllFonts()
	case "fontImport":
		a.importFontsDialog()
	case "fontExport":
		a.exportFontsDialog()
	case "fontOpenDir":
		a.openFontsFolder()
	case "saveLog":
		a.saveLog()
	case "openGameLog":
		a.openFile("dfo-mod.log")
	case "openMarksReport":
		a.openFile("dfo-mod-marks.txt")
	case "openInstallerLog":
		a.openInstallerLog()
	case "openUrl":
		if act.URL == boostySupportURL {
			pShellExecuteW.Call(a.hwnd, uintptr(unsafe.Pointer(u16("open"))), uintptr(unsafe.Pointer(u16(act.URL))), 0, 0, 1)
		}
	}
}
