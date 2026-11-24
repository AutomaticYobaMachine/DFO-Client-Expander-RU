//go:build !windows

package main

// systemLang: the tests' platform has no Windows UI language; the window itself only runs on Windows.
func systemLang() string { return "en" }
