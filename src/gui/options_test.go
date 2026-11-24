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
	if on[idRu] || on[idMarks] || on[idVisited] || !on[idLoot] || !on[idDungeons] || !on[idDungeonNav] {
		t.Fatalf("lost older-install defaults or explicit false: %v", on)
	}
	next := loadChoices(json.RawMessage(`{"nearbyLoot":false,"dungeons":false,"dungeonNav":false,"itemCards":false}`), on)
	if !next[idEnhancedUi] {
		t.Fatal("enhancedUi locked base layer must stay enabled")
	}
	next = loadChoices(json.RawMessage(`{"enhancedUi":false,"fonts":false,"inventory":false}`), next)
	if !next[idEnhancedUi] {
		t.Fatal("core enhanced interfaces must stay enabled even if config had false")
	}
	if selectedCount(next) != 1 {
		t.Fatalf("expected only locked enhancedUi active: %v (count=%d)", next, selectedCount(next))
	}
	if !reflect.DeepEqual(next, loadChoices(json.RawMessage(`broken`), next)) {
		t.Fatal("bad config changed selection")
	}
	resumed := resumeChoices(map[string]bool{"enhancedUi": false, "ru": false, "dungeonNav": false}, defaults())
	if !resumed[idEnhancedUi] || resumed[idRu] || resumed[idDungeonNav] {
		t.Fatalf("resumeChoices must preserve locked enhancedUi=true and respect unlocked choices: %v", resumed)
	}
}

func TestEveryVisibleFeatureReachesPatcherIndependently(t *testing.T) {
	for _, f := range features {
		if f.Locked {
			// Locked enhancedUi always sends itemCards=1, inventory=1, fonts=1 to patcher.
			on := defaults()
			on[f.ID] = false
			args := operationArgs("install", on, "")
			flags := map[string]bool{}
			for i := 0; i < len(args)-1; i++ {
				if args[i] == "--set" {
					flags[args[i+1]] = true
				}
			}
			for _, req := range []string{"itemCards=1", "inventory=1", "fonts=1"} {
				if !flags[req] {
					t.Fatalf("locked base feature %s must always send %s: %v", f.Key, req, args)
				}
			}
			continue
		}
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
			if other.ID == f.ID {
				continue
			}
			if other.ID == idEnhancedUi {
				if flags["itemCards=1"] != "present" || flags["inventory=1"] != "present" || flags["fonts=1"] != "present" {
					t.Fatalf("%s unexpectedly disabled enhancedUi sub-flags", f.Key)
				}
				continue
			}
			if flags[other.Key+"=1"] != "present" {
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
	if lootKeyBadge(nil) != "КЛАВИША J · 10 МЕТРОВ" {
		t.Fatal("missing default hotkey")
	}
	if lootKeyBadge(json.RawMessage(`{"nearbyLootOptions":{"keyCode":"KeyK"}}`)) != "КЛАВИША K · 10 МЕТРОВ" {
		t.Fatal("saved hotkey is misleading")
	}
}

func TestWin32DialogFilterIsDoubleTerminated(t *testing.T) {
	b := dialogFilter("Программы (*.exe)", "*.exe", "Все файлы", "*.*")
	if string(utf16.Decode(b)) != "Программы (*.exe)\x00*.exe\x00Все файлы\x00*.*\x00\x00" {
		t.Fatal("invalid Windows MULTI_SZ filter")
	}
}
