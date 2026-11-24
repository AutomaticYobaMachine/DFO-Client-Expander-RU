"""Real Win32 updater tests under Wine: local Releases fixture, no publication."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import tempfile
import time
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('installer_ui', ROOT/'tools/test-installer-ui.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)


def main():
    temp = Path(tempfile.mkdtemp(prefix='dfo-updater-ui-'))
    # A Russian Windows, as the installer UI test: the restarted window keeps the language through the update plan.
    env = dict(os.environ, DISPLAY=os.environ.get('DFO_TEST_DISPLAY', ':93'), WINEDEBUG='-all', LANG='ru_RU.UTF-8', LC_ALL='ru_RU.UTF-8')
    env.setdefault('WINEPREFIX', str(temp/'wine-profile'))
    log = (temp/'process.log').open('wb')
    screen = app = game_process = None
    current = json.loads((ROOT/'src/mod/version.json').read_text())['version']
    major, minor, _ = map(int, current.split('.'))
    future_version = f'{major}.{minor+1}.0'
    try:
        screen = subprocess.Popen([base.XVFB, env['DISPLAY'], '-screen', '0', '1600x1100x24', '-nolisten', 'tcp', '-ac'], env=env, stdout=log, stderr=log)
        time.sleep(.4)
        assert screen.poll() is None, 'Xvfb did not start'

        def wine(*args, extra=None, timeout=45):
            with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as error:
                result = subprocess.run([base.WINE, *map(str,args)], env=dict(env, **(extra or {})), stdout=out, stderr=error, timeout=timeout)
                out.seek(0); error.seek(0)
                text, stderr = out.read().decode('utf-8'), error.read().decode('utf-8')
            if result.returncode:
                raise RuntimeError(f'Wine failed {result.returncode}: {args}\n{text}\n{stderr}')
            return text

        build_env = dict(env, GOOS='windows', GOARCH='amd64', CGO_ENABLED='0')
        probe, parent = temp/'probe.exe', temp/'parent-tests.exe'
        subprocess.run([base.GO,'build','-o',str(probe),str(ROOT/'tools/installer-probe/main_windows.go')],env=build_env,check=True)
        subprocess.run([base.GO,'test','-c','-o',str(parent),'.'],cwd=ROOT/'src/gui',env=build_env,check=True)

        def state(*args):
            value=json.loads(wine(base.winpath(probe),*args))
            if value:value['by_id']={c['ID']:c for c in value['Controls']}
            return value

        def close_window():
            for _ in range(60):
                if not state():return
                state('close'); time.sleep(.15)
            raise AssertionError('installer did not close')

        def offer(answer):
            dialog=base.wait(lambda:state('dialog'))
            assert 'Доступна новая версия' in str(dialog), dialog
            assert all(x['ID'] in dialog['by_id'] for x in [{'ID':6},{'ID':7}]), dialog
            state('dialogclick',answer)

        assert state() is None, 'another installer is open'
        wine(base.winpath(parent),'-test.run=TestNativeUpdateResultWaitRetriesSharingViolation','-test.v')
        appdata=wine(base.winpath(base.NODE),'-p','process.env.APPDATA').strip()
        local=wine(base.winpath(base.NODE),'-p','process.env.LOCALAPPDATA').strip()
        unix=lambda p:Path(env['WINEPREFIX'])/'drive_c'/Path(p[3:].replace('\\','/'))
        profile=unix(appdata)/'DFO Online'; profile.mkdir(parents=True,exist_ok=True)
        updates=unix(local)/'DFO-Client-Expander-RU/updates'

        future_src=temp/'future-source';shutil.copytree(ROOT/'src/gui',future_src)
        options=future_src/'options.go';options.write_text(re.sub(r'appVersion\s*=\s*"[^"]+"',f'appVersion = "{future_version}"',options.read_text()))
        raw=io.BytesIO()
        with ZipFile(future_src/'payload_windows.zip') as original,ZipFile(raw,'w') as output:
            for info in original.infolist():
                data=original.read(info.filename)
                if info.filename=='mod/version.json':
                    value=json.loads(data);value['version']=future_version;data=json.dumps(value,ensure_ascii=False).encode()
                output.writestr(info,data)
        payload=raw.getvalue();(future_src/'payload_windows.zip').write_bytes(payload)
        future=temp/'future.exe'
        subprocess.run([base.GO,'build','-trimpath','-ldflags','-H windowsgui -s -w','-o',str(future),'.'],cwd=future_src,env=build_env,check=True)
        assert json.loads(wine(base.winpath(future),'--dfo-update-info'))=={'product':'DFO-Client-Expander-RU','version':future_version,'protocol':2}
        binary=bytearray(future.read_bytes());offset=binary.find(payload);assert offset>=0
        with ZipFile(io.BytesIO(payload)) as z:info=z.getinfo('README.txt')
        name_len,extra_len=struct.unpack_from('<HH',payload,info.header_offset+26)
        binary[offset+info.header_offset+30+name_len+extra_len+info.compress_size//2]^=0x55
        broken=temp/'broken-future.exe';broken.write_bytes(binary)

        old_payload=temp/'old-payload';shutil.copytree(ROOT/'dist/payload',old_payload)
        old_version=old_payload/'mod/version.json';value=json.loads(old_version.read_text());value['version']='1.13.0';old_version.write_text(json.dumps(value))
        game=temp/'Клиент DFO';(game/'resources').mkdir(parents=True)
        shutil.copyfile(base.NODE,game/'DFO Online.exe')
        archive=game/'resources/app.asar';config=profile/'dfo-mod.json';cache=profile/'dfo-mod-cache.json'
        original=base.asar({'main.cjs':b"const protocol={handle(){}};const app={};function handleDagger(){};protocol.handle('dagger',handleDagger);",'package.json':b'{"version":"0.1.fixture"}'})
        def cli(*args):return wine(base.winpath(base.NODE),base.winpath(old_payload/'patcher/patcher.cjs'),*args)
        def status():return json.loads(cli('status','--json','--asar',base.winpath(archive),'--user-data',base.winpath(profile)).splitlines()[-1])
        def reset_client():
            archive.write_bytes(original)
            for p in game.joinpath('resources').glob('app.asar.*'):p.unlink()
            config.write_text(json.dumps({'custom':123,'enabled':False}))
            cache.write_text(json.dumps({'towns':{'keep':True},'loot':{'revision':7,'presets':[]},'dungeons':{},'hotkeys':{}}))
            cli('install','--no-ru','--no-proc-check','--asar',base.winpath(archive),'--user-data',base.winpath(profile),'--loot-key','Mouse5','--dungeon-key','NumpadEnter','--set','enabled=0','--set','ru=0','--set','marks=1','--set','nearbyLoot=0','--set','dungeons=1','--set','onlyVisited=0')
            assert status()['modVersion']=='1.13.0'
            return archive.read_bytes(),config.read_bytes(),cache.read_bytes()
        def unchanged(before):assert before==(archive.read_bytes(),config.read_bytes(),cache.read_bytes()),'modified game without Install click'
        def started(mode,candidate=future,**extra):
            target=temp/('Программа '+mode)/'DFO-Client-Expander-RU.exe';target.parent.mkdir();shutil.copyfile(parent,target)
            extra=dict(DFO_TEST_UPDATE_EXE=base.winpath(candidate),DFO_TEST_GAME_EXE=base.winpath(game/'DFO Online.exe'),DFO_TEST_UPDATE_VERSION=future_version,**extra)
            proc=subprocess.Popen([base.WINE,base.winpath(target),'-test.run=TestNativeSelfUpdateStartup','-test.v'],env=dict(env,**extra),stdout=log,stderr=log)
            return target,proc
        def ready(version=current):return base.wait(lambda:(s if (s:=state()) and version in s['Title'] and s['by_id'].get(108,{}).get('Enabled') else None),timeout=60)

        before=reset_client();target,app=started('decline',DFO_TEST_EXPECT_HANDOFF='false',DFO_TEST_EXPECT_NO_DOWNLOAD='true')
        offer(7);ready();time.sleep(3);unchanged(before)
        assert hashlib.sha256(target.read_bytes()).digest()==hashlib.sha256(parent.read_bytes()).digest()
        assert state('dialog') is None,'repeated update offer after No'
        close_window();app.wait(timeout=15);assert app.returncode==0
        print('PASS: No keeps UI alive, downloads nothing and never auto-injects over 1.13',flush=True)

        before=reset_client();target,app=started('consent')
        offer(7);ready()
        state('click',103);state('click',105)
        state('click',120);wine(base.winpath(probe),'key','0x65','0x4c')
        base.wait(lambda:state()['by_id'][120]['Title']=='Клавиша: NumPad 5')
        state('click',121);wine(base.winpath(probe),'key','0x6b','0x4e')
        base.wait(lambda:state()['by_id'][121]['Title']=='Клавиша: NumPad +')
        state('click',125);offer(6)
        s=ready(future_version);time.sleep(3);unchanged(before)
        assert s['by_id'][103]['Checked']==1 and s['by_id'][105]['Checked']==1
        assert s['by_id'][120]['Title']=='Клавиша: NumPad 5' and s['by_id'][121]['Title']=='Клавиша: NumPad +'
        assert hashlib.sha256(target.read_bytes()).digest()==hashlib.sha256(future.read_bytes()).digest()
        state('click',108);base.wait(lambda:status()['modVersion']==future_version,timeout=60);ready(future_version)
        after=json.loads(config.read_text());assert after['custom']==123 and after['nearbyLootOptions']['keyCode']=='Numpad5' and after['dungeonOptions']['keyCode']=='NumpadAdd'
        close_window();app.wait(timeout=15);assert app.returncode==0
        print('PASS: consented real EXE replacement preserves pending choices; ASAR changes only after Install',flush=True)

        before=reset_client();target,app=started('checksum',DFO_TEST_EXPECT_HANDOFF='false',DFO_TEST_UPDATE_FAILURE='checksum')
        offer(6)
        base.wait(lambda:'контрольная сумма метаданных не совпадает' in str(state()),timeout=45)
        unchanged(before);assert hashlib.sha256(target.read_bytes()).digest()==hashlib.sha256(parent.read_bytes()).digest()
        assert 'контрольная сумма метаданных не совпадает' in (profile/'dfo-mod-installer.log').read_text()
        close_window();app.wait(timeout=15);assert app.returncode==0
        print('PASS: rejected download leaves current GUI alive with full diagnostic file',flush=True)

        before=reset_client();target,app=started('rollback',broken)
        offer(6)
        def result():
            for path in updates.glob('update-*/plan.json'):
                plan=json.loads(path.read_text())
                if plan['target'].lower()==base.winpath(target).lower() and (path.parent/'result.json').exists():return json.loads((path.parent/'result.json').read_text())
        value=base.wait(result,timeout=65);assert value['state']=='rolled-back',value
        ready();unchanged(before)
        assert hashlib.sha256(target.read_bytes()).digest()==hashlib.sha256(parent.read_bytes()).digest()
        close_window();app.wait(timeout=15);assert app.returncode==0
        print('PASS: damaged payload rolls back confirmed update without touching ASAR/settings',flush=True)
    finally:
        if app is not None and 'close_window' in locals():
            try:(temp/'last-window.json').write_text(json.dumps(state(),ensure_ascii=False,indent=2))
            except Exception:pass
            try:close_window()
            except Exception as error:print('Window cleanup:',error,flush=True)
        if game_process and game_process.poll() is None:game_process.terminate()
        if app and app.poll() is None:app.terminate()
        if screen:screen.terminate();screen.wait(timeout=10)
        log.close()
        print('Updater test files:',temp,flush=True)


if __name__=='__main__':main()
