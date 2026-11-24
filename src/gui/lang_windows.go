package main

var pGetUserDefaultUILanguage = kernel32.NewProc("GetUserDefaultUILanguage")

// systemLang: "ru" when Windows shows its own interface in Russian (primary language 0x19), "en" otherwise.
func systemLang() string {
	if pGetUserDefaultUILanguage.Find() != nil {
		return "en"
	}
	id, _, _ := pGetUserDefaultUILanguage.Call()
	if id&0x3ff == 0x19 {
		return "ru"
	}
	return "en"
}
