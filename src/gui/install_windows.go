package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

func (a *app) patcherCmd(ctx context.Context, exe string, args ...string) *exec.Cmd {
	full := append([]string{filepath.Join(a.payloadDir, "patcher", "patcher.cjs")}, args...)
	full = append(full, "--asar", filepath.Join(filepath.Dir(exe), "resources", "app.asar"), "--lang", lang())
	c := exec.CommandContext(ctx, exe, full...)
	c.Dir = a.payloadDir
	c.Env = append(os.Environ(), "ELECTRON_RUN_AS_NODE=1")
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	return c
}

func (a *app) appendLog(s string) {
	a.logbook.append(s)
	if a.hwnd != 0 && a.logPosted.CompareAndSwap(false, true) {
		pPostMessageW.Call(a.hwnd, wmLog, 0, 0)
	}
}

func (a *app) startSearch() {
	a.mu.Lock()
	if a.busy || a.searching || a.startupError != nil {
		a.mu.Unlock()
		return
	}
	a.searching = true
	token := a.generation
	a.mu.Unlock()
	a.syncControls()
	invalidate(a.hwnd)
	a.wg.Add(1)
	go func() {
		defer a.wg.Done()
		var found []string
		how := ""
		if b, e := os.ReadFile(filepath.Join(a.prefsDir, "game-path.txt")); e == nil {
			if exe := gameIn(filepath.Dir(strings.TrimSpace(string(b)))); exe != "" {
				found = []string{exe}
				how = T("installer.how.saved")
			}
		}
		if len(found) == 0 && a.ctx.Err() == nil {
			found, how = findGame(a.modDir)
		}
		a.mu.Lock()
		a.searching = false
		if token == a.generation {
			a.searchFound = found
			a.searchHow = how
			a.searchReady = true
		}
		a.mu.Unlock()
		if a.ctx.Err() == nil {
			pPostMessageW.Call(a.hwnd, wmSearch, 0, 0)
		}
	}()
}

func (a *app) setGame(exe, how string) {
	if absolute, err := filepath.Abs(exe); err == nil {
		exe = absolute
	}
	a.mu.Lock()
	sameGame := a.exe != "" && strings.EqualFold(filepath.Clean(a.exe), filepath.Clean(exe))
	resuming := a.updateResume != nil && a.updateResume.Dirty && (a.updateResume.Game == "" || sameUpdatePath(a.updateResume.Game, exe))
	if a.updateResume != nil && a.updateResume.Game != "" && !sameUpdatePath(a.updateResume.Game, exe) {
		a.updateResume = nil
	}
	a.generation++
	a.exe = exe
	a.status = nil
	if !sameGame && !resuming {
		a.lootKey, a.lootKeyDirty = defaultLootKey, false
	}
	a.capturingKey = false
	a.recordedKey, a.recordedMouse = 0, 0
	a.querying = false
	a.searchHow = how
	a.note = say{}
	a.pathHint = ""
	a.mu.Unlock()
	caption(a.ctl[idPath], exe)
	if e := os.MkdirAll(a.prefsDir, 0700); e == nil {
		_ = os.WriteFile(filepath.Join(a.prefsDir, "game-path.txt"), []byte(exe), 0600)
	}
	a.appendLog(T("installer.log.client", "exe", exe, "how", how) + "\r\n")
	a.requestStatus(true)
}

func (a *app) requestStatus(restoreChoices bool) {
	if a.ctx.Err() != nil {
		return
	}
	a.mu.Lock()
	if a.exe == "" || a.querying || a.busy || a.startupError != nil {
		a.mu.Unlock()
		return
	}
	exe, token, revision := a.exe, a.generation, a.choiceRevision
	a.querying = true
	a.mu.Unlock()
	pPostMessageW.Call(a.hwnd, wmStatus, 0, 0)
	a.wg.Add(1)
	go func() {
		defer a.wg.Done()
		ctx, cancel := context.WithTimeout(a.ctx, 20*time.Second)
		defer cancel()
		a.appendLog(T("installer.log.checking", "exe", exe))
		out, err := a.patcherCmd(ctx, exe, "status", "--json").CombinedOutput()
		if ctx.Err() != nil {
			err = errors.Join(err, ctx.Err())
		}
		a.appendLog(T("installer.log.checkOutput") + "\r\n" + string(out))
		if err != nil {
			a.appendLog(T("installer.log.checkResult", "error", err.Error()))
		}
		var st *gameStatus
		if err == nil {
			for _, line := range strings.Split(string(out), "\n") {
				var value gameStatus
				if strings.HasPrefix(strings.TrimSpace(line), "{") && json.Unmarshal([]byte(strings.TrimSpace(line)), &value) == nil && value.Asar != "" {
					st = &value
					break
				}
			}
		}
		if st == nil && err == nil {
			err = errors.New(T("installer.err.statusJson"))
		}
		a.mu.Lock()
		if token != a.generation || a.ctx.Err() != nil {
			a.mu.Unlock()
			return
		}
		a.querying = false
		a.status = st
		if st != nil && restoreChoices && st.Installed && revision == a.choiceRevision {
			a.toggles = loadChoices(st.Cfg, a.toggles)
		}
		if st != nil && !a.lootKeyDirty {
			a.lootKey = resolveLootKey(st)
		}
		if st != nil && !a.dungeonKeyDirty {
			a.dungeonKey = resolveDungeonKey(st)
		}
		a.restoreUpdateChoices(st, exe)
		if st == nil {
			a.note = sayKey("installer.note.checkFailed")
			a.noteCol = colRed
			a.page = idJournal
		}
		if st != nil && a.toggles[idLoot] && a.toggles[idDungeons] && a.lootKey == a.dungeonKey {
			a.note = sayKey("installer.note.sameKeysFound")
			a.noteCol = colRed
		}
		a.mu.Unlock()
		if st == nil {
			a.appendLog(T("installer.log.checkFailed", "error", err.Error()))
		} else {
			if st.UserData != "" {
				if e := a.logbook.move(st.UserData); e != nil {
					a.appendLog(T("installer.log.journalMove", "error", e.Error()))
				} else {
					_ = a.logbook.captureCrashes()
				}
			}
			path, _ := a.logbook.location()
			a.appendLog(T("installer.log.journal", "path", path))
			key := resolveLootKey(st)
			source := "installer.log.lootKeyProfile"
			if validLootKey(st.CachedLootKey) {
				source = "installer.log.lootKeyCache"
			}
			a.appendLog(T(source, "key", lootKeyLabel(key), "profile", st.UserData) + "\r\n")
		}
		a.logbook.sync()
		pPostMessageW.Call(a.hwnd, wmStatus, 0, 0)
	}()
}

var pctRe = regexp.MustCompile(`^\s*(\d{1,3})%\s*$`)

func (a *app) run(what string) {
	if what != "install" && what != "uninstall" {
		return
	}
	a.mu.Lock()
	if a.startupError != nil || a.busy || a.updateDownloading || a.updateHandoff || a.handedOff || a.resumePath != "" && !a.resumeCommitted || a.querying || a.capturingKey || a.exe == "" || a.status == nil || a.status.Running {
		a.mu.Unlock()
		return
	}
	if what == "install" && selectedCount(a.toggles) == 0 {
		a.note = sayKey("installer.note.pickOne")
		a.noteCol = colDim
		a.mu.Unlock()
		invalidate(a.hwnd)
		return
	}
	if what == "uninstall" && !a.status.Installed {
		a.mu.Unlock()
		return
	}
	a.busy = true
	a.updateText = say{}
	a.operation = what
	a.progress = 0
	a.note = say{}
	a.stage = T("installer.stage.preparing")
	exe := a.exe
	keyOverride := a.lootKey
	args := operationArgs(what, a.toggles, keyOverride, a.dungeonKey)
	a.mu.Unlock()
	a.syncControls()
	invalidate(a.hwnd)
	a.appendLog("\r\n" + time.Now().Format("02.01.2006 15:04:05") + " · " + T("installer.log.op."+what) + "\r\n")
	a.wg.Add(1)
	go func() {
		defer a.wg.Done()
		// Closing the window is disabled while the archive is being replaced.
		// A UI/status timeout must never kill an installation mid-write.
		c := a.patcherCmd(context.Background(), exe, args...)
		a.appendLog(T("installer.log.command", "cmd", c.String()))
		err := runLoggedCommand(c, func(line string) {
			a.appendLog(line)
			if m := pctRe.FindStringSubmatch(line); m != nil {
				p, _ := strconv.Atoi(m[1])
				if p > 100 {
					p = 100
				}
				a.mu.Lock()
				a.progress = p
				a.mu.Unlock()
			} else if strings.TrimSpace(line) != "" {
				a.mu.Lock()
				a.stage = diagnosticStage(line)
				a.mu.Unlock()
			}
		})
		if err != nil {
			a.appendLog(T("installer.log.opFailed", "error", err.Error()) + "\r\n")
		}
		if err == nil {
			a.appendLog(T("installer.log.opDone"))
		}
		a.logbook.sync()
		a.mu.Lock()
		a.busy = false
		if err == nil {
			a.progress = 100
			a.noteCol = colGreen
			if what == "install" {
				a.lootKeyDirty = false
				a.dungeonKeyDirty = false
				a.savedChoiceRevision = a.choiceRevision
				a.note = sayKey("installer.note.installed")

			} else {
				a.note = sayKey("installer.note.removed")
			}
		} else {
			a.progress = 0
			a.noteCol = colRed
			a.note = sayKey("installer.note.failed")
			a.page = idJournal
		}
		a.mu.Unlock()
		pPostMessageW.Call(a.hwnd, wmDone, 0, 0)
		a.requestStatus(false)
	}()
}

func (a *app) browse() {
	defer a.updateModal()()
	file := make([]uint16, 32768)
	filter := dialogFilter(T("installer.filter.client"), "DFO Online.exe;Daggerfall Online.exe;DaggerfallOnline.exe", T("installer.filter.programs"), "*.exe")
	ofn := openFileName{hwndOwner: a.hwnd, lpstrFilter: &filter[0], nFilterIndex: 1, lpstrFile: &file[0], nMaxFile: uint32(len(file)), lpstrTitle: u16(T("installer.dialog.pickGame")), flags: 0x1000 | 0x0800 | 0x80000 | 0x0008}
	ofn.lStructSize = uint32(unsafe.Sizeof(ofn))
	if r, _, _ := pGetOpenFileNameW.Call(uintptr(unsafe.Pointer(&ofn))); r == 0 {
		return
	}
	p := syscall.UTF16ToString(file)
	if exe := gameIn(filepath.Dir(p)); exe != "" {
		a.setGame(exe, T("installer.how.manual"))
	} else {
		a.message(T("installer.msg.notClient"), 0x30)
	}
}

func (a *app) message(s string, kind uintptr) uintptr {
	defer a.updateModal()()
	r, _, _ := pMessageBoxW.Call(a.hwnd, uintptr(unsafe.Pointer(u16(s))), uintptr(unsafe.Pointer(u16(appName))), kind)
	return r
}
func (a *app) openGuide() {
	name := guideName(lang())
	p := filepath.Join(a.payloadDir, name)
	if _, e := os.Stat(p); e != nil {
		name = "README.txt"
		p = filepath.Join(a.payloadDir, name)
	}
	if data, e := os.ReadFile(p); e == nil && os.MkdirAll(a.prefsDir, 0700) == nil {
		dest := filepath.Join(a.prefsDir, name)
		if os.WriteFile(dest, data, 0600) == nil {
			p = dest
		}
	}
	r, _, _ := pShellExecuteW.Call(a.hwnd, uintptr(unsafe.Pointer(u16("open"))), uintptr(unsafe.Pointer(u16(p))), 0, 0, 1)
	if r <= 32 {
		a.message(T("installer.msg.guideFailed"), 0x30)
	}
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
		a.message(T("installer.msg.noReport"), 0x40)
		return
	}
	pShellExecuteW.Call(a.hwnd, uintptr(unsafe.Pointer(u16("open"))), uintptr(unsafe.Pointer(u16(p))), 0, 0, 1)
}
func (a *app) saveLog() {
	defer a.updateModal()()
	file := make([]uint16, 32768)
	copy(file, syscall.StringToUTF16(appName+"-install.log"))
	filter := dialogFilter(T("installer.filter.log"), "*.log", T("installer.filter.all"), "*.*")
	ofn := openFileName{hwndOwner: a.hwnd, lpstrFilter: &filter[0], nFilterIndex: 1, lpstrFile: &file[0], nMaxFile: uint32(len(file)), lpstrTitle: u16(T("installer.dialog.saveLog")), lpstrDefExt: u16("log"), flags: 0x2 | 0x800 | 0x80000 | 0x8}
	ofn.lStructSize = uint32(unsafe.Sizeof(ofn))
	if r, _, _ := pGetSaveFileNameW.Call(uintptr(unsafe.Pointer(&ofn))); r == 0 {
		return
	}
	s := a.logbook.snapshot(0)
	if err := os.WriteFile(syscall.UTF16ToString(file), []byte(s), 0600); err != nil {
		a.message(T("installer.msg.saveLogFailed", "error", err.Error()), 0x10)
	}
}

func (a *app) openInstallerLog() {
	a.logbook.sync()
	path, err := a.logbook.location()
	if path == "" || err != nil {
		a.message(T("installer.msg.journalUnavailable", "error", fmt.Sprint(err)), 0x30)
		return
	}
	r, _, _ := pShellExecuteW.Call(a.hwnd, uintptr(unsafe.Pointer(u16("open"))), uintptr(unsafe.Pointer(u16(path))), 0, 0, 1)
	if r <= 32 {
		a.message(T("installer.msg.journalOpenFailed", "path", path), 0x30)
	}
}
