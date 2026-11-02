package main

import (
	"syscall"
	"unsafe"
)

var (
	user32                         = syscall.NewLazyDLL("user32.dll")
	gdi32                          = syscall.NewLazyDLL("gdi32.dll")
	kernel32                       = syscall.NewLazyDLL("kernel32.dll")
	comdlg32                       = syscall.NewLazyDLL("comdlg32.dll")
	shell32                        = syscall.NewLazyDLL("shell32.dll")
	advapi32                       = syscall.NewLazyDLL("advapi32.dll")
	uxtheme                        = syscall.NewLazyDLL("uxtheme.dll")
	dwmapi                         = syscall.NewLazyDLL("dwmapi.dll")
	pRegisterClassExW              = user32.NewProc("RegisterClassExW")
	pCreateWindowExW               = user32.NewProc("CreateWindowExW")
	pDefWindowProcW                = user32.NewProc("DefWindowProcW")
	pGetMessageW                   = user32.NewProc("GetMessageW")
	pIsDialogMessageW              = user32.NewProc("IsDialogMessageW")
	pTranslateMessage              = user32.NewProc("TranslateMessage")
	pDispatchMessageW              = user32.NewProc("DispatchMessageW")
	pPostQuitMessage               = user32.NewProc("PostQuitMessage")
	pPostMessageW                  = user32.NewProc("PostMessageW")
	pSendMessageW                  = user32.NewProc("SendMessageW")
	pShowWindow                    = user32.NewProc("ShowWindow")
	pUpdateWindow                  = user32.NewProc("UpdateWindow")
	pMoveWindow                    = user32.NewProc("MoveWindow")
	pSetWindowPos                  = user32.NewProc("SetWindowPos")
	pSetWindowTextW                = user32.NewProc("SetWindowTextW")
	pGetWindowTextLengthW          = user32.NewProc("GetWindowTextLengthW")
	pGetWindowTextW                = user32.NewProc("GetWindowTextW")
	pGetFocus                      = user32.NewProc("GetFocus")
	pGetKeyState                   = user32.NewProc("GetKeyState")
	pSetFocus                      = user32.NewProc("SetFocus")
	pGetDlgCtrlID                  = user32.NewProc("GetDlgCtrlID")
	pGetWindowRect                 = user32.NewProc("GetWindowRect")
	pBeginPaint                    = user32.NewProc("BeginPaint")
	pEndPaint                      = user32.NewProc("EndPaint")
	pGetClientRect                 = user32.NewProc("GetClientRect")
	pInvalidateRect                = user32.NewProc("InvalidateRect")
	pFillRect                      = user32.NewProc("FillRect")
	pDrawTextW                     = user32.NewProc("DrawTextW")
	pDrawFocusRect                 = user32.NewProc("DrawFocusRect")
	pLoadCursorW                   = user32.NewProc("LoadCursorW")
	pLoadIconW                     = user32.NewProc("LoadIconW")
	pEnableWindow                  = user32.NewProc("EnableWindow")
	pMessageBoxW                   = user32.NewProc("MessageBoxW")
	pAdjustWindowRect              = user32.NewProc("AdjustWindowRect")
	pSystemParametersInfoW         = user32.NewProc("SystemParametersInfoW")
	pSetProcessDPIAware            = user32.NewProc("SetProcessDPIAware")
	pSetProcessDpiAwarenessContext = user32.NewProc("SetProcessDpiAwarenessContext")
	pGetDpiForWindow               = user32.NewProc("GetDpiForWindow")
	pGetDC                         = user32.NewProc("GetDC")
	pReleaseDC                     = user32.NewProc("ReleaseDC")
	pSetScrollInfo                 = user32.NewProc("SetScrollInfo")
	pGetScrollInfo                 = user32.NewProc("GetScrollInfo")
	pSetTimer                      = user32.NewProc("SetTimer")
	pKillTimer                     = user32.NewProc("KillTimer")
	pCreateFontW                   = gdi32.NewProc("CreateFontW")
	pCreateSolidBrush              = gdi32.NewProc("CreateSolidBrush")
	pCreatePen                     = gdi32.NewProc("CreatePen")
	pSelectObject                  = gdi32.NewProc("SelectObject")
	pDeleteObject                  = gdi32.NewProc("DeleteObject")
	pSetTextColor                  = gdi32.NewProc("SetTextColor")
	pSetBkColor                    = gdi32.NewProc("SetBkColor")
	pSetBkMode                     = gdi32.NewProc("SetBkMode")
	pRoundRect                     = gdi32.NewProc("RoundRect")
	pCreateCompatibleDC            = gdi32.NewProc("CreateCompatibleDC")
	pCreateCompatibleBitmap        = gdi32.NewProc("CreateCompatibleBitmap")
	pBitBlt                        = gdi32.NewProc("BitBlt")
	pDeleteDC                      = gdi32.NewProc("DeleteDC")
	pGetDeviceCaps                 = gdi32.NewProc("GetDeviceCaps")
	pGetModuleHandleW              = kernel32.NewProc("GetModuleHandleW")
	pGetOpenFileNameW              = comdlg32.NewProc("GetOpenFileNameW")
	pGetSaveFileNameW              = comdlg32.NewProc("GetSaveFileNameW")
	pShellExecuteW                 = shell32.NewProc("ShellExecuteW")
	pRegOpenKeyExW                 = advapi32.NewProc("RegOpenKeyExW")
	pRegEnumKeyExW                 = advapi32.NewProc("RegEnumKeyExW")
	pRegQueryValueExW              = advapi32.NewProc("RegQueryValueExW")
	pRegCloseKey                   = advapi32.NewProc("RegCloseKey")
	pSetWindowTheme                = uxtheme.NewProc("SetWindowTheme")
	pDwmSetWindowAttribute         = dwmapi.NewProc("DwmSetWindowAttribute")
)

const (
	wmCreate          = 0x0001
	wmDestroy         = 0x0002
	wmSize            = 0x0005
	wmPaint           = 0x000f
	wmClose           = 0x0010
	wmEraseBkgnd      = 0x0014
	wmGetMinMaxInfo   = 0x0024
	wmDrawItem        = 0x002b
	wmSetFont         = 0x0030
	wmKeyDown         = 0x0100
	wmKeyUp           = 0x0101
	wmChar            = 0x0102
	wmSysKeyDown      = 0x0104
	wmSysKeyUp        = 0x0105
	wmSysChar         = 0x0106
	wmActivateApp     = 0x001c
	wmCommand         = 0x0111
	wmTimer           = 0x0113
	wmVScroll         = 0x0115
	wmCtlColorEdit    = 0x0133
	wmCtlColorBtn     = 0x0135
	wmCtlColorStat    = 0x0138
	wmMouseWheel      = 0x020a
	wmLButtonDown     = 0x0201
	wmRButtonDown     = 0x0204
	wmMButtonDown     = 0x0207
	wmMButtonUp       = 0x0208
	wmXButtonDown     = 0x020b
	wmXButtonUp       = 0x020c
	wmDpiChanged      = 0x02e0
	wmLog             = 0x8001
	wmDone            = 0x8002
	wmStatus          = 0x8003
	wmSearch          = 0x8004
	wsCaption         = 0x00c00000
	wsSysMenu         = 0x00080000
	wsThickFrame      = 0x00040000
	wsMinimizeBox     = 0x00020000
	wsMaximizeBox     = 0x00010000
	wsChild           = 0x40000000
	wsVisible         = 0x10000000
	wsVScroll         = 0x00200000
	wsClipChild       = 0x02000000
	wsTabStop         = 0x00010000
	wsExControlParent = 0x00010000
	esMultiline       = 0x0004
	esAutoVScroll     = 0x0040
	esAutoHScroll     = 0x0080
	esReadOnly        = 0x0800
	bsOwnerDraw       = 0x000b
	bsAutoCheckbox    = 0x0003
	bsMultiline       = 0x2000
	bsNotify          = 0x4000
	bmGetCheck        = 0x00f0
	bmSetCheck        = 0x00f1
	bmClick           = 0x00f5
	emSetSel          = 0x00b1
	emReplaceSel      = 0x00c2
	emSetLimit        = 0x00c5
	odsSelected       = 0x0001
	odsDisabled       = 0x0004
	odsFocus          = 0x0010
	dtLeft            = 0
	dtCenter          = 1
	dtRight           = 2
	dtVCenter         = 4
	dtWordBreak       = 0x10
	dtSingleLine      = 0x20
	dtCalcRect        = 0x400
	dtNoPrefix        = 0x800
	dtEndEllipsis     = 0x8000
	dtPathEllipsis    = 0x4000
	transparent       = 1
	swHide            = 0
	swShow            = 5
	sibVert           = 1
)

type wndClassEx struct {
	cbSize, style                            uint32
	lpfnWndProc                              uintptr
	cbClsExtra, cbWndExtra                   int32
	hInstance, hIcon, hCursor, hbrBackground uintptr
	lpszMenuName, lpszClassName              *uint16
	hIconSm                                  uintptr
}
type point struct{ x, y int32 }
type msg struct {
	hwnd           uintptr
	message        uint32
	wParam, lParam uintptr
	time           uint32
	pt             point
	_              uint32
}
type rect struct{ left, top, right, bottom int32 }
type paintStruct struct {
	hdc                  uintptr
	fErase               int32
	rcPaint              rect
	fRestore, fIncUpdate int32
	rgbReserved          [32]byte
}
type drawItemStruct struct {
	ctlType, ctlID, itemID, itemAction, itemState uint32
	hwndItem, hDC                                 uintptr
	rcItem                                        rect
	itemData                                      uintptr
}
type minMaxInfo struct{ reserved, maxSize, maxPosition, minTrackSize, maxTrackSize point }
type scrollInfo struct {
	cbSize, fMask   uint32
	nMin, nMax      int32
	nPage           uint32
	nPos, nTrackPos int32
}
type openFileName struct {
	lStructSize                    uint32
	hwndOwner, hInstance           uintptr
	lpstrFilter, lpstrCustomFilter *uint16
	nMaxCustFilter, nFilterIndex   uint32
	lpstrFile                      *uint16
	nMaxFile                       uint32
	lpstrFileTitle                 *uint16
	nMaxFileTitle                  uint32
	lpstrInitialDir, lpstrTitle    *uint16
	flags                          uint32
	nFileOffset, nFileExtension    uint16
	lpstrDefExt                    *uint16
	lCustData, lpfnHook            uintptr
	lpTemplateName                 *uint16
	pvReserved                     uintptr
	dwReserved, flagsEx            uint32
}

func u16(s string) *uint16      { p, _ := syscall.UTF16PtrFromString(s); return p }
func rgb(r, g, b uint8) uintptr { return uintptr(r) | uintptr(g)<<8 | uintptr(b)<<16 }
func signed(v int32) uintptr    { return uintptr(int64(v)) }
func enable(hwnd uintptr, on bool) {
	var v uintptr
	if on {
		v = 1
	}
	pEnableWindow.Call(hwnd, v)
}
func show(hwnd uintptr, on bool) {
	mode := uintptr(swHide)
	if on {
		mode = swShow
	}
	pShowWindow.Call(hwnd, mode)
}
func caption(hwnd uintptr, s string) { pSetWindowTextW.Call(hwnd, uintptr(unsafe.Pointer(u16(s)))) }
func invalidate(hwnd uintptr)        { pInvalidateRect.Call(hwnd, 0, 0) }
func move(hwnd uintptr, r rect) {
	pMoveWindow.Call(hwnd, signed(r.left), signed(r.top), signed(r.right-r.left), signed(r.bottom-r.top), 1)
}
func bounds(hwnd uintptr) rect {
	var r rect
	pGetClientRect.Call(hwnd, uintptr(unsafe.Pointer(&r)))
	return r
}

var (
	colBg      = rgb(14, 19, 27)
	colCard    = rgb(23, 30, 41)
	colField   = rgb(29, 38, 51)
	colEdge    = rgb(51, 65, 82)
	colBone    = rgb(234, 239, 245)
	colDim     = rgb(169, 182, 199)
	colBrass   = rgb(221, 182, 108)
	colBrassHi = rgb(239, 205, 143)
	colRed     = rgb(244, 143, 137)
	colGreen   = rgb(133, 216, 173)
	colLog     = rgb(11, 16, 23)
	colInk     = rgb(24, 29, 34)
)

func fill(hdc uintptr, r rect, col uintptr) {
	b, _, _ := pCreateSolidBrush.Call(col)
	pFillRect.Call(hdc, uintptr(unsafe.Pointer(&r)), b)
	pDeleteObject.Call(b)
}
func roundBox(hdc uintptr, r rect, rad int32, inside, edge uintptr) {
	b, _, _ := pCreateSolidBrush.Call(inside)
	p, _, _ := pCreatePen.Call(0, 1, edge)
	ob, _, _ := pSelectObject.Call(hdc, b)
	op, _, _ := pSelectObject.Call(hdc, p)
	pRoundRect.Call(hdc, signed(r.left), signed(r.top), signed(r.right), signed(r.bottom), signed(rad), signed(rad))
	pSelectObject.Call(hdc, ob)
	pSelectObject.Call(hdc, op)
	pDeleteObject.Call(b)
	pDeleteObject.Call(p)
}
func text(hdc uintptr, s string, r rect, font, col, flags uintptr) {
	of, _, _ := pSelectObject.Call(hdc, font)
	pSetTextColor.Call(hdc, col)
	pSetBkMode.Call(hdc, transparent)
	w := syscall.StringToUTF16(s)
	pDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&w[0])), uintptr(len(w)-1), uintptr(unsafe.Pointer(&r)), flags|dtNoPrefix)
	pSelectObject.Call(hdc, of)
}
