package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Replaced only by the Windows test binary's local transport. The distributed
// executable has no endpoint override or option to skip integrity checks.
var installerUpdater = func() *releaseUpdater { return newReleaseUpdater(appVersion, nil, probeUpdateInstaller) }

func (a *app) startSelfUpdate() {
	a.mu.Lock()
	if a.updatesDisabled || a.updateChecking || a.updateDownloading || a.updateReady != nil || a.updateHandoff || a.handedOff || a.busy {
		a.mu.Unlock()
		return
	}
	a.updateChecking = true
	a.updateAvailable = nil
	a.updateText = "Проверяю обновления программы…"
	a.mu.Unlock()
	a.syncControls()
	a.appendLog("Проверка релизов: " + updateAPI)
	a.wg.Add(1)
	go func() {
		defer a.wg.Done()
		self, _ := os.Executable()
		pruneUpdateCache(updatesRoot(), self)
		ctx, cancel := context.WithTimeout(a.ctx, 10*time.Second)
		defer cancel()
		release, err := installerUpdater().latest(ctx)
		a.mu.Lock()
		a.updateChecking = false
		a.updateAvailable = release
		a.updateText = "Установлена актуальная версия программы."
		if release != nil {
			a.updateText = "Доступна программа " + release.Version + ". Ожидаю вашего решения."
		}
		if err != nil {
			a.updateText = "Не удалось проверить обновления. Можно работать с текущей версией."
		}
		a.mu.Unlock()
		if err != nil {
			a.appendLog("Проверка обновлений: " + err.Error())
		} else if release != nil {
			a.appendLog("Найдена программа " + release.Version + ". До согласия скачивание и замена не выполняются.")
		} else {
			a.appendLog("Более свежего стабильного релиза нет.")
		}
		pPostMessageW.Call(a.hwnd, wmUpdater, 0, 0)
	}()
}

func (a *app) pendingChoices() bool {
	return a.choiceRevision != a.savedChoiceRevision || a.lootKeyDirty || a.dungeonKeyDirty
}

// Window thread only: metadata checks never download or replace anything.
// A completed download carries explicit consent, and ASAR operations are never
// invoked from the timer, status completion, or self-update resume.
func (a *app) maybeUpdate() {
	a.mu.Lock()
	if a.ctx.Err() != nil || a.busy || a.querying || a.searching || a.capturingKey || a.modalDepth > 0 || a.updateHandoff || a.handedOff {
		a.mu.Unlock()
		return
	}
	if a.resumePath != "" && !a.resumeCommitted {
		var r updateResult
		if err := readUpdateJSON(filepath.Join(filepath.Dir(a.resumePath), "result.json"), &r); err != nil || r.State != "committed" {
			a.mu.Unlock()
			return
		}
		a.resumeCommitted = true
		a.updateText = "Программа обновлена до " + appVersion + ". Применение к игре — по кнопке."
		pPostMessageW.Call(a.hwnd, wmUpdater, 0, 0)
	}
	if release := a.updateAvailable; release != nil {
		if time.Since(a.lastUserInput) < 300*time.Millisecond {
			a.mu.Unlock()
			return
		}
		a.updateAvailable = nil // Consume once, including No and window cancellation.
		a.mu.Unlock()
		answer := a.message(fmt.Sprintf("Доступна новая версия %s (сейчас %s).\n\nСкачать её и перезапустить программу?\nНастройки сохранятся. Применение расширения к игре выполняется отдельно, по кнопке.", release.Version, appVersion), 0x124)
		if answer != 6 { // IDYES; No is the default button.
			a.mu.Lock()
			a.updateText = "Обновление отложено. Повторная проверка — кнопкой «Обновления…»."
			a.mu.Unlock()
			a.appendLog("Пользователь отложил обновление до " + release.Version + ".")
			a.syncControls()
			return
		}
		a.downloadSelfUpdate(release)
		return
	}
	ready := a.updateReady
	if ready == nil || !a.updateAccepted {
		a.mu.Unlock()
		return
	}
	if otherInstallerOpen(a.hwnd) {
		changed := !a.updateWaitOthers
		a.updateWaitOthers = true
		a.updateText = "Обновление скачано. Для перезапуска закройте другие окна установщика."
		a.mu.Unlock()
		if changed {
			a.syncControls()
		}
		return
	}
	a.updateWaitOthers = false
	a.updateReady = nil
	a.updateHandoff = true
	a.updateText = "Подготавливаю подтверждённое обновление программы…"
	choices := map[string]bool{"onlyVisited": a.toggles[idVisited]}
	for _, f := range features {
		choices[f.Key] = a.toggles[f.ID]
	}
	state := updateResume{Game: a.exe, Choices: choices, LootKey: a.lootKey, DungeonKey: a.dungeonKey, Dirty: a.pendingChoices()}
	if path, _ := a.logbook.location(); path != "" {
		state.LogDir = filepath.Dir(path)
	}
	foreground, _, _ := updateForeground.Call()
	state.Background = foreground != a.hwnd
	if a.status == nil {
		state.LootKey, state.DungeonKey = "", ""
	}
	a.mu.Unlock()
	a.syncControls()
	a.beginUpdateHandoff(ready, state)
}

func (a *app) downloadSelfUpdate(release *updateRelease) {
	a.mu.Lock()
	a.updateAccepted, a.updateDownloading = true, true
	a.updateText = "Скачиваю программу " + release.Version + "…"
	a.mu.Unlock()
	a.syncControls()
	a.appendLog("Пользователь подтвердил обновление до " + release.Version + ".")
	a.wg.Add(1)
	go func() {
		defer a.wg.Done()
		ctx, cancel := context.WithTimeout(a.ctx, 2*time.Minute)
		defer cancel()
		ready, err := installerUpdater().download(ctx, release, updatesRoot(), func(p int) {
			a.mu.Lock()
			a.updateProgress = p
			a.mu.Unlock()
		})
		a.mu.Lock()
		a.updateDownloading = false
		a.updateProgress = 0
		a.updateReady = ready
		if err != nil {
			a.updateAccepted = false
			a.updateText = "Обновление не выполнено. Текущая версия продолжает работу."
			a.page = idJournal
		}
		a.mu.Unlock()
		if err != nil {
			a.appendLog("Скачивание/проверка обновления: " + err.Error())
		} else {
			a.appendLog("Размер, SHA-256, продукт и версия нового EXE проверены.")
		}
		a.logbook.sync()
		pPostMessageW.Call(a.hwnd, wmUpdater, 0, 0)
	}()
}

func (a *app) updateModal() func() {
	a.mu.Lock()
	a.modalDepth++
	a.mu.Unlock()
	return func() { a.mu.Lock(); a.modalDepth--; a.lastUserInput = time.Now(); a.mu.Unlock() }
}

func (a *app) beginUpdateHandoff(ready *downloadedUpdate, state updateResume) {
	a.wg.Add(1)
	go func() {
		defer a.wg.Done()
		self, err := os.Executable()
		if err == nil {
			self, err = filepath.EvalSymlinks(self)
		}
		var digest string
		if err == nil {
			digest, err = fileSHA256(self)
		}
		path := filepath.Join(ready.Dir, "plan.json")
		p := updatePlan{Product: appName, Protocol: updateProtocol, UserApproved: true, Target: self, Download: ready.EXE, Version: ready.Version, FromVersion: appVersion, SHA256: ready.SHA256, OldSHA256: digest, ParentPID: os.Getpid(), Resume: state}
		if err == nil {
			err = writeUpdateJSON(path, p)
		}
		var helperStarted bool
		if err == nil {
			c := hiddenUpdateCommand(ready.EXE, "--dfo-apply-update", path)
			if err = c.Start(); err == nil {
				ctx, cancel := context.WithTimeout(a.ctx, 10*time.Second)
				result, e := awaitUpdateResult(ctx, filepath.Join(ready.Dir, "ready.json"))
				cancel()
				if e != nil {
					err = e
				} else if result.State != "ready" {
					err = fmt.Errorf("подготовка замены EXE: %s", result.Error)
				}
				if err == nil {
					helperStarted = true
					_ = c.Process.Release()
				} else {
					_ = c.Process.Kill()
					_ = c.Wait()
				}
			}
		}
		a.mu.Lock()
		a.updateHandoff = false
		a.handedOff = helperStarted
		if err != nil {
			a.updateAccepted = false
			a.page = idJournal
			a.updateText = "Не удалось заменить программу. Текущая версия продолжает работу."
		}
		a.mu.Unlock()
		if err != nil {
			a.appendLog("Самообновление: " + err.Error() + "\r\n")
			_ = os.RemoveAll(ready.Dir)
		}
		a.logbook.sync()
		pPostMessageW.Call(a.hwnd, wmUpdater, 0, 0)
	}()
}

func (a *app) restoreUpdateChoices(st *gameStatus, exe string) {
	if a.updateResume == nil || a.updateResume.Game != "" && !sameUpdatePath(a.updateResume.Game, exe) {
		return
	}
	r := a.updateResume
	if r.Dirty && a.choiceRevision == a.resumeRevision {
		base := a.toggles
		if st != nil {
			base = loadChoices(st.Cfg, base)
		}
		a.toggles = resumeChoices(r.Choices, base)
	}
	a.updateResume = nil
}

func (a *app) announceUpdateStartup() {
	if a.resumePath != "" && !a.resumeCommitted {
		if err := writeUpdateJSON(filepath.Join(filepath.Dir(a.resumePath), "started.json"), updateResult{State: "started"}); err != nil {
			a.appendLog("Подтверждение запуска: " + err.Error() + "\r\n")
		}
	}
}
