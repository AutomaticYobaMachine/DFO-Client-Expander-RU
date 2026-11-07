"""Drive the real standalone Windows installer under Wine on an isolated Xvfb.

Requires Wine, Xvfb, xdotool, Go, Pillow and an official Windows node.exe fixture.
Test-only: Windows Node stands in for the game's ELECTRON_RUN_AS_NODE executable.
"""
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import time

from PIL import ImageGrab

ROOT = Path(__file__).resolve().parent.parent
WINE = os.environ.get('DFO_WINE', 'wine64')
XVFB = os.environ.get('DFO_XVFB', 'Xvfb')
XDO = os.environ.get('DFO_XDOTOOL', 'xdotool')
GO = os.environ.get('DFO_GO', 'go')
NODE = Path(os.environ['DFO_WINDOWS_NODE'])
INSTALLER = ROOT / 'dist/DFO-Client-Expander-RU/DFO-Client-Expander-RU.exe'


def asar(files):
    offset, entries, content = 0, {}, b''
    for name, value in files.items():
        entries[name] = {'size': len(value), 'offset': str(offset)}
        offset += len(value)
        content += value
    raw = json.dumps({'files': entries}, separators=(',', ':')).encode()
    pad = b'\0' * (-len(raw) % 4)
    header = struct.pack('<II', 4 + len(raw) + len(pad), len(raw)) + raw + pad
    return struct.pack('<II', 4, len(header)) + header + content


def winpath(p):
    return 'Z:' + str(p.resolve()).replace('/', '\\')


def wait(fn, timeout=30):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        value = fn()
        if value:
            return value
        time.sleep(.15)
    raise AssertionError('Timed out waiting for installer state')


def main():
    temp = Path(tempfile.mkdtemp(prefix='dfo-installer-ui-'))
    display = os.environ.get('DFO_TEST_DISPLAY', ':92')
    # A Russian Windows: the window starts in Russian and offers the translation checked (--lang ru pins the words).
    env = dict(os.environ, DISPLAY=display, WINEDEBUG='-all', LANG='ru_RU.UTF-8', LC_ALL='ru_RU.UTF-8')
    env.setdefault('WINEPREFIX', str(temp / 'wine-profile'))
    screen = app = None
    log = (temp / 'process.log').open('wb')
    try:
        screen = subprocess.Popen([XVFB, display, '-screen', '0', '1600x1100x24', '-nolisten', 'tcp', '-ac'], stdout=log, stderr=log)
        time.sleep(.4)
        assert screen.poll() is None, 'Xvfb did not start'
        probe = temp / 'probe.exe'
        subprocess.run([GO, 'build', '-o', str(probe), str(ROOT/'tools/installer-probe/main_windows.go')], env=dict(env, GOOS='windows', GOARCH='amd64', CGO_ENABLED='0'), check=True)

        def wine(*args):
            # Wine's inherited Unix anonymous pipe is not a Win32 pipe to libuv.
            # Files keep test-driver stdout valid; the installer itself uses Win32 pipes.
            with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
                result=subprocess.run([WINE, *map(str, args)], env=env, stdout=out, stderr=err, timeout=25)
                out.seek(0);err.seek(0);stdout=out.read().decode('utf-8');stderr=err.read().decode('utf-8')
            if result.returncode:
                raise RuntimeError(f'Wine command failed ({result.returncode}): {args}\n{stdout}\n{stderr}')
            return stdout

        def state(*args):
            out = wine(winpath(probe), *args)
            value = json.loads(out)
            if value:
                value['by_id'] = {c['ID']: c for c in value['Controls']}
            return value

        def key(code):
            # Clearing modifiers also synthesizes Num Lock presses, which a
            # legitimate recorder would capture before the requested key.
            subprocess.run([XDO, 'key', code], env=env, check=True)

        def shot(name):
            folder = Path(os.environ.get('DFO_SCREENSHOT_DIR', str(ROOT/'dist/installer-screenshots')))
            folder.mkdir(parents=True, exist_ok=True)
            ImageGrab.grab(xdisplay=display).save(folder/name)

        game = temp/'Клиент DFO'
        (game/'resources').mkdir(parents=True)
        shutil.copyfile(NODE, game/'DFO Online.exe')
        original = asar({'main.cjs': b"const protocol={handle(){}};const app={};function handleDagger(){};protocol.handle('dagger',handleDagger);", 'package.json': b'{"version":"0.1.fixture"}', 'untouched.bin': b'\0\n*\xff'})
        archive = game/'resources/app.asar'
        archive.write_bytes(original)

        # Resolve the test prefix's AppData from Windows itself, not a guessed username.
        appdata = wine(winpath(NODE), '-p', 'process.env.APPDATA').strip()
        assert appdata.startswith('C:\\'), appdata
        profile = Path(env['WINEPREFIX'])/'drive_c'/Path(appdata[3:].replace('\\', '/'))/'DFO Online'
        profile.mkdir(parents=True, exist_ok=True)
        config = profile/'dfo-mod.json'
        config.write_text(json.dumps({'enabled': False, 'nearbyLootOptions': {'keyCode': 'KeyK', 'customOption': 456}, 'custom': 123}))
        cache = profile/'dfo-mod-cache.json'
        cached = b'{"towns":{"kept":true},"loot":{"revision":7,"presets":[]},"dungeons":{}}'
        cache.write_bytes(cached)

        # Only the EXE is copied: sidecar patcher/mod/data directories are absent.
        standalone = temp/'standalone'
        standalone.mkdir()
        executable = standalone/INSTALLER.name
        shutil.copyfile(INSTALLER, executable)

        def launch(*flags):
            return subprocess.Popen([WINE, winpath(executable), '--no-self-update', '--lang', 'ru', *flags, '--game', winpath(game/'DFO Online.exe')], env=env, stdout=log, stderr=log)

        app = launch("--auto-install")
        s = wait(lambda: (v if (v := state()) and v['by_id'][108]['Enabled'] and v['by_id'][108]['Visible'] and v['by_id'][120]['Enabled'] and v['by_id'][121]['Enabled'] and v['by_id'][117]['Title']==winpath(game/'DFO Online.exe') else None))
        assert 'DFO-Client-Expander-RU' in s['Title']
        assert all(s['by_id'][i]['Checked'] == 1 for i in [103,104,105,106,107,122])
        assert all(len(s['by_id'][1000+i]['Title'])>100 for i in [103,104,105,106,122])
        assert not any(c['Title']=='GitHub' for c in s['Controls'])
        # The RU/EN switch names the other language and re-words the open window both ways.
        assert s['by_id'][126]['Title']=='English' and s['by_id'][110]['Title']=='Компоненты'
        state('click',126);wait(lambda:state()['by_id'][110]['Title']=='Components')
        s=state();assert s['by_id'][126]['Title']=='Русский' and s['by_id'][103]['Title']=='Russian translation' and s['by_id'][107]['Title']=='Only visited'
        state('click',126);wait(lambda:state()['by_id'][110]['Title']=='Компоненты')
        assert state()['by_id'][103]['Title']=='Русификация'
        pane=s['by_id'][118]['Rect']
        for i in [103,104,105,106]:
            assert s['by_id'][i]['Rect']['Top']>=pane['Top'] and s['by_id'][1000+i]['Rect']['Bottom']<=pane['Bottom'], 'all four features and descriptions should fit the initial test screen'
        shot('installer-components.png')
        # Old launch flags and a failed backend must never terminate the UI.
        time.sleep(3)
        assert archive.read_bytes()==original and json.loads(config.read_text())['enabled'] is False
        archive.write_bytes(b'broken ASAR for failure test')
        state('click',108)
        wait(lambda:'Операция завершилась с ошибкой' in str(state()))
        assert app.poll() is None and state()['by_id'][112]['Visible']
        journal=profile/'dfo-mod-installer.log'
        assert journal.exists() and 'Операция завершилась с ошибкой' in journal.read_text()
        assert 'автоматической установки проигнорирован' in journal.read_text()
        assert json.loads(config.read_text())['enabled'] is False and cache.read_bytes()==cached
        archive.write_bytes(original)
        state('click',102)
        wait(lambda:state()['by_id'][108]['Enabled'])
        state('click',110)
        s=state()
        assert s['by_id'][121]['Title']=='Клавиша: K' and s['by_id'][121]['Enabled'], 'dungeon shortcut should default to K independently of loot'

        assert s['by_id'][120]['Title']=='Клавиша: K', f'uninstalled client lost its saved binding: {s["by_id"][120]["Title"]}; game={s["by_id"][117]["Title"]}; config={config}; log={s["by_id"][112]["Title"]}'
        r=s['by_id'][120]['Rect']
        subprocess.run([XDO,'mousemove','--sync',str((r['Left']+r['Right'])//2),str((r['Top']+r['Bottom'])//2),'click','1'],env=env,check=True)
        wait(lambda:state()['by_id'][120]['Title']=='Нажмите клавишу…')
        subprocess.run([XDO,'click','1'],env=env,check=True)
        wait(lambda:state()['by_id'][120]['Title']=='Клавиша: K')

        def bind_key(keys, label, native=None):
            state('click',120)
            assert state()['by_id'][120]['Title']=='Нажмите клавишу…'
            if native is None:
                key(keys)
            else:
                state('key',*native)
            try:
                wait(lambda:state()['by_id'][120]['Title']=='Клавиша: '+label, timeout=8)
            except AssertionError:
                current=state();shot('installer-capture-failure.png')
                raise AssertionError(f'Capture {keys}: wanted {label!r}, got {current["by_id"][120]["Title"]!r}')
            assert state()['by_id'][108]['Enabled'], 'recorded release restarted capture or clicked Install'
            assert json.loads(config.read_text())['enabled'] is False, 'recording alone must not install or save config'

        state('focus',120);key('Return')
        assert state()['by_id'][120]['Title']=='Нажмите клавишу…', 'Enter should start capture, not bind itself'
        shot('installer-hotkey-recording.png')
        key('Escape');assert state()['by_id'][120]['Title']=='Клавиша: K', 'Escape changed the binding'
        bind_key('space','Пробел')
        bind_key('Tab','Tab')
        bind_key('1','1')
        # Xdotool synthesizes extra Num Lock presses for keypad keysyms. Send
        # the physical Win32 scan codes through SendInput instead, with both
        # virtual-key forms delivered by Windows when Num Lock is on/off.
        keypad=[(0x52,0x2d),(0x4f,0x23),(0x50,0x28),(0x51,0x22),(0x4b,0x25),(0x4c,0x0c),(0x4d,0x27),(0x47,0x24),(0x48,0x26),(0x49,0x21)]
        for digit,(scan,off_vk) in enumerate(keypad):
            for vk in [0x60+digit,off_vk]:
                bind_key('NumPad '+str(digit),'NumPad '+str(digit),(str(vk),str(scan)))
        for keys,label,vk,scan,extended in [('Return','Enter',0x0d,0x1c,False),('KP_Enter','NumPad Enter',0x0d,0x1c,True),('KP_Add','NumPad +',0x6b,0x4e,False),('KP_Subtract','NumPad −',0x6d,0x4a,False),('KP_Multiply','NumPad ×',0x6a,0x37,False),('KP_Divide','NumPad /',0x6f,0x35,True),('KP_Decimal','NumPad .',0x6e,0x53,False),('KP_Delete','NumPad .',0x2e,0x53,False)]:
            bind_key(keys,label,(str(vk),str(scan),*(['extended'] if extended else [])))
        state('click',120);state('deactivate')
        wait(lambda:state()['by_id'][120]['Title']=='Клавиша: NumPad .')
        for button in [8,9]:
            state('click',120)
            r=state()['by_id'][120]['Rect']
            subprocess.run([XDO,'mousemove','--sync',str((r['Left']+r['Right'])//2),str((r['Top']+r['Bottom'])//2),'click',str(button)],env=env,check=True)
            wait(lambda:state()['by_id'][120]['Title']=='Клавиша: Мышь '+str(button-4))
        state('click',102);wait(lambda:state()['by_id'][108]['Enabled'])
        assert state()['by_id'][120]['Title']=='Клавиша: Мышь 5', 'status refresh replaced an unapplied binding'
        assert json.loads(config.read_text())['nearbyLootOptions']['keyCode']=='KeyK', 'capture wrote before Apply'
        state('click',120);state('click',111);state('click',110)
        assert state()['by_id'][120]['Title']=='Клавиша: Мышь 5', 'changing tabs should cancel capture'
        print('PASS capture: real clicks, Escape, Space/Tab/Enter, physical NumPad and both Windows Num Lock VK forms, mouse 4/5, refresh and tab cancellation',flush=True)

        state('click',121);key('KP_Add')
        wait(lambda:state()['by_id'][121]['Title']=='Клавиша: NumPad +')
        assert state()['by_id'][120]['Title']=='Клавиша: Мышь 5', 'dungeon capture overwrote loot'
        state('click',121);key('Escape')
        assert state()['by_id'][121]['Title']=='Клавиша: NumPad +', 'cancel lost the dungeon binding'
        state('click',121)
        r=state()['by_id'][121]['Rect']
        subprocess.run([XDO,'mousemove','--sync',str((r['Left']+r['Right'])//2),str((r['Top']+r['Bottom'])//2),'click','8'],env=env,check=True)
        wait(lambda:state()['by_id'][121]['Title']=='Клавиша: Мышь 4')
        assert state()['by_id'][120]['Title']=='Клавиша: Мышь 5'
        assert 'dungeonOptions' not in json.loads(config.read_text()), 'recording must wait for Apply'

        picker=subprocess.Popen([WINE,winpath(probe),'click','101'],env=env,stdout=log,stderr=log)
        wait(lambda:state('dialog'));state('cancel-save');picker.wait(timeout=10)
        picker=subprocess.Popen([WINE,winpath(probe),'click','101'],env=env,stdout=log,stderr=log)
        wait(lambda:state('dialog'));state('savepath',winpath(game/'DFO Online.exe'));picker.wait(timeout=10)
        wait(lambda:state()['by_id'][108]['Enabled'])

        state('focus', '103'); key('space')
        assert state()['by_id'][103]['Checked'] == 0, 'Space did not toggle the native checkbox'
        key('Tab'); assert state()['Focus'] == 104, 'Tab order should follow the feature list'
        key('Tab'); assert state()['Focus'] == 107
        key('space'); assert state()['by_id'][107]['Checked'] == 0
        state('focus',123)
        s=state(); assert s['by_id'][123]['Rect']['Top']>=s['by_id'][118]['Rect']['Top'], 'fonts checkbox did not scroll into view'
        for i in [104,105,106,122,123]:
            state('click', i)
        s = state()
        assert not s['by_id'][108]['Enabled'], 'empty feature choice must not start an install'
        assert not s['by_id'][107]['Enabled'], 'visited-only option depends on city marks'
        state('click', 104)
        assert state()['by_id'][107]['Enabled']

        state('resize', 820, 620); state('focus', 106)
        s = state(); child, pane = s['by_id'][106]['Rect'], s['by_id'][118]['Rect']
        assert child['Top']>=pane['Top'] and child['Bottom']<=pane['Bottom'], 'Tab focus did not scroll the checkbox into view'
        assert s['by_id'][1106]['Rect']['Bottom']<=pane['Bottom'], 'the focused card description should also be visible when it fits'
        primary, outer = s['by_id'][108]['Rect'], s['Window']
        assert primary['Bottom']<=outer['Bottom'] and primary['Right']<=outer['Right']
        shot('installer-small.png')
        # At minimum width the updater must not overlap destructive actions.
        state('resize',760,620)
        narrow=state()['by_id']
        assert narrow[125]['Rect']['Top'] < narrow[108]['Rect']['Top']
        assert narrow[124]['Rect']['Right'] <= state()['Window']['Right']
        state('resize',820,620)
        state('click',105)
        state('focus',120)
        s=state();child,pane=s['by_id'][120]['Rect'],s['by_id'][118]['Rect']
        assert child['Top']>=pane['Top'] and child['Bottom']<=pane['Bottom'], 'key button focus did not scroll into view'
        state('click',105)
        state('resize', 1008, 927)

        state('click', 108)
        wait(lambda: config.exists() and json.loads(config.read_text()).get('enabled') is True)
        wait(lambda: state()['by_id'][108]['Enabled'])
        cfg = json.loads(config.read_text())
        assert [cfg[k] for k in ['ru','marks','nearbyLoot','dungeons','itemCards','fonts']] == [False,True,False,False,False,False], cfg
        assert cfg['marksOptions']['onlyVisited'] is False
        assert cfg['nearbyLootOptions']['keyCode']=='Mouse5' and cfg['custom']==123
        assert cfg['nearbyLootOptions']['customOption']==456
        assert cfg['dungeonOptions']['keyCode']=='Mouse4'
        assert archive.read_bytes()!=original
        assert json.loads(cache.read_text())=={**json.loads(cached), 'hotkeys': {'loot':'Mouse5','dungeon':'Mouse4'}}
        print('PASS install: chosen mouse binding and unrelated options/cache survive repeated game selection and installation',flush=True)

        state('close'); app.wait(timeout=15)
        app = launch()
        wait(lambda: (s := state()) and s['by_id'][108]['Enabled'] and s['by_id'][108]['Visible'] and s['by_id'][117]['Title']==winpath(game/'DFO Online.exe'))
        s = state()
        assert [s['by_id'][i]['Checked'] for i in [103,104,105,106,107,122,123]] == [0,1,0,0,0,0,0], 'restart lost saved checkboxes'
        assert s['by_id'][120]['Title']=='Клавиша: Мышь 5' and not s['by_id'][120]['Enabled'], 'restart lost the saved mouse binding or ignored the disabled feature'
        assert s['by_id'][121]['Title']=='Клавиша: Мышь 4' and not s['by_id'][121]['Enabled'], 'restart lost the independent dungeon shortcut'
        for i in [103,104,105,106]:
            state('click', i)
        state('click',120);key('KP_Enter')
        wait(lambda:state()['by_id'][120]['Title']=='Клавиша: NumPad Enter')
        state('click', 108)
        wait(lambda: json.loads(config.read_text()).get('ru') is True)
        wait(lambda: state()['by_id'][108]['Enabled'])
        cfg = json.loads(config.read_text())
        assert [cfg[k] for k in ['ru','marks','nearbyLoot','dungeons']] == [True,False,True,True]
        assert cfg['nearbyLootOptions']['keyCode']=='NumpadEnter'
        assert cfg['dungeonOptions']['keyCode']=='Mouse4'
        state('click', 111)
        s=state()
        assert s['by_id'][112]['Visible'] and not s['by_id'][118]['Visible']
        assert 'AutomaticYobaMachine' in s['by_id'][112]['Title'] and 'Готово' in s['by_id'][112]['Title']
        shot('installer-journal.png')

        picker=subprocess.Popen([WINE,winpath(probe),'click','113'],env=env,stdout=log,stderr=log)
        wait(lambda:state('dialog'));state('cancel-save');picker.wait(timeout=10)
        picker=subprocess.Popen([WINE,winpath(probe),'click','113'],env=env,stdout=log,stderr=log)
        wait(lambda:state('dialog'))
        saved=temp/'Отчёт установки.log';state('savepath',winpath(saved));picker.wait(timeout=10)
        wait(lambda:saved.exists())
        report=saved.read_text()
        assert 'AutomaticYobaMachine' in report and 'Создано специально для русского сообщества DFO Online.' in report and 'Готово' in report

        assert archive.with_name(archive.name+'.dfo-mod-original.bak').read_bytes()==original
        state('click', 109)
        wait(lambda: archive.read_bytes()==original)
        wait(lambda: state()['by_id'][108]['Enabled'])
        assert json.loads(cache.read_text())=={**json.loads(cached), 'hotkeys': {'loot':'NumpadEnter','dungeon':'Mouse4'}}
        assert not archive.with_name(archive.name+'.dfo-mod-original.bak').exists()
        state('close'); app.wait(timeout=15); app=None
        config.unlink()
        app=launch()
        wait(lambda:(s:=state()) and s['by_id'][108]['Visible'] and s['by_id'][108]['Enabled'] and s['by_id'][117]['Title']==winpath(game/'DFO Online.exe'))
        assert state()['by_id'][120]['Title']=='Клавиша: NumPad Enter', 'cached binding must survive a missing config'
        assert state()['by_id'][121]['Title']=='Клавиша: Мышь 4', 'cached dungeon binding must survive a missing config'
        assert not config.exists(), 'status must not recreate or change the config'
        assert archive.read_bytes()==original
        state('close');app.wait(timeout=15);app=None
        print('PASS: standalone Win32 EXE; keyboard capture, Escape/focus/tab cancel, Space/Tab/Enter release safety, NumPad 0-9/navigation/operators/Enter, real mouse buttons 4/5, apply/preservation/restart; file picker/cancel, checkboxes/descriptions/focus scrolling, small window, selected install, journal/export/cancel, ASAR restoration and cache conservation')
    finally:
        if app and app.poll() is None:
            app.terminate()
            app.wait(timeout=10)
        if screen:
            screen.terminate()
            screen.wait(timeout=10)
        log.close()
        if os.environ.get('DFO_KEEP_UI_TEST'):
            print('Test files:', temp)
        else:
            shutil.rmtree(temp)


if __name__ == '__main__':
    main()
