// Native Win32 installer. Embedded data; no separately installed runtime.
package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"unsafe"
)

type app struct {
	mu                                          sync.Mutex
	wg                                          sync.WaitGroup
	ctx                                         context.Context
	cancel                                      context.CancelFunc
	hwnd, pane                                  uintptr
	dpi                                         int32
	modDir, payloadDir, prefsDir                string
	exe                                         string
	status                                      *gameStatus
	busy, querying, searching                   bool
	lootKey, dungeonKey                         string
	lootKeyDirty, dungeonKeyDirty, capturingKey bool
	captureTarget                               int
	recordedKey, recordedMouse                  uint32
	generation, choiceRevision                  uint64
	searchFound                                 []string
	searchHow                                   string
	searchReady                                 bool
	note, stage, operation                      string
	noteCol                                     uintptr
	progress                                    int
	page                                        int
	pending, fullLog                            strings.Builder
	toggles                                     map[int]bool
	ctl, descriptions                           map[int]uintptr
	fonts                                       map[string]uintptr
	brushBg, brushCard, brushField, brushLog    uintptr
	rows                                        map[int]rect
	scroll, contentHeight, wheel                int32
	anim                                        int32
	auto                                        string
}

var A = &app{dpi: 96, page: idComponents, lootKey: defaultLootKey, dungeonKey: defaultDungeonKey, toggles: defaults(), ctl: map[int]uintptr{}, descriptions: map[int]uintptr{}, fonts: map[string]uintptr{}, rows: map[int]rect{}}

func (a *app) px(v int32) int32 { return v * a.dpi / 96 }
func (a *app) font(name string, size, weight int32) uintptr {
	if f, ok := a.fonts[name]; ok {
		return f
	}
	f, _, _ := pCreateFontW.Call(uintptr(uint32(-a.px(size))), 0, 0, 0, uintptr(weight), 0, 0, 0, 1, 0, 0, 5, 0, uintptr(unsafe.Pointer(u16("Segoe UI"))))
	a.fonts[name] = f
	return f
}
func (a *app) child(parent uintptr, id int, kind, label string, style uintptr) uintptr {
	h, _, _ := pCreateWindowExW.Call(0, uintptr(unsafe.Pointer(u16(kind))), uintptr(unsafe.Pointer(u16(label))), wsChild|style, 0, 0, 10, 10, parent, uintptr(id), 0, 0)
	a.ctl[id] = h
	return h
}
func (a *app) button(id int, label string) {
	a.child(a.hwnd, id, "BUTTON", label, wsVisible|wsTabStop|bsOwnerDraw)
}
func (a *app) createControls() {
	a.child(a.hwnd, idPath, "EDIT", "Поиск установленной игры…", wsVisible|wsTabStop|esReadOnly|esAutoHScroll)
	for _, v := range []struct {
		id    int
		label string
	}{{idBrowse, "Выбрать игру…"}, {idRefresh, "Проверить"}, {idComponents, "Компоненты"}, {idJournal, "Журнал"}} {
		a.button(v.id, v.label)
	}
	pane, _, _ := pCreateWindowExW.Call(wsExControlParent, uintptr(unsafe.Pointer(u16("DFOExpanderComponents"))), 0, wsChild|wsVisible|wsVScroll|wsClipChild, 0, 0, 10, 10, a.hwnd, idPane, 0, 0)
	a.pane = pane
	a.ctl[idPane] = pane
	for _, f := range features {
		h := a.child(pane, f.ID, "BUTTON", f.Title, wsVisible|wsTabStop|bsAutoCheckbox|bsMultiline|bsNotify)
		if pSetWindowTheme.Find() == nil {
			pSetWindowTheme.Call(h, uintptr(unsafe.Pointer(u16(""))), uintptr(unsafe.Pointer(u16(""))))
		}
		a.descriptions[f.ID] = a.child(pane, 1000+f.ID, "STATIC", f.Description, wsVisible|0x80)
		if f.ID == idMarks {
			a.child(pane, idVisited, "BUTTON", "Только посещённые", wsVisible|wsTabStop|bsAutoCheckbox|bsNotify)
			if pSetWindowTheme.Find() == nil {
				pSetWindowTheme.Call(a.ctl[idVisited], uintptr(unsafe.Pointer(u16(""))), uintptr(unsafe.Pointer(u16(""))))
			}
		}
		if f.ID == idLoot {
			a.child(pane, idLootKey, "BUTTON", "Клавиша: J", wsVisible|wsTabStop|bsOwnerDraw|bsNotify)
		}
		if f.ID == idDungeons {
			a.child(pane, idDungeonKey, "BUTTON", "Клавиша: K", wsVisible|wsTabStop|bsOwnerDraw|bsNotify)
		}
	}
	a.child(a.hwnd, idLog, "EDIT", "", wsVScroll|wsTabStop|esMultiline|esAutoVScroll|esReadOnly)
	for _, v := range []struct {
		id    int
		label string
	}{{idSaveLog, "Сохранить журнал…"}, {idOpenLog, "Журнал игры"}, {idOpenReport, "Отчёт меток"}, {idReadme, "Инструкция"}, {idUninstall, "Удалить расширение"}, {idInstall, "Установить выбранное"}} {
		a.button(v.id, v.label)
	}
	pSendMessageW.Call(a.ctl[idLog], emSetLimit, 1024*1024, 0)
	a.applyFonts()
	a.layout()
	a.syncControls()
}
func (a *app) applyFonts() {
	for _, f := range features {
		pSendMessageW.Call(a.ctl[f.ID], wmSetFont, a.font("feature", 16, 600), 1)
		pSendMessageW.Call(a.descriptions[f.ID], wmSetFont, a.font("body", 14, 400), 1)
	}
	pSendMessageW.Call(a.ctl[idVisited], wmSetFont, a.font("small", 12, 400), 1)
	pSendMessageW.Call(a.ctl[idPath], wmSetFont, a.font("path", 15, 400), 1)
	pSendMessageW.Call(a.ctl[idLog], wmSetFont, a.font("body", 14, 400), 1)
}
func (a *app) syncControls() {
	a.mu.Lock()
	choices := make(map[int]bool, len(a.toggles))
	for id, on := range a.toggles {
		choices[id] = on
	}
	busy, querying, searching, st, page, operation := a.busy, a.querying, a.searching, a.status, a.page, a.operation
	key, dungeonKey, recording, target := a.lootKey, a.dungeonKey, a.capturingKey, a.captureTarget
	a.mu.Unlock()
	for _, f := range features {
		pSendMessageW.Call(a.ctl[f.ID], bmSetCheck, uintptrBool(choices[f.ID]), 0)
		enable(a.ctl[f.ID], !busy)
		invalidate(a.ctl[f.ID])
	}
	pSendMessageW.Call(a.ctl[idVisited], bmSetCheck, uintptrBool(choices[idVisited]), 0)
	enable(a.ctl[idVisited], !busy && choices[idMarks])
	ready := !busy && !querying && st != nil && !st.Running && !recording
	enable(a.ctl[idLootKey], !busy && !querying && st != nil && choices[idLoot])
	keyLabel := "Клавиша: " + lootKeyLabel(key)
	if recording && target == idLootKey {
		keyLabel = "Нажмите клавишу…"
	}
	caption(a.ctl[idLootKey], keyLabel)
	invalidate(a.ctl[idLootKey])
	enable(a.ctl[idDungeonKey], !busy && !querying && st != nil && choices[idDungeons])
	dungeonLabel := "Клавиша: " + lootKeyLabel(dungeonKey)
	if recording && target == idDungeonKey {
		dungeonLabel = "Нажмите клавишу…"
	}
	caption(a.ctl[idDungeonKey], dungeonLabel)
	invalidate(a.ctl[idDungeonKey])
	enable(a.ctl[idInstall], ready && selectedCount(choices) > 0)
	enable(a.ctl[idUninstall], ready && st.Installed)
	enable(a.ctl[idBrowse], !busy)
	enable(a.ctl[idRefresh], !busy && !querying && !searching)
	label := "Установить выбранное"
	if st != nil && st.Installed {
		label = "Обновить расширение"
		if st.ModVersion != nil && *st.ModVersion == appVersion {
			label = "Применить настройки"
		}
	}
	if busy {
		if operation == "uninstall" {
			label = "Удаление…"
		} else {
			label = "Установка…"
		}
	}
	caption(a.ctl[idInstall], label)
	show(a.pane, page == idComponents)
	show(a.ctl[idLog], page == idJournal)
	for _, id := range []int{idSaveLog, idOpenLog, idOpenReport} {
		show(a.ctl[id], page == idJournal)
	}
	for _, id := range []int{idComponents, idJournal, idInstall, idUninstall, idBrowse, idRefresh} {
		invalidate(a.ctl[id])
	}
	invalidate(a.pane)
	invalidate(a.hwnd)
	a.layout()
}
func uintptrBool(v bool) uintptr {
	if v {
		return 1
	}
	return 0
}

func (a *app) layout() {
	if a.hwnd == 0 {
		return
	}
	r := bounds(a.hwnd)
	P := a.px
	compact := r.bottom < P(710)
	gameTop, paneTop, foot := int32(120), int32(290), int32(136)
	if compact {
		gameTop = 92
		paneTop = 254
	}
	move(a.ctl[idBrowse], rect{r.right - P(168), P(gameTop + 22), r.right - P(40), P(gameTop + 54)})
	move(a.ctl[idRefresh], rect{r.right - P(168), P(gameTop + 60), r.right - P(40), P(gameTop + 88)})
	move(a.ctl[idPath], rect{P(40), P(gameTop + 36), r.right - P(190), P(gameTop + 62)})
	tabTop := P(paneTop - 44)
	move(a.ctl[idComponents], rect{P(24), tabTop, P(180), tabTop + P(32)})
	move(a.ctl[idJournal], rect{P(188), tabTop, P(294), tabTop + P(32)})
	bottom := r.bottom - P(foot) - P(10)
	if bottom < P(paneTop+40) {
		bottom = P(paneTop + 40)
	}
	move(a.pane, rect{P(24), P(paneTop), r.right - P(24), bottom})
	move(a.ctl[idLog], rect{P(36), P(paneTop + 12), r.right - P(36), bottom - P(48)})
	move(a.ctl[idSaveLog], rect{P(32), bottom - P(38), P(224), bottom - P(8)})
	move(a.ctl[idOpenLog], rect{P(232), bottom - P(38), P(372), bottom - P(8)})
	move(a.ctl[idOpenReport], rect{P(380), bottom - P(38), P(514), bottom - P(8)})
	base := r.bottom - P(60)
	move(a.ctl[idInstall], rect{r.right - P(276), base, r.right - P(24), base + P(42)})
	move(a.ctl[idUninstall], rect{r.right - P(470), base, r.right - P(288), base + P(42)})
	move(a.ctl[idReadme], rect{P(24), base + P(4), P(138), base + P(36)})
	a.layoutRows()
	invalidate(a.hwnd)
}
func (a *app) layoutRows() {
	if a.pane == 0 {
		return
	}
	P := a.px
	r := bounds(a.pane)
	w := r.right - P(2)
	hdc, _, _ := pGetDC.Call(a.pane)
	defer pReleaseDC.Call(a.pane, hdc)
	y := int32(0)
	type measure struct {
		f feature
		h int32
	}
	measured := []measure{}
	for _, f := range features {
		t := rect{0, 0, w - P(284), 0}
		of, _, _ := pSelectObject.Call(hdc, a.font("body", 14, 400))
		s := syscall.StringToUTF16(f.Description)
		pDrawTextW.Call(hdc, uintptr(unsafe.Pointer(&s[0])), uintptr(len(s)-1), uintptr(unsafe.Pointer(&t)), dtWordBreak|dtCalcRect|dtNoPrefix)
		pSelectObject.Call(hdc, of)
		h := t.bottom + P(32)
		if h < P(98) {
			h = P(98)
		}
		if f.ID == idMarks && h < P(116) {
			h = P(116)
		}
		if (f.ID == idLoot || f.ID == idDungeons) && h < P(130) {
			h = P(130)
		}
		a.rows[f.ID] = rect{0, y, w, y + h}
		measured = append(measured, measure{f, t.bottom + P(4)})
		y += h + P(10)
	}
	a.contentHeight = y - P(10)
	limit := a.contentHeight - r.bottom
	if limit < 0 {
		limit = 0
	}
	if a.scroll > limit {
		a.scroll = limit
	}
	if a.scroll < 0 {
		a.scroll = 0
	}
	si := scrollInfo{fMask: 0x17, nMin: 0, nMax: a.contentHeight - 1, nPage: uint32(r.bottom), nPos: a.scroll}
	si.cbSize = uint32(unsafe.Sizeof(si))
	pSetScrollInfo.Call(a.pane, sibVert, uintptr(unsafe.Pointer(&si)), 1)
	for _, m := range measured {
		row := a.rows[m.f.ID]
		top := row.top - a.scroll
		move(a.ctl[m.f.ID], rect{P(20), top + P(17), P(244), top + P(49)})
		move(a.descriptions[m.f.ID], rect{P(270), top + P(16), w - P(16), top + P(16) + m.h})
		if m.f.ID == idMarks {
			move(a.ctl[idVisited], rect{P(40), top + P(80), P(244), top + P(104)})
		}
		if m.f.ID == idLoot {
			move(a.ctl[idLootKey], rect{P(40), top + P(80), P(244), top + P(114)})
		}
		if m.f.ID == idDungeons {
			move(a.ctl[idDungeonKey], rect{P(40), top + P(80), P(244), top + P(114)})
		}
	}
	invalidate(a.pane)
}
func (a *app) scrollTo(y int32) { a.scroll = y; a.layoutRows() }
func (a *app) focusRow(id int) {
	rowID := id
	offset := a.px(16)
	if id == idVisited {
		rowID = idMarks
		offset = a.px(80)
	}
	if id == idLootKey {
		rowID = idLoot
		offset = a.px(80)
	}
	if id == idDungeonKey {
		rowID = idDungeons
		offset = a.px(80)
	}
	r, ok := a.rows[rowID]
	if !ok {
		return
	}
	top := r.top + offset
	bottom := top + a.px(32)
	viewH := bounds(a.pane).bottom
	if r.bottom-r.top <= viewH {
		if r.top < a.scroll {
			a.scrollTo(r.top)
		} else if r.bottom > a.scroll+viewH {
			a.scrollTo(r.bottom - viewH)
		}
		return
	}
	if top < a.scroll {
		a.scrollTo(top - a.px(8))
	} else if bottom > a.scroll+viewH {
		a.scrollTo(bottom - viewH + a.px(8))
	}
}

func (a *app) paint(hdc uintptr, r rect) {
	a.mu.Lock()
	defer a.mu.Unlock()
	P := a.px
	fill(hdc, r, colBg)
	compact := r.bottom < P(710)
	titleSize, gameTop, foot := int32(29), int32(120), int32(136)
	if compact {
		titleSize = 25
		gameTop = 92
	}
	fill(hdc, rect{P(24), P(24), P(28), P(66)}, colBrass)
	titleBottom, authorTop := int32(59), int32(60)
	if compact {
		titleBottom = 48
		authorTop = 49
	}
	text(hdc, appName, rect{P(42), P(17), r.right - P(142), P(titleBottom)}, a.font(fmt.Sprintf("title-%d", titleSize), titleSize, 700), colBone, dtSingleLine|dtVCenter|dtEndEllipsis)
	roundBox(hdc, rect{r.right - P(120), P(24), r.right - P(24), P(52)}, P(10), colField, colEdge)
	text(hdc, "v"+appVersion, rect{r.right - P(116), P(24), r.right - P(28), P(52)}, a.font("small", 12, 600), colBrass, dtCenter|dtVCenter|dtSingleLine)
	text(hdc, "Автор: "+appAuthor, rect{P(42), P(authorTop), r.right - P(24), P(authorTop + 20)}, a.font("body", 14, 400), colBrass, dtSingleLine|dtVCenter)
	communityTop := int32(84)
	if compact {
		communityTop = 70
	}
	text(hdc, appCommunity, rect{P(42), P(communityTop), r.right - P(24), P(communityTop + 22)}, a.font("small", 12, 400), colDim, dtSingleLine|dtVCenter|dtEndEllipsis)
	roundBox(hdc, rect{P(24), P(gameTop), r.right - P(24), P(gameTop + 100)}, P(14), colCard, colEdge)
	text(hdc, "01  КЛИЕНТ DFO ONLINE", rect{P(40), P(gameTop + 10), P(480), P(gameTop + 30)}, a.font("label", 11, 600), colBrass, dtSingleLine|dtVCenter)
	line, col := "Выберите игру, если она не найдена автоматически.", colDim
	if a.searching {
		line = "Ищем клиент рядом с установщиком и в обычных папках…"
	} else if a.querying {
		line = "Проверяем установленную версию и сохранённый выбор…"
	} else if st := a.status; st != nil {
		line = "Расширение ещё не установлено"
		if st.Installed {
			line = "Установлено расширение"
			if st.ModVersion != nil {
				line += " " + *st.ModVersion
			}
		}
		if st.Running {
			line += " · закройте игру и нажмите «Проверить»"
			col = colRed
		} else {
			line += " · клиент готов"
		}
	}
	text(hdc, line, rect{P(40), P(gameTop + 66), r.right - P(190), P(gameTop + 90)}, a.font("small", 12, 400), col, dtSingleLine|dtVCenter|dtEndEllipsis)
	paneTop := int32(290)
	if compact {
		paneTop = 254
	}
	text(hdc, selectionLabel(a.toggles), rect{P(316), P(paneTop - 43), r.right - P(28), P(paneTop - 12)}, a.font("small", 12, 400), colDim, dtRight|dtSingleLine|dtVCenter)
	if a.page == idJournal {
		roundBox(hdc, rect{P(24), P(paneTop), r.right - P(24), r.bottom - P(foot) - P(10)}, P(10), colLog, colEdge)
	}
	footer := r.bottom - P(foot)
	fill(hdc, rect{P(24), footer, r.right - P(24), footer + P(1)}, colEdge)
	note, ncol := a.note, a.noteCol
	if a.capturingKey {
		note = "Нажмите клавишу или кнопку мыши 3/4/5. Esc — отмена."
		ncol = colBrass
	} else if a.busy {
		if note == "" {
			note = "Установка…"
			if a.operation == "uninstall" {
				note = "Удаление…"
			}
		}
		ncol = colBrass
	} else if a.toggles[idLoot] && a.toggles[idDungeons] && a.lootKey == a.dungeonKey {
		note = "Кнопки лута и сведений совпадают. Назначьте разные; сводка доступна кнопкой в игре."
		ncol = colRed
	} else if note == "" {
		note = "Выберите нужные функции. Резервная копия клиента создаётся автоматически."
		ncol = colDim
		if selectedCount(a.toggles) == 0 {
			note = "Выберите хотя бы одну функцию или удалите расширение целиком."
		}
	}
	text(hdc, note, rect{P(24), footer + P(9), r.right - P(24), footer + P(33)}, a.font("body", 14, 400), ncol, dtSingleLine|dtVCenter|dtEndEllipsis)
	if a.busy {
		text(hdc, a.stage, rect{P(24), footer + P(34), r.right - P(70), footer + P(54)}, a.font("small", 12, 400), colDim, dtSingleLine|dtVCenter|dtEndEllipsis)
	}
	barY := footer + P(61)
	bar := rect{P(24), barY, r.right - P(24), barY + P(3)}
	fill(hdc, bar, colEdge)
	if a.progress > 0 {
		bar.right = bar.left + (bar.right-bar.left)*int32(a.progress)/100
		fill(hdc, bar, colBrass)
	} else if a.busy {
		width := bar.right - bar.left
		start := (a.anim*a.px(14))%(width+a.px(130)) - a.px(130)
		seg := rect{bar.left + start, bar.top, bar.left + start + a.px(130), bar.bottom}
		if seg.left < bar.left {
			seg.left = bar.left
		}
		if seg.right > bar.right {
			seg.right = bar.right
		}
		if seg.right > seg.left {
			fill(hdc, seg, colBrass)
		}
	}
}
func (a *app) paintRows(hdc uintptr, r rect) {
	fill(hdc, r, colBg)
	a.mu.Lock()
	defer a.mu.Unlock()
	P := a.px
	for _, f := range features {
		row := a.rows[f.ID]
		row.top -= a.scroll
		row.bottom -= a.scroll
		if row.bottom < 0 || row.top > r.bottom {
			continue
		}
		edge := colEdge
		if a.toggles[f.ID] {
			edge = rgb(105, 91, 65)
		}
		roundBox(hdc, row, P(12), colCard, edge)
		field := rect{P(256), row.top + P(8), row.right - P(8), row.bottom - P(8)}
		roundBox(hdc, field, P(8), colField, colField)
		badge := f.Badge
		if f.ID == idLoot {
			badge = lootBindingBadge(a.lootKey)
		}
		if f.ID == idDungeons {
			badge = "КЛАВИША " + lootKeyLabel(a.dungeonKey) + " · СВОДКА"
		}
		text(hdc, badge, rect{P(40), row.top + P(53), P(246), row.top + P(73)}, a.font("badge", 10, 600), colDim, dtSingleLine|dtVCenter|dtEndEllipsis)
	}
}
func (a *app) drawButton(d *drawItemStruct) {
	hdc, r, id := d.hDC, d.rcItem, int(d.ctlID)
	a.mu.Lock()
	page := a.page
	recording := a.capturingKey && a.captureTarget == id
	a.mu.Unlock()
	bg, edge, fg := colCard, colEdge, colBone
	if id == idInstall {
		bg, edge, fg = colBrass, colBrass, colInk
	} else if (id == idLootKey || id == idDungeonKey) && recording {
		bg, edge, fg = colField, colBrass, colBrass
	} else if id == idComponents || id == idJournal {
		if id == page {
			bg, edge, fg = colField, colBrass, colBrass
		} else {
			bg, edge, fg = colBg, colBg, colDim
		}
	}
	if d.itemState&odsSelected != 0 {
		if id == idInstall {
			bg = colBrassHi
		} else {
			bg = colField
		}
	}
	if d.itemState&odsDisabled != 0 {
		bg, edge, fg = colCard, colEdge, colDim
	}
	fill(hdc, r, colBg)
	roundBox(hdc, rect{r.left + 1, r.top + 1, r.right - 1, r.bottom - 1}, a.px(8), bg, edge)
	n, _, _ := pGetWindowTextLengthW.Call(d.hwndItem)
	buf := make([]uint16, int(n)+1)
	pGetWindowTextW.Call(d.hwndItem, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	text(hdc, syscall.UTF16ToString(buf), r, a.font("button", 14, 600), fg, dtCenter|dtVCenter|dtSingleLine)
	if d.itemState&odsFocus != 0 {
		focus := rect{r.left + a.px(4), r.top + a.px(4), r.right - a.px(4), r.bottom - a.px(4)}
		pDrawFocusRect.Call(hdc, uintptr(unsafe.Pointer(&focus)))
	}
}
func colorControl(a *app, m uint32, hdc, control uintptr) uintptr {
	brush, bg := a.brushCard, colCard
	if control == a.ctl[idLog] {
		brush, bg = a.brushLog, colLog
	} else if control == a.ctl[idPath] {
		brush, bg = a.brushCard, colCard
	} else if m == wmCtlColorStat {
		id, _, _ := pGetDlgCtrlID.Call(control)
		if id >= 1000 {
			brush, bg = a.brushField, colField
		}
	}
	pSetTextColor.Call(hdc, colBone)
	pSetBkColor.Call(hdc, bg)
	return brush
}
func paintWindow(hwnd uintptr, paint func(uintptr, rect)) {
	var ps paintStruct
	hdc, _, _ := pBeginPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
	r := bounds(hwnd)
	if r.right > 0 && r.bottom > 0 {
		mem, _, _ := pCreateCompatibleDC.Call(hdc)
		bmp, _, _ := pCreateCompatibleBitmap.Call(hdc, uintptr(r.right), uintptr(r.bottom))
		old, _, _ := pSelectObject.Call(mem, bmp)
		paint(mem, r)
		pBitBlt.Call(hdc, 0, 0, uintptr(r.right), uintptr(r.bottom), mem, 0, 0, 0x00cc0020)
		pSelectObject.Call(mem, old)
		pDeleteObject.Call(bmp)
		pDeleteDC.Call(mem)
	}
	pEndPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
}

func paneProc(hwnd uintptr, m uint32, wp, lp uintptr) uintptr {
	a := A
	switch m {
	case wmDrawItem:
		a.drawButton((*drawItemStruct)(unsafe.Pointer(lp)))
		return 1
	case wmEraseBkgnd:
		return 1
	case wmPaint:
		paintWindow(hwnd, a.paintRows)
		return 0
	case wmCommand:
		if wp>>16 == 6 {
			a.focusRow(int(wp & 0xffff))
			return 0
		}
		r, _, _ := pSendMessageW.Call(a.hwnd, wmCommand, wp, lp)
		return r
	case wmCtlColorBtn, wmCtlColorStat, wmCtlColorEdit:
		return colorControl(a, m, wp, lp)
	case wmMouseWheel:
		a.wheel += int32(int16(wp >> 16))
		steps := a.wheel / 120
		a.wheel %= 120
		if steps != 0 {
			a.scrollTo(a.scroll - steps*a.px(54))
		}
		return 0
	case wmVScroll:
		pos := a.scroll
		switch wp & 0xffff {
		case 0:
			pos -= a.px(36)
		case 1:
			pos += a.px(36)
		case 2:
			pos -= bounds(a.pane).bottom
		case 3:
			pos += bounds(a.pane).bottom
		case 4, 5:
			si := scrollInfo{fMask: 0x10}
			si.cbSize = uint32(unsafe.Sizeof(si))
			pGetScrollInfo.Call(hwnd, sibVert, uintptr(unsafe.Pointer(&si)))
			pos = si.nTrackPos
		case 6:
			pos = 0
		case 7:
			pos = a.contentHeight
		}
		a.scrollTo(pos)
		return 0
	}
	r, _, _ := pDefWindowProcW.Call(hwnd, uintptr(m), wp, lp)
	return r
}
func wndProc(hwnd uintptr, m uint32, wp, lp uintptr) uintptr {
	a := A
	switch m {
	case wmActivateApp:
		if wp == 0 {
			a.recordedKey, a.recordedMouse = 0, 0
			if a.capturingKey {
				a.finishLootKeyCapture("")
			}
		}
	case wmCreate:
		a.hwnd = hwnd
		a.createControls()
		pSetTimer.Call(hwnd, 1, 90, 0)
		return 0
	case wmEraseBkgnd:
		return 1
	case wmPaint:
		paintWindow(hwnd, a.paint)
		return 0
	case wmSize:
		if wp != 1 {
			a.layout()
		}
		return 0
	case wmGetMinMaxInfo:
		mm := (*minMaxInfo)(unsafe.Pointer(lp))
		mm.minTrackSize = point{a.px(760), a.px(540)}
		return 0
	case wmDpiChanged:
		a.dpi = int32(wp & 0xffff)
		old := a.fonts
		a.fonts = map[string]uintptr{}
		a.applyFonts()
		r := (*rect)(unsafe.Pointer(lp))
		pSetWindowPos.Call(hwnd, 0, signed(r.left), signed(r.top), signed(r.right-r.left), signed(r.bottom-r.top), 0x14)
		for _, f := range old {
			pDeleteObject.Call(f)
		}
		a.layout()
		return 0
	case wmDrawItem:
		a.drawButton((*drawItemStruct)(unsafe.Pointer(lp)))
		return 1
	case wmCtlColorBtn, wmCtlColorEdit, wmCtlColorStat:
		return colorControl(a, m, wp, lp)
	case wmMouseWheel:
		a.mu.Lock()
		page := a.page
		a.mu.Unlock()
		if page == idComponents {
			r, _, _ := pSendMessageW.Call(a.pane, uintptr(m), wp, lp)
			return r
		}
	case wmTimer:
		a.mu.Lock()
		busy := a.busy
		a.mu.Unlock()
		if busy {
			a.anim++
			r := bounds(hwnd)
			r.top = r.bottom - a.px(136)
			pInvalidateRect.Call(hwnd, uintptr(unsafe.Pointer(&r)), 0)
		}
		return 0
	case wmCommand:
		id := int(wp & 0xffff)
		if (id == idLootKey || id == idDungeonKey) && wp>>16 == 5 { // BS_NOTIFY: the second click can be BN_DOUBLECLICKED.
			a.startLootKeyCapture(id)
			return 0
		}
		if wp>>16 != 0 {
			return 0
		}
		if a.capturingKey && id != a.captureTarget {
			a.finishLootKeyCapture("")
		}
		switch id {
		case idLootKey, idDungeonKey:
			a.startLootKeyCapture(id)
		case idBrowse:
			a.browse()
		case idRefresh:
			a.mu.Lock()
			have := a.exe != ""
			a.mu.Unlock()
			if have {
				a.requestStatus(false)
			} else {
				a.startSearch()
			}
		case idRu, idMarks, idLoot, idDungeons, idVisited:
			on, _, _ := pSendMessageW.Call(a.ctl[id], bmGetCheck, 0, 0)
			a.mu.Lock()
			a.toggles[id] = on == 1
			a.choiceRevision++
			a.mu.Unlock()
			a.syncControls()
		case idComponents, idJournal:
			a.mu.Lock()
			a.page = id
			a.mu.Unlock()
			a.syncControls()
		case idInstall:
			a.run("install")
		case idUninstall:
			a.run("uninstall")
		case idSaveLog:
			a.saveLog()
		case idOpenLog:
			a.openFile("dfo-mod.log")
		case idOpenReport:
			a.openFile("dfo-mod-marks.txt")
		case idReadme:
			a.openGuide()
		case 2:
			pPostMessageW.Call(hwnd, wmClose, 0, 0)
		}
		return 0
	case wmLog:
		a.mu.Lock()
		s := a.pending.String()
		a.pending.Reset()
		a.mu.Unlock()
		if s != "" {
			pSendMessageW.Call(a.ctl[idLog], emSetSel, 0x7fffffff, 0x7fffffff)
			pSendMessageW.Call(a.ctl[idLog], emReplaceSel, 0, uintptr(unsafe.Pointer(u16(s))))
		}
		invalidate(hwnd)
		return 0
	case wmStatus, wmDone:
		a.syncControls()
		a.mu.Lock()
		auto := a.auto
		ready := !a.busy && !a.querying && a.status != nil && !a.status.Running
		if ready {
			a.auto = ""
		}
		a.mu.Unlock()
		if auto != "" && ready {
			a.run(auto)
		}
		return 0
	case wmSearch:
		a.mu.Lock()
		found, how, apply := a.searchFound, a.searchHow, a.searchReady
		a.searchReady = false
		a.mu.Unlock()
		if apply {
			if len(found) > 0 {
				a.setGame(found[0], how)
				if len(found) > 1 {
					a.appendLog(fmt.Sprintf("Найдено копий: %d. Другую можно выбрать кнопкой «Выбрать игру…».\r\n", len(found)))
				}
			} else {
				a.mu.Lock()
				have := a.exe != ""
				if !have {
					a.note = "Игра не найдена автоматически. Нажмите «Выбрать игру…»."
					a.noteCol = colDim
				}
				a.mu.Unlock()
				if !have {
					caption(a.ctl[idPath], "Укажите DFO Online.exe из папки игры")
				}
			}
		}
		a.syncControls()
		return 0
	case wmClose:
		a.mu.Lock()
		busy := a.busy
		if busy {
			a.note = "Дождитесь завершения операции, чтобы сохранить файлы клиента."
			a.noteCol = colBrass
		}
		a.mu.Unlock()
		if busy {
			invalidate(hwnd)
			return 0
		}
	case wmDestroy:
		a.cancel()
		pKillTimer.Call(hwnd, 1)
		pPostQuitMessage.Call(0)
		return 0
	}
	r, _, _ := pDefWindowProcW.Call(hwnd, uintptr(m), wp, lp)
	return r
}

func main() {
	runtime.LockOSThread()
	a := A
	a.ctx, a.cancel = context.WithCancel(context.Background())
	defer a.cancel()
	if pSetProcessDpiAwarenessContext.Find() == nil {
		pSetProcessDpiAwarenessContext.Call(^uintptr(3))
	} else {
		pSetProcessDPIAware.Call()
	}
	self, _ := os.Executable()
	a.modDir = filepath.Dir(self)
	a.prefsDir = filepath.Join(os.Getenv("LOCALAPPDATA"), appName)
	var gameArg string
	for i, arg := range os.Args[1:] {
		if arg == "--auto-install" {
			a.auto = "install"
		} else if arg == "--auto-uninstall" {
			a.auto = "uninstall"
		} else if arg == "--game" && i+2 < len(os.Args) {
			gameArg = os.Args[i+2]
		}
	}
	var err error
	a.payloadDir, err = unpackPayload()
	if err != nil {
		a.message("Не удалось подготовить файлы установщика. Проверьте свободное место и повторите запуск.\n\n"+err.Error(), 0x10)
		return
	}
	defer os.RemoveAll(a.payloadDir)
	hdc, _, _ := pGetDC.Call(0)
	dpi, _, _ := pGetDeviceCaps.Call(hdc, 90)
	pReleaseDC.Call(0, hdc)
	if dpi >= 96 {
		a.dpi = int32(dpi)
	}
	a.brushBg, _, _ = pCreateSolidBrush.Call(colBg)
	a.brushCard, _, _ = pCreateSolidBrush.Call(colCard)
	a.brushField, _, _ = pCreateSolidBrush.Call(colField)
	a.brushLog, _, _ = pCreateSolidBrush.Call(colLog)
	inst, _, _ := pGetModuleHandleW.Call(0)
	cursor, _, _ := pLoadCursorW.Call(0, 32512)
	icon, _, _ := pLoadIconW.Call(inst, 1)
	if icon == 0 {
		icon, _, _ = pLoadIconW.Call(0, 32512)
	}
	for _, c := range []struct {
		name string
		proc uintptr
	}{{"DFOExpanderComponents", syscall.NewCallback(paneProc)}, {"DFOClientExpanderInstaller", syscall.NewCallback(wndProc)}} {
		wc := wndClassEx{lpfnWndProc: c.proc, hInstance: inst, hCursor: cursor, hIcon: icon, hIconSm: icon, hbrBackground: a.brushBg, lpszClassName: u16(c.name)}
		wc.cbSize = uint32(unsafe.Sizeof(wc))
		pRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	}
	style := uintptr(wsCaption | wsSysMenu | wsThickFrame | wsMinimizeBox | wsMaximizeBox | wsClipChild)
	var work rect
	pSystemParametersInfoW.Call(0x30, 0, uintptr(unsafe.Pointer(&work)), 0)
	if work.right == 0 {
		work = rect{0, 0, a.px(1280), a.px(900)}
	}
	r := rect{0, 0, a.px(1000), a.px(1040)}
	pAdjustWindowRect.Call(uintptr(unsafe.Pointer(&r)), style, 0)
	w, h := r.right-r.left, r.bottom-r.top
	if w > work.right-work.left-a.px(40) {
		w = work.right - work.left - a.px(40)
	}
	if h > work.bottom-work.top-a.px(40) {
		h = work.bottom - work.top - a.px(40)
	}
	hwnd, _, _ := pCreateWindowExW.Call(wsExControlParent, uintptr(unsafe.Pointer(u16("DFOClientExpanderInstaller"))), uintptr(unsafe.Pointer(u16(versionTitle()))), style, signed(work.left+(work.right-work.left-w)/2), signed(work.top+(work.bottom-work.top-h)/2), signed(w), signed(h), 0, 0, inst, 0)
	if hwnd == 0 {
		a.message("Не удалось открыть окно установщика.", 0x10)
		return
	}
	if pDwmSetWindowAttribute.Find() == nil {
		dark := int32(1)
		pDwmSetWindowAttribute.Call(hwnd, 20, uintptr(unsafe.Pointer(&dark)), 4)
	}
	pShowWindow.Call(hwnd, 1)
	pUpdateWindow.Call(hwnd)
	pSetFocus.Call(a.ctl[idRu])
	a.appendLog(versionTitle() + "\r\nАвтор: " + appAuthor + "\r\n" + appCommunity + "\r\n\r\n")
	if gameArg != "" {
		if exe := gameIn(filepath.Dir(gameArg)); exe != "" {
			a.setGame(exe, "параметр запуска")
		} else {
			a.message("В указанной папке не найден клиент DFO Online.", 0x30)
			a.startSearch()
		}
	} else {
		a.startSearch()
	}
	var mm msg
	for {
		r, _, _ := pGetMessageW.Call(uintptr(unsafe.Pointer(&mm)), 0, 0, 0)
		if r == 0 || int32(r) == -1 {
			break
		}
		if a.captureInput(&mm) {
			continue
		}
		if mm.message == wmKeyDown && mm.wParam == 13 {
			focus, _, _ := pGetFocus.Call()
			id, _, _ := pGetDlgCtrlID.Call(focus)
			if int(id) != idLog && int(id) != idPath && int(id) != idRu && int(id) != idMarks && int(id) != idLoot && int(id) != idDungeons && int(id) != idVisited {
				pSendMessageW.Call(focus, bmClick, 0, 0)
				continue
			}
		}
		handled, _, _ := pIsDialogMessageW.Call(hwnd, uintptr(unsafe.Pointer(&mm)))
		if handled != 0 {
			continue
		}
		pTranslateMessage.Call(uintptr(unsafe.Pointer(&mm)))
		pDispatchMessageW.Call(uintptr(unsafe.Pointer(&mm)))
	}
	a.wg.Wait()
	for _, f := range a.fonts {
		pDeleteObject.Call(f)
	}
	for _, b := range []uintptr{a.brushBg, a.brushCard, a.brushField, a.brushLog} {
		pDeleteObject.Call(b)
	}
}
