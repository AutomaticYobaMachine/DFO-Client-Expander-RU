package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"debug/pe"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

var updateOpenProcess = kernel32.NewProc("OpenProcess")
var updateQueryImage = kernel32.NewProc("QueryFullProcessImageNameW")
var updateWaitProcess = kernel32.NewProc("WaitForSingleObject")
var updateCloseHandle = kernel32.NewProc("CloseHandle")
var updateReplaceFile = kernel32.NewProc("ReplaceFileW")
var updateMoveFile = kernel32.NewProc("MoveFileExW")
var updateFindWindow = user32.NewProc("FindWindowExW")
var updateForeground = user32.NewProc("GetForegroundWindow")

func updatesRoot() string { return filepath.Join(os.Getenv("LOCALAPPDATA"), appName, "updates") }
func sameUpdatePath(a, b string) bool {
	return strings.EqualFold(filepath.Clean(strings.TrimPrefix(a, `\\?\`)), filepath.Clean(strings.TrimPrefix(b, `\\?\`)))
}
func hiddenUpdateCommand(exe string, args ...string) *exec.Cmd {
	c := updateWindowCommand(exe, args...)
	c.SysProcAttr.HideWindow = true
	return c
}
func updateWindowCommand(exe string, args ...string) *exec.Cmd {
	c := exec.Command(exe, args...)
	c.Dir = filepath.Dir(exe)
	// A hidden STARTUPINFO flag would override the GUI's first ShowWindow call.
	// CREATE_NO_WINDOW alone suppresses a console without hiding the new GUI.
	c.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x08000000}
	return c
}

type cappedUpdateOutput struct{ bytes.Buffer }

func (b *cappedUpdateOutput) Write(p []byte) (int, error) {
	if b.Len()+len(p) > 4096 {
		return 0, errors.New("слишком большой ответ установщика")
	}
	return b.Buffer.Write(p)
}

func probeUpdateInstaller(ctx context.Context, path string) (installerInfo, error) {
	var info installerInfo
	f, err := pe.Open(path)
	if err != nil {
		return info, err
	}
	header, ok := f.OptionalHeader.(*pe.OptionalHeader64)
	valid := f.Machine == pe.IMAGE_FILE_MACHINE_AMD64 && ok && header.Subsystem == pe.IMAGE_SUBSYSTEM_WINDOWS_GUI
	f.Close()
	if !valid {
		return info, errors.New("ожидался установщик Windows x64")
	}
	ctx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	c := exec.CommandContext(ctx, path, "--dfo-update-info")
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	var output cappedUpdateOutput
	c.Stdout = &output
	if err = c.Run(); err != nil {
		return info, err
	}
	err = json.Unmarshal(output.Bytes(), &info)
	return info, err
}

// Runs before unpacking the payload or opening a window. Helpers never invoke
// the patcher, terminate a game process or change settings in the game profile.
func earlyUpdateMode(args []string) (bool, int) {
	if len(args) == 1 && args[0] == "--dfo-update-info" {
		json.NewEncoder(os.Stdout).Encode(installerInfo{Product: appName, Version: appVersion, Protocol: updateProtocol})
		return true, 0
	}
	if len(args) == 2 && args[0] == "--dfo-apply-update" {
		if err := runUpdateHelper(args[1]); err != nil {
			fmt.Fprintln(os.Stderr, err)
			return true, 1
		}
		return true, 0
	}
	return false, 0
}

func openUpdateParent(p *updatePlan) (uintptr, error) {
	h, _, err := updateOpenProcess.Call(0x00100000|0x1000, 0, uintptr(p.ParentPID))
	if h == 0 {
		return 0, err
	}
	name := make([]uint16, 32768)
	size := uint32(len(name))
	ok, _, err := updateQueryImage.Call(h, 0, uintptr(unsafe.Pointer(&name[0])), uintptr(unsafe.Pointer(&size)))
	if ok == 0 || !sameUpdatePath(syscall.UTF16ToString(name[:size]), p.Target) {
		updateCloseHandle.Call(h)
		return 0, errors.New("родительский процесс не является обновляемым установщиком")
	}
	return h, nil
}

func replaceUpdateFile(target, incoming, backup string) error {
	r, _, err := updateReplaceFile.Call(uintptr(unsafe.Pointer(u16(target))), uintptr(unsafe.Pointer(u16(incoming))), uintptr(unsafe.Pointer(u16(backup))), 0, 0, 0)
	if r == 0 {
		return err
	}
	return nil
}
func restoreUpdateFile(target, backup string) error {
	r, _, err := updateMoveFile.Call(uintptr(unsafe.Pointer(u16(backup))), uintptr(unsafe.Pointer(u16(target))), 1|8)
	if r == 0 {
		return err
	}
	return nil
}

func runUpdateHelper(path string) (err error) {
	journal := newSessionJournal(filepath.Join(os.Getenv("APPDATA"), "DFO Online"), filepath.Join(os.Getenv("LOCALAPPDATA"), appName, "logs"))
	defer journal.close()
	defer func() {
		if err != nil {
			journal.append("Помощник обновления: " + err.Error())
		} else {
			journal.append("Замена EXE подтверждена. Автоматическое применение к игре отключено.")
		}
	}()
	journal.append(fmt.Sprintf("Помощник обновления PID=%d. План: %s", os.Getpid(), path))
	path, _ = filepath.Abs(path)
	p, err := loadUpdatePlan(path, updatesRoot())
	if err != nil {
		return err
	}
	if p.Resume.LogDir != "" {
		if e := journal.move(p.Resume.LogDir); e != nil {
			journal.append("Перенос журнала помощника: " + e.Error())
		}
	}
	_ = journal.captureCrashes()
	dir := filepath.Dir(path)
	ready := filepath.Join(dir, "ready.json")
	defer func() {
		if err != nil {
			_ = writeUpdateJSON(ready, updateResult{State: "error", Error: err.Error()})
		}
	}()
	self, _ := os.Executable()
	if p.Version != appVersion || !sameUpdatePath(self, p.Download) {
		return errors.New("запущен другой файл обновления")
	}
	parent, err := openUpdateParent(p)
	if err != nil {
		return err
	}
	defer updateCloseHandle.Call(parent)
	// A non-shared handle serializes helpers for the same portable EXE. A stale
	// lock file is harmless: the OS releases its handle when a process exits.
	key := shaTarget(p.Target)
	lockPath := filepath.Join(updatesRoot(), "lock-"+key)
	lock, err := syscall.CreateFile(u16(lockPath), syscall.GENERIC_READ|syscall.GENERIC_WRITE, 0, nil, syscall.OPEN_ALWAYS, syscall.FILE_ATTRIBUTE_NORMAL, 0)
	if err != nil {
		return fmt.Errorf("другое обновление уже выполняется: %w", err)
	}
	defer syscall.CloseHandle(lock)
	if err = prepareUpdateTarget(p); err != nil {
		return err
	}
	defer os.Remove(p.Incoming)
	if err = writeUpdateJSON(path, p); err != nil {
		return err
	}
	if err = writeUpdateJSON(ready, updateResult{State: "ready"}); err != nil {
		return err
	}
	state, _, waitErr := updateWaitProcess.Call(parent, 60000)
	if state != 0 {
		return fmt.Errorf("установщик не завершил работу: %v", waitErr)
	}
	// ReplaceFileW is atomic and keeps the previous file on the same volume.
	for until := time.Now().Add(8 * time.Second); ; {
		current, e := fileSHA256(p.Target)
		if e != nil || current != p.OldSHA256 {
			return restartFailedUpdate(p, path, errors.New("файл программы был изменён другим процессом"), false)
		}
		err = replaceUpdateFile(p.Target, p.Incoming, p.Backup)
		if err == nil {
			break
		}
		if time.Now().After(until) {
			return restartFailedUpdate(p, path, err, false)
		}
		time.Sleep(100 * time.Millisecond)
	}
	c := updateWindowCommand(p.Target, resumeUpdateArgs(p, path)...)
	if err = c.Start(); err != nil {
		return restartFailedUpdate(p, path, err, true)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	health, healthErr := awaitUpdateResult(ctx, filepath.Join(dir, "started.json"))
	if healthErr != nil || health.State != "started" {
		// Only the replacement child created above is stopped. No other process.
		_ = c.Process.Kill()
		_ = c.Wait()
		if healthErr == nil {
			healthErr = errors.New("новая программа не подтвердила запуск")
		}
		return restartFailedUpdate(p, path, healthErr, true)
	}
	if err = writeUpdateJSON(filepath.Join(dir, "result.json"), updateResult{State: "committed"}); err != nil {
		_ = c.Process.Kill()
		_ = c.Wait()
		return restartFailedUpdate(p, path, err, true)
	}
	_ = c.Process.Release()
	_ = os.Remove(p.Backup)
	return nil
}

func restartFailedUpdate(p *updatePlan, path string, cause error, replaced bool) error {
	if replaced {
		if err := restoreUpdateFile(p.Target, p.Backup); err != nil {
			return fmt.Errorf("не удалось восстановить %s: %w (обновление: %v)", p.Target, err, cause)
		}
	}
	_ = writeUpdateJSON(filepath.Join(filepath.Dir(path), "result.json"), updateResult{State: "rolled-back", Error: cause.Error()})
	c := updateWindowCommand(p.Target, resumeUpdateArgs(p, path)...)
	if err := c.Start(); err != nil {
		return fmt.Errorf("запустите прежний установщик вручную: %w", err)
	}
	_ = c.Process.Release()
	return fmt.Errorf("обновление отменено, восстановлена предыдущая версия: %w", cause)
}

func resumeUpdateArgs(p *updatePlan, path string) []string {
	args := []string{"--dfo-resume-update", path, "--no-self-update"}
	if p.Resume.Game != "" {
		args = append(args, "--game", p.Resume.Game)
	}
	return args
}

func shaTarget(path string) string {
	// Hashing the normalized target keeps lock names short, with no path data.
	return fmt.Sprintf("%x", sha256.Sum256([]byte(strings.ToLower(filepath.Clean(path)))))
}

func loadResumeUpdate(path, self string) (*updatePlan, bool, error) {
	p, err := loadUpdatePlan(path, updatesRoot())
	if err != nil {
		return nil, false, err
	}
	if !sameUpdatePath(self, p.Target) {
		return nil, false, errors.New("план предназначен для другого установщика")
	}
	var result updateResult
	_ = readUpdateJSON(filepath.Join(filepath.Dir(path), "result.json"), &result)
	rolledBack := result.State == "rolled-back"
	expected, version := p.SHA256, p.Version
	if rolledBack {
		expected, version = p.OldSHA256, p.FromVersion
	}
	digest, err := fileSHA256(self)
	if err != nil || digest != expected || version != appVersion {
		return nil, false, errors.New("версия запущенной программы не соответствует обновлению")
	}
	return p, rolledBack, nil
}

// Watching the process names is cheap; the patcher's fresh status and its own
// final running-game check remain authoritative before writing app.asar.
func nativeGameRunning() bool {
	h, err := syscall.CreateToolhelp32Snapshot(syscall.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return true
	}
	defer syscall.CloseHandle(h)
	var entry syscall.ProcessEntry32
	entry.Size = uint32(unsafe.Sizeof(entry))
	for err = syscall.Process32First(h, &entry); err == nil; err = syscall.Process32Next(h, &entry) {
		if entry.ProcessID == uint32(os.Getpid()) {
			continue
		}
		name := syscall.UTF16ToString(entry.ExeFile[:])
		for _, known := range exeNames {
			if strings.EqualFold(name, known) {
				return true
			}
		}
	}
	return err != syscall.ERROR_NO_MORE_FILES
}

func otherInstallerOpen(own uintptr) bool {
	var previous uintptr
	for {
		h, _, _ := updateFindWindow.Call(0, previous, uintptr(unsafe.Pointer(u16("DFOClientExpanderInstaller"))), 0)
		if h == 0 {
			return false
		}
		if h != own {
			return true
		}
		previous = h
	}
}
