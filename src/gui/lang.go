package main

// The installer's words in two languages. The tables have the format of the mod's own locale packs
// (src/mod/item-text/<en|ru>/ui/*.csv: key,text,note; {name} a value, {n:a|b|c} a word for the number) and the
// same checks (test/ui-text.test.cjs), but live inside this module: the installer must speak even when its payload
// cannot be unpacked. Russian on a Russian Windows, English otherwise; the window's RU/EN switch is remembered.

import (
	"embed"
	"encoding/csv"
	"io/fs"
	"math"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
)

//go:embed locale/*/ui/*.csv
var localeFiles embed.FS

var (
	uiLang    atomic.Value // "ru" or "en": read by worker goroutines, changed by the window's switch
	packsOnce sync.Once
	packs     map[string]map[string]string
	placeRe   = regexp.MustCompile(`\{([A-Za-z][A-Za-z0-9]*)(?::([^{}]*))?\}`)
)

const langFile = "language.txt"

func init() { uiLang.Store("ru") }

func lang() string {
	if l, ok := uiLang.Load().(string); ok && l != "" {
		return l
	}
	return "ru"
}
func setLang(l string) {
	if l == "en" || l == "ru" {
		uiLang.Store(l)
	}
}
func otherLang(l string) string {
	if l == "ru" {
		return "en"
	}
	return "ru"
}

func loadPacks() map[string]map[string]string {
	packsOnce.Do(func() {
		packs = map[string]map[string]string{}
		for _, l := range []string{"en", "ru"} {
			strs := map[string]string{}
			files, _ := fs.Glob(localeFiles, path.Join("locale", l, "ui", "*.csv"))
			for _, f := range files {
				b, err := localeFiles.ReadFile(f)
				if err != nil {
					continue
				}
				rows, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(string(b), "\uFEFF"))).ReadAll()
				if err != nil || len(rows) == 0 {
					continue
				}
				for _, r := range rows[1:] {
					if len(r) >= 2 && r[0] != "" {
						strs[r[0]] = strings.ReplaceAll(r[1], `\n`, "\n")
					}
				}
			}
			packs[l] = strs
		}
	})
	return packs
}

// T: the key's words in the window's language - English for a key the Russian table lacks, the key itself last.
// kv are name/value pairs for the places: T("installer.found", "n", 3).
func T(key string, kv ...any) string { return tIn(lang(), key, kv...) }

func tIn(l, key string, kv ...any) string {
	p := loadPacks()
	text, ok := p[l][key]
	if !ok {
		if text, ok = p["en"][key]; !ok {
			return key
		}
	}
	params := map[string]any{}
	for i := 0; i+1 < len(kv); i += 2 {
		if name, ok := kv[i].(string); ok {
			params[name] = kv[i+1]
		}
	}
	return format(text, params, l)
}

// format fills a text's places as dfo_ui_text.js does: a value as it is, a word for the number by the plural rule;
// a missing value keeps its place visible.
func format(text string, params map[string]any, l string) string {
	return placeRe.ReplaceAllStringFunc(text, func(all string) string {
		m := placeRe.FindStringSubmatch(all)
		v, have := params[m[1]]
		if !strings.Contains(all, ":") {
			if !have {
				return all
			}
			return valueText(v)
		}
		forms := strings.Split(m[2], "|")
		n, ok := number(v)
		if !have || !ok {
			return forms[len(forms)-1]
		}
		i := pluralIndex(l, n)
		if i >= len(forms) {
			i = len(forms) - 1
		}
		return forms[i]
	})
}

func valueText(v any) string {
	switch x := v.(type) {
	case string:
		return x
	case int:
		return strconv.Itoa(x)
	case int64:
		return strconv.FormatInt(x, 10)
	case uint64:
		return strconv.FormatUint(x, 10)
	case float64:
		return strconv.FormatFloat(x, 'f', -1, 64)
	case error:
		return x.Error()
	case interface{ String() string }:
		return x.String()
	}
	return ""
}

func number(v any) (float64, bool) {
	switch x := v.(type) {
	case int:
		return float64(x), true
	case int64:
		return float64(x), true
	case uint64:
		return float64(x), true
	case float64:
		return x, true
	case string:
		f, err := strconv.ParseFloat(x, 64)
		return f, err == nil
	}
	return 0, false
}

// pluralIndex: English one|other; Russian one|few|many («1,5 метра» takes the second form).
func pluralIndex(l string, n float64) int {
	if l != "ru" {
		if n == 1 {
			return 0
		}
		return 1
	}
	if n != math.Trunc(n) {
		return 1
	}
	a := int64(math.Abs(n)) % 100
	b := a % 10
	switch {
	case a > 10 && a < 20:
		return 2
	case b == 1:
		return 0
	case b >= 2 && b <= 4:
		return 1
	}
	return 2
}

// say: a message kept as its key, so the window's switch re-reads it in the other language.
type say struct {
	key string
	kv  []any
}

func sayKey(key string, kv ...any) say { return say{key: key, kv: kv} }
func (s say) String() string {
	if s.key == "" {
		return ""
	}
	return T(s.key, s.kv...)
}
func (s say) empty() bool { return s.key == "" }

// The language the window starts in: --lang, else the remembered switch, else the system's.
func chooseLang(flag, prefsDir, system string) string {
	if flag == "ru" || flag == "en" {
		return flag
	}
	if b, err := os.ReadFile(filepath.Join(prefsDir, langFile)); err == nil {
		if l := strings.TrimSpace(string(b)); l == "ru" || l == "en" {
			return l
		}
	}
	if system == "ru" {
		return "ru"
	}
	return "en"
}

func saveLang(prefsDir, l string) error {
	if err := os.MkdirAll(prefsDir, 0700); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(prefsDir, langFile), []byte(l), 0600)
}
