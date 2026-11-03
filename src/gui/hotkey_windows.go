package main

// Recording happens inside our window's message loop, before dialog navigation.
// No global hooks: leaving the application cancels recording.
func (a *app) startLootKeyCapture(targets ...int) {
	a.mu.Lock()
	target, feature := idLootKey, idLoot
	if len(targets) > 0 && targets[0] == idDungeonKey {
		target, feature = idDungeonKey, idDungeons
	}
	allowed := !a.busy && !a.querying && a.status != nil && a.toggles[feature]
	if allowed {
		a.capturingKey = !a.capturingKey || a.captureTarget != target
		a.captureTarget = target
	}
	a.mu.Unlock()
	a.syncControls()
}

func (a *app) finishLootKeyCapture(code string) {
	a.mu.Lock()
	if a.capturingKey && validLootKey(code) {
		if a.captureTarget == idDungeonKey {
			a.dungeonKey = code
			a.dungeonKeyDirty = true
		} else {
			a.lootKey = code
			a.lootKeyDirty = true
		}
	}
	a.capturingKey = false
	a.mu.Unlock()
	a.syncControls()
}

func (a *app) captureInput(m *msg) bool {
	// Swallow the release/repeats of a recorded press too. In particular, Space
	// must not click the focused record button again when it is released.
	if a.recordedKey != 0 && uint32(m.wParam) == a.recordedKey {
		switch m.message {
		case wmKeyUp, wmSysKeyUp:
			a.recordedKey = 0
			return true
		case wmKeyDown, wmSysKeyDown:
			return true
		}
	}
	if a.recordedMouse != 0 && (m.message == wmMButtonUp || m.message == wmXButtonUp) {
		button := uint32(3)
		if m.message == wmXButtonUp {
			button = uint32(m.wParam>>16) + 3
		}
		if button == a.recordedMouse {
			a.recordedMouse = 0
			return true
		}
	}
	if !a.capturingKey {
		return false
	}
	switch m.message {
	case wmKeyDown, wmSysKeyDown:
		vk := uint32(m.wParam)
		if vk == 0x1b {
			a.recordedKey = vk
			a.finishLootKeyCapture("")
			return true
		}
		if m.lParam&(1<<30) != 0 {
			return true
		}
		for _, modifier := range []uintptr{0x10, 0x11, 0x12, 0x5b, 0x5c} {
			state, _, _ := pGetKeyState.Call(modifier)
			if state&0x8000 != 0 {
				return true
			}
		}
		code := physicalLootKey(vk, uint32(m.lParam>>16)&0xff, m.lParam&(1<<24) != 0)
		if validLootKey(code) {
			a.recordedKey = vk
			a.finishLootKeyCapture(code)
		}
		return true
	case wmKeyUp, wmSysKeyUp, wmChar, wmSysChar:
		return true
	case wmMButtonDown, wmXButtonDown:
		code, button := "Mouse3", uint32(3)
		if m.message == wmXButtonDown {
			switch m.wParam >> 16 {
			case 1:
				code, button = "Mouse4", 4
			case 2:
				code, button = "Mouse5", 5
			default:
				return true
			}
		}
		for _, modifier := range []uintptr{0x10, 0x11, 0x12, 0x5b, 0x5c} {
			state, _, _ := pGetKeyState.Call(modifier)
			if state&0x8000 != 0 {
				return true
			}
		}
		a.recordedMouse = button
		a.finishLootKeyCapture(code)
		return true
	case wmLButtonDown, wmRButtonDown:
		if m.message == wmLButtonDown && m.hwnd == a.ctl[a.captureTarget] {
			// Let the record button's own click toggle the recording off.
			return false
		}
		// Ordinary clicks cancel and then continue to their actual control.
		a.finishLootKeyCapture("")
	}
	return false
}
