package main

import (
	"encoding/json"
	"strconv"
	"strings"
	"unicode/utf16"
)

const (
	appName    = "DFO-Client-Expander-RU"
	appVersion = "1.30.0"
	appAuthor  = "AutomaticYobaMachine"
)

const (
	idBrowse = 101 + iota
	idRefresh
	idRu
	idMarks
	idLoot
	idDungeons
	idVisited
	idInstall
	idUninstall
	idComponents
	idJournal
	idLog
	idSaveLog
	idOpenLog
	idOpenReport
	_ // Reserved: removed repository button; keep the remaining control IDs stable.
	idPath
	idPane
	idReadme
	idLootKey
	idDungeonKey
	idItemCards
	idFonts
	idInstallerLog
	idCheckUpdates
	idLang
	idInventory
	idFontsTab
	idFontsPane
	idConfigureFonts
	idFontsApplyAll
	idFontsResetAll
	idFontsImport
	idFontsExport
	idFontsOpenDir
	idDungeonNav
	idEnhancedUi
)

type feature struct {
	ID     int
	Key    string
	Locked bool
}

// A feature's words: installer.feature.<key>.title|badge|description in the window's language.
func (f feature) Title() string       { return T("installer.feature." + f.Key + ".title") }
func (f feature) Badge() string       { return T("installer.feature." + f.Key + ".badge") }
func (f feature) Description() string { return T("installer.feature." + f.Key + ".description") }

var features = []feature{
	{idRu, "ru", false},
	{idMarks, "marks", false},
	{idLoot, "nearbyLoot", false},
	{idDungeons, "dungeons", false},
	{idDungeonNav, "dungeonNav", false},
	{idEnhancedUi, "enhancedUi", true},
}

type gameStatus struct {
	Asar             string          `json:"asar"`
	Shell            string          `json:"shell"`
	Installed        bool            `json:"installed"`
	WithRu           bool            `json:"withRu"`
	ModVersion       *string         `json:"modVersion"`
	CleanCopy        bool            `json:"cleanCopy"`
	OldRu            bool            `json:"oldRu"`
	Running          bool            `json:"running"`
	UserData         string          `json:"userData"`
	Cfg              json.RawMessage `json:"cfg"`
	CachedLootKey    string          `json:"cachedLootKey,omitempty"`
	CachedDungeonKey string          `json:"cachedDungeonKey,omitempty"`
}

func defaults() map[int]bool {
	return map[int]bool{idRu: true, idMarks: true, idLoot: true, idDungeons: true, idDungeonNav: true, idEnhancedUi: true, idVisited: true}
}

// Missing options in an older install keep their defaults; explicit false survives.
// Enhanced interfaces (inventory + item cards + community fonts) stay always active.
func loadChoices(raw json.RawMessage, previous map[int]bool) map[int]bool {
	out := make(map[int]bool, len(previous))
	for id, on := range previous {
		out[id] = on
	}
	var cfg map[string]json.RawMessage
	if json.Unmarshal(raw, &cfg) != nil {
		out[idEnhancedUi] = true
		return out
	}
	for _, f := range features {
		if f.Locked {
			out[f.ID] = true
			continue
		}
		var on bool
		if b, ok := cfg[f.Key]; ok && json.Unmarshal(b, &on) == nil {
			out[f.ID] = on
		}
	}
	var opts struct {
		OnlyVisited *bool `json:"onlyVisited"`
	}
	if json.Unmarshal(cfg["marksOptions"], &opts) == nil && opts.OnlyVisited != nil {
		out[idVisited] = *opts.OnlyVisited
	}
	out[idEnhancedUi] = true
	return out
}

func selectedCount(choices map[int]bool) int {
	n := 0
	for _, f := range features {
		if f.Locked || choices[f.ID] {
			n++
		}
	}
	return n
}

func operationArgs(what string, choices map[int]bool, lootKey string, dungeonKeys ...string) []string {
	args := []string{what}
	if what != "install" {
		return args
	}
	if !choices[idRu] {
		args = append(args, "--no-ru")
	}
	if validLootKey(lootKey) {
		args = append(args, "--loot-key", lootKey)
	}
	if len(dungeonKeys) > 0 && validLootKey(dungeonKeys[0]) {
		args = append(args, "--dungeon-key", dungeonKeys[0])
	}
	args = append(args, "--set", "enabled=1")
	for _, f := range features {
		if f.ID == idEnhancedUi {
			args = append(args, "--set", "itemCards=1", "--set", "inventory=1", "--set", "fonts=1")
			continue
		}
		on := f.Locked || choices[f.ID]
		args = append(args, "--set", f.Key+"="+boolFlag(on))
	}
	return append(args, "--set", "onlyVisited="+boolFlag(choices[idVisited]))
}

func boolFlag(on bool) string {
	if on {
		return "1"
	}
	return "0"
}

// Win32 file-dialog filters are a double-NUL-terminated MULTI_SZ, not one
// NUL-free string accepted by syscall.StringToUTF16.
func dialogFilter(parts ...string) []uint16 {
	return utf16.Encode([]rune(strings.Join(parts, "\x00") + "\x00\x00"))
}
func versionTitle() string { return appName + " · " + appVersion }
func selectionLabel(choices map[int]bool) string {
	return T("installer.selected", "n", strconv.Itoa(selectedCount(choices)), "all", strconv.Itoa(len(features)))
}
