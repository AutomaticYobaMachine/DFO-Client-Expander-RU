package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"unsafe"
)

var (
	ole32                   = syscall.NewLazyDLL("ole32.dll")
	pCoInitializeEx         = ole32.NewProc("CoInitializeEx")
	pCoUninitialize         = ole32.NewProc("CoUninitialize")
	pCoTaskMemAlloc         = ole32.NewProc("CoTaskMemAlloc")
	pCoTaskMemFree          = ole32.NewProc("CoTaskMemFree")
	pLoadLibraryExW         = kernel32.NewProc("LoadLibraryExW")
	pGetProcAddress         = kernel32.NewProc("GetProcAddress")
	pReleaseCapture         = user32.NewProc("ReleaseCapture")
	pDwmExtendFrame         = dwmapi.NewProc("DwmExtendFrameIntoClientArea")
	pSetLayeredWindowAttr   = user32.NewProc("SetLayeredWindowAttributes")
)

const (
	coinitApartmentThreaded   = 0x2
	loadWithAlteredSearchPath = 0x00000008
	eNoInterface              = uintptr(0x80004002)
	sOK                       = uintptr(0)
	wsPopup                   = 0x80000000
	swMinimize                = 6
	wmMove                    = 0x0003
	wmMoving                  = 0x0216
	wmNCLButtonDown           = 0x00A1
	htCaption                 = 2
	wmWebAction               = 0x8006
)

type comGUID struct {
	Data1 uint32
	Data2 uint16
	Data3 uint16
	Data4 [8]byte
}

var (
	iidIUnknown = comGUID{0x00000000, 0x0000, 0x0000, [8]byte{0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}}
	// ICoreWebView2EnvironmentOptions {2FDE08A8-1E9A-4766-8C05-95A9CEB9D1C5}
	iidEnvOptions = comGUID{0x2FDE08A8, 0x1E9A, 0x4766, [8]byte{0x8C, 0x05, 0x95, 0xA9, 0xCE, 0xB9, 0xD1, 0xC5}}
	// ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler {4E8A3389-C9D8-4BD2-B6B5-124FEE6CC14D}
	iidEnvCompleted = comGUID{0x4E8A3389, 0xC9D8, 0x4BD2, [8]byte{0xB6, 0xB5, 0x12, 0x4F, 0xEE, 0x6C, 0xC1, 0x4D}}
	// ICoreWebView2CreateCoreWebView2ControllerCompletedHandler {6C4819F3-C9B7-4260-8127-C9F5BDE7F68C}
	iidCtrlCompleted = comGUID{0x6C4819F3, 0xC9B7, 0x4260, [8]byte{0x81, 0x27, 0xC9, 0xF5, 0xBD, 0xE7, 0xF6, 0x8C}}
	// ICoreWebView2Controller2 {C979903E-D4CA-4228-92EB-47EE3FA96EAB}
	iidController2 = comGUID{0xC979903E, 0xD4CA, 0x4228, [8]byte{0x92, 0xEB, 0x47, 0xEE, 0x3F, 0xA9, 0x6E, 0xAB}}
)

func guidEqual(ptr uintptr, target *comGUID) bool {
	if ptr == 0 {
		return false
	}
	g := (*comGUID)(unsafe.Pointer(ptr))
	return *g == *target
}

func allocCoTaskUTF16(s string) uintptr {
	u := syscall.StringToUTF16(s)
	n := uintptr(len(u) * 2)
	mem, _, _ := pCoTaskMemAlloc.Call(n)
	if mem == 0 {
		return 0
	}
	dst := unsafe.Slice((*uint16)(unsafe.Pointer(mem)), len(u))
	copy(dst, u)
	return mem
}

// COM vtable definitions matching WebView2.h (AMD64 stdcall/fastcall layout).
type iCoreWebView2EnvironmentVtbl struct {
	QueryInterface                 uintptr
	AddRef                         uintptr
	Release                        uintptr
	CreateCoreWebView2Controller   uintptr
	CreateWebResourceResponse      uintptr
	GetBrowserVersionString        uintptr
	AddNewBrowserVersionAvailable  uintptr
	RemoveNewBrowserVersionAvail   uintptr
}

type iCoreWebView2Environment struct {
	vtbl *iCoreWebView2EnvironmentVtbl
}

type iCoreWebView2ControllerVtbl struct {
	QueryInterface                   uintptr
	AddRef                           uintptr
	Release                          uintptr
	GetIsVisible                     uintptr
	PutIsVisible                     uintptr
	GetBounds                        uintptr
	PutBounds                        uintptr
	GetZoomFactor                    uintptr
	PutZoomFactor                    uintptr
	AddZoomFactorChanged             uintptr
	RemoveZoomFactorChanged          uintptr
	SetBoundsAndZoomFactor           uintptr
	MoveFocus                        uintptr
	AddMoveFocusRequested            uintptr
	RemoveMoveFocusRequested         uintptr
	AddGotFocus                      uintptr
	RemoveGotFocus                   uintptr
	AddLostFocus                     uintptr
	RemoveLostFocus                  uintptr
	AddAcceleratorKeyPressed         uintptr
	RemoveAcceleratorKeyPressed      uintptr
	GetParentWindow                  uintptr
	PutParentWindow                  uintptr
	NotifyParentWindowPositionChange uintptr
	Close                            uintptr
	GetCoreWebView2                  uintptr
}

type iCoreWebView2Controller struct {
	vtbl *iCoreWebView2ControllerVtbl
}

type iCoreWebView2Controller2Vtbl struct {
	iCoreWebView2ControllerVtbl
	GetDefaultBackgroundColor uintptr
	PutDefaultBackgroundColor uintptr
}

type iCoreWebView2Controller2 struct {
	vtbl *iCoreWebView2Controller2Vtbl
}

type iCoreWebView2Vtbl struct {
	QueryInterface   uintptr
	AddRef           uintptr
	Release          uintptr
	GetSettings      uintptr
	GetSource        uintptr
	Navigate         uintptr
	NavigateToString uintptr
}

type iCoreWebView2 struct {
	vtbl *iCoreWebView2Vtbl
}

type iCoreWebView2SettingsVtbl struct {
	QueryInterface                    uintptr
	AddRef                            uintptr
	Release                           uintptr
	GetIsScriptEnabled                uintptr
	PutIsScriptEnabled                uintptr
	GetIsWebMessageEnabled            uintptr
	PutIsWebMessageEnabled            uintptr
	GetAreDefaultScriptDialogsEnabled uintptr
	PutAreDefaultScriptDialogsEnabled uintptr
	GetIsStatusBarEnabled             uintptr
	PutIsStatusBarEnabled             uintptr
	GetAreDevToolsEnabled             uintptr
	PutAreDevToolsEnabled             uintptr
	GetAreDefaultContextMenusEnabled  uintptr
	PutAreDefaultContextMenusEnabled  uintptr
	GetAreHostObjectsAllowed          uintptr
	PutAreHostObjectsAllowed          uintptr
	GetIsZoomControlEnabled           uintptr
	PutIsZoomControlEnabled           uintptr
	GetIsBuiltInErrorPageEnabled      uintptr
	PutIsBuiltInErrorPageEnabled      uintptr
}

type iCoreWebView2Settings struct {
	vtbl *iCoreWebView2SettingsVtbl
}

// Static COM callback objects (no Go pointers embedded; safe across COM calls).
type wv2EnvOptionsVtbl struct {
	QueryInterface          uintptr
	AddRef                  uintptr
	Release                 uintptr
	GetAdditionalArgs       uintptr
	PutAdditionalArgs       uintptr
	GetLanguage             uintptr
	PutLanguage             uintptr
	GetTargetVersion        uintptr
	PutTargetVersion        uintptr
	GetAllowSSO             uintptr
	PutAllowSSO             uintptr
}

type wv2EnvOptionsObj struct {
	vtbl uintptr
	refs int32
}

type wv2HandlerVtbl struct {
	QueryInterface uintptr
	AddRef         uintptr
	Release        uintptr
	Invoke         uintptr
}

type wv2HandlerObj struct {
	vtbl uintptr
	refs int32
}

type webView2Host struct {
	hwnd       uintptr
	startURL   string
	debugTools bool
	onFail     func(error)
	env        *iCoreWebView2Environment
	ctrl       *iCoreWebView2Controller
	wv         *iCoreWebView2
	ready      bool
	closed     bool
}

var (
	activeWV2        *webView2Host
	wv2OptsVtbl      wv2EnvOptionsVtbl
	wv2OptsObj       wv2EnvOptionsObj
	wv2EnvCBVtbl     wv2HandlerVtbl
	wv2EnvCBObj      wv2HandlerObj
	wv2CtrlCBVtbl    wv2HandlerVtbl
	wv2CtrlCBObj     wv2HandlerObj
	wv2CallbacksInit bool
)

func initWV2Callbacks() {
	if wv2CallbacksInit {
		return
	}
	wv2CallbacksInit = true

	wv2OptsVtbl = wv2EnvOptionsVtbl{
		QueryInterface: syscall.NewCallback(func(this, riid, ppv uintptr) uintptr {
			if ppv == 0 {
				return uintptr(0x80004003) // E_POINTER
			}
			if guidEqual(riid, &iidIUnknown) || guidEqual(riid, &iidEnvOptions) {
				*(*uintptr)(unsafe.Pointer(ppv)) = this
				atomic.AddInt32(&wv2OptsObj.refs, 1)
				return sOK
			}
			*(*uintptr)(unsafe.Pointer(ppv)) = 0
			return eNoInterface
		}),
		AddRef: syscall.NewCallback(func(this uintptr) uintptr {
			return uintptr(atomic.AddInt32(&wv2OptsObj.refs, 1))
		}),
		Release: syscall.NewCallback(func(this uintptr) uintptr {
			return uintptr(atomic.AddInt32(&wv2OptsObj.refs, -1))
		}),
		GetAdditionalArgs: syscall.NewCallback(func(this, out uintptr) uintptr {
			if out == 0 {
				return uintptr(0x80004003)
			}
			*(*uintptr)(unsafe.Pointer(out)) = allocCoTaskUTF16("--autoplay-policy=no-user-gesture-required")
			return sOK
		}),
		PutAdditionalArgs: syscall.NewCallback(func(this, val uintptr) uintptr { return sOK }),
		GetLanguage: syscall.NewCallback(func(this, out uintptr) uintptr {
			if out == 0 {
				return uintptr(0x80004003)
			}
			*(*uintptr)(unsafe.Pointer(out)) = allocCoTaskUTF16("")
			return sOK
		}),
		PutLanguage: syscall.NewCallback(func(this, val uintptr) uintptr { return sOK }),
		GetTargetVersion: syscall.NewCallback(func(this, out uintptr) uintptr {
			if out == 0 {
				return uintptr(0x80004003)
			}
			*(*uintptr)(unsafe.Pointer(out)) = allocCoTaskUTF16("100.0.1185.39")
			return sOK
		}),
		PutTargetVersion: syscall.NewCallback(func(this, val uintptr) uintptr { return sOK }),
		GetAllowSSO: syscall.NewCallback(func(this, out uintptr) uintptr {
			if out == 0 {
				return uintptr(0x80004003)
			}
			*(*int32)(unsafe.Pointer(out)) = 0
			return sOK
		}),
		PutAllowSSO: syscall.NewCallback(func(this, val uintptr) uintptr { return sOK }),
	}
	wv2OptsObj = wv2EnvOptionsObj{vtbl: uintptr(unsafe.Pointer(&wv2OptsVtbl)), refs: 1}

	wv2EnvCBVtbl = wv2HandlerVtbl{
		QueryInterface: syscall.NewCallback(func(this, riid, ppv uintptr) uintptr {
			if ppv == 0 {
				return uintptr(0x80004003)
			}
			if guidEqual(riid, &iidIUnknown) || guidEqual(riid, &iidEnvCompleted) {
				*(*uintptr)(unsafe.Pointer(ppv)) = this
				atomic.AddInt32(&wv2EnvCBObj.refs, 1)
				return sOK
			}
			*(*uintptr)(unsafe.Pointer(ppv)) = 0
			return eNoInterface
		}),
		AddRef: syscall.NewCallback(func(this uintptr) uintptr {
			return uintptr(atomic.AddInt32(&wv2EnvCBObj.refs, 1))
		}),
		Release: syscall.NewCallback(func(this uintptr) uintptr {
			return uintptr(atomic.AddInt32(&wv2EnvCBObj.refs, -1))
		}),
		Invoke: syscall.NewCallback(func(this, hr, envPtr uintptr) uintptr {
			h := activeWV2
			if h == nil || h.closed {
				return sOK
			}
			if hr != 0 || envPtr == 0 {
				if h.onFail != nil {
					h.onFail(fmt.Errorf("webview2 environment failed: 0x%x", uint32(hr)))
				}
				return sOK
			}
			env := (*iCoreWebView2Environment)(unsafe.Pointer(envPtr))
			syscall.SyscallN(env.vtbl.AddRef, envPtr)
			h.env = env
			r, _, _ := syscall.SyscallN(
				env.vtbl.CreateCoreWebView2Controller,
				envPtr,
				h.hwnd,
				uintptr(unsafe.Pointer(&wv2CtrlCBObj)),
			)
			if r != 0 && h.onFail != nil {
				h.onFail(fmt.Errorf("webview2 create controller failed: 0x%x", uint32(r)))
			}
			return sOK
		}),
	}
	wv2EnvCBObj = wv2HandlerObj{vtbl: uintptr(unsafe.Pointer(&wv2EnvCBVtbl)), refs: 1}

	wv2CtrlCBVtbl = wv2HandlerVtbl{
		QueryInterface: syscall.NewCallback(func(this, riid, ppv uintptr) uintptr {
			if ppv == 0 {
				return uintptr(0x80004003)
			}
			if guidEqual(riid, &iidIUnknown) || guidEqual(riid, &iidCtrlCompleted) {
				*(*uintptr)(unsafe.Pointer(ppv)) = this
				atomic.AddInt32(&wv2CtrlCBObj.refs, 1)
				return sOK
			}
			*(*uintptr)(unsafe.Pointer(ppv)) = 0
			return eNoInterface
		}),
		AddRef: syscall.NewCallback(func(this uintptr) uintptr {
			return uintptr(atomic.AddInt32(&wv2CtrlCBObj.refs, 1))
		}),
		Release: syscall.NewCallback(func(this uintptr) uintptr {
			return uintptr(atomic.AddInt32(&wv2CtrlCBObj.refs, -1))
		}),
		Invoke: syscall.NewCallback(func(this, hr, ctrlPtr uintptr) uintptr {
			h := activeWV2
			if h == nil || h.closed {
				return sOK
			}
			if hr != 0 || ctrlPtr == 0 {
				if h.onFail != nil {
					h.onFail(fmt.Errorf("webview2 controller failed: 0x%x", uint32(hr)))
				}
				return sOK
			}
			ctrl := (*iCoreWebView2Controller)(unsafe.Pointer(ctrlPtr))
			syscall.SyscallN(ctrl.vtbl.AddRef, ctrlPtr)
			h.ctrl = ctrl

			// Set dark background color (#080b12) via ICoreWebView2Controller2 to avoid white flash.
			var ctrl2Ptr uintptr
			if qhr, _, _ := syscall.SyscallN(ctrl.vtbl.QueryInterface, ctrlPtr, uintptr(unsafe.Pointer(&iidController2)), uintptr(unsafe.Pointer(&ctrl2Ptr))); qhr == 0 && ctrl2Ptr != 0 {
				ctrl2 := (*iCoreWebView2Controller2)(unsafe.Pointer(ctrl2Ptr))
				// COREWEBVIEW2_COLOR { A: 255, R: 8, G: 11, B: 18 } packed little-endian into 32-bit value.
				bgCol := uintptr(uint32(255) | uint32(8)<<8 | uint32(11)<<16 | uint32(18)<<24)
				syscall.SyscallN(ctrl2.vtbl.PutDefaultBackgroundColor, ctrl2Ptr, bgCol)
				syscall.SyscallN(ctrl2.vtbl.Release, ctrl2Ptr)
			}

			var wvPtr uintptr
			if r, _, _ := syscall.SyscallN(ctrl.vtbl.GetCoreWebView2, ctrlPtr, uintptr(unsafe.Pointer(&wvPtr))); r != 0 || wvPtr == 0 {
				if h.onFail != nil {
					h.onFail(fmt.Errorf("webview2 GetCoreWebView2 failed: 0x%x", uint32(r)))
				}
				return sOK
			}
			wv := (*iCoreWebView2)(unsafe.Pointer(wvPtr))
			h.wv = wv

			var settingsPtr uintptr
			if r, _, _ := syscall.SyscallN(wv.vtbl.GetSettings, wvPtr, uintptr(unsafe.Pointer(&settingsPtr))); r == 0 && settingsPtr != 0 {
				settings := (*iCoreWebView2Settings)(unsafe.Pointer(settingsPtr))
				syscall.SyscallN(settings.vtbl.PutIsStatusBarEnabled, settingsPtr, 0)
				syscall.SyscallN(settings.vtbl.PutAreDefaultContextMenusEnabled, settingsPtr, 0)
				syscall.SyscallN(settings.vtbl.PutIsZoomControlEnabled, settingsPtr, 0)
				syscall.SyscallN(settings.vtbl.PutIsBuiltInErrorPageEnabled, settingsPtr, 0)
				var devTools uintptr
				if h.debugTools {
					devTools = 1
				}
				syscall.SyscallN(settings.vtbl.PutAreDevToolsEnabled, settingsPtr, devTools)
				syscall.SyscallN(settings.vtbl.Release, settingsPtr)
			}

			h.ready = true
			h.resize()
			syscall.SyscallN(ctrl.vtbl.PutIsVisible, ctrlPtr, 1)
			syscall.SyscallN(wv.vtbl.Navigate, wvPtr, uintptr(unsafe.Pointer(u16(h.startURL))))
			syscall.SyscallN(ctrl.vtbl.MoveFocus, ctrlPtr, 0)
			return sOK
		}),
	}
	wv2CtrlCBObj = wv2HandlerObj{vtbl: uintptr(unsafe.Pointer(&wv2CtrlCBVtbl)), refs: 1}
}

func (h *webView2Host) resize() {
	if h == nil || !h.ready || h.ctrl == nil || h.hwnd == 0 {
		return
	}
	r := bounds(h.hwnd)
	// On Windows amd64 ABI, RECT (16 bytes) is passed by pointer in RDX.
	syscall.SyscallN(h.ctrl.vtbl.PutBounds, uintptr(unsafe.Pointer(h.ctrl)), uintptr(unsafe.Pointer(&r)))
}

func (h *webView2Host) notifyMoved() {
	if h == nil || !h.ready || h.ctrl == nil {
		return
	}
	syscall.SyscallN(h.ctrl.vtbl.NotifyParentWindowPositionChange, uintptr(unsafe.Pointer(h.ctrl)))
}

func (h *webView2Host) close() {
	if h == nil || h.closed {
		return
	}
	h.closed = true
	h.ready = false
	if h.ctrl != nil {
		ptr := uintptr(unsafe.Pointer(h.ctrl))
		syscall.SyscallN(h.ctrl.vtbl.Close, ptr)
		syscall.SyscallN(h.ctrl.vtbl.Release, ptr)
		h.ctrl = nil
	}
	if h.wv != nil {
		syscall.SyscallN(h.wv.vtbl.Release, uintptr(unsafe.Pointer(h.wv)))
		h.wv = nil
	}
	if h.env != nil {
		syscall.SyscallN(h.env.vtbl.Release, uintptr(unsafe.Pointer(h.env)))
		h.env = nil
	}
	if activeWV2 == h {
		activeWV2 = nil
	}
}

func compareDottedVersion(a, b string) int {
	pa := strings.Split(a, ".")
	pb := strings.Split(b, ".")
	n := len(pa)
	if len(pb) > n {
		n = len(pb)
	}
	for i := 0; i < n; i++ {
		var va, vb int
		if i < len(pa) {
			va, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			vb, _ = strconv.Atoi(pb[i])
		}
		if va < vb {
			return -1
		}
		if va > vb {
			return 1
		}
	}
	return 0
}

func readRegString(root uintptr, subKey, valueName string) string {
	var h uintptr
	if r, _, _ := pRegOpenKeyExW.Call(root, uintptr(unsafe.Pointer(u16(subKey))), 0, 0x20019, uintptr(unsafe.Pointer(&h))); r != 0 {
		return ""
	}
	defer pRegCloseKey.Call(h)
	buf := make([]uint16, 1024)
	size := uint32(len(buf) * 2)
	if r, _, _ := pRegQueryValueExW.Call(h, uintptr(unsafe.Pointer(u16(valueName))), 0, 0, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size))); r != 0 {
		return ""
	}
	return strings.TrimSpace(syscall.UTF16ToString(buf))
}

func findEdgeWebViewDLL() string {
	const webViewClientGUID = `{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`
	regVersions := []string{}
	for _, spec := range []struct {
		root uintptr
		key  string
	}{
		{0x80000002, `SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\` + webViewClientGUID},
		{0x80000002, `SOFTWARE\Microsoft\EdgeUpdate\Clients\` + webViewClientGUID},
		{0x80000001, `Software\Microsoft\EdgeUpdate\Clients\` + webViewClientGUID},
	} {
		if pv := readRegString(spec.root, spec.key, "pv"); pv != "" && pv != "0.0.0.0" {
			regVersions = append(regVersions, pv)
		}
	}

	appDirs := []string{}
	for _, base := range []string{os.Getenv("ProgramFiles(x86)"), os.Getenv("ProgramFiles"), os.Getenv("LOCALAPPDATA")} {
		if base == "" {
			continue
		}
		appDirs = append(appDirs,
			filepath.Join(base, "Microsoft", "EdgeWebView", "Application"),
			filepath.Join(base, "Microsoft", "Edge", "Application"),
		)
	}

	for _, dir := range appDirs {
		for _, pv := range regVersions {
			cand := filepath.Join(dir, pv, "EBWebView", "x64", "EmbeddedBrowserWebView.dll")
			if st, err := os.Stat(cand); err == nil && !st.IsDir() {
				return cand
			}
		}
	}

	type foundVer struct {
		ver  string
		path string
	}
	var found []foundVer
	for _, dir := range appDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			cand := filepath.Join(dir, e.Name(), "EBWebView", "x64", "EmbeddedBrowserWebView.dll")
			if st, err := os.Stat(cand); err == nil && !st.IsDir() {
				found = append(found, foundVer{ver: e.Name(), path: cand})
			}
		}
	}
	if len(found) == 0 {
		return ""
	}
	sort.Slice(found, func(i, j int) bool {
		return compareDottedVersion(found[i].ver, found[j].ver) > 0
	})
	return found[0].path
}

func startWebView2(hwnd uintptr, userDataDir, startURL string, onFail func(error)) (*webView2Host, error) {
	dllPath := findEdgeWebViewDLL()
	if dllPath == "" {
		return nil, errors.New("edge webview2 runtime not found")
	}
	if err := os.MkdirAll(userDataDir, 0700); err != nil {
		return nil, err
	}
	mod, _, err := pLoadLibraryExW.Call(uintptr(unsafe.Pointer(u16(dllPath))), 0, loadWithAlteredSearchPath)
	if mod == 0 {
		return nil, fmt.Errorf("load EmbeddedBrowserWebView.dll: %w", err)
	}
	procName := append([]byte("CreateWebViewEnvironmentWithOptionsInternal"), 0)
	proc, _, err := pGetProcAddress.Call(mod, uintptr(unsafe.Pointer(&procName[0])))
	if proc == 0 {
		return nil, fmt.Errorf("resolve CreateWebViewEnvironmentWithOptionsInternal: %w", err)
	}

	initWV2Callbacks()
	host := &webView2Host{
		hwnd:       hwnd,
		startURL:   startURL,
		debugTools: os.Getenv("DFO_DEBUG_WEBVIEW") == "1",
		onFail:     onFail,
	}
	activeWV2 = host

	// HRESULT CreateWebViewEnvironmentWithOptionsInternal(
	//   bool checkRunningInstance, int runtimeType, PCWSTR userDataDir,
	//   IUnknown* environmentOptions, ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler* handler)
	hr, _, _ := syscall.SyscallN(
		proc,
		1, // checkRunningInstance = true
		0, // runtimeType = Evergreen
		uintptr(unsafe.Pointer(u16(userDataDir))),
		uintptr(unsafe.Pointer(&wv2OptsObj)),
		uintptr(unsafe.Pointer(&wv2EnvCBObj)),
	)
	if hr != 0 {
		activeWV2 = nil
		return nil, fmt.Errorf("CreateWebViewEnvironmentWithOptionsInternal failed: 0x%x", uint32(hr))
	}
	return host, nil
}
