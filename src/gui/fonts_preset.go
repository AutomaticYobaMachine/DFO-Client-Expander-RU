package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	fontPresetSchema = 1
	maxFontFileBytes = 32 * 1024 * 1024
)

type fontSlotMeta struct {
	ID        string
	BaseLabel string
	BaseFile  string
}

// Keep in exact sync with src/mod/font-store.cjs SLOTS.
var fontSlots = []fontSlotMeta{
	{ID: "body", BaseLabel: "DFO Gabin", BaseFile: "item-font-text.ttf"},
	{ID: "title", BaseLabel: "DFO Greengoth", BaseFile: "item-font-title.ttf"},
	{ID: "description", BaseLabel: "DFO Flow", BaseFile: "item-font-description.otf"},
	{ID: "number", BaseLabel: "DFO Flexi", BaseFile: "item-font-numbers.ttf"},
	{ID: "book", BaseLabel: "DFO Hangyaku", BaseFile: "book-font-text.ttf"},
	{ID: "power", BaseLabel: "DFO Wolga", BaseFile: "item-font-legendary.otf"},
	{ID: "sigil", BaseLabel: "DFO Ckazka", BaseFile: "item-font-sigil.ttf"},
	{ID: "set", BaseLabel: "DFO Ritalin", BaseFile: "item-font-set.ttf"},
}

func (s fontSlotMeta) Title() string {
	return T("installer.fonts.slot." + s.ID + ".title")
}

func (s fontSlotMeta) Description() string {
	return T("installer.fonts.slot." + s.ID + ".description")
}

type fontSlotConfig struct {
	Mode   string `json:"mode"`
	File   string `json:"file,omitempty"`
	Label  string `json:"label,omitempty"`
	Format string `json:"format,omitempty"`
	SHA256 string `json:"sha256,omitempty"`
}

type fontPreset struct {
	Schema       int                       `json:"schema"`
	ActivePreset string                    `json:"activePreset"`
	Slots        map[string]fontSlotConfig `json:"slots"`
}

type portableFontPreset struct {
	Schema       int                       `json:"schema"`
	ActivePreset string                    `json:"activePreset"`
	Slots        map[string]fontSlotConfig `json:"slots"`
	FontsData    map[string]string         `json:"fontsData,omitempty"`
}

var (
	fontFormatByExt = map[string]string{
		".ttf":   "truetype",
		".otf":   "opentype",
		".woff2": "woff2",
		".woff":  "woff",
	}
	safeFontNameRe = regexp.MustCompile(`^[\w .-]+\.(?:ttf|otf|woff2?)$`)
	unsafeCharRe   = regexp.MustCompile(`[^A-Za-z0-9._-]+`)
)

func fontStoreDir(userData string) string {
	return filepath.Join(userData, "dfo-mod-fonts")
}

func fontFilesDir(userData string) string {
	return filepath.Join(fontStoreDir(userData), "files")
}

func fontPresetPath(userData string) string {
	return filepath.Join(fontStoreDir(userData), "preset.json")
}

func defaultFontPreset() *fontPreset {
	slots := make(map[string]fontSlotConfig, len(fontSlots))
	for _, s := range fontSlots {
		slots[s.ID] = fontSlotConfig{Mode: "base"}
	}
	return &fontPreset{Schema: fontPresetSchema, ActivePreset: "default", Slots: slots}
}

func isValidFontSlot(id string) bool {
	for _, s := range fontSlots {
		if s.ID == id {
			return true
		}
	}
	return false
}

func sanitizeFontFileName(original string) string {
	ext := strings.ToLower(filepath.Ext(original))
	if _, ok := fontFormatByExt[ext]; !ok {
		ext = ".ttf"
	}
	stem := strings.TrimSuffix(filepath.Base(original), filepath.Ext(original))
	stem = unsafeCharRe.ReplaceAllString(stem, "_")
	stem = strings.Trim(stem, "._-")
	if len(stem) > 64 {
		stem = stem[:64]
	}
	if stem == "" {
		stem = "custom-font"
	}
	return stem + ext
}

func safeStoredFontName(name string) bool {
	if name == "" || strings.Contains(name, "/") || strings.Contains(name, "\\") || strings.Contains(name, "..") || strings.ContainsRune(name, 0) {
		return false
	}
	return safeFontNameRe.MatchString(strings.ToLower(name))
}

func detectFontMagic(data []byte) (ext string, format string, ok bool) {
	if len(data) < 4 {
		return "", "", false
	}
	if data[0] == 0x00 && data[1] == 0x01 && data[2] == 0x00 && data[3] == 0x00 {
		return ".ttf", "truetype", true
	}
	switch string(data[:4]) {
	case "true", "typ1":
		return ".ttf", "truetype", true
	case "OTTO":
		return ".otf", "opentype", true
	case "wOFF":
		return ".woff", "woff", true
	case "wOF2":
		return ".woff2", "woff2", true
	default:
		return "", "", false
	}
}

func validateFontBytes(data []byte, ext string) (string, string, error) {
	ext = strings.ToLower(ext)
	if _, ok := fontFormatByExt[ext]; !ok {
		return "", "", errors.New(T("installer.fonts.err.ext"))
	}
	if len(data) < 12 || len(data) > maxFontFileBytes {
		return "", "", errors.New(T("installer.fonts.err.size"))
	}
	trueExt, format, ok := detectFontMagic(data)
	if !ok {
		return "", "", errors.New(T("installer.fonts.err.invalid"))
	}
	return trueExt, format, nil
}

func detectFileFontMagic(path string) (ext string, format string, ok bool) {
	f, err := os.Open(path)
	if err != nil {
		return "", "", false
	}
	defer f.Close()
	var hdr [4]byte
	n, err := f.Read(hdr[:])
	if err != nil || n != 4 {
		return "", "", false
	}
	return detectFontMagic(hdr[:])
}

func fileHasValidFontMagic(path string) bool {
	_, _, ok := detectFileFontMagic(path)
	return ok
}

func truncateRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}

func normalizeFontPreset(userData string, raw *fontPreset) *fontPreset {
	out := defaultFontPreset()
	if raw == nil {
		return out
	}
	fdir := fontFilesDir(userData)
	custom := 0
	for _, s := range fontSlots {
		entry, ok := raw.Slots[s.ID]
		// Legacy preset migration: carry over former `narrative` override into merged `description` slot.
		if s.ID == "description" && (!ok || entry.Mode != "custom") {
			if legacy, hasLegacy := raw.Slots["narrative"]; hasLegacy && legacy.Mode == "custom" {
				entry, ok = legacy, true
			}
		}
		if !ok || entry.Mode != "custom" || !safeStoredFontName(entry.File) {
			out.Slots[s.ID] = fontSlotConfig{Mode: "base"}
			continue
		}
		full := filepath.Join(fdir, entry.File)
		info, err := os.Stat(full)
		if err != nil || info.IsDir() || info.Size() < 12 || info.Size() > maxFontFileBytes {
			out.Slots[s.ID] = fontSlotConfig{Mode: "base"}
			continue
		}
		_, format, magicOK := detectFileFontMagic(full)
		if !magicOK || format == "" {
			out.Slots[s.ID] = fontSlotConfig{Mode: "base"}
			continue
		}
		label := strings.TrimSpace(entry.Label)
		if label == "" {
			label = entry.File
		}
		label = truncateRunes(label, 128)
		out.Slots[s.ID] = fontSlotConfig{
			Mode:   "custom",
			File:   entry.File,
			Label:  label,
			Format: format,
			SHA256: entry.SHA256,
		}
		custom++
	}
	if custom > 0 {
		out.ActivePreset = "custom"
	} else {
		out.ActivePreset = "default"
	}
	return out
}

func loadFontPreset(userData string) *fontPreset {
	if userData == "" {
		return defaultFontPreset()
	}
	rawBytes, err := os.ReadFile(fontPresetPath(userData))
	if err != nil {
		return defaultFontPreset()
	}
	var parsed fontPreset
	if json.Unmarshal(rawBytes, &parsed) != nil {
		return defaultFontPreset()
	}
	return normalizeFontPreset(userData, &parsed)
}

func atomicWriteBytes(target string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
		return err
	}
	tmp := fmt.Sprintf("%s.%d.tmp", target, os.Getpid())
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	var lastErr error
	for i := 0; i < 6; i++ {
		if err := os.Rename(tmp, target); err == nil {
			return nil
		} else {
			lastErr = err
			time.Sleep(time.Duration(i+1) * 25 * time.Millisecond)
		}
	}
	_ = os.Remove(tmp)
	return lastErr
}

func pruneUnusedFontFiles(userData string, p *fontPreset) {
	fdir := fontFilesDir(userData)
	entries, err := os.ReadDir(fdir)
	if err != nil {
		return
	}
	used := map[string]bool{}
	for _, s := range fontSlots {
		if cfg := p.Slots[s.ID]; cfg.Mode == "custom" && cfg.File != "" {
			used[cfg.File] = true
		}
	}
	for _, e := range entries {
		if !e.IsDir() && !used[e.Name()] {
			_ = os.Remove(filepath.Join(fdir, e.Name()))
		}
	}
}

func saveFontPreset(userData string, p *fontPreset) (*fontPreset, error) {
	if userData == "" {
		return nil, errors.New(T("installer.fonts.err.noProfile"))
	}
	clean := normalizeFontPreset(userData, p)
	encoded, err := json.MarshalIndent(clean, "", "  ")
	if err != nil {
		return nil, err
	}
	encoded = append(encoded, '\n')
	if err := atomicWriteBytes(fontPresetPath(userData), encoded); err != nil {
		return nil, err
	}
	pruneUnusedFontFiles(userData, clean)
	return clean, nil
}

func storeFontBytes(userData, originalName string, data []byte) (fontSlotConfig, error) {
	ext := strings.ToLower(filepath.Ext(originalName))
	trueExt, format, err := validateFontBytes(data, ext)
	if err != nil {
		return fontSlotConfig{}, err
	}
	sum := sha256.Sum256(data)
	hexSum := hex.EncodeToString(sum[:])
	sanitized := sanitizeFontFileName(originalName)
	if curExt := strings.ToLower(filepath.Ext(sanitized)); curExt != trueExt {
		sanitized = strings.TrimSuffix(sanitized, filepath.Ext(sanitized)) + trueExt
	}
	storedName := hexSum[:8] + "-" + sanitized
	dest := filepath.Join(fontFilesDir(userData), storedName)
	needWrite := true
	if info, statErr := os.Stat(dest); statErr == nil && !info.IsDir() && info.Size() == int64(len(data)) {
		if existing, readErr := os.ReadFile(dest); readErr == nil && bytes.Equal(existing, data) {
			needWrite = false
		}
	}
	if needWrite {
		if err := atomicWriteBytes(dest, data); err != nil {
			return fontSlotConfig{}, err
		}
	}
	return fontSlotConfig{
		Mode:   "custom",
		File:   storedName,
		Label:  truncateRunes(filepath.Base(originalName), 128),
		Format: format,
		SHA256: hexSum,
	}, nil
}

func importFontFile(userData, srcPath string) (fontSlotConfig, error) {
	info, err := os.Stat(srcPath)
	if err != nil {
		return fontSlotConfig{}, err
	}
	if info.IsDir() || info.Size() > maxFontFileBytes {
		return fontSlotConfig{}, errors.New(T("installer.fonts.err.size"))
	}
	data, err := os.ReadFile(srcPath)
	if err != nil {
		return fontSlotConfig{}, err
	}
	return storeFontBytes(userData, filepath.Base(srcPath), data)
}

func setFontSlot(userData string, cur *fontPreset, slotID, srcPath string) (*fontPreset, error) {
	if !isValidFontSlot(slotID) {
		return nil, errors.New(T("installer.fonts.err.slot"))
	}
	entry, err := importFontFile(userData, srcPath)
	if err != nil {
		return nil, err
	}
	next := normalizeFontPreset(userData, cur)
	next.Slots[slotID] = entry
	return saveFontPreset(userData, next)
}

func setAllFontSlots(userData string, cur *fontPreset, srcPath string) (*fontPreset, error) {
	entry, err := importFontFile(userData, srcPath)
	if err != nil {
		return nil, err
	}
	next := normalizeFontPreset(userData, cur)
	for _, s := range fontSlots {
		next.Slots[s.ID] = entry
	}
	return saveFontPreset(userData, next)
}

func resetFontSlot(userData string, cur *fontPreset, slotID string) (*fontPreset, error) {
	if !isValidFontSlot(slotID) {
		return nil, errors.New(T("installer.fonts.err.slot"))
	}
	next := normalizeFontPreset(userData, cur)
	next.Slots[slotID] = fontSlotConfig{Mode: "base"}
	return saveFontPreset(userData, next)
}

func resetAllFontSlots(userData string) (*fontPreset, error) {
	return saveFontPreset(userData, defaultFontPreset())
}

func exportFontPreset(userData string, cur *fontPreset, destPath string) error {
	clean := normalizeFontPreset(userData, cur)
	portable := portableFontPreset{
		Schema:       fontPresetSchema,
		ActivePreset: clean.ActivePreset,
		Slots:        clean.Slots,
		FontsData:    map[string]string{},
	}
	for _, s := range fontSlots {
		cfg := clean.Slots[s.ID]
		if cfg.Mode != "custom" || cfg.File == "" {
			continue
		}
		if _, exists := portable.FontsData[cfg.File]; exists {
			continue
		}
		data, err := os.ReadFile(filepath.Join(fontFilesDir(userData), cfg.File))
		if err != nil {
			return err
		}
		portable.FontsData[cfg.File] = base64.StdEncoding.EncodeToString(data)
	}
	if len(portable.FontsData) == 0 {
		portable.FontsData = nil
	}
	encoded, err := json.MarshalIndent(portable, "", "  ")
	if err != nil {
		return err
	}
	encoded = append(encoded, '\n')
	return atomicWriteBytes(destPath, encoded)
}

const maxPresetFileBytes = 128 * 1024 * 1024

func importFontPreset(userData, srcPath string) (*fontPreset, error) {
	if userData == "" {
		return nil, errors.New(T("installer.fonts.err.noProfile"))
	}
	info, err := os.Stat(srcPath)
	if err != nil {
		return nil, err
	}
	if info.IsDir() || info.Size() > maxPresetFileBytes {
		return nil, errors.New(T("installer.fonts.err.badPreset"))
	}
	raw, err := os.ReadFile(srcPath)
	if err != nil {
		return nil, err
	}
	var portable portableFontPreset
	if err := json.Unmarshal(raw, &portable); err != nil {
		return nil, errors.New(T("installer.fonts.err.badPreset"))
	}
	if portable.Slots == nil {
		return nil, errors.New(T("installer.fonts.err.badPreset"))
	}
	next := defaultFontPreset()
	decodedCache := map[string]fontSlotConfig{}
	for _, s := range fontSlots {
		cfg, ok := portable.Slots[s.ID]
		if s.ID == "description" && (!ok || cfg.Mode != "custom") {
			if legacy, hasLegacy := portable.Slots["narrative"]; hasLegacy && legacy.Mode == "custom" {
				cfg, ok = legacy, true
			}
		}
		if !ok || cfg.Mode != "custom" {
			next.Slots[s.ID] = fontSlotConfig{Mode: "base"}
			continue
		}
		if b64, embedded := portable.FontsData[cfg.File]; embedded && b64 != "" {
			stored, cached := decodedCache[cfg.File]
			if !cached {
				decoded, decErr := base64.StdEncoding.DecodeString(b64)
				if decErr != nil {
					return nil, errors.New(T("installer.fonts.err.badPreset"))
				}
				storeName := cfg.Label
				if _, okExt := fontFormatByExt[strings.ToLower(filepath.Ext(storeName))]; !okExt {
					storeName = cfg.File
				}
				var storeErr error
				stored, storeErr = storeFontBytes(userData, storeName, decoded)
				if storeErr != nil {
					return nil, storeErr
				}
				decodedCache[cfg.File] = stored
			}
			if lbl := strings.TrimSpace(cfg.Label); lbl != "" {
				stored.Label = truncateRunes(lbl, 128)
			}
			next.Slots[s.ID] = stored
			continue
		}
		// Fallback: reference an existing valid file already inside userData/dfo-mod-fonts/files/
		if safeStoredFontName(cfg.File) {
			existing := filepath.Join(fontFilesDir(userData), cfg.File)
			if st, statErr := os.Stat(existing); statErr == nil && !st.IsDir() && st.Size() >= 12 && fileHasValidFontMagic(existing) {
				next.Slots[s.ID] = cfg
				continue
			}
		}
		next.Slots[s.ID] = fontSlotConfig{Mode: "base"}
	}
	return saveFontPreset(userData, next)
}

func customFontCount(p *fontPreset) int {
	if p == nil {
		return 0
	}
	n := 0
	for _, s := range fontSlots {
		if p.Slots[s.ID].Mode == "custom" {
			n++
		}
	}
	return n
}

func slotBadgeText(meta fontSlotMeta, p *fontPreset) (string, bool) {
	if p != nil {
		if cfg := p.Slots[meta.ID]; cfg.Mode == "custom" && cfg.Label != "" {
			return T("installer.fonts.badgeCustom", "name", cfg.Label), true
		}
	}
	return T("installer.fonts.badgeBase", "name", meta.BaseLabel), false
}

func fontsSummaryLabel(p *fontPreset) string {
	n := customFontCount(p)
	if n == 0 {
		return T("installer.fonts.summaryBase", "all", strconv.Itoa(len(fontSlots)))
	}
	return T("installer.fonts.summaryCustom", "n", strconv.Itoa(n), "all", strconv.Itoa(len(fontSlots)))
}

func fontsFeatureBadge(p *fontPreset) string {
	n := customFontCount(p)
	if n == 0 {
		return T("installer.feature.fonts.badge")
	}
	return T("installer.fonts.featureCustomBadge", "n", strconv.Itoa(n), "all", strconv.Itoa(len(fontSlots)))
}
