package main

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
)

const defaultLootKey = "KeyJ"

var simpleLootKey = regexp.MustCompile(`^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4])|Numpad[0-9]|Mouse[345])$`)
var lootKeyNames = map[string]string{
	"Space": "Пробел", "Tab": "Tab", "Enter": "Enter", "Backspace": "Backspace",
	"Insert": "Insert", "Delete": "Delete", "Home": "Home", "End": "End",
	"PageUp": "Page Up", "PageDown": "Page Down", "ArrowUp": "↑", "ArrowDown": "↓",
	"ArrowLeft": "←", "ArrowRight": "→", "CapsLock": "Caps Lock", "NumLock": "Num Lock",
	"ScrollLock": "Scroll Lock", "Pause": "Pause", "PrintScreen": "Print Screen",
	"Backquote": "`", "Minus": "−", "Equal": "=", "BracketLeft": "[", "BracketRight": "]",
	"Backslash": "\\", "Semicolon": ";", "Quote": "'", "Comma": ",", "Period": ".", "Slash": "/",
	"IntlBackslash": "\\ (ISO)", "ContextMenu": "Меню",
	"NumpadEnter": "NumPad Enter", "NumpadAdd": "NumPad +", "NumpadSubtract": "NumPad −",
	"NumpadMultiply": "NumPad ×", "NumpadDivide": "NumPad /", "NumpadDecimal": "NumPad .",
	"NumpadComma": "NumPad ,", "NumpadEqual": "NumPad =",
}

func validLootKey(code string) bool {
	_, named := lootKeyNames[code]
	return named || simpleLootKey.MatchString(code)
}

func resolveLootKey(st *gameStatus) string {
	if st == nil {
		return defaultLootKey
	}
	if validLootKey(st.CachedLootKey) {
		return st.CachedLootKey
	}
	return configuredLootKey(st.Cfg)
}

func configuredLootKey(raw json.RawMessage) string {
	var cfg struct {
		Cached  string `json:"cachedLootKey"`
		Options struct {
			Code string `json:"keyCode"`
		} `json:"nearbyLootOptions"`
	}
	if json.Unmarshal(raw, &cfg) == nil {
		if validLootKey(cfg.Cached) {
			return cfg.Cached
		}
		if validLootKey(cfg.Options.Code) {
			return cfg.Options.Code
		}
	}
	return defaultLootKey
}

func lootKeyLabel(code string) string {
	if name, ok := lootKeyNames[code]; ok {
		return name
	}
	if !simpleLootKey.MatchString(code) {
		return "Другая клавиша"
	}
	if strings.HasPrefix(code, "Numpad") {
		return "NumPad " + strings.TrimPrefix(code, "Numpad")
	}
	if strings.HasPrefix(code, "Mouse") {
		return "Мышь " + strings.TrimPrefix(code, "Mouse")
	}
	return strings.TrimPrefix(strings.TrimPrefix(code, "Key"), "Digit")
}

func lootBindingBadge(code string) string {
	if !validLootKey(code) {
		return "ВАША КЛАВИША · 15 МЕТРОВ"
	}
	label := strings.ToUpper(lootKeyLabel(code))
	if !strings.HasPrefix(code, "Mouse") {
		label = "КЛАВИША " + label
	}
	return label + " · 15 МЕТРОВ"
}

func lootKeyBadge(raw json.RawMessage) string { return lootBindingBadge(configuredLootKey(raw)) }

// DOM KeyboardEvent.code describes the physical key, regardless of the active
// keyboard layout and Num Lock. The extended bit separates the navigation block
// and main Enter from the physically different keys on the numeric keypad.
func physicalLootKey(vk, scan uint32, extended bool) string {
	switch vk {
	case 0x10, 0x11, 0x12, 0x5b, 0x5c, 0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5:
		return ""
	case 0x1b: // Escape cancels recording.
		return ""
	case 0x13:
		return "Pause"
	case 0x90:
		return "NumLock"
	}
	if extended {
		if name := map[uint32]string{0x1c: "NumpadEnter", 0x35: "NumpadDivide", 0x37: "PrintScreen",
			0x47: "Home", 0x48: "ArrowUp", 0x49: "PageUp", 0x4b: "ArrowLeft", 0x4d: "ArrowRight",
			0x4f: "End", 0x50: "ArrowDown", 0x51: "PageDown", 0x52: "Insert", 0x53: "Delete", 0x5d: "ContextMenu"}[scan]; name != "" {
			return name
		}
	} else if name := physicalScanCodes[scan]; name != "" {
		return name
	}
	if vk >= 0x70 && vk <= 0x87 {
		return "F" + strconv.Itoa(int(vk-0x6f))
	}
	if vk >= 0x60 && vk <= 0x69 {
		return "Numpad" + strconv.Itoa(int(vk-0x60))
	}
	// Fallback for keyboards/drivers that omit a scan code.
	if vk >= 0x41 && vk <= 0x5a {
		return "Key" + string(rune(vk))
	}
	if vk >= 0x30 && vk <= 0x39 {
		return "Digit" + string(rune(vk))
	}
	if vk == 0x0d && extended {
		return "NumpadEnter"
	}
	return map[uint32]string{0x08: "Backspace", 0x09: "Tab", 0x0d: "Enter", 0x20: "Space",
		0x0c: "Numpad5", 0x14: "CapsLock", 0x2c: "PrintScreen", 0x5d: "ContextMenu", 0x91: "ScrollLock",
		0x21: "PageUp", 0x22: "PageDown", 0x23: "End", 0x24: "Home", 0x25: "ArrowLeft",
		0x26: "ArrowUp", 0x27: "ArrowRight", 0x28: "ArrowDown", 0x2d: "Insert", 0x2e: "Delete",
		0x6a: "NumpadMultiply", 0x6b: "NumpadAdd", 0x6c: "NumpadComma", 0x6d: "NumpadSubtract",
		0x6e: "NumpadDecimal", 0x6f: "NumpadDivide"}[vk]
}

var physicalScanCodes = map[uint32]string{
	0x02: "Digit1", 0x03: "Digit2", 0x04: "Digit3", 0x05: "Digit4", 0x06: "Digit5",
	0x07: "Digit6", 0x08: "Digit7", 0x09: "Digit8", 0x0a: "Digit9", 0x0b: "Digit0",
	0x0c: "Minus", 0x0d: "Equal", 0x0e: "Backspace", 0x0f: "Tab",
	0x10: "KeyQ", 0x11: "KeyW", 0x12: "KeyE", 0x13: "KeyR", 0x14: "KeyT", 0x15: "KeyY",
	0x16: "KeyU", 0x17: "KeyI", 0x18: "KeyO", 0x19: "KeyP", 0x1a: "BracketLeft", 0x1b: "BracketRight",
	0x1c: "Enter", 0x1e: "KeyA", 0x1f: "KeyS", 0x20: "KeyD", 0x21: "KeyF", 0x22: "KeyG",
	0x23: "KeyH", 0x24: "KeyJ", 0x25: "KeyK", 0x26: "KeyL", 0x27: "Semicolon", 0x28: "Quote", 0x29: "Backquote",
	0x2b: "Backslash", 0x2c: "KeyZ", 0x2d: "KeyX", 0x2e: "KeyC", 0x2f: "KeyV", 0x30: "KeyB",
	0x31: "KeyN", 0x32: "KeyM", 0x33: "Comma", 0x34: "Period", 0x35: "Slash", 0x37: "NumpadMultiply",
	0x39: "Space", 0x3a: "CapsLock", 0x46: "ScrollLock", 0x47: "Numpad7", 0x48: "Numpad8", 0x49: "Numpad9",
	0x4a: "NumpadSubtract", 0x4b: "Numpad4", 0x4c: "Numpad5", 0x4d: "Numpad6", 0x4e: "NumpadAdd",
	0x4f: "Numpad1", 0x50: "Numpad2", 0x51: "Numpad3", 0x52: "Numpad0", 0x53: "NumpadDecimal",
	0x56: "IntlBackslash", 0x59: "NumpadEqual",
}
