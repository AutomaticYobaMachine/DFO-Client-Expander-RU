// Test-only Win32 driver. Never included in the user installer.
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"syscall"
	"unsafe"
)

var u = syscall.NewLazyDLL("user32.dll")
var find = u.NewProc("FindWindowW")
var enum = u.NewProc("EnumChildWindows")
var ctrlID = u.NewProc("GetDlgCtrlID")
var getText = u.NewProc("GetWindowTextW")
var getLength = u.NewProc("GetWindowTextLengthW")
var getClass = u.NewProc("GetClassNameW")
var visible = u.NewProc("IsWindowVisible")
var enabled = u.NewProc("IsWindowEnabled")
var send = u.NewProc("SendMessageW")
var post = u.NewProc("PostMessageW")
var windowRect = u.NewProc("GetWindowRect")
var clientRect = u.NewProc("GetClientRect")
var move = u.NewProc("MoveWindow")
var setFocus = u.NewProc("SetFocus")
var thread = u.NewProc("GetWindowThreadProcessId")
var attach = u.NewProc("AttachThreadInput")
var foreground = u.NewProc("SetForegroundWindow")
var guiInfo = u.NewProc("GetGUIThreadInfo")
var currentThread = syscall.NewLazyDLL("kernel32.dll").NewProc("GetCurrentThreadId")
var parent = u.NewProc("GetParent")
var sendInput = u.NewProc("SendInput")

// Win64 INPUT: its union is 32 bytes, with KEYBDINPUT at offset 8.
type keyboardInput struct {
	Type, Padding uint32
	VK, Scan      uint16
	Flags, Time   uint32
	_             uint32
	ExtraInfo     uintptr
	_             [8]byte
}

type rect struct{ Left, Top, Right, Bottom int32 }
type control struct {
	ID               int
	Handle           uintptr
	Title, Class     string
	Visible, Enabled bool
	Checked          int
	Rect             rect
}
type threadInfo struct {
	Size, Flags                               uint32
	Active, Focus, Capture, Menu, Move, Caret uintptr
	Rect                                      rect
}

func ptr(s string) uintptr { p, _ := syscall.UTF16PtrFromString(s); return uintptr(unsafe.Pointer(p)) }
func text(h uintptr) string {
	n, _, _ := send.Call(h, 0x000e, 0, 0)
	b := make([]uint16, n+1)
	send.Call(h, 0x000d, uintptr(len(b)), uintptr(unsafe.Pointer(&b[0])))
	return syscall.UTF16ToString(b)
}
func box(h uintptr) rect { var r rect; windowRect.Call(h, uintptr(unsafe.Pointer(&r))); return r }
func main() {
	h, _, _ := find.Call(ptr("DFOClientExpanderInstaller"), 0)
	if len(os.Args) > 1 && (os.Args[1] == "dialog" || os.Args[1] == "savepath" || os.Args[1] == "cancel-save") {
		h, _, _ = find.Call(ptr("#32770"), 0)
	}
	if h == 0 {
		fmt.Println("null")
		return
	}
	controls := []control{}
	handles := map[int]uintptr{}
	cb := syscall.NewCallback(func(c, p uintptr) uintptr {
		id, _, _ := ctrlID.Call(c)
		b := make([]uint16, 128)
		getClass.Call(c, uintptr(unsafe.Pointer(&b[0])), uintptr(len(b)))
		v, _, _ := visible.Call(c)
		e, _, _ := enabled.Call(c)
		checked := -1
		if id >= 103 && id <= 107 {
			n, _, _ := send.Call(c, 0xf0, 0, 0)
			checked = int(n)
		}
		controls = append(controls, control{int(id), c, text(c), syscall.UTF16ToString(b), v != 0, e != 0, checked, box(c)})
		handles[int(id)] = c
		return 1
	})
	enum.Call(h, cb, 0)
	if len(os.Args) > 1 {
		switch os.Args[1] {
		case "key":
			vk, _ := strconv.ParseUint(os.Args[2], 0, 16)
			scan, _ := strconv.ParseUint(os.Args[3], 0, 16)
			flags := uint32(0)
			if len(os.Args) > 4 && os.Args[4] == "extended" {
				flags = 1
			}
			input := []keyboardInput{{Type: 1, VK: uint16(vk), Scan: uint16(scan), Flags: flags}, {Type: 1, VK: uint16(vk), Scan: uint16(scan), Flags: flags | 2}}
			foreground.Call(h)
			n, _, err := sendInput.Call(2, uintptr(unsafe.Pointer(&input[0])), unsafe.Sizeof(input[0]))
			if n != 2 {
				fmt.Fprintln(os.Stderr, "SendInput:", n, err)
				os.Exit(2)
			}
		case "click":
			id, _ := strconv.Atoi(os.Args[2])
			foreground.Call(h)
			send.Call(handles[id], 0xf5, 0, 0)
		case "focus":
			id, _ := strconv.Atoi(os.Args[2])
			target, _, _ := thread.Call(h, 0)
			own, _, _ := currentThread.Call()
			attach.Call(own, target, 1)
			foreground.Call(h)
			setFocus.Call(handles[id])
			attach.Call(own, target, 0)
		case "resize":
			w, _ := strconv.Atoi(os.Args[2])
			v, _ := strconv.Atoi(os.Args[3])
			r := box(h)
			move.Call(h, uintptr(r.Left), uintptr(r.Top), uintptr(w), uintptr(v), 1)
		case "close":
			post.Call(h, 0x10, 0, 0)
		case "deactivate":
			post.Call(h, 0x001c, 0, 0)
		case "savepath":
			var edit uintptr
			for _, c := range controls {
				filename := c.ID == 1152 || c.ID == 1148 || strings.Contains(c.Title, "-install.log")
				p := c.Handle
				for i := 0; i < 6 && p != 0 && p != h; i++ {
					p, _, _ = parent.Call(p)
					pid, _, _ := ctrlID.Call(p)
					if pid == 1148 || pid == 1152 {
						filename = true
					}
				}
				if c.Class == "Edit" && filename {
					edit = c.Handle
					break
				}
			}
			if edit == 0 {
				json.NewEncoder(os.Stderr).Encode(controls)
				fmt.Fprintln(os.Stderr, "filename edit not found")
				os.Exit(2)
			}
			value, _ := syscall.UTF16PtrFromString(os.Args[2])
			send.Call(edit, 0x000c, 0, uintptr(unsafe.Pointer(value)))
			post.Call(h, 0x0111, 1, 0)
		case "cancel-save":
			post.Call(h, 0x0111, 2, 0)
		}
	}
	tid, _, _ := thread.Call(h, 0)
	info := threadInfo{}
	info.Size = uint32(unsafe.Sizeof(info))
	guiInfo.Call(tid, uintptr(unsafe.Pointer(&info)))
	focus, _, _ := ctrlID.Call(info.Focus)
	var client rect
	clientRect.Call(h, uintptr(unsafe.Pointer(&client)))
	json.NewEncoder(os.Stdout).Encode(struct {
		Title          string
		Window, Client rect
		Focus          int
		Controls       []control
	}{text(h), box(h), client, int(focus), controls})
}
