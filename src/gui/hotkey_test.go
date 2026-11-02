package main

import (
	"encoding/json"
	"slices"
	"testing"
)

func TestPhysicalLootKeySeparatesNumpadWithEitherNumLockState(t *testing.T) {
	for _, tc := range []struct {
		vk, scan uint32
		extended bool
		want     string
	}{
		{0x61, 0x4f, false, "Numpad1"}, {0x23, 0x4f, false, "Numpad1"}, {0x23, 0x4f, true, "End"},
		{0x60, 0x52, false, "Numpad0"}, {0x2d, 0x52, false, "Numpad0"}, {0x2d, 0x52, true, "Insert"},
		{0x65, 0x4c, false, "Numpad5"}, {0x0c, 0x4c, false, "Numpad5"},
		{0x28, 0x50, false, "Numpad2"}, {0x28, 0x50, true, "ArrowDown"},
		{0x22, 0x51, false, "Numpad3"}, {0x22, 0x51, true, "PageDown"},
		{0x25, 0x4b, false, "Numpad4"}, {0x25, 0x4b, true, "ArrowLeft"},
		{0x27, 0x4d, false, "Numpad6"}, {0x27, 0x4d, true, "ArrowRight"},
		{0x24, 0x47, false, "Numpad7"}, {0x24, 0x47, true, "Home"},
		{0x26, 0x48, false, "Numpad8"}, {0x26, 0x48, true, "ArrowUp"},
		{0x21, 0x49, false, "Numpad9"}, {0x21, 0x49, true, "PageUp"},
		{0x6e, 0x53, false, "NumpadDecimal"}, {0x2e, 0x53, false, "NumpadDecimal"}, {0x2e, 0x53, true, "Delete"},
		{0x0d, 0x1c, false, "Enter"}, {0x0d, 0x1c, true, "NumpadEnter"},
		{0x6f, 0x35, true, "NumpadDivide"}, {0xbf, 0x35, false, "Slash"},
		{0x6a, 0x37, false, "NumpadMultiply"}, {0x2c, 0x37, true, "PrintScreen"},
		{0x6b, 0x4e, false, "NumpadAdd"}, {0x6d, 0x4a, false, "NumpadSubtract"},
		{0x31, 0x02, false, "Digit1"}, {0x5a, 0x15, false, "KeyY"}, // Physical Y on a layout whose VK is Z.
		{0x87, 0, false, "F24"}, {0x10, 0x2a, false, ""}, {0x1b, 0x01, false, ""},
		{0x4a, 0, false, "KeyJ"}, {0x31, 0, false, "Digit1"}, {0x0d, 0, true, "NumpadEnter"},
	} {
		got := physicalLootKey(tc.vk, tc.scan, tc.extended)
		if got != tc.want {
			t.Errorf("VK=%x scan=%x extended=%v: got %q, want %q", tc.vk, tc.scan, tc.extended, got, tc.want)
		}
		if got != "" && !validLootKey(got) {
			t.Errorf("captured an unsaveable key: %s", got)
		}
	}
}

func TestLootKeyChoiceReachesInstallWithoutReplacingAnUnchangedBinding(t *testing.T) {
	for _, code := range []string{"Mouse3", "Mouse4", "Mouse5", "Numpad0", "NumpadEnter", "NumpadAdd", "KeyJ", "Tab"} {
		args := operationArgs("install", defaults(), code)
		at := slices.Index(args, "--loot-key")
		if at < 0 || args[at+1] != code {
			t.Errorf("missing explicit binding %s: %v", code, args)
		}
	}
	for _, code := range []string{"", "Escape", "Mouse1", "Mouse2", "Mouse6", "ShiftLeft", "Numpad100", "bad\x00key"} {
		if slices.Contains(operationArgs("install", defaults(), code), "--loot-key") {
			t.Errorf("sent invalid/unchanged binding %q", code)
		}
	}
	for _, tc := range []struct{ code, label string }{{"Mouse4", "Мышь 4"}, {"Mouse5", "Мышь 5"}, {"Numpad1", "NumPad 1"}, {"Digit1", "1"}, {"NumpadEnter", "NumPad Enter"}, {"Enter", "Enter"}} {
		if got := lootKeyLabel(tc.code); got != tc.label {
			t.Errorf("ambiguous key label %s: %s", tc.code, got)
		}
	}
	if configuredLootKey(json.RawMessage(`{"nearbyLootOptions":{"keyCode":"Mouse5"}}`)) != "Mouse5" {
		t.Fatal("lost saved mouse binding")
	}
	if configuredLootKey(nil) != "KeyJ" {
		t.Fatal("changed legacy default")
	}
}

func TestResolveLootKeyPrefersCache(t *testing.T) {
	stWithCache := &gameStatus{
		CachedLootKey: "Mouse4",
		Cfg:           json.RawMessage(`{"nearbyLootOptions":{"keyCode":"KeyK"}}`),
	}
	if got := resolveLootKey(stWithCache); got != "Mouse4" {
		t.Fatalf("expected Mouse4 from cache, got %s", got)
	}

	stOnlyCfg := &gameStatus{
		Cfg: json.RawMessage(`{"nearbyLootOptions":{"keyCode":"KeyK"}}`),
	}
	if got := resolveLootKey(stOnlyCfg); got != "KeyK" {
		t.Fatalf("expected KeyK from cfg, got %s", got)
	}

	stInvalidCache := &gameStatus{
		CachedLootKey: "InvalidKeyName",
		Cfg:           json.RawMessage(`{"nearbyLootOptions":{"keyCode":"KeyK"}}`),
	}
	if got := resolveLootKey(stInvalidCache); got != "KeyK" {
		t.Fatalf("expected KeyK on invalid cache key, got %s", got)
	}

	if got := resolveLootKey(nil); got != defaultLootKey {
		t.Fatalf("expected default %s for nil status, got %s", defaultLootKey, got)
	}
}
