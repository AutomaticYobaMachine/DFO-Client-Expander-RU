package main

import (
	"os"
	"path/filepath"
	"syscall"
	"time"
	"unsafe"
)

const (
	idFontPickBase  = 2000
	idFontResetBase = 2100
	idFontDescBase  = 2200
)

func (a *app) activeUserData() string {
	a.mu.Lock()
	dir := ""
	if a.status != nil && a.status.UserData != "" {
		dir = a.status.UserData
	}
	a.mu.Unlock()
	if dir != "" {
		return dir
	}
	base := os.Getenv("APPDATA")
	if base == "" {
		if cfgDir, err := os.UserConfigDir(); err == nil {
			base = cfgDir
		}
	}
	for _, n := range []string{"DFO Online", "Daggerfall JavaScript", "daggerfall-js-app"} {
		p := filepath.Join(base, n)
		if info, err := os.Stat(p); err == nil && info.IsDir() {
			return p
		}
	}
	return filepath.Join(base, "DFO Online")
}

func (a *app) reloadFontPreset() {
	ud := a.activeUserData()
	p := loadFontPreset(ud)
	a.mu.Lock()
	a.fontPreset = p
	a.mu.Unlock()
}

func (a *app) createFontControls() {
	fp, _, _ := pCreateWindowExW.Call(wsExControlParent, uintptr(unsafe.Pointer(u16("DFOExpanderFonts"))), 0, wsChild|wsVScroll|wsClipChild, 0, 0, 10, 10, a.hwnd, idFontsPane, 0, 0)
	a.fontsPane = fp
	a.ctl[idFontsPane] = fp
	for i, s := range fontSlots {
		a.fontDescs[s.ID] = a.child(fp, idFontDescBase+i, "STATIC", s.Description(), wsVisible|0x80)
		a.child(fp, idFontPickBase+i, "BUTTON", T("installer.fonts.btn.pick"), wsVisible|wsTabStop|bsOwnerDraw|bsNotify)
		a.child(fp, idFontResetBase+i, "BUTTON", T("installer.fonts.btn.reset"), wsVisible|wsTabStop|bsOwnerDraw|bsNotify)
	}
	for _, id := range []int{idFontsApplyAll, idFontsResetAll, idFontsImport, idFontsExport, idFontsOpenDir} {
		a.button(id, buttonLabel(id))
	}
}

func (a *app) applyFontTabFonts() {
	for _, s := range fontSlots {
		if h := a.fontDescs[s.ID]; h != 0 {
			pSendMessageW.Call(h, wmSetFont, a.font("body", 13, 400), 1)
		}
	}
}

func (a *app) retextFontControls() {
	for i, s := range fontSlots {
		if h := a.fontDescs[s.ID]; h != 0 {
			caption(h, s.Description())
		}
		if h := a.ctl[idFontPickBase+i]; h != 0 {
			caption(h, T("installer.fonts.btn.pick"))
		}
		if h := a.ctl[idFontResetBase+i]; h != 0 {
			caption(h, T("installer.fonts.btn.reset"))
		}
	}
	if h := a.ctl[idConfigureFonts]; h != 0 {
		caption(h, buttonLabel(idConfigureFonts))
	}
	invalidate(a.fontsPane)
}

func (a *app) layoutFontRows() {
	if a.fontsPane == 0 {
		return
	}
	P := a.px
	r := bounds(a.fontsPane)
	w := r.right - P(2)
	if w < P(360) {
		w = P(360)
	}
	hdc, _, _ := pGetDC.Call(a.fontsPane)
	defer pReleaseDC.Call(a.fontsPane, hdc)
	y := int32(0)
	btnCol := P(136)
	descLeft := P(256)
	descRight := w - btnCol - P(14)
	if descRight < descLeft+P(120) {
		descRight = descLeft + P(120)
	}
	type measuredSlot struct {
		idx  int
		slot fontSlotMeta
		h    int32
	}
	measured := make([]measuredSlot, 0, len(fontSlots))
	for i, s := range fontSlots {
		t := rect{0, 0, descRight - descLeft - P(20), 0}
		of, _, _ := pSelectObject.Call(hdc, a.font("body", 13, 400))
		u := syscall.StringToUTF16(s.Description())
		pDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&u[0])), uintptr(len(u)-1), uintptr(unsafe.Pointer(&t)), dtWordBreak|dtCalcRect|dtNoPrefix)
		pSelectObject.Call(hdc, of)
		h := t.bottom + P(30)
		if h < P(86) {
			h = P(86)
		}
		a.fontRows[s.ID] = rect{0, y, w, y + h}
		measured = append(measured, measuredSlot{i, s, t.bottom + P(4)})
		y += h + P(8)
	}
	a.fontContentH = y - P(8)
	limit := a.fontContentH - r.bottom
	if limit < 0 {
		limit = 0
	}
	if a.fontScroll > limit {
		a.fontScroll = limit
	}
	if a.fontScroll < 0 {
		a.fontScroll = 0
	}
	si := scrollInfo{fMask: 0x17, nMin: 0, nMax: a.fontContentH - 1, nPage: uint32(r.bottom), nPos: a.fontScroll}
	si.cbSize = uint32(unsafe.Sizeof(si))
	pSetScrollInfo.Call(a.fontsPane, sibVert, uintptr(unsafe.Pointer(&si)), 1)
	for _, m := range measured {
		row := a.fontRows[m.slot.ID]
		top := row.top - a.fontScroll
		move(a.fontDescs[m.slot.ID], rect{descLeft + P(10), top + P(14), descRight - P(10), top + P(14) + m.h})
		btnX0 := w - btnCol
		btnX1 := w - P(10)
		move(a.ctl[idFontPickBase+m.idx], rect{btnX0, top + P(12), btnX1, top + P(42)})
		move(a.ctl[idFontResetBase+m.idx], rect{btnX0, top + P(48), btnX1, top + P(76)})
	}
	invalidate(a.fontsPane)
}

func (a *app) scrollFontsTo(y int32) {
	viewH := bounds(a.fontsPane).bottom
	limit := a.fontContentH - viewH
	if limit < 0 {
		limit = 0
	}
	if y > limit {
		y = limit
	}
	if y < 0 {
		y = 0
	}
	if y == a.fontScroll {
		return
	}
	a.fontScroll = y
	a.layoutFontRows()
}

func (a *app) focusFontRow(id int) {
	idx := -1
	if id >= idFontPickBase && id < idFontPickBase+len(fontSlots) {
		idx = id - idFontPickBase
	} else if id >= idFontResetBase && id < idFontResetBase+len(fontSlots) {
		idx = id - idFontResetBase
	}
	if idx < 0 {
		return
	}
	r, ok := a.fontRows[fontSlots[idx].ID]
	if !ok {
		return
	}
	viewH := bounds(a.fontsPane).bottom
	if r.top < a.fontScroll {
		a.scrollFontsTo(r.top)
	} else if r.bottom > a.fontScroll+viewH {
		a.scrollFontsTo(r.bottom - viewH)
	}
}

func (a *app) paintFontRows(hdc uintptr, r rect) {
	fill(hdc, r, colBg)
	a.mu.Lock()
	preset := a.fontPreset
	a.mu.Unlock()
	if preset == nil {
		preset = defaultFontPreset()
	}
	P := a.px
	btnCol := P(136)
	for _, s := range fontSlots {
		row := a.fontRows[s.ID]
		row.top -= a.fontScroll
		row.bottom -= a.fontScroll
		if row.bottom < 0 || row.top > r.bottom {
			continue
		}
		badge, isCustom := slotBadgeText(s, preset)
		edge := colEdge
		if isCustom {
			edge = rgb(78, 138, 108)
		}
		roundBox(hdc, row, P(12), colCard, edge)
		descRight := row.right - btnCol - P(14)
		if descRight > P(264) {
			roundBox(hdc, rect{P(256), row.top + P(8), descRight, row.bottom - P(8)}, P(8), colField, colField)
		}
		text(hdc, s.Title(), rect{P(16), row.top + P(12), P(248), row.top + P(40)}, a.font("feature", 15, 600), colBone, dtSingleLine|dtVCenter|dtEndEllipsis)
		badgeCol := colDim
		if isCustom {
			badgeCol = colGreen
		}
		text(hdc, badge, rect{P(16), row.top + P(44), P(248), row.top + P(68)}, a.font("badge", 11, 600), badgeCol, dtSingleLine|dtVCenter|dtEndEllipsis)
	}
}

func fontsPaneProc(hwnd uintptr, m uint32, wp, lp uintptr) uintptr {
	a := A
	switch m {
	case wmDrawItem:
		a.drawButton((*drawItemStruct)(unsafe.Pointer(lp)))
		return 1
	case wmEraseBkgnd:
		return 1
	case wmPaint:
		paintWindow(hwnd, a.paintFontRows)
		return 0
	case wmCommand:
		a.mu.Lock()
		a.lastUserInput = time.Now()
		a.mu.Unlock()
		if wp>>16 == 6 {
			a.focusFontRow(int(wp & 0xffff))
			return 0
		}
		r, _, _ := pSendMessageW.Call(a.hwnd, wmCommand, wp, lp)
		return r
	case wmCtlColorBtn, wmCtlColorStat, wmCtlColorEdit:
		return colorControl(a, m, wp, lp)
	case wmMouseWheel:
		a.fontWheel += int32(int16(wp >> 16))
		steps := a.fontWheel / 120
		a.fontWheel %= 120
		if steps != 0 {
			a.scrollFontsTo(a.fontScroll - steps*a.px(54))
		}
		return 0
	case wmVScroll:
		pos := a.fontScroll
		switch wp & 0xffff {
		case 0:
			pos -= a.px(36)
		case 1:
			pos += a.px(36)
		case 2:
			pos -= bounds(a.fontsPane).bottom
		case 3:
			pos += bounds(a.fontsPane).bottom
		case 4, 5:
			si := scrollInfo{fMask: 0x10}
			si.cbSize = uint32(unsafe.Sizeof(si))
			pGetScrollInfo.Call(hwnd, sibVert, uintptr(unsafe.Pointer(&si)))
			pos = si.nTrackPos
		case 6:
			pos = 0
		case 7:
			pos = a.fontContentH
		}
		a.scrollFontsTo(pos)
		return 0
	}
	r, _, _ := pDefWindowProcW.Call(hwnd, uintptr(m), wp, lp)
	return r
}

func (a *app) browseFontFile(title string) string {
	defer a.updateModal()()
	file := make([]uint16, 32768)
	filter := dialogFilter(T("installer.fonts.filter.fonts"), "*.ttf;*.otf;*.woff2;*.woff", T("installer.filter.all"), "*.*")
	initDir := a.lastFontDir
	if initDir != "" {
		if info, err := os.Stat(initDir); err != nil || !info.IsDir() {
			initDir = ""
		}
	}
	if initDir == "" {
		if winFonts := filepath.Join(os.Getenv("WINDIR"), "Fonts"); winFonts != "" {
			if info, err := os.Stat(winFonts); err == nil && info.IsDir() {
				initDir = winFonts
			}
		}
	}
	ofn := openFileName{
		hwndOwner:    a.hwnd,
		lpstrFilter:  &filter[0],
		nFilterIndex: 1,
		lpstrFile:    &file[0],
		nMaxFile:     uint32(len(file)),
		lpstrTitle:   u16(title),
		flags:        0x1000 | 0x0800 | 0x80000 | 0x0008,
	}
	if initDir != "" {
		ofn.lpstrInitialDir = u16(initDir)
	}
	ofn.lStructSize = uint32(unsafe.Sizeof(ofn))
	if r, _, _ := pGetOpenFileNameW.Call(uintptr(unsafe.Pointer(&ofn))); r == 0 {
		return ""
	}
	chosen := syscall.UTF16ToString(file)
	if chosen != "" {
		a.lastFontDir = filepath.Dir(chosen)
	}
	return chosen
}

func (a *app) fontsActionBusy() bool {
	a.mu.Lock()
	busy := a.busy || a.updateDownloading || a.updateHandoff || a.handedOff
	a.mu.Unlock()
	return busy
}

func (a *app) pickFontForSlot(idx int) {
	if a.fontsActionBusy() || idx < 0 || idx >= len(fontSlots) {
		return
	}
	meta := fontSlots[idx]
	chosen := a.browseFontFile(T("installer.fonts.dialog.pickSlot", "slot", meta.Title()))
	if chosen == "" {
		return
	}
	ud := a.activeUserData()
	a.mu.Lock()
	cur := a.fontPreset
	a.mu.Unlock()
	next, err := setFontSlot(ud, cur, meta.ID, chosen)
	if err != nil {
		a.message(T("installer.fonts.msg.failed", "error", err.Error()), 0x10)
		return
	}
	a.mu.Lock()
	a.fontPreset = next
	a.note = sayKey("installer.fonts.note.slotSaved", "slot", meta.Title(), "file", filepath.Base(chosen))
	a.noteCol = colGreen
	a.mu.Unlock()
	a.appendLog(T("installer.fonts.log.slotSet", "slot", meta.Title(), "file", filepath.Base(chosen), "dir", fontStoreDir(ud)) + "\r\n")
	a.syncControls()
}

func (a *app) resetSingleFontSlot(idx int) {
	if a.fontsActionBusy() || idx < 0 || idx >= len(fontSlots) {
		return
	}
	meta := fontSlots[idx]
	ud := a.activeUserData()
	a.mu.Lock()
	cur := a.fontPreset
	a.mu.Unlock()
	next, err := resetFontSlot(ud, cur, meta.ID)
	if err != nil {
		a.message(T("installer.fonts.msg.failed", "error", err.Error()), 0x10)
		return
	}
	a.mu.Lock()
	a.fontPreset = next
	a.note = sayKey("installer.fonts.note.slotReset", "slot", meta.Title())
	a.noteCol = colGreen
	a.mu.Unlock()
	a.appendLog(T("installer.fonts.log.slotReset", "slot", meta.Title()) + "\r\n")
	a.syncControls()
}

func (a *app) applyFontToAllSlots() {
	if a.fontsActionBusy() {
		return
	}
	chosen := a.browseFontFile(T("installer.fonts.dialog.pickAll"))
	if chosen == "" {
		return
	}
	ud := a.activeUserData()
	a.mu.Lock()
	cur := a.fontPreset
	a.mu.Unlock()
	next, err := setAllFontSlots(ud, cur, chosen)
	if err != nil {
		a.message(T("installer.fonts.msg.failed", "error", err.Error()), 0x10)
		return
	}
	a.mu.Lock()
	a.fontPreset = next
	a.note = sayKey("installer.fonts.note.allSaved", "file", filepath.Base(chosen))
	a.noteCol = colGreen
	a.mu.Unlock()
	a.appendLog(T("installer.fonts.log.allSet", "file", filepath.Base(chosen)) + "\r\n")
	a.syncControls()
}

func (a *app) resetAllFonts() {
	if a.fontsActionBusy() {
		return
	}
	ud := a.activeUserData()
	next, err := resetAllFontSlots(ud)
	if err != nil {
		a.message(T("installer.fonts.msg.failed", "error", err.Error()), 0x10)
		return
	}
	a.mu.Lock()
	a.fontPreset = next
	a.note = sayKey("installer.fonts.note.allReset")
	a.noteCol = colGreen
	a.mu.Unlock()
	a.appendLog(T("installer.fonts.log.allReset") + "\r\n")
	a.syncControls()
}

func (a *app) exportFontsDialog() {
	if a.fontsActionBusy() {
		return
	}
	defer a.updateModal()()
	file := make([]uint16, 32768)
	copy(file, syscall.StringToUTF16("dfo-fonts-preset.json"))
	filter := dialogFilter(T("installer.fonts.filter.preset"), "*.json", T("installer.filter.all"), "*.*")
	ofn := openFileName{
		hwndOwner:    a.hwnd,
		lpstrFilter:  &filter[0],
		nFilterIndex: 1,
		lpstrFile:    &file[0],
		nMaxFile:     uint32(len(file)),
		lpstrTitle:   u16(T("installer.fonts.dialog.export")),
		lpstrDefExt:  u16("json"),
		flags:        0x2 | 0x800 | 0x80000 | 0x8,
	}
	ofn.lStructSize = uint32(unsafe.Sizeof(ofn))
	if r, _, _ := pGetSaveFileNameW.Call(uintptr(unsafe.Pointer(&ofn))); r == 0 {
		return
	}
	dest := syscall.UTF16ToString(file)
	ud := a.activeUserData()
	a.mu.Lock()
	cur := a.fontPreset
	a.mu.Unlock()
	if err := exportFontPreset(ud, cur, dest); err != nil {
		a.message(T("installer.fonts.msg.failed", "error", err.Error()), 0x10)
		return
	}
	a.mu.Lock()
	a.note = sayKey("installer.fonts.note.exported", "file", filepath.Base(dest))
	a.noteCol = colGreen
	a.mu.Unlock()
	a.appendLog(T("installer.fonts.log.exported", "path", dest) + "\r\n")
	a.syncControls()
}

func (a *app) importFontsDialog() {
	if a.fontsActionBusy() {
		return
	}
	defer a.updateModal()()
	file := make([]uint16, 32768)
	filter := dialogFilter(T("installer.fonts.filter.preset"), "*.json", T("installer.filter.all"), "*.*")
	ofn := openFileName{
		hwndOwner:    a.hwnd,
		lpstrFilter:  &filter[0],
		nFilterIndex: 1,
		lpstrFile:    &file[0],
		nMaxFile:     uint32(len(file)),
		lpstrTitle:   u16(T("installer.fonts.dialog.import")),
		flags:        0x1000 | 0x0800 | 0x80000 | 0x0008,
	}
	ofn.lStructSize = uint32(unsafe.Sizeof(ofn))
	if r, _, _ := pGetOpenFileNameW.Call(uintptr(unsafe.Pointer(&ofn))); r == 0 {
		return
	}
	src := syscall.UTF16ToString(file)
	ud := a.activeUserData()
	next, err := importFontPreset(ud, src)
	if err != nil {
		a.message(T("installer.fonts.msg.failed", "error", err.Error()), 0x10)
		return
	}
	a.mu.Lock()
	a.fontPreset = next
	a.note = sayKey("installer.fonts.note.imported", "file", filepath.Base(src))
	a.noteCol = colGreen
	a.mu.Unlock()
	a.appendLog(T("installer.fonts.log.imported", "path", src) + "\r\n")
	a.syncControls()
}

func (a *app) openFontsFolder() {
	ud := a.activeUserData()
	dir := fontStoreDir(ud)
	a.mu.Lock()
	cur := a.fontPreset
	a.mu.Unlock()
	if err := os.MkdirAll(fontFilesDir(ud), 0o755); err == nil {
		if _, statErr := os.Stat(fontPresetPath(ud)); statErr != nil {
			_, _ = saveFontPreset(ud, cur)
		}
	}
	pShellExecuteW.Call(a.hwnd, uintptr(unsafe.Pointer(u16("open"))), uintptr(unsafe.Pointer(u16(dir))), 0, 0, 1)
}
