"""Native updater integration under Wine/Xvfb. Local fake Releases transport only.

Requires the same DFO_WINDOWS_NODE/DFO_WINE environment as test-installer-ui.py.
Builds a future-version fixture; never downloads or publishes a release.
"""
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
    env = dict(os.environ, DISPLAY=os.environ.get('DFO_TEST_DISPLAY', ':92'), WINEDEBUG='-all')
    env.setdefault('WINEPREFIX', str(temp/'wine-profile'))
    log = (temp/'process.log').open('wb')
    screen = app = game_process = None
    try:
        screen = subprocess.Popen([base.XVFB, env['DISPLAY'], '-screen', '0', '1600x1100x24', '-nolisten', 'tcp', '-ac'], env=env, stdout=log, stderr=log)
        time.sleep(.4)
        assert screen.poll() is None, 'Xvfb did not start'

        def wine(*args, extra=None, timeout=40):
            with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as error:
                result = subprocess.run([base.WINE, *map(str,args)], env=dict(env, **(extra or {})), stdout=out, stderr=error, timeout=timeout)
                out.seek(0); error.seek(0)
                text, stderr = out.read().decode('utf-8'), error.read().decode('utf-8')
            if result.returncode:
                raise RuntimeError(f'Wine failed {result.returncode}: {args}\n{text}\n{stderr}')
            return text

        build_env = dict(env, GOOS='windows', GOARCH='amd64', CGO_ENABLED='0')
        probe = temp/'probe.exe'
        subprocess.run([base.GO,'build','-o',str(probe),str(ROOT/'tools/installer-probe/main_windows.go')],env=build_env,check=True)
        parent = temp/'parent-tests.exe'
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

        assert state() is None, 'another installer is open in the test profile'
        wine(base.winpath(parent),'-test.run=TestNativeUpdateResultWaitRetriesSharingViolation','-test.v')
        appdata=wine(base.winpath(base.NODE),'-p','process.env.APPDATA').strip()
        local=wine(base.winpath(base.NODE),'-p','process.env.LOCALAPPDATA').strip()
        unix=lambda p:Path(env['WINEPREFIX'])/'drive_c'/Path(p[3:].replace('\\','/'))
        profile=unix(appdata)/'DFO Online'; profile.mkdir(parents=True,exist_ok=True)
        updates=unix(local)/'DFO-Client-Expander-RU/updates'

        # The real application, with only its compile-time version/payload changed.
        future_src=temp/'future-source';shutil.copytree(ROOT/'src/gui',future_src)
        options=future_src/'options.go';options.write_text(re.sub(r'appVersion\s*=\s*"[^"]+"','appVersion = "1.20.0"',options.read_text()))
        raw=io.BytesIO()
        with ZipFile(future_src/'payload_windows.zip') as original,ZipFile(raw,'w') as output:
            for info in original.infolist():
                data=original.read(info.filename)
                if info.filename=='mod/version.json':
                    value=json.loads(data);value['version']='1.20.0';data=json.dumps(value,ensure_ascii=False).encode()
                if info.filename=='patcher/patcher.cjs':
                    # Simulate an unavailable tasklist reporting "not running".
                    # The independent native Go watcher must still protect the game.
                    marker=b'function gameRunning() {';assert data.count(marker)==1
                    data=data.replace(marker,marker+b' return false; /* test fixture */')
                output.writestr(info,data)
        payload=raw.getvalue();(future_src/'payload_windows.zip').write_bytes(payload)
        future=temp/'future.exe'
        subprocess.run([base.GO,'build','-trimpath','-ldflags','-H windowsgui -s -w','-o',str(future),'.'],cwd=future_src,env=build_env,check=True)
        info=json.loads(wine(base.winpath(future),'--dfo-update-info'))
        assert info=={'product':'DFO-Client-Expander-RU','version':'1.20.0','protocol':1},info

        # The helper/probe can start, but the normal GUI cannot unpack this build.
        binary=bytearray(future.read_bytes());offset=binary.find(payload);assert offset>=0
        with ZipFile(io.BytesIO(payload)) as z:info=z.getinfo('README.txt')
        name_len,extra_len=struct.unpack_from('<HH',payload,info.header_offset+26)
        pos=offset+info.header_offset+30+name_len+extra_len+info.compress_size//2
        binary[pos]^=0x55;broken=temp/'broken-future.exe';broken.write_bytes(binary)
        assert json.loads(wine(base.winpath(broken),'--dfo-update-info'))['version']=='1.20.0'

        old_payload=temp/'old-payload';shutil.copytree(ROOT/'dist/payload',old_payload)
        meta=old_payload/'mod/version.json';value=json.loads(meta.read_text());value['version']='1.18.0';meta.write_text(json.dumps(value))
        game=temp/'Клиент DFO';(game/'resources').mkdir(parents=True);shutil.copyfile(base.NODE,game/'DFO Online.exe')
        archive=game/'resources/app.asar'
        config=profile/'dfo-mod.json';cache=profile/'dfo-mod-cache.json'

        def status():
            text=wine(base.winpath(base.NODE),base.winpath(ROOT/'dist/payload/patcher/patcher.cjs'),'status','--json','--no-proc-check','--asar',base.winpath(archive),'--user-data',base.winpath(profile))
            return next(json.loads(line) for line in text.splitlines() if line.startswith('{'))

        def reset_client():
            archive.write_bytes(base.asar({'main.cjs':b"const protocol={handle(){}};const app={};function handleDagger(){};protocol.handle('dagger',handleDagger);",'package.json':b'{"version":"0.1.fixture"}','untouched.bin':b'\0\n*\xff'}))
            (archive.with_name(archive.name+'.dfo-mod-original.bak')).unlink(missing_ok=True)
            config.write_text(json.dumps({'enabled':False,'ru':False,'marks':True,'nearbyLoot':False,'dungeons':True,'custom':{'kept':123},'marksOptions':{'onlyVisited':False,'keep':456},'nearbyLootOptions':{'customOption':789}}))
            cache.write_text(json.dumps({'towns':{'kept':True},'loot':{'revision':7,'presets':[{'id':'kept'}]},'dungeons':{'kept':True}}))
            wine(base.winpath(base.NODE),base.winpath(old_payload/'patcher/patcher.cjs'),'install','--no-ru','--no-proc-check','--asar',base.winpath(archive),'--user-data',base.winpath(profile),'--loot-key','Mouse5','--dungeon-key','NumpadEnter','--set','enabled=0','--set','ru=0','--set','marks=1','--set','nearbyLoot=0','--set','dungeons=1','--set','onlyVisited=0')
            assert status()['modVersion']=='1.18.0'
            return json.loads(config.read_text()),json.loads(cache.read_text())

        def started(mode,candidate):
            target=temp/('Программа '+mode)/'DFO-Client-Expander-RU.exe';target.parent.mkdir();shutil.copyfile(parent,target)
            extra={'DFO_TEST_UPDATE_EXE':base.winpath(candidate),'DFO_TEST_GAME_EXE':base.winpath(game/'DFO Online.exe')}
            proc=subprocess.Popen([base.WINE,base.winpath(target),'-test.run=TestNativeSelfUpdateStartup','-test.v'],env=dict(env,**extra),stdout=log,stderr=log)
            return target,proc,extra

        def plan_for(target):
            for path in updates.glob('update-*/plan.json'):
                value=json.loads(path.read_text())
                if value['target'].lower()==base.winpath(target).lower():return path,value

        # Program replacement while the game stays open, then automatic ASAR upgrade.
        before,cached=reset_client();flag=temp/'game-running';flag.write_text('running')
        game_process=subprocess.Popen([base.WINE,base.winpath(game/'DFO Online.exe'),'-e',"const fs=require('fs');setInterval(()=>{if(!fs.existsSync(process.env.DFO_TEST_RUNNING_FILE))process.exit(0)},50)"],env=dict(env,DFO_TEST_RUNNING_FILE=base.winpath(flag)),stdout=log,stderr=log)
        target,app,extra=started('automatic',future)
        base.wait(lambda:(s if (s:=state()) and '1.20.0' in s['Title'] and s['by_id'].get(108,{}).get('Visible') else None),timeout=60)
        assert status()['modVersion']=='1.18.0' and game_process.poll() is None,'updated or stopped the running game'
        wine(base.winpath(parent),'-test.run=TestNativeGameWatcher','-test.v',extra=dict(extra,DFO_TEST_EXPECT_GAME_RUNNING='true'))
        flag.unlink();game_process.wait(timeout=15);game_process=None
        wine(base.winpath(parent),'-test.run=TestNativeGameWatcher','-test.v',extra=dict(extra,DFO_TEST_EXPECT_GAME_RUNNING='false'))
        base.wait(lambda:status()['modVersion']=='1.20.0',timeout=45)
        after=json.loads(config.read_text());after_cache=json.loads(cache.read_text())
        for key in ['enabled','ru','marks','nearbyLoot','dungeons','custom']:assert after[key]==before[key],key
        for key in ['towns','loot','dungeons','hotkeys']:assert after_cache[key]==cached[key],key
        assert hashlib.sha256(target.read_bytes()).digest()==hashlib.sha256(future.read_bytes()).digest()
        app.wait(timeout=10);assert app.returncode==0
        close_window();print('PASS: real download/probe/helper/replacement/restart; running game is untouched; automatic mod upgrade preserves disabled state and cache',flush=True)

        # A pending selection and both pending bindings survive the new process.
        before,cached=reset_client();old_archive=archive.read_bytes();old_cfg=config.read_bytes();old_cache=cache.read_bytes()
        target,app,extra=started('pending',future)
        base.wait(lambda:(s if (s:=state()) and s['by_id'].get(108,{}).get('Enabled') else None))
        state('click',103);state('click',105)
        state('click',120);wine(base.winpath(probe),'key','0x65','0x4c')
        base.wait(lambda:state()['by_id'][120]['Title']=='Клавиша: NumPad 5')
        state('click',121);wine(base.winpath(probe),'key','0x6b','0x4e')
        base.wait(lambda:state()['by_id'][121]['Title']=='Клавиша: NumPad +')
        base.wait(lambda:(s if (s:=state()) and '1.20.0' in s['Title'] and s['by_id'].get(108,{}).get('Enabled') and s['by_id'][108]['Visible'] else None),timeout=60)
        s=state();assert s['by_id'][103]['Checked']==1 and s['by_id'][105]['Checked']==1
        assert s['by_id'][120]['Title']=='Клавиша: NumPad 5' and s['by_id'][121]['Title']=='Клавиша: NumPad +'
        assert archive.read_bytes()==old_archive and config.read_bytes()==old_cfg and cache.read_bytes()==old_cache,'pending choices were applied without clicking Install'
        state('click',108);base.wait(lambda:status()['modVersion']=='1.20.0',timeout=45)
        after=json.loads(config.read_text());assert after['ru'] and after['nearbyLoot'] and after['nearbyLootOptions']['keyCode']=='Numpad5' and after['dungeonOptions']['keyCode']=='NumpadAdd'
        close_window();app.wait(timeout=10);assert app.returncode==0
        print('PASS: pending feature choices and NumPad bindings survive handoff and apply only after the user clicks Install',flush=True)

        # A valid EXE/probe with a broken embedded ZIP must roll back before ASAR writes.
        reset_client();old_archive=archive.read_bytes();old_cfg=config.read_bytes();old_cache=cache.read_bytes()
        target,app,extra=started('rollback',broken);old_hash=hashlib.sha256(parent.read_bytes()).digest()
        path,plan=base.wait(lambda:plan_for(target),timeout=30)
        base.wait(lambda:(json.loads((path.parent/'result.json').read_text()) if (path.parent/'result.json').exists() else None),timeout=65)
        result=json.loads((path.parent/'result.json').read_text());assert result['state']=='rolled-back',result
        base.wait(lambda:(s if (s:=state()) and '1.19.0' in s['Title'] and s['by_id'].get(108,{}).get('Enabled') and s['by_id'][108]['Visible'] else None),timeout=30)
        assert hashlib.sha256(target.read_bytes()).digest()==old_hash,'old EXE not restored'
        assert archive.read_bytes()==old_archive and config.read_bytes()==old_cfg and cache.read_bytes()==old_cache,'failed startup changed game files'
        close_window();app.wait(timeout=10);assert app.returncode==0
        print('PASS: real startup failure rolls back the EXE and restarts the old installer without changing ASAR/settings',flush=True)
        print('PASS: complete native self-updater integration; no external release downloads or publication',flush=True)
    finally:
        # The replacement is a child of the helper, not this Python Popen. Close
        # its own window as well when an assertion interrupts a test scenario.
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
