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
	a.updateChecking = true
	a.updateText = "Проверяю обновления программы…"
	a.mu.Unlock()
	a.wg.Add(1)
	go func() {
		defer a.wg.Done()
		self, _ := os.Executable()
		pruneUpdateCache(updatesRoot(), self)
		u := installerUpdater()
		ctx, cancel := context.WithTimeout(a.ctx, 10*time.Second)
		release, err := u.latest(ctx)
		cancel()
		var ready *downloadedUpdate
		if err == nil && release != nil {
			a.mu.Lock()
			a.updateText = "Скачиваю программу " + release.Version + "…"
			a.mu.Unlock()
			a.appendLog("Найдена новая программа: " + release.Version + ".\r\n")
			ctx, cancel = context.WithTimeout(a.ctx, 2*time.Minute)
			ready, err = u.download(ctx, release, updatesRoot(), func(p int) { a.mu.Lock(); a.updateProgress = p; a.mu.Unlock() })
			cancel()
		}
		a.mu.Lock()
		a.updateReady = ready
		a.updateChecking = false
		a.updateChecked = true
		a.updateText = ""
		a.updateProgress = 0
		if err != nil && a.ctx.Err() == nil {
			a.updateText = "Обновления временно недоступны. Можно работать с текущей версией."
		}
		a.mu.Unlock()
		if err != nil && a.ctx.Err() == nil {
			a.appendLog("Проверка обновлений: " + err.Error() + "\r\n")
		}
		pPostMessageW.Call(a.hwnd, wmUpdater, 0, 0)
	}()
}

func (a *app) pendingChoices() bool {
	return a.choiceRevision != a.savedChoiceRevision || a.lootKeyDirty || a.dungeonKeyDirty
}

// Called only on the window thread. Downloads can finish while the user edits;
// the handoff captures the current controls and waits for ASAR/key operations.
func (a *app) maybeUpdate() {
	a.mu.Lock()
	if a.ctx.Err() != nil || a.busy || a.querying || a.searching || a.capturingKey || a.modalDepth > 0 || a.updateHandoff || a.handedOff {
		a.mu.Unlock()
		return
	}
	ready := a.updateReady
	if (ready != nil || a.autoUpgrade) && otherInstallerOpen(a.hwnd) {
		changed := !a.updateWaitOthers
		a.updateWaitOthers = true
		a.updateText = "Для автообновления закройте другие окна установщика."
		a.mu.Unlock()
		if changed {
			a.syncControls()
		}
		return
	}
	if a.updateWaitOthers {
		a.updateWaitOthers = false
		a.updateText = ""
		restore := !a.pendingChoices()
		haveGame := a.exe != ""
		a.mu.Unlock()
		if haveGame {
			a.requestStatus(restore)
		}
		return
	}
	if ready != nil {
		if time.Since(a.lastUserInput) < 2*time.Second {
			a.mu.Unlock()
			return
		}
		a.updateReady = nil
		a.updateHandoff = true
		a.updateText = "Подготавливаю обновление программы…"
		choices := map[string]bool{"onlyVisited": a.toggles[idVisited]}
		for _, f := range features {
			choices[f.Key] = a.toggles[f.ID]
		}
		state := updateResume{Game: a.exe, Choices: choices, LootKey: a.lootKey, DungeonKey: a.dungeonKey, Dirty: a.pendingChoices(), AutoApply: a.status != nil && a.status.Installed && !a.pendingChoices()}
		foreground, _, _ := updateForeground.Call()
		state.Background = foreground != a.hwnd
		if a.status == nil {
			state.LootKey = ""
			state.DungeonKey = ""
		}
		a.mu.Unlock()
		a.syncControls()
		a.beginUpdateHandoff(ready, state)
		return
	}
	if a.resumePath != "" && !a.resumeCommitted {
		var r updateResult
		err := readUpdateJSON(filepath.Join(filepath.Dir(a.resumePath), "result.json"), &r)
		if err == nil && r.State == "committed" {
			a.resumeCommitted = true
			a.updateText = "Программа обновлена до " + appVersion + "."
			pPostMessageW.Call(a.hwnd, wmUpdater, 0, 0)
		} else {
			a.mu.Unlock()
			return
		}
	}
	if !a.autoUpgrade || !a.updateChecked {
		a.mu.Unlock()
		return
	}
	if !upgradeEligible(a.status, a.pendingChoices()) {
		a.autoUpgrade = false
		a.mu.Unlock()
		return
	}
	if time.Since(a.lastUserInput) < 2*time.Second {
		a.mu.Unlock()
		return
	}
	// tasklist can be unavailable even when the game is running. Never rely
	// on that fallback's "false" alone before an automatic archive write.
	if !a.status.Running && nativeGameRunning() {
		a.status.Running = true
		pPostMessageW.Call(a.hwnd, wmUpdater, 0, 0)
	}
	if a.status.Running {
		poll := time.Since(a.updatePoll) > 2*time.Second
		if poll {
			a.updatePoll = time.Now()
		}
		a.updateText = "Программа обновлена. Расширение обновится после закрытия игры."
		a.mu.Unlock()
		if poll && !nativeGameRunning() {
			a.requestStatus(false)
		}
		return
	}
	a.mu.Unlock()
	a.run("upgrade")
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
		p := updatePlan{Product: appName, Protocol: updateProtocol, Target: self, Download: ready.EXE, Version: ready.Version, FromVersion: appVersion, SHA256: ready.SHA256, OldSHA256: digest, ParentPID: os.Getpid(), Resume: state}
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
			a.updateText = "Не удалось заменить программу. Текущая версия продолжает работу."
		}
		a.mu.Unlock()
		if err != nil {
			a.appendLog("Самообновление: " + err.Error() + "\r\n")
			_ = os.RemoveAll(ready.Dir)
		}
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
	if r.Dirty {
		a.autoUpgrade = false
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
