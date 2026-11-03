package main

import (
	"encoding/json"
	"strconv"
	"strings"
	"unicode/utf16"
)

const (
	appName      = "DFO-Client-Expander-RU"
	appVersion   = "1.16.1"
	appAuthor    = "AutomaticYobaMachine"
	appCommunity = "Создано специально для русского сообщества DFO Online."
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
)

type feature struct {
	ID                             int
	Key, Title, Badge, Description string
}

var features = []feature{
	{idRu, "ru", "Русификация", "ИГРА НА РУССКОМ", "Перевод интерфейса, предметов, квестов и книг. Русские названия и описания помогают ориентироваться в игре; собственные имена мест сохраняются там, где это нужно для поиска на карте."},
	{idMarks, "marks", "Метки и карта города", "ОРИЕНТИРОВАНИЕ", "Метки таверн, магазинов, гильдий и других заведений на Overworld. Подробная карта города помогает найти нужное место. «Только посещённые» скрывает здания, в которых вы ещё не были."},
	{idLoot, "nearbyLoot", "Лут рядом", "КЛАВИША J · 15 МЕТРОВ", "Дроп противников и предметы на полу — в одном окне с фильтрами, пресетами, сортировкой и «Забрать все». Автолут настраивается отдельно. Стены и соседние этажи исключены; вещи подбираются из исходных куч и трупов."},
	{idDungeons, "dungeons", "Сведения о данжах", "КАРТОЧКИ И СВОДКА ВНУТРИ", "Карточки данжей на Overworld и живая сводка внутри: враги, элиты, игроки, квесты, аурум и реген. Навигация рисует линию по полу к выходу, ауруму, ближайшему элитнику или цели задания. Окно открывается по K; свою кнопку назначьте ниже."},
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
	return map[int]bool{idRu: true, idMarks: true, idLoot: true, idDungeons: true, idVisited: true}
}

// Missing options in an older install keep their defaults; explicit false survives.
func loadChoices(raw json.RawMessage, previous map[int]bool) map[int]bool {
	out := make(map[int]bool, len(previous))
	for id, on := range previous {
		out[id] = on
	}
	var cfg map[string]json.RawMessage
	if json.Unmarshal(raw, &cfg) != nil {
		return out
	}
	for _, f := range features {
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
	return out
}

func selectedCount(choices map[int]bool) int {
	n := 0
	for _, f := range features {
		if choices[f.ID] {
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
		args = append(args, "--set", f.Key+"="+boolFlag(choices[f.ID]))
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
	return "Выбрано " + strconv.Itoa(selectedCount(choices)) + " из " + strconv.Itoa(len(features))
}
