package main

import (
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

var exeNames = []string{"DFO Online.exe", "Daggerfall Online.exe", "DaggerfallOnline.exe"}

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
