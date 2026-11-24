package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func TestWebUIServerRoutesAuthSSEAndActions(t *testing.T) {
	prevLang := lang()
	setLang("ru")
	defer setLang(prevLang)

	a := &app{
		dpi:        96,
		prefsDir:   t.TempDir(),
		toggles:    defaults(),
		lootKey:    defaultLootKey,
		dungeonKey: defaultDungeonKey,
		fontPreset: defaultFontPreset(),
		status:     &gameStatus{Asar: "C:\\game\\resources\\app.asar", Installed: true},
		ctl:        map[int]uintptr{},
	}
	srv, err := a.startWebServer()
	if err != nil {
		t.Fatalf("startWebServer failed: %v", err)
	}
	defer srv.close()
	a.webMode = true
	a.webSrv = srv

	base := "http://" + srv.listener.Addr().String()
	client := &http.Client{Timeout: 5 * time.Second}

	// 1. Auth token enforcement
	for _, ep := range []string{"/", "/api/state", "/api/events", "/api/user-font/test.ttf"} {
		res, err := client.Get(base + ep)
		if err != nil {
			t.Fatalf("GET %s: %v", ep, err)
		}
		res.Body.Close()
		if res.StatusCode != http.StatusForbidden {
			t.Fatalf("GET %s without token: got %d want 403", ep, res.StatusCode)
		}
	}
	badAct, err := client.Post(base+"/api/action", "application/json", strings.NewReader(`{"cmd":"toggleLang"}`))
	if err != nil {
		t.Fatalf("POST /api/action: %v", err)
	}
	badAct.Body.Close()
	if badAct.StatusCode != http.StatusForbidden {
		t.Fatalf("POST /api/action without token: got %d want 403", badAct.StatusCode)
	}

	// 2. Embedded assets, dungeon frames, fonts, and audio Range streaming
	for _, tc := range []struct {
		path string
		ct   string
	}{
		{"/?token=" + srv.token, "text/html"},
		{"/ui/installer-app.js", "text/javascript"},
		{"/ui/installer-scene.js", "text/javascript"},
		{"/ui/installer-styles.css", "text/css"},
		{"/assets/tbank-qr.jpg", "image/jpeg"},
		{"/assets/gauntlet-cursor-2x.png", "image/png"},
		{"/assets/dungeon/bg_F0.png", "image/png"},
		{"/assets/dungeon/occ3_F11.png", "image/png"},
		{"/fonts/item-font-text.ttf", "font/ttf"},
		{"/fonts/item-font-description.otf", "font/otf"},
	} {
		res, err := client.Get(base + tc.path)
		if err != nil {
			t.Fatalf("GET %s: %v", tc.path, err)
		}
		body, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode != http.StatusOK || len(body) == 0 {
			t.Fatalf("GET %s: status=%d len=%d", tc.path, res.StatusCode, len(body))
		}
		if !strings.Contains(res.Header.Get("Content-Type"), tc.ct) {
			t.Fatalf("GET %s: content-type=%q want substring %q", tc.path, res.Header.Get("Content-Type"), tc.ct)
		}
	}

	// Audio range request
	reqAudio, _ := http.NewRequest(http.MethodGet, base+"/assets/launcher-theme.mp3", nil)
	reqAudio.Header.Set("Range", "bytes=0-1023")
	resAudio, err := client.Do(reqAudio)
	if err != nil {
		t.Fatalf("GET audio range: %v", err)
	}
	audioChunk, _ := io.ReadAll(resAudio.Body)
	resAudio.Body.Close()
	if resAudio.StatusCode != http.StatusPartialContent || len(audioChunk) != 1024 {
		t.Fatalf("audio range: status=%d len=%d", resAudio.StatusCode, len(audioChunk))
	}

	// Path traversal blocked
	resTrav, err := client.Get(base + "/assets/..%2Findex.html")
	if err != nil {
		t.Fatalf("GET traversal: %v", err)
	}
	resTrav.Body.Close()
	if resTrav.StatusCode != http.StatusNotFound {
		t.Fatalf("traversal must return 404, got %d", resTrav.StatusCode)
	}

	// 3. State JSON contract
	resState, err := client.Get(base + "/api/state?token=" + srv.token)
	if err != nil {
		t.Fatalf("GET /api/state: %v", err)
	}
	var st webUIState
	if err := json.NewDecoder(resState.Body).Decode(&st); err != nil {
		resState.Body.Close()
		t.Fatalf("decode /api/state: %v", err)
	}
	resState.Body.Close()
	if st.Version != appVersion || st.Lang != "ru" || !st.Toggles["dungeonNav"] || !st.Toggles["enhancedUi"] {
		t.Fatalf("unexpected initial web state: %+v", st.Toggles)
	}
	if len(st.FontSlots) != 8 {
		t.Fatalf("expected 8 font slots, got %d", len(st.FontSlots))
	}
	if len(st.Locales["ru"]) == 0 || len(st.Locales["en"]) == 0 {
		t.Fatalf("expected embedded RU/EN locales in state")
	}

	// 4. SSE stream initial snapshot + live push
	sseClient := &http.Client{Timeout: 5 * time.Second}
	sseRes, err := sseClient.Get(base + "/api/events?token=" + srv.token)
	if err != nil {
		t.Fatalf("GET /api/events: %v", err)
	}
	defer sseRes.Body.Close()
	rd := bufio.NewReader(sseRes.Body)
	firstLine, err := rd.ReadString('\n')
	if err != nil || !strings.HasPrefix(firstLine, "data: ") {
		t.Fatalf("SSE first frame invalid: %q err=%v", firstLine, err)
	}
	_, _ = rd.ReadString('\n') // blank separator

	// Trigger live state push via action
	a.handleWebActionOnUIThread(webAction{Cmd: "toggleFeature", Key: "dungeonNav"})
	secondLine, err := rd.ReadString('\n')
	if err != nil || !strings.HasPrefix(secondLine, "data: ") {
		t.Fatalf("SSE pushed frame invalid: %q err=%v", secondLine, err)
	}
	var pushed webUIState
	if err := json.Unmarshal([]byte(strings.TrimPrefix(strings.TrimSpace(secondLine), "data: ")), &pushed); err != nil {
		t.Fatalf("decode SSE frame: %v", err)
	}
	if pushed.Toggles["dungeonNav"] {
		t.Fatalf("expected dungeonNav=false after toggleFeature")
	}

	// 5. Locked feature cannot be disabled; visited respects marks; hotkeys validate & detect collisions
	a.handleWebActionOnUIThread(webAction{Cmd: "toggleFeature", Key: "enhancedUi"})
	if !a.toggles[idEnhancedUi] {
		t.Fatal("enhancedUi must stay locked true")
	}
	a.handleWebActionOnUIThread(webAction{Cmd: "toggleFeature", Key: "marks"}) // marks -> false
	wasVisited := a.toggles[idVisited]
	a.handleWebActionOnUIThread(webAction{Cmd: "toggleVisited"})
	if a.toggles[idVisited] != wasVisited {
		t.Fatal("toggleVisited must be ignored when marks is disabled")
	}

	a.handleWebActionOnUIThread(webAction{Cmd: "setKey", Target: "loot", Code: "Space"})
	if a.lootKey != "Space" {
		t.Fatalf("expected lootKey=Space, got %q", a.lootKey)
	}
	a.handleWebActionOnUIThread(webAction{Cmd: "setKey", Target: "dungeon", Code: "Space"})
	if a.dungeonKey != "Space" || a.note.key != "installer.note.sameKeysFound" {
		t.Fatalf("expected collision note, got key=%q note=%q", a.dungeonKey, a.note.key)
	}
	a.handleWebActionOnUIThread(webAction{Cmd: "setKey", Target: "dungeon", Code: "Mouse4"})
	if a.dungeonKey != "Mouse4" || a.note.key != "" {
		t.Fatalf("expected collision note cleared, got key=%q note=%q", a.dungeonKey, a.note.key)
	}
	a.handleWebActionOnUIThread(webAction{Cmd: "setKey", Target: "loot", Code: "Mouse6"})
	if a.lootKey != "Space" {
		t.Fatalf("invalid key Mouse6 must be rejected, got %q", a.lootKey)
	}

	// Disabled feature rejects setKey
	a.handleWebActionOnUIThread(webAction{Cmd: "toggleFeature", Key: "dungeons"}) // dungeons -> false
	a.handleWebActionOnUIThread(webAction{Cmd: "setKey", Target: "dungeon", Code: "Mouse5"})
	if a.dungeonKey != "Mouse4" {
		t.Fatalf("disabled dungeons feature must reject setKey, got %q", a.dungeonKey)
	}

	// Action endpoint queues work cleanly with valid token
	reqAct, _ := http.NewRequest(http.MethodPost, base+"/api/action", bytes.NewReader([]byte(`{"cmd":"toggleFeature","key":"ru"}`)))
	reqAct.Header.Set("Content-Type", "application/json")
	reqAct.Header.Set("X-DFO-Token", srv.token)
	resAct, err := client.Do(reqAct)
	if err != nil {
		t.Fatalf("POST /api/action valid: %v", err)
	}
	resAct.Body.Close()
	if resAct.StatusCode != http.StatusNoContent {
		t.Fatalf("POST /api/action status=%d want 204", resAct.StatusCode)
	}
	a.drainWebActions()
	if a.toggles[idRu] {
		t.Fatal("queued toggleFeature ru did not execute on drainWebActions")
	}
}

func TestWebUIChromeE2E(t *testing.T) {
	script := os.Getenv("DFO_CHROME_E2E_SCRIPT")
	nodeBin := os.Getenv("DFO_CHROME_E2E_NODE")
	if script == "" || nodeBin == "" {
		t.Skip("DFO_CHROME_E2E_SCRIPT not configured")
	}
	prevLang := lang()
	setLang("ru")
	defer setLang(prevLang)

	tmp := t.TempDir()
	logbook := newSessionJournal(tmp, tmp)
	defer logbook.close()
	logbook.append("DFO-Client-Expander-RU · " + appVersion + "\r\nReady.\r\n")

	a := &app{
		dpi:        96,
		prefsDir:   tmp,
		exe:        `C:\Games\DFO Online\Daggerfall Online.exe`,
		toggles:    defaults(),
		lootKey:    defaultLootKey,
		dungeonKey: defaultDungeonKey,
		fontPreset: defaultFontPreset(),
		status:     &gameStatus{Asar: `C:\Games\DFO Online\resources\app.asar`, Installed: false, UserData: tmp},
		logbook:    logbook,
		ctl:        map[int]uintptr{},
	}
	srv, err := a.startWebServer()
	if err != nil {
		t.Fatalf("startWebServer: %v", err)
	}
	defer srv.close()
	a.webMode = true
	a.webSrv = srv

	// Drain queued actions as the real Win32 message loop would.
	stopDrain := make(chan struct{})
	go func() {
		tk := time.NewTicker(8 * time.Millisecond)
		defer tk.Stop()
		for {
			select {
			case <-stopDrain:
				return
			case <-tk.C:
				a.drainWebActions()
			}
		}
	}()
	defer close(stopDrain)

	// Control endpoint for test mutations (installed / running / updateAvailable / inspect).
	ctrlLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	ctrlMux := http.NewServeMux()
	ctrlMux.HandleFunc("/inspect", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(a.marshalWebState(false))
	})
	ctrlMux.HandleFunc("/setInstalled", func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Installed bool }
		_ = json.NewDecoder(r.Body).Decode(&body)
		a.mu.Lock()
		a.status.Installed = body.Installed
		if body.Installed {
			v := appVersion
			a.status.ModVersion = &v
		} else {
			a.status.ModVersion = nil
		}
		a.mu.Unlock()
		a.pushWebState()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	ctrlMux.HandleFunc("/setRunning", func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Running bool }
		_ = json.NewDecoder(r.Body).Decode(&body)
		a.mu.Lock()
		a.status.Running = body.Running
		a.mu.Unlock()
		a.pushWebState()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	ctrlMux.HandleFunc("/setUpdate", func(w http.ResponseWriter, r *http.Request) {
		var body struct{ Version string }
		_ = json.NewDecoder(r.Body).Decode(&body)
		a.mu.Lock()
		a.updateAvailable = &updateRelease{Version: body.Version}
		a.mu.Unlock()
		a.pushWebState()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	ctrlSrv := &http.Server{Handler: ctrlMux}
	go func() { _ = ctrlSrv.Serve(ctrlLn) }()
	defer ctrlSrv.Close()

	cmd := exec.Command(nodeBin, script, srv.url, "http://"+ctrlLn.Addr().String())
	cmd.Env = append(os.Environ(), "ELECTRON_RUN_AS_NODE=1")
	out, err := cmd.CombinedOutput()
	t.Log(string(out))
	if err != nil {
		t.Fatalf("Chrome E2E failed: %v", err)
	}
}
