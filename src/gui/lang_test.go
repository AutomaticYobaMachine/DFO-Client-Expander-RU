package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestTablesSpeakBothLanguages(t *testing.T) {
	p := loadPacks()
	if len(p["en"]) == 0 || len(p["en"]) != len(p["ru"]) {
		t.Fatalf("en %d keys, ru %d keys", len(p["en"]), len(p["ru"]))
	}
	for key := range p["en"] {
		if _, ok := p["ru"][key]; !ok {
			t.Errorf("ru lacks %s", key)
		}
	}
	for _, f := range features {
		for _, l := range []string{"en", "ru"} {
			if tIn(l, "installer.feature."+f.Key+".title") == "installer.feature."+f.Key+".title" {
				t.Errorf("%s: no title for %s", l, f.Key)
			}
		}
	}
}

func TestWordsFollowTheChosenLanguage(t *testing.T) {
	defer setLang(lang())
	setLang("en")
	if got := T("installer.selected", "n", 2, "all", 6); got != "Selected 2 of 6" {
		t.Fatal(got)
	}
	if got := lootBindingBadge("Mouse4"); got != "MOUSE 4 · 15 METERS" {
		t.Fatal(got)
	}
	if got := sayKey("installer.update.available", "version", "1.2.3").String(); got != "Program 1.2.3 is available. Waiting for your decision." {
		t.Fatal(got)
	}
	setLang("ru")
	if got := T("installer.selected", "n", 2, "all", 6); got != "Выбрано 2 из 6" {
		t.Fatal(got)
	}
	if got := T("no.such.key"); got != "no.such.key" {
		t.Fatal(got)
	}
	if got := T("installer.key.label"); got != "Клавиша: {key}" {
		t.Fatal("a missing value keeps its place visible:", got)
	}
}

func TestPluralRules(t *testing.T) {
	for _, tc := range []struct {
		l    string
		n    float64
		want string
	}{{"ru", 1, "a"}, {"ru", 3, "b"}, {"ru", 5, "c"}, {"ru", 11, "c"}, {"ru", 21, "a"}, {"ru", 1.5, "b"}, {"en", 1, "a"}, {"en", 2, "b"}} {
		forms := "{n:a|b|c}"
		if tc.l == "en" {
			forms = "{n:a|b}"
		}
		if got := format(forms, map[string]any{"n": tc.n}, tc.l); got != tc.want {
			t.Errorf("%s %v: %s", tc.l, tc.n, got)
		}
	}
}

func TestStartLanguage(t *testing.T) {
	dir := t.TempDir()
	if chooseLang("", dir, "ru") != "ru" || chooseLang("", dir, "en") != "en" || chooseLang("", dir, "de") != "en" {
		t.Fatal("the system's language decides without a saved choice")
	}
	if err := saveLang(dir, "en"); err != nil {
		t.Fatal(err)
	}
	if chooseLang("", dir, "ru") != "en" {
		t.Fatal("the remembered switch wins over the system")
	}
	if chooseLang("ru", dir, "en") != "ru" {
		t.Fatal("--lang wins over everything")
	}
	if err := os.WriteFile(filepath.Join(dir, langFile), []byte("xx"), 0600); err != nil || chooseLang("", dir, "ru") != "ru" {
		t.Fatal("a broken saved choice is ignored")
	}
	if got := parseStartup([]string{"--lang", "en", "--no-self-update"}); got.lang != "en" || !got.noUpdate {
		t.Fatalf("%+v", got)
	}
}
