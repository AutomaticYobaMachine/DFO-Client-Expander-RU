package main

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"unicode/utf8"
)

func fakeTTFBytes(seed byte) []byte {
	out := make([]byte, 64)
	out[0], out[1], out[2], out[3] = 0x00, 0x01, 0x00, 0x00
	for i := 4; i < len(out); i++ {
		out[i] = seed + byte(i)
	}
	return out
}

func fakeOTFBytes(seed byte) []byte {
	out := make([]byte, 64)
	copy(out[:4], "OTTO")
	for i := 4; i < len(out); i++ {
		out[i] = seed + byte(i)
	}
	return out
}

func TestFontPresetLifecycleValidationAndPortability(t *testing.T) {
	dir := t.TempDir()
	profileA := filepath.Join(dir, "profileA")
	profileB := filepath.Join(dir, "profileB")
	srcFontA := filepath.Join(dir, "MyChatFont.ttf")
	srcFontB := filepath.Join(dir, "MyTitleFont.otf")
	badFont := filepath.Join(dir, "broken.ttf")
	if err := os.WriteFile(srcFontA, fakeTTFBytes(1), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(srcFontB, fakeOTFBytes(9), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(badFont, []byte("not a valid font file at all"), 0o644); err != nil {
		t.Fatal(err)
	}

	// Default preset starts with all 8 slots on base
	p := loadFontPreset(profileA)
	if len(p.Slots) != 8 || customFontCount(p) != 0 || p.ActivePreset != "default" {
		t.Fatalf("unexpected default preset: %+v", p)
	}

	// Invalid magic bytes (and renamed .ttc collections) are rejected cleanly
	if _, err := setFontSlot(profileA, p, "description", badFont); err == nil {
		t.Fatal("expected invalid font bytes to fail")
	}
	ttcRenamed := filepath.Join(dir, "collection.ttf")
	ttcBytes := make([]byte, 64)
	copy(ttcBytes[:4], "ttcf")
	if err := os.WriteFile(ttcRenamed, ttcBytes, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := setFontSlot(profileA, p, "description", ttcRenamed); err == nil {
		t.Fatal("expected renamed .ttc collection to be rejected")
	}

	// Set two independent slots: description and title (sigil stays base!)
	var err error
	p, err = setFontSlot(profileA, p, "description", srcFontA)
	if err != nil {
		t.Fatalf("setFontSlot description: %v", err)
	}
	p, err = setFontSlot(profileA, p, "title", srcFontB)
	if err != nil {
		t.Fatalf("setFontSlot title: %v", err)
	}
	if customFontCount(p) != 2 || p.Slots["sigil"].Mode != "base" || p.Slots["description"].Label != "MyChatFont.ttf" || p.Slots["title"].Format != "opentype" {
		t.Fatalf("unexpected custom slots: %+v", p)
	}

	// Reloading from disk preserves overrides even after original source file is deleted
	_ = os.Remove(srcFontA)
	reloaded := loadFontPreset(profileA)
	if customFontCount(reloaded) != 2 || reloaded.Slots["description"].File != p.Slots["description"].File {
		t.Fatalf("reload lost stored font copy: %+v", reloaded)
	}

	// Export self-contained preset and import into clean profileB
	exportPath := filepath.Join(dir, "shared-preset.json")
	if err := exportFontPreset(profileA, reloaded, exportPath); err != nil {
		t.Fatalf("exportFontPreset: %v", err)
	}
	imported, err := importFontPreset(profileB, exportPath)
	if err != nil {
		t.Fatalf("importFontPreset: %v", err)
	}
	if customFontCount(imported) != 2 || imported.Slots["description"].Label != "MyChatFont.ttf" || imported.Slots["title"].Label != "MyTitleFont.otf" {
		t.Fatalf("imported preset mismatch: %+v", imported)
	}
	if _, err := os.Stat(filepath.Join(fontFilesDir(profileB), imported.Slots["description"].File)); err != nil {
		t.Fatalf("imported font binary missing: %v", err)
	}

	// Legacy preset using `narrative` slot migrates cleanly into merged `description` slot
	legacyJSON := []byte(`{"schema":1,"activePreset":"custom","slots":{"narrative":{"mode":"custom","file":"` + reloaded.Slots["description"].File + `","label":"LegacyChat.ttf","format":"truetype"},"description":{"mode":"base"}}}`)
	if err := os.WriteFile(fontPresetPath(profileA), legacyJSON, 0o644); err != nil {
		t.Fatal(err)
	}
	migrated := loadFontPreset(profileA)
	if migrated.Slots["description"].Mode != "custom" || migrated.Slots["description"].Label != "LegacyChat.ttf" {
		t.Fatalf("legacy narrative slot did not migrate to description: %+v", migrated)
	}
	// Restore 2-slot state before continuing reset checks
	reloaded, err = saveFontPreset(profileA, reloaded)
	if err != nil {
		t.Fatal(err)
	}

	// Resetting one slot prunes its orphan file while keeping the other slot's binary
	oldDescFile := reloaded.Slots["description"].File
	reloaded, err = resetFontSlot(profileA, reloaded, "description")
	if err != nil {
		t.Fatalf("resetFontSlot: %v", err)
	}
	if customFontCount(reloaded) != 1 || reloaded.Slots["description"].Mode != "base" {
		t.Fatalf("reset slot failed: %+v", reloaded)
	}
	if _, err := os.Stat(filepath.Join(fontFilesDir(profileA), oldDescFile)); !os.IsNotExist(err) {
		t.Fatal("orphan font file was not pruned after reset")
	}

	// Apply-to-all sets all 8 slots using a single deduplicated file
	reloaded, err = setAllFontSlots(profileA, reloaded, srcFontB)
	if err != nil {
		t.Fatalf("setAllFontSlots: %v", err)
	}
	if customFontCount(reloaded) != len(fontSlots) {
		t.Fatalf("expected all %d slots custom, got %d", len(fontSlots), customFontCount(reloaded))
	}

	// Reset all restores built-in base preset and cleans files folder
	reloaded, err = resetAllFontSlots(profileA)
	if err != nil {
		t.Fatalf("resetAllFontSlots: %v", err)
	}
	if customFontCount(reloaded) != 0 || reloaded.ActivePreset != "default" {
		t.Fatalf("resetAllFontSlots failed: %+v", reloaded)
	}
	entries, _ := os.ReadDir(fontFilesDir(profileA))
	if len(entries) != 0 {
		t.Fatalf("expected files folder empty after reset all, found %d", len(entries))
	}

	// Regression checks:
	// 1. Multi-byte UTF-8 long label truncation never splits a rune
	longName := strings.Repeat("\u00e9", 150)
	trunc := truncateRunes(longName, 128)
	if !utf8.ValidString(trunc) || len([]rune(trunc)) != 128 {
		t.Fatalf("truncateRunes broke UTF-8: valid=%v runes=%d", utf8.ValidString(trunc), len([]rune(trunc)))
	}

	// 2. Importing a portable preset whose custom label has NO file extension still succeeds via cfg.File extension
	profileC := filepath.Join(dir, "profileC")
	customLabelPreset := portableFontPreset{
		Schema:       1,
		ActivePreset: "custom",
		Slots: map[string]fontSlotConfig{
			"description": {Mode: "custom", File: "deadbeef-MyFont.ttf", Label: "Custom Display Label Without Ext"},
			"body":        {Mode: "custom", File: "deadbeef-MyFont.ttf", Label: "Custom Display Label Without Ext"},
		},
		FontsData: map[string]string{
			"deadbeef-MyFont.ttf": base64.StdEncoding.EncodeToString(fakeTTFBytes(7)),
		},
	}
	rawCustom, _ := json.Marshal(customLabelPreset)
	customExport := filepath.Join(dir, "extless-label.json")
	if err := os.WriteFile(customExport, rawCustom, 0o644); err != nil {
		t.Fatal(err)
	}
	impC, err := importFontPreset(profileC, customExport)
	if err != nil {
		t.Fatalf("importFontPreset with extension-less label failed: %v", err)
	}
	if customFontCount(impC) != 2 || impC.Slots["description"].Label != "Custom Display Label Without Ext" {
		t.Fatalf("unexpected imported extension-less preset: %+v", impC)
	}

	// 3. Corrupted stored file on disk fails magic check (falls back to base) and self-heals on re-import
	corruptTarget := filepath.Join(fontFilesDir(profileC), impC.Slots["description"].File)
	if err := os.WriteFile(corruptTarget, []byte("corrupted bytes of arbitrary length"), 0o644); err != nil {
		t.Fatal(err)
	}
	afterCorrupt := loadFontPreset(profileC)
	if customFontCount(afterCorrupt) != 0 || afterCorrupt.Slots["description"].Mode != "base" {
		t.Fatalf("corrupted font binary must fall back to base: %+v", afterCorrupt)
	}
	healed, err := importFontPreset(profileC, customExport)
	if err != nil || customFontCount(healed) != 2 {
		t.Fatalf("re-importing after corruption must self-heal stored binary: err=%v preset=%+v", err, healed)
	}

	// 4. Misnamed wOF2 file saved with .ttf extension normalizes stored extension and format to woff2 while keeping label
	misnamedWoff2 := filepath.Join(dir, "MisnamedWebFont.ttf")
	woff2Bytes := make([]byte, 64)
	copy(woff2Bytes[:4], "wOF2")
	if err := os.WriteFile(misnamedWoff2, woff2Bytes, 0o644); err != nil {
		t.Fatal(err)
	}
	fixedWoff2, err := setFontSlot(profileC, healed, "body", misnamedWoff2)
	if err != nil {
		t.Fatalf("setFontSlot misnamed wOF2 failed: %v", err)
	}
	if fixedWoff2.Slots["body"].Format != "woff2" || !strings.HasSuffix(fixedWoff2.Slots["body"].File, ".woff2") || fixedWoff2.Slots["body"].Label != "MisnamedWebFont.ttf" {
		t.Fatalf("misnamed wOF2 was not normalized: %+v", fixedWoff2.Slots["body"])
	}
}
