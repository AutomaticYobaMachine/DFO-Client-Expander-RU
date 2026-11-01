// DFO Mod - the installer's window (Windows, plain Win32 through syscall: no runtime, no dependencies).
//
// It finds the game (DFO Online.exe with resources\app.asar) three folders up and three down from where it lies,
// then in the uninstall registry and the usual install folders; shows what is installed; and runs the patcher
// (patcher\patcher.cjs) with the game's own exe as Node (ELECTRON_RUN_AS_NODE), its output in the window.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

const appVersion = "1.11.1"

var exeNames = []string{"DFO Online.exe", "Daggerfall Online.exe", "DaggerfallOnline.exe"}

// ─── Win32 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
var (
	user32   = syscall.NewLazyDLL("user32.dll")
	gdi32    = syscall.NewLazyDLL("gdi32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	comdlg32 = syscall.NewLazyDLL("comdlg32.dll")
	shell32  = syscall.NewLazyDLL("shell32.dll")
	advapi32 = syscall.NewLazyDLL("advapi32.dll")

	pRegisterClassExW       = user32.NewProc("RegisterClassExW")
	pCreateWindowExW        = user32.NewProc("CreateWindowExW")
	pDefWindowProcW         = user32.NewProc("DefWindowProcW")
	pGetMessageW            = user32.NewProc("GetMessageW")
	pTranslateMessage       = user32.NewProc("TranslateMessage")
	pDispatchMessageW       = user32.NewProc("DispatchMessageW")
	pPostQuitMessage        = user32.NewProc("PostQuitMessage")
	pPostMessageW           = user32.NewProc("PostMessageW")
	pSendMessageW           = user32.NewProc("SendMessageW")
	pShowWindow             = user32.NewProc("ShowWindow")
	pUpdateWindow           = user32.NewProc("UpdateWindow")
	pBeginPaint             = user32.NewProc("BeginPaint")
	pEndPaint               = user32.NewProc("EndPaint")
	pGetClientRect          = user32.NewProc("GetClientRect")
	pInvalidateRect         = user32.NewProc("InvalidateRect")
	pFillRect               = user32.NewProc("FillRect")
	pDrawTextW              = user32.NewProc("DrawTextW")
	pLoadCursorW            = user32.NewProc("LoadCursorW")
	pLoadIconW              = user32.NewProc("LoadIconW")
	pEnableWindow           = user32.NewProc("EnableWindow")
	pMessageBoxW            = user32.NewProc("MessageBoxW")
	pAdjustWindowRect       = user32.NewProc("AdjustWindowRect")
	pGetSystemMetrics       = user32.NewProc("GetSystemMetrics")
	pSetProcessDPIAware     = user32.NewProc("SetProcessDPIAware")
	pGetDC                  = user32.NewProc("GetDC")
	pReleaseDC              = user32.NewProc("ReleaseDC")
	pCreateFontW            = gdi32.NewProc("CreateFontW")
	pCreateSolidBrush       = gdi32.NewProc("CreateSolidBrush")
	pCreatePen              = gdi32.NewProc("CreatePen")
	pSelectObject           = gdi32.NewProc("SelectObject")
	pDeleteObject           = gdi32.NewProc("DeleteObject")
	pSetTextColor           = gdi32.NewProc("SetTextColor")
	pSetBkColor             = gdi32.NewProc("SetBkColor")
	pSetBkMode              = gdi32.NewProc("SetBkMode")
	pRoundRect              = gdi32.NewProc("RoundRect")
	pCreateCompatibleDC     = gdi32.NewProc("CreateCompatibleDC")
	pCreateCompatibleBitmap = gdi32.NewProc("CreateCompatibleBitmap")
	pBitBlt                 = gdi32.NewProc("BitBlt")
	pDeleteDC               = gdi32.NewProc("DeleteDC")
	pGetDeviceCaps          = gdi32.NewProc("GetDeviceCaps")
	pGetModuleHandleW       = kernel32.NewProc("GetModuleHandleW")
	pGetOpenFileNameW       = comdlg32.NewProc("GetOpenFileNameW")
	pShellExecuteW          = shell32.NewProc("ShellExecuteW")
	pRegOpenKeyExW          = advapi32.NewProc("RegOpenKeyExW")
	pRegEnumKeyExW          = advapi32.NewProc("RegEnumKeyExW")
	pRegQueryValueExW       = advapi32.NewProc("RegQueryValueExW")
	pRegCloseKey            = advapi32.NewProc("RegCloseKey")
)

const (
	wmCreate       = 0x0001
	wmDestroy      = 0x0002
	wmPaint        = 0x000F
	wmClose        = 0x0010
	wmEraseBkgnd   = 0x0014
	wmSetFont      = 0x0030
	wmDrawItem     = 0x002B
	wmCommand      = 0x0111
	wmCtlColorEdit = 0x0133
	wmCtlColorStat = 0x0138
	wmApp          = 0x8000
	wmLog          = wmApp + 1
	wmDone         = wmApp + 2
	wmFound        = wmApp + 3
	wmStatus       = wmApp + 4

	wsOverlapped   = 0x00000000
	wsCaption      = 0x00C00000
	wsSysMenu      = 0x00080000
	wsMinimizeBox  = 0x00020000
	wsChild        = 0x40000000
	wsVisible      = 0x10000000
	wsVScroll      = 0x00200000
	wsClipChild    = 0x02000000
	esMultiline    = 0x0004
	esAutoVScroll  = 0x0040
	esReadOnly     = 0x0800
	bsOwnerDraw    = 0x0000000B
	emSetSel       = 0x00B1
	emReplaceSel   = 0x00C2
	emSetLimit     = 0x00C5
	odsSelected    = 0x0001
	odsDisabled    = 0x0004
	dtLeft         = 0x0000
	dtCenter       = 0x0001
	dtRight        = 0x0002
	dtVCenter      = 0x0004
	dtSingleLine   = 0x0020
	dtWordBreak    = 0x0010
	dtNoPrefix     = 0x0800
	dtEndEllipsis  = 0x8000
	dtPathEllipsis = 0x4000
	transparent    = 1
	cwUseDefault   = 0x80000000
)

type wndClassEx struct {
	cbSize        uint32
	style         uint32
	lpfnWndProc   uintptr
	cbClsExtra    int32
	cbWndExtra    int32
	hInstance     uintptr
	hIcon         uintptr
	hCursor       uintptr
	hbrBackground uintptr
	lpszMenuName  *uint16
	lpszClassName *uint16
	hIconSm       uintptr
}
type point struct{ x, y int32 }
type msg struct {
	hwnd    uintptr
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      point
	_       uint32
}
type rect struct{ left, top, right, bottom int32 }
type paintStruct struct {
	hdc         uintptr
	fErase      int32
	rcPaint     rect
	fRestore    int32
	fIncUpdate  int32
	rgbReserved [32]byte
}
type drawItemStruct struct {
	ctlType    uint32
	ctlID      uint32
	itemID     uint32
	itemAction uint32
	itemState  uint32
	hwndItem   uintptr
	hDC        uintptr
	rcItem     rect
	itemData   uintptr
}
type openFileName struct {
	lStructSize       uint32
	hwndOwner         uintptr
	hInstance         uintptr
	lpstrFilter       *uint16
	lpstrCustomFilter *uint16
	nMaxCustFilter    uint32
	nFilterIndex      uint32
	lpstrFile         *uint16
	nMaxFile          uint32
	lpstrFileTitle    *uint16
	nMaxFileTitle     uint32
	lpstrInitialDir   *uint16
	lpstrTitle        *uint16
	flags             uint32
	nFileOffset       uint16
	nFileExtension    uint16
	lpstrDefExt       *uint16
	lCustData         uintptr
	lpfnHook          uintptr
	lpTemplateName    *uint16
	pvReserved        uintptr
	dwReserved        uint32
	flagsEx           uint32
}

func u16(s string) *uint16      { p, _ := syscall.UTF16PtrFromString(s); return p }
func rgb(r, g, b uint8) uintptr { return uintptr(r) | uintptr(g)<<8 | uintptr(b)<<16 }

// ─── the look: the game's Enhanced theme (slate, bone, brass) ─────────────────────────────────────────────────────
var (
	colBg      = rgb(0x0e, 0x10, 0x13)
	colCard    = rgb(0x17, 0x1a, 0x1f)
	colEdge    = rgb(0x3a, 0x33, 0x27)
	colBone    = rgb(0xe9, 0xe4, 0xd9)
	colDim     = rgb(0x9a, 0x94, 0x88)
	colBrass   = rgb(0xc0, 0x8a, 0x3e)
	colBrassHi = rgb(0xd9, 0xa5, 0x5a)
	colRed     = rgb(0xb0, 0x44, 0x3a)
	colGreen   = rgb(0x61, 0xd1, 0x9d)
	colBlue    = rgb(0x4a, 0x84, 0xe8)
	colOrange  = rgb(0xd1, 0x93, 0x61)
	colLog     = rgb(0x0a, 0x0b, 0x0d)
)

const (
	idBrowse = 101 + iota
	idRu
	idMarks
	idVisited
	idInstall
	idUninstall
	idLog
	idOpenReport
	idOpenLog
)

type app struct {
	mu                           sync.Mutex
	hwnd                         uintptr
	dpi                          int32
	modDir                       string
	game                         string // folder holding the exe
	exe                          string
	status                       *gameStatus
	note                         string // the bottom line
	noteCol                      uintptr
	busy                         bool
	progress                     int
	pending                      strings.Builder
	toggles                      map[int]bool
	ctl                          map[int]uintptr
	fonts                        map[string]uintptr
	brushBg, brushCard, brushLog uintptr
	searchMsg                    string
	auto                         string // --auto-install / --auto-uninstall (tests)
}

type gameStatus struct {
	Asar       string          `json:"asar"`
	Shell      string          `json:"shell"`
	Installed  bool            `json:"installed"`
	WithRu     bool            `json:"withRu"`
	ModVersion *string         `json:"modVersion"`
	CleanCopy  bool            `json:"cleanCopy"`
	OldRu      bool            `json:"oldRu"`
	Running    bool            `json:"running"`
	UserData   string          `json:"userData"`
	Cfg        json.RawMessage `json:"cfg"`
}

var A = &app{toggles: map[int]bool{idRu: true, idMarks: true, idVisited: true}, ctl: map[int]uintptr{}, fonts: map[string]uintptr{}}

func (a *app) px(v int32) int32 { return v * a.dpi / 96 }

func (a *app) font(name string, size int32, weight int32, face string) uintptr {
	if f, ok := a.fonts[name]; ok {
		return f
	}
	f, _, _ := pCreateFontW.Call(uintptr(uint32(-a.px(size))), 0, 0, 0, uintptr(weight), 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(u16(face))))
	a.fonts[name] = f
	return f
}

// ─── finding the game ──────────────────────────────────────────────────────────────────────────────────────────────
func gameIn(dir string) string {
	if _, err := os.Stat(filepath.Join(dir, "resources", "app.asar")); err != nil {
		return ""
	}
	for _, n := range exeNames {
		if st, err := os.Stat(filepath.Join(dir, n)); err == nil && !st.IsDir() {
			return filepath.Join(dir, n)
		}
	}
	return ""
}

var skipDirs = map[string]bool{"$recycle.bin": true, "system volume information": true, "windows": true, "node_modules": true, ".git": true, "winsxs": true, "temp": true}

// search: the folders 3 levels up from `start` and, under each, 3 levels down - the nearest first.
func searchNear(start string, limit time.Duration) []string {
	deadline := time.Now().Add(limit)
	found := []string{}
	seen := map[string]bool{}
	add := func(exe string) {
		k := strings.ToLower(exe)
		if !seen[k] {
			seen[k] = true
			found = append(found, exe)
		}
	}
	bases := []string{start}
	for d, i := start, 0; i < 3; i++ {
		p := filepath.Dir(d)
		if p == d {
			break
		}
		bases = append(bases, p)
		d = p
	}
	visited := map[string]bool{}
	for _, base := range bases {
		type item struct {
			dir   string
			depth int
		}
		queue := []item{{base, 0}}
		for len(queue) > 0 && time.Now().Before(deadline) {
			it := queue[0]
			queue = queue[1:]
			key := strings.ToLower(it.dir)
			if visited[key] {
				continue
			}
			visited[key] = true
			if exe := gameIn(it.dir); exe != "" {
				add(exe)
			}
			if it.depth >= 3 {
				continue
			}
			ents, err := os.ReadDir(it.dir)
			if err != nil {
				continue
			}
			for _, e := range ents {
				if !e.IsDir() || skipDirs[strings.ToLower(e.Name())] {
					continue
				}
				queue = append(queue, item{filepath.Join(it.dir, e.Name()), it.depth + 1})
			}
		}
	}
	return found
}

// the uninstall registry's InstallLocation of anything named like the game
func searchRegistry() []string {
	out := []string{}
	for _, root := range []uintptr{0x80000001, 0x80000002} { // HKCU, HKLM
		var h uintptr
		if r, _, _ := pRegOpenKeyExW.Call(root, uintptr(unsafe.Pointer(u16(`Software\Microsoft\Windows\CurrentVersion\Uninstall`))), 0, 0x20019, uintptr(unsafe.Pointer(&h))); r != 0 {
			continue
		}
		for i := uint32(0); ; i++ {
			name := make([]uint16, 256)
			n := uint32(len(name))
			if r, _, _ := pRegEnumKeyExW.Call(h, uintptr(i), uintptr(unsafe.Pointer(&name[0])), uintptr(unsafe.Pointer(&n)), 0, 0, 0, 0); r != 0 {
				break
			}
			var sub uintptr
			if r, _, _ := pRegOpenKeyExW.Call(h, uintptr(unsafe.Pointer(&name[0])), 0, 0x20019, uintptr(unsafe.Pointer(&sub))); r != 0 {
				continue
			}
			for _, v := range []string{"InstallLocation", "DisplayIcon"} {
				buf := make([]uint16, 1024)
				size := uint32(len(buf) * 2)
				if r, _, _ := pRegQueryValueExW.Call(sub, uintptr(unsafe.Pointer(u16(v))), 0, 0, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size))); r == 0 {
					s := strings.Trim(syscall.UTF16ToString(buf), `"`)
					if i := strings.Index(strings.ToLower(s), ".exe"); i > 0 {
						s = filepath.Dir(s[:i+4])
					}
					if exe := gameIn(s); exe != "" {
						out = append(out, exe)
					}
				}
			}
			pRegCloseKey.Call(sub)
		}
		pRegCloseKey.Call(h)
	}
	return out
}

func findGame(modDir string) ([]string, string) {
	if b, err := os.ReadFile(filepath.Join(modDir, "game-path.txt")); err == nil {
		p := strings.TrimSpace(string(b))
		if exe := gameIn(filepath.Dir(p)); exe != "" {
			return []string{exe}, "путь из прошлого раза"
		}
	}
	if f := searchNear(modDir, 6*time.Second); len(f) > 0 {
		return f, "рядом с установщиком"
	}
	if f := searchRegistry(); len(f) > 0 {
		return f, "по реестру установленных программ"
	}
	for _, d := range []string{filepath.Join(os.Getenv("LOCALAPPDATA"), "Programs", "DFO Online"), filepath.Join(os.Getenv("ProgramFiles"), "DFO Online"),
		filepath.Join(os.Getenv("ProgramFiles(x86)"), "DFO Online"), `C:\games\DFO Online`, `D:\games\DFO Online`, `C:\games\Daggerfall Online\DFO Online`, `D:\games\Daggerfall Online\DFO Online`} {
		if exe := gameIn(d); exe != "" {
			return []string{exe}, "в обычной папке установки"
		}
	}
	return nil, ""
}

// ─── running the patcher ───────────────────────────────────────────────────────────────────────────────────────────
func (a *app) patcherCmd(args ...string) *exec.Cmd {
	full := append([]string{filepath.Join(a.modDir, "patcher", "patcher.cjs")}, args...)
	full = append(full, "--asar", filepath.Join(a.game, "resources", "app.asar"))
	c := exec.Command(a.exe, full...)
	c.Dir = a.modDir
	c.Env = append(os.Environ(), "ELECTRON_RUN_AS_NODE=1")
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000} // CREATE_NO_WINDOW
	return c
}

func (a *app) queryStatus() {
	out, err := a.patcherCmd("status", "--json").Output()
	var st gameStatus
	if err == nil {
		for _, line := range strings.Split(string(out), "\n") {
			if strings.HasPrefix(strings.TrimSpace(line), "{") && json.Unmarshal([]byte(strings.TrimSpace(line)), &st) == nil {
				a.mu.Lock()
				a.status = &st
				var cfg struct {
					Ru           *bool `json:"ru"`
					Marks        *bool `json:"marks"`
					MarksOptions struct {
						OnlyVisited *bool `json:"onlyVisited"`
					} `json:"marksOptions"`
				}
				if len(st.Cfg) > 0 && json.Unmarshal(st.Cfg, &cfg) == nil && st.Installed {
					if cfg.Ru != nil {
						a.toggles[idRu] = *cfg.Ru
					}
					if cfg.Marks != nil {
						a.toggles[idMarks] = *cfg.Marks
					}
					if cfg.MarksOptions.OnlyVisited != nil {
						a.toggles[idVisited] = *cfg.MarksOptions.OnlyVisited
					}
				}
				a.mu.Unlock()
				break
			}
		}
	} else {
		a.mu.Lock()
		a.status = nil
		a.note = "Не удалось прочитать состояние игры: " + err.Error()
		a.noteCol = colRed
		a.mu.Unlock()
	}
	pPostMessageW.Call(a.hwnd, wmStatus, 0, 0)
}

var pctRe = regexp.MustCompile(`^\s*(\d{1,3})%\s*$`)

func (a *app) run(what string) {
	a.mu.Lock()
	if a.busy || a.exe == "" {
		a.mu.Unlock()
		return
	}
	a.busy = true
	a.progress = 0
	a.mu.Unlock()
	a.enableButtons(false)
	b2s := func(b bool) string {
		if b {
			return "1"
		}
		return "0"
	}
	args := []string{what}
	if what == "install" {
		if !a.toggles[idRu] {
			args = append(args, "--no-ru")
		}
		args = append(args, "--set", "ru="+b2s(a.toggles[idRu]), "--set", "marks="+b2s(a.toggles[idMarks]), "--set", "onlyVisited="+b2s(a.toggles[idVisited]))
	}
	a.appendLog(fmt.Sprintf("─── %s ───\r\n", map[string]string{"install": "Установка", "uninstall": "Удаление"}[what]))
	go func() {
		c := a.patcherCmd(args...)
		r, w, _ := os.Pipe()
		c.Stdout, c.Stderr = w, w
		err := c.Start()
		w.Close()
		ok := false
		if err == nil {
			buf := make([]byte, 4096)
			line := ""
			for {
				n, e := r.Read(buf)
				if n > 0 {
					line += string(buf[:n])
					for {
						i := strings.IndexAny(line, "\r\n")
						if i < 0 {
							break
						}
						l := line[:i]
						line = line[i+1:]
						if m := pctRe.FindStringSubmatch(l); m != nil {
							p, _ := strconv.Atoi(m[1])
							a.mu.Lock()
							a.progress = p
							a.mu.Unlock()
							pInvalidateRect.Call(a.hwnd, 0, 0)
							continue
						}
						if strings.TrimSpace(l) != "" || l == "" {
							a.appendLog(l + "\r\n")
						}
					}
				}
				if e != nil {
					break
				}
			}
			if line != "" {
				a.appendLog(line + "\r\n")
			}
			ok = c.Wait() == nil
		} else {
			a.appendLog("Не удалось запустить " + a.exe + ": " + err.Error() + "\r\n")
		}
		r.Close()
		a.mu.Lock()
		a.busy = false
		if ok {
			a.progress = 100
			if what == "install" {
				a.note, a.noteCol = "Готово. Запускайте игру как обычно.", colGreen
			} else {
				a.note, a.noteCol = "Готово. Мод удалён, игра чистая.", colGreen
			}
		} else {
			a.progress = 0
			a.note, a.noteCol = "Не получилось - причина в журнале ниже.", colRed
		}
		a.mu.Unlock()
		pPostMessageW.Call(a.hwnd, wmDone, 0, 0)
		a.queryStatus()
	}()
}

func (a *app) appendLog(s string) {
	a.mu.Lock()
	a.pending.WriteString(strings.ReplaceAll(strings.ReplaceAll(s, "\r\n", "\n"), "\n", "\r\n"))
	a.mu.Unlock()
	pPostMessageW.Call(a.hwnd, wmLog, 0, 0)
}

func (a *app) enableButtons(on bool) {
	v := uintptr(0)
	if on {
		v = 1
	}
	a.mu.Lock()
	have, marks := a.exe != "", a.toggles[idMarks]
	a.mu.Unlock()
	for _, id := range []int{idBrowse, idInstall, idUninstall, idRu, idMarks, idVisited} {
		e := v
		if (id == idInstall || id == idUninstall) && !have || id == idVisited && !marks {
			e = 0
		}
		pEnableWindow.Call(a.ctl[id], e)
	}
}

func (a *app) setGame(exe string, how string) {
	a.mu.Lock()
	a.exe = exe
	a.game = filepath.Dir(exe)
	a.status = nil
	a.searchMsg = how
	a.mu.Unlock()
	os.WriteFile(filepath.Join(a.modDir, "game-path.txt"), []byte(exe), 0o644)
	pInvalidateRect.Call(a.hwnd, 0, 0)
	go a.queryStatus()
}

func (a *app) browse() {
	file := make([]uint16, 1024)
	filter := syscall.StringToUTF16("DFO Online.exe\x00DFO Online.exe;Daggerfall Online.exe;DaggerfallOnline.exe\x00Все программы (*.exe)\x00*.exe\x00\x00")
	ofn := openFileName{hwndOwner: a.hwnd, lpstrFilter: &filter[0], lpstrFile: &file[0], nMaxFile: uint32(len(file)), lpstrTitle: u16("Где лежит DFO Online.exe?"), flags: 0x00001000 | 0x00000800 | 0x00080000 | 0x00000004}
	ofn.lStructSize = uint32(unsafe.Sizeof(ofn))
	if r, _, _ := pGetOpenFileNameW.Call(uintptr(unsafe.Pointer(&ofn))); r == 0 {
		return
	}
	p := syscall.UTF16ToString(file)
	if exe := gameIn(filepath.Dir(p)); exe != "" {
		a.setGame(exe, "выбрано вручную")
	} else {
		pMessageBoxW.Call(a.hwnd, uintptr(unsafe.Pointer(u16("Рядом с этим файлом нет папки resources\\app.asar - это не установленная игра DFO Online."))), uintptr(unsafe.Pointer(u16("DFO Mod"))), 0x30)
	}
}

// ─── painting ─────────────────────────────────────────────────────────────────────────────────────────────────────
func fill(hdc uintptr, r rect, col uintptr) {
	b, _, _ := pCreateSolidBrush.Call(col)
	pFillRect.Call(hdc, uintptr(unsafe.Pointer(&r)), b)
	pDeleteObject.Call(b)
}
func roundBox(hdc uintptr, r rect, rad int32, fillCol, edgeCol uintptr) {
	b, _, _ := pCreateSolidBrush.Call(fillCol)
	p, _, _ := pCreatePen.Call(0, 1, edgeCol)
	ob, _, _ := pSelectObject.Call(hdc, b)
	op, _, _ := pSelectObject.Call(hdc, p)
	pRoundRect.Call(hdc, uintptr(r.left), uintptr(r.top), uintptr(r.right), uintptr(r.bottom), uintptr(rad), uintptr(rad))
	pSelectObject.Call(hdc, ob)
	pSelectObject.Call(hdc, op)
	pDeleteObject.Call(b)
	pDeleteObject.Call(p)
}
func text(hdc uintptr, s string, r rect, font uintptr, col uintptr, flags uintptr) {
	of, _, _ := pSelectObject.Call(hdc, font)
	pSetTextColor.Call(hdc, col)
	pSetBkMode.Call(hdc, transparent)
	w := syscall.StringToUTF16(s)
	pDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&w[0])), uintptr(len(w)-1), uintptr(unsafe.Pointer(&r)), flags|dtNoPrefix)
	pSelectObject.Call(hdc, of)
}

func (a *app) paint(hdc uintptr, cr rect) {
	a.mu.Lock()
	defer a.mu.Unlock()
	P := a.px
	fill(hdc, cr, colBg)
	// header
	text(hdc, "DFO Mod", rect{P(28), P(18), P(400), P(56)}, a.font("title", 30, 700, "Segoe UI"), colBrass, dtLeft|dtSingleLine|dtVCenter)
	text(hdc, "v"+appVersion, rect{P(400), P(18), cr.right - P(28), P(56)}, a.font("small", 13, 400, "Segoe UI"), colDim, dtRight|dtSingleLine|dtVCenter)
	text(hdc, "Метки таверн, магазинов и гильдий на Overworld + русификатор (наследник DFO_RU)", rect{P(28), P(56), cr.right - P(28), P(80)}, a.font("body", 15, 400, "Segoe UI"), colBone, dtLeft|dtSingleLine|dtVCenter|dtEndEllipsis)
	// legend
	lx := P(28)
	for _, it := range []struct {
		col  uintptr
		word string
	}{{colGreen, "таверны"}, {colBlue, "магазины"}, {colOrange, "гильдии, ордена, храмы"}} {
		fill(hdc, rect{lx, P(90), lx + P(10), P(100)}, it.col)
		text(hdc, it.word, rect{lx + P(16), P(84), lx + P(220), P(106)}, a.font("small", 13, 400, "Segoe UI"), colDim, dtLeft|dtSingleLine|dtVCenter)
		lx += P(36) + P(int32(len([]rune(it.word))*7))
	}
	// the game card
	card := rect{P(20), P(116), cr.right - P(20), P(214)}
	roundBox(hdc, card, P(10), colCard, colEdge)
	text(hdc, "ИГРА", rect{P(36), P(126), P(300), P(144)}, a.font("label", 12, 700, "Segoe UI"), colBrass, dtLeft|dtSingleLine|dtVCenter)
	where, line := a.game, ""
	col := colBone
	switch {
	case a.exe == "" && a.searchMsg == "":
		where, col = "Ищу DFO Online рядом с установщиком...", colDim
	case a.exe == "":
		where, col = "Игра не найдена. Нажмите «Обзор…» и укажите DFO Online.exe.", colRed
	default:
		line = "найдено " + a.searchMsg
		if st := a.status; st != nil {
			mod := "мод не установлен"
			if st.Installed {
				mod = "мод установлен"
				if st.ModVersion != nil {
					mod += " " + *st.ModVersion
				}
				if st.WithRu {
					mod += ", с русификатором"
				}
			}
			line = fmt.Sprintf("оболочка %s · %s", st.Shell, mod)
			if st.OldRu {
				line += " · стоит старый DFO_RU (будет заменён)"
			}
			if st.Running {
				line += " · ИГРА ЗАПУЩЕНА - закройте её"
			}
		}
	}
	text(hdc, where, rect{P(36), P(146), cr.right - P(150), P(172)}, a.font("path", 15, 600, "Segoe UI"), col, dtLeft|dtSingleLine|dtVCenter|dtPathEllipsis)
	text(hdc, line, rect{P(36), P(174), cr.right - P(150), P(200)}, a.font("small", 13, 400, "Segoe UI"), colDim, dtLeft|dtSingleLine|dtVCenter|dtEndEllipsis)
	// options card
	roundBox(hdc, rect{P(20), P(222), cr.right - P(20), P(296)}, P(10), colCard, colEdge)
	text(hdc, "СОСТАВ", rect{P(36), P(230), P(300), P(248)}, a.font("label", 12, 700, "Segoe UI"), colBrass, dtLeft|dtSingleLine|dtVCenter)
	// progress
	bar := rect{P(20), P(358), cr.right - P(20), P(364)}
	fill(hdc, bar, colEdge)
	if a.progress > 0 {
		bar.right = bar.left + (bar.right-bar.left)*int32(a.progress)/100
		fill(hdc, bar, colBrass)
	}
	// the bottom line
	note, ncol := a.note, a.noteCol
	if note == "" {
		note, ncol = "Закройте игру перед установкой. Файлы самой игры не меняются - только оболочка (resources\\app.asar), её чистая копия сохраняется рядом.", colDim
	}
	text(hdc, note, rect{P(20), cr.bottom - P(34), cr.right - P(20), cr.bottom - P(8)}, a.font("small", 13, 400, "Segoe UI"), ncol, dtLeft|dtSingleLine|dtVCenter|dtEndEllipsis)
}

func (a *app) drawItem(d *drawItemStruct) {
	a.mu.Lock()
	defer a.mu.Unlock()
	hdc, r := d.hDC, d.rcItem
	pressed, disabled := d.itemState&odsSelected != 0, d.itemState&odsDisabled != 0
	fill(hdc, r, colCard)
	switch int(d.ctlID) {
	case idRu, idMarks, idVisited:
		on := a.toggles[int(d.ctlID)]
		box := rect{r.left, r.top + (r.bottom-r.top-a.px(18))/2, r.left + a.px(18), r.top + (r.bottom-r.top+a.px(18))/2}
		edge := colBrass
		if disabled {
			edge = colEdge
		}
		roundBox(hdc, box, a.px(4), colBg, edge)
		if on {
			in := rect{box.left + a.px(4), box.top + a.px(4), box.right - a.px(4), box.bottom - a.px(4)}
			fill(hdc, in, edge)
		}
		label := map[int]string{idRu: "Русификатор", idMarks: "Метки заведений", idVisited: "Только посещённые здания"}[int(d.ctlID)]
		col := colBone
		if disabled {
			col = colDim
		}
		text(hdc, label, rect{box.right + a.px(10), r.top, r.right, r.bottom}, a.font("body", 15, 400, "Segoe UI"), col, dtLeft|dtSingleLine|dtVCenter)
	case idInstall, idUninstall, idBrowse, idOpenLog, idOpenReport:
		fill(hdc, r, colBg)
		f, edge, txt, tcol := colBrass, colBrassHi, "", colBg
		switch int(d.ctlID) {
		case idInstall:
			txt = "УСТАНОВИТЬ"
			if a.status != nil && a.status.Installed {
				txt = "ПЕРЕУСТАНОВИТЬ"
			}
		case idUninstall:
			f, edge, txt, tcol = colBg, colRed, "УДАЛИТЬ", colRed
		case idBrowse:
			f, edge, txt, tcol = colCard, colEdge, "Обзор…", colBone
		case idOpenLog:
			f, edge, txt, tcol = colBg, colEdge, "Журнал хуков", colDim
		case idOpenReport:
			f, edge, txt, tcol = colBg, colEdge, "Отчёт о метках", colDim
		}
		if pressed {
			f = edge
		}
		if disabled {
			f, edge, tcol = colCard, colEdge, colDim
		}
		roundBox(hdc, r, a.px(8), f, edge)
		fnt := a.font("button", 15, 700, "Segoe UI")
		if d.ctlID == idBrowse || d.ctlID == idOpenLog || d.ctlID == idOpenReport {
			fnt = a.font("body", 15, 400, "Segoe UI")
		}
		text(hdc, txt, r, fnt, tcol, dtCenter|dtSingleLine|dtVCenter)
	}
}

func (a *app) button(id int, x, y, w, h int32) {
	hw, _, _ := pCreateWindowExW.Call(0, uintptr(unsafe.Pointer(u16("BUTTON"))), uintptr(unsafe.Pointer(u16(""))), wsChild|wsVisible|bsOwnerDraw,
		uintptr(a.px(x)), uintptr(a.px(y)), uintptr(a.px(w)), uintptr(a.px(h)), a.hwnd, uintptr(id), 0, 0)
	a.ctl[id] = hw
}

func (a *app) openFile(name string) {
	a.mu.Lock()
	dir := ""
	if a.status != nil {
		dir = a.status.UserData
	}
	a.mu.Unlock()
	if dir == "" {
		dir = filepath.Join(os.Getenv("APPDATA"), "DFO Online")
	}
	p := filepath.Join(dir, name)
	if _, err := os.Stat(p); err != nil {
		pMessageBoxW.Call(a.hwnd, uintptr(unsafe.Pointer(u16("Файла ещё нет - он появится после запуска игры с модом:\n"+p))), uintptr(unsafe.Pointer(u16("DFO Mod"))), 0x40)
		return
	}
	pShellExecuteW.Call(a.hwnd, uintptr(unsafe.Pointer(u16("open"))), uintptr(unsafe.Pointer(u16(p))), 0, 0, 1)
}

func wndProc(hwnd uintptr, m uint32, wp, lp uintptr) uintptr {
	a := A
	switch m {
	case wmCreate:
		a.hwnd = hwnd
		a.button(idBrowse, 520, 150, 100, 32)
		a.button(idRu, 36, 252, 170, 32)
		a.button(idMarks, 214, 252, 180, 32)
		a.button(idVisited, 400, 252, 230, 32)
		a.button(idInstall, 20, 306, 300, 42)
		a.button(idUninstall, 332, 306, 140, 42)
		a.button(idOpenLog, 484, 306, 156, 19)
		a.button(idOpenReport, 484, 329, 156, 19)
		ed, _, _ := pCreateWindowExW.Call(0, uintptr(unsafe.Pointer(u16("EDIT"))), 0, wsChild|wsVisible|wsVScroll|esMultiline|esAutoVScroll|esReadOnly,
			uintptr(a.px(20)), uintptr(a.px(374)), uintptr(a.px(620)), uintptr(a.px(172)), hwnd, idLog, 0, 0)
		a.ctl[idLog] = ed
		pSendMessageW.Call(ed, wmSetFont, a.font("mono", 13, 400, "Consolas"), 1)
		pSendMessageW.Call(ed, emSetLimit, 0x7fffffff, 0)
		return 0
	case wmEraseBkgnd:
		return 1
	case wmPaint:
		var ps paintStruct
		hdc, _, _ := pBeginPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
		var cr rect
		pGetClientRect.Call(hwnd, uintptr(unsafe.Pointer(&cr)))
		mem, _, _ := pCreateCompatibleDC.Call(hdc)
		bmp, _, _ := pCreateCompatibleBitmap.Call(hdc, uintptr(cr.right), uintptr(cr.bottom))
		old, _, _ := pSelectObject.Call(mem, bmp)
		a.paint(mem, cr)
		pBitBlt.Call(hdc, 0, 0, uintptr(cr.right), uintptr(cr.bottom), mem, 0, 0, 0x00CC0020)
		pSelectObject.Call(mem, old)
		pDeleteObject.Call(bmp)
		pDeleteDC.Call(mem)
		pEndPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
		return 0
	case wmDrawItem:
		a.drawItem((*drawItemStruct)(unsafe.Pointer(lp)))
		return 1
	case wmCtlColorEdit, wmCtlColorStat:
		pSetTextColor.Call(wp, colBone)
		pSetBkColor.Call(wp, colLog)
		return a.brushLog
	case wmCommand:
		id := int(wp & 0xffff)
		switch id {
		case idBrowse:
			a.browse()
		case idRu, idMarks, idVisited:
			a.mu.Lock()
			a.toggles[id] = !a.toggles[id]
			if id == idMarks {
				pEnableWindow.Call(a.ctl[idVisited], map[bool]uintptr{true: 1, false: 0}[a.toggles[idMarks]])
			}
			a.mu.Unlock()
			pInvalidateRect.Call(a.ctl[id], 0, 0)
		case idInstall:
			a.run("install")
		case idUninstall:
			a.run("uninstall")
		case idOpenLog:
			a.openFile("dfo-mod.log")
		case idOpenReport:
			a.openFile("dfo-mod-marks.txt")
		}
		return 0
	case wmLog:
		a.mu.Lock()
		s := a.pending.String()
		a.pending.Reset()
		a.mu.Unlock()
		if s != "" {
			ed := a.ctl[idLog]
			pSendMessageW.Call(ed, emSetSel, 0x7fffffff, 0x7fffffff)
			w := syscall.StringToUTF16(s)
			pSendMessageW.Call(ed, emReplaceSel, 0, uintptr(unsafe.Pointer(&w[0])))
		}
		return 0
	case wmFound:
		return 0
	case wmDone:
		a.enableButtons(true)
		pInvalidateRect.Call(hwnd, 0, 0)
		return 0
	case wmStatus:
		for _, id := range []int{idRu, idMarks, idVisited, idInstall} {
			pInvalidateRect.Call(a.ctl[id], 0, 0)
		}
		pInvalidateRect.Call(hwnd, 0, 0)
		a.mu.Lock()
		auto := a.auto
		a.auto = ""
		ready := a.exe != "" && !a.busy
		a.mu.Unlock()
		if auto != "" && ready {
			a.run(auto)
		}
		return 0
	case wmClose:
		a.mu.Lock()
		busy := a.busy
		a.mu.Unlock()
		if busy {
			return 0 // never mid-write of app.asar
		}
	case wmDestroy:
		pPostQuitMessage.Call(0)
		return 0
	}
	r, _, _ := pDefWindowProcW.Call(hwnd, uintptr(m), wp, lp)
	return r
}

func main() {
	runtime.LockOSThread()
	pSetProcessDPIAware.Call()
	self, _ := os.Executable()
	A.modDir = filepath.Dir(self)
	for _, arg := range os.Args[1:] {
		if arg == "--auto-install" {
			A.auto = "install"
		} else if arg == "--auto-uninstall" {
			A.auto = "uninstall"
		}
	}
	if _, err := os.Stat(filepath.Join(A.modDir, "patcher", "patcher.cjs")); err != nil {
		pMessageBoxW.Call(0, uintptr(unsafe.Pointer(u16("Рядом с установщиком нет папки patcher. Распакуйте архив DFO_Mod целиком и запустите DFO_Mod.exe из распакованной папки."))), uintptr(unsafe.Pointer(u16("DFO Mod"))), 0x10)
		return
	}
	hdc, _, _ := pGetDC.Call(0)
	dpi, _, _ := pGetDeviceCaps.Call(hdc, 90) // LOGPIXELSY
	pReleaseDC.Call(0, hdc)
	A.dpi = int32(dpi)
	if A.dpi < 96 {
		A.dpi = 96
	}
	A.brushBg, _, _ = pCreateSolidBrush.Call(colBg)
	A.brushCard, _, _ = pCreateSolidBrush.Call(colCard)
	A.brushLog, _, _ = pCreateSolidBrush.Call(colLog)

	inst, _, _ := pGetModuleHandleW.Call(0)
	cursor, _, _ := pLoadCursorW.Call(0, 32512)
	icon, _, _ := pLoadIconW.Call(inst, 1)
	if icon == 0 {
		icon, _, _ = pLoadIconW.Call(0, 32512)
	}
	cls := u16("DFOModInstaller")
	wc := wndClassEx{lpfnWndProc: syscall.NewCallback(wndProc), hInstance: inst, hCursor: cursor, hIcon: icon, hIconSm: icon, hbrBackground: A.brushBg, lpszClassName: cls}
	wc.cbSize = uint32(unsafe.Sizeof(wc))
	pRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	style := uintptr(wsOverlapped | wsCaption | wsSysMenu | wsMinimizeBox | wsClipChild)
	r := rect{0, 0, A.px(660), A.px(590)}
	pAdjustWindowRect.Call(uintptr(unsafe.Pointer(&r)), style, 0)
	w, h := r.right-r.left, r.bottom-r.top
	sw, _, _ := pGetSystemMetrics.Call(0)
	sh, _, _ := pGetSystemMetrics.Call(1)
	hwnd, _, _ := pCreateWindowExW.Call(0, uintptr(unsafe.Pointer(cls)), uintptr(unsafe.Pointer(u16("DFO Mod "+appVersion+" - установщик"))), style,
		uintptr((int32(sw)-w)/2), uintptr((int32(sh)-h)/2), uintptr(w), uintptr(h), 0, 0, inst, 0)
	pShowWindow.Call(hwnd, 1)
	pUpdateWindow.Call(hwnd)
	A.enableButtons(false)
	pEnableWindow.Call(A.ctl[idBrowse], 1)
	go func() {
		found, how := findGame(A.modDir)
		if len(found) == 0 {
			A.mu.Lock()
			A.searchMsg = "none"
			A.mu.Unlock()
			pInvalidateRect.Call(A.hwnd, 0, 0)
			A.appendLog("Игра не найдена ни рядом с установщиком (3 уровня вверх и вниз), ни в реестре, ни в обычных папках.\r\nНажмите «Обзор…» и укажите DFO Online.exe.\r\n")
			return
		}
		A.setGame(found[0], how)
		A.appendLog("Игра: " + filepath.Dir(found[0]) + " (" + how + ")\r\n")
		if len(found) > 1 {
			A.appendLog(fmt.Sprintf("Найдено копий игры: %d - выбрана ближайшая. Другую можно указать через «Обзор…».\r\n", len(found)))
		}
		pPostMessageW.Call(A.hwnd, wmDone, 0, 0)
	}()
	var mm msg
	for {
		r, _, _ := pGetMessageW.Call(uintptr(unsafe.Pointer(&mm)), 0, 0, 0)
		if r == 0 || int32(r) == -1 {
			break
		}
		pTranslateMessage.Call(uintptr(unsafe.Pointer(&mm)))
		pDispatchMessageW.Call(uintptr(unsafe.Pointer(&mm)))
	}
}
