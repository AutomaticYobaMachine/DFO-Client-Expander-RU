package main

import (
	"encoding/json"
	"reflect"
	"testing"
	"unicode/utf16"
)

func TestOptionsSurviveOldInstallAndExplicitDisable(t *testing.T) {
	on := defaults()
	on = loadChoices(json.RawMessage(`{"ru":false,"marks":false,"marksOptions":{"onlyVisited":false}}`), on)
	if on[idRu] || on[idMarks] || on[idVisited] || !on[idLoot] || !on[idDungeons] {
		t.Fatalf("lost older-install defaults or explicit false: %v", on)
	}
	next := loadChoices(json.RawMessage(`{"nearbyLoot":false,"dungeons":false,"itemCards":false}`), on)
	if !next[idFonts] {
		t.Fatal("older config disabled the new fonts default")
	}
	next = loadChoices(json.RawMessage(`{"fonts":false}`), next)
	if selectedCount(next) != 0 {
		t.Fatalf("disabled features re-enabled: %v", next)
	}
	if !reflect.DeepEqual(next, loadChoices(json.RawMessage(`broken`), next)) {
		t.Fatal("bad config changed selection")
	}
}

func TestEveryVisibleFeatureReachesPatcherIndependently(t *testing.T) {
	for _, f := range features {
		on := defaults()
		on[f.ID] = false
		args := operationArgs("install", on, "")
		flags := map[string]string{}
		for i := 0; i < len(args)-1; i++ {
			if args[i] == "--set" {
				flags[args[i+1]] = "present"
			}
		}
		if flags[f.Key+"=0"] != "present" || flags["enabled=1"] != "present" {
			t.Fatalf("%s did not reach patcher: %v", f.Key, args)
		}
		for _, other := range features {
			if other.ID != f.ID && flags[other.Key+"=1"] != "present" {
				t.Fatalf("%s unexpectedly disabled %s", f.Key, other.Key)
			}
		}
		if f.ID == idRu && args[1] != "--no-ru" {
			t.Fatal("disabled translation still changes shell language")
		}
	}
	if !reflect.DeepEqual(operationArgs("uninstall", defaults(), "Mouse5"), []string{"uninstall"}) {
		t.Fatal("uninstall should not rewrite user options")
	}
}

func TestDescriptionShowsSavedLootKey(t *testing.T) {
	if lootKeyBadge(nil) != "КЛАВИША J · 15 МЕТРОВ" {
		t.Fatal("missing default hotkey")
	}
	if lootKeyBadge(json.RawMessage(`{"nearbyLootOptions":{"keyCode":"KeyK"}}`)) != "КЛАВИША K · 15 МЕТРОВ" {
		t.Fatal("saved hotkey is misleading")
	}
}

func TestWin32DialogFilterIsDoubleTerminated(t *testing.T) {
	b := dialogFilter("Программы (*.exe)", "*.exe", "Все файлы", "*.*")
	if string(utf16.Decode(b)) != "Программы (*.exe)\x00*.exe\x00Все файлы\x00*.*\x00\x00" {
		t.Fatal("invalid Windows MULTI_SZ filter")
	}
}
