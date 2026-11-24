'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const fontStore = require('../src/mod/font-store.cjs');
const dfoFonts = require('../src/mod/page/dfo_fonts.js');

function fakeFont(magic, fillByte) {
  const buf = Buffer.alloc(64, fillByte);
  Buffer.isBuffer(magic) ? magic.copy(buf, 0) : Buffer.from(magic, 'ascii').copy(buf, 0);
  return buf;
}

test('modular font store validates binaries, isolates all 8 slots, migrates legacy narrative, prunes orphans, and falls back gracefully', () => {
  assert.equal(fontStore.SLOTS.length, 8);
  assert.deepEqual(fontStore.SLOTS.map(s => s.id), ['body', 'title', 'description', 'number', 'book', 'power', 'sigil', 'set']);
  assert.deepEqual(dfoFonts.slotDefs.map(s => s.id), fontStore.SLOTS.map(s => s.id));
  assert.doesNotMatch(dfoFonts.stacks.description, /DFO Ckazka/, 'description/prose stack must not contain Ckazka');
  assert.ok(dfoFonts.stacks.description.indexOf('DFO Base Text') < dfoFonts.stacks.description.indexOf('DFO Base Num'), 'text stacks must prefer Base Text before Base Num');
  assert.ok(dfoFonts.stacks.number.indexOf('DFO Base Num') < dfoFonts.stacks.number.indexOf('DFO Base Text'), 'number stack must prefer Base Num before Base Text');

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dfo-font-store-'));
  try {
    const profile = path.join(temp, 'userData');
    const store = fontStore.createFontStore(profile);

    // Default state: all 8 slots use built-in base community preset
    const init = store.ensureDefault();
    assert.equal(init.activePreset, 'default');
    assert.equal(init.customCount, 0);
    assert.ok(fs.existsSync(store.presetPath));

    // Reject invalid bytes and unsupported extensions
    const badPath = path.join(temp, 'not-a-font.ttf');
    fs.writeFileSync(badPath, Buffer.from('hello world, not a font binary'));
    assert.throws(() => store.setSlot('body', badPath), /Invalid font/);
    const ttcRenamed = path.join(temp, 'collection.ttf');
    fs.writeFileSync(ttcRenamed, fakeFont('ttcf', 0x33));
    assert.throws(() => store.setSlot('body', ttcRenamed), /Invalid font/, 'TrueType collections (.ttc renamed to .ttf) must be rejected');
    const wrongExt = path.join(temp, 'font.png');
    fs.writeFileSync(wrongExt, fakeFont(Buffer.from([0x00, 0x01, 0x00, 0x00]), 1));
    assert.throws(() => store.setSlot('body', wrongExt), /Unsupported font/);

    // Override description (.ttf) and power (.woff2) independently — sigil stays on base Ckazka!
    const proseFont = path.join(temp, 'PTSerif Regular.ttf');
    const powerFont = path.join(temp, 'Runic.woff2');
    fs.writeFileSync(proseFont, fakeFont(Buffer.from([0x00, 0x01, 0x00, 0x00]), 0x11));
    fs.writeFileSync(powerFont, fakeFont('wOF2', 0x22));

    let st = store.setSlot('description', proseFont);
    st = store.setSlot('power', powerFont);
    assert.equal(st.activePreset, 'custom');
    assert.equal(st.customCount, 2);
    assert.equal(st.slots.description.mode, 'custom');
    assert.equal(st.slots.description.format, 'truetype');
    assert.equal(st.slots.power.mode, 'custom');
    assert.equal(st.slots.power.format, 'woff2');
    assert.equal(st.slots.sigil.mode, 'base', 'overriding description must never mutate sigil');

    // Generated CSS uses revisioned user-fonts URLs ONLY for overridden slots,
    // while keeping clean immutable base URLs (?dfo=VERSION) & base fallbacks for others
    const clientCfg = store.clientConfig();
    const sheet = dfoFonts.css('dagger://game/dfo-mod/', '1.30.0', clientCfg);
    assert.match(sheet, /font-family:'DFO Flow';src:url\("dagger:\/\/game\/dfo-mod\/user-fonts\/[^"]*PTSerif_Regular\.ttf\?dfo=1\.30\.0-[0-9a-f]{12}"\) format\('truetype'\),url\("dagger:\/\/game\/dfo-mod\/item-font-description\.otf\?dfo=1\.30\.0"\) format\('opentype'\)/);
    assert.match(sheet, /font-family:'DFO Wolga';src:url\("dagger:\/\/game\/dfo-mod\/user-fonts\/[^"]*Runic\.woff2\?dfo=1\.30\.0-[0-9a-f]{12}"\) format\('woff2'\),url\("dagger:\/\/game\/dfo-mod\/item-font-legendary\.otf\?dfo=1\.30\.0"\) format\('opentype'\)/);
    assert.match(sheet, /font-family:'DFO Ckazka';src:url\("dagger:\/\/game\/dfo-mod\/item-font-sigil\.ttf\?dfo=1\.30\.0"\)/);
    assert.match(sheet, /font-family:'DFO Base Text';src:url\("dagger:\/\/game\/dfo-mod\/item-font-text\.ttf\?dfo=1\.30\.0"\)/);
    assert.match(sheet, /font-family:'DFO Base Num';src:url\("dagger:\/\/game\/dfo-mod\/item-font-numbers\.ttf\?dfo=1\.30\.0"\)/);
    const cachedBuf = store.readFileBuffer(st.slots.description.file);
    assert.ok(cachedBuf && cachedBuf.buf.length === 64 && cachedBuf.mime === 'font/ttf');

    // Bundle script is valid JS setting globalThis.__dfoFontPreset
    const js = store.bundle();
    assert.match(js, /^globalThis\.__dfoFontPreset=\{/);

    // Path traversal is blocked by resolveFile
    assert.equal(store.resolveFile('../preset.json'), null);
    assert.equal(store.resolveFile('..\\preset.json'), null);
    assert.equal(store.resolveFile('sub/file.ttf'), null);

    // If user manually deletes a stored file from disk, store gracefully falls back to base without throwing
    const storedPower = st.slots.power.file;
    fs.unlinkSync(path.join(store.filesDir, storedPower));
    const afterDelete = store.read();
    assert.equal(afterDelete.slots.power.mode, 'base');
    assert.equal(afterDelete.customCount, 1);

    // Legacy preset.json with `narrative` slot migrates cleanly into merged `description` slot
    const storedDesc = st.slots.description.file;
    fs.writeFileSync(store.presetPath, JSON.stringify({
      schema: 1,
      activePreset: 'custom',
      slots: { narrative: { mode: 'custom', file: storedDesc, label: 'LegacyChat.ttf', format: 'truetype' }, description: { mode: 'base' } },
    }));
    const migrated = store.read();
    assert.equal(migrated.slots.description.mode, 'custom');
    assert.equal(migrated.slots.description.file, storedDesc);
    assert.equal(migrated.slots.description.label, 'LegacyChat.ttf');

    // Resetting description prunes its orphan binary from files/
    const afterReset = store.resetSlot('description');
    assert.equal(afterReset.customCount, 0);
    assert.equal(afterReset.activePreset, 'default');
    assert.equal(fs.existsSync(path.join(store.filesDir, storedDesc)), false);

    // Corrupted stored binary on disk fails magic check (graceful fallback to base) and self-heals on re-set
    const allCustom = store.setAllSlots(proseFont);
    assert.equal(allCustom.customCount, 8);
    assert.equal(fs.readdirSync(store.filesDir).length, 1);
    const cachedFile = path.join(store.filesDir, allCustom.slots.description.file);
    fs.writeFileSync(cachedFile, Buffer.from('not-a-valid-font-header-anymore'));
    const afterCorrupt = store.read();
    assert.equal(afterCorrupt.customCount, 0, 'corrupted file on disk must fall back to base');
    const healed = store.setSlot('description', proseFont);
    assert.equal(healed.slots.description.mode, 'custom', 're-setting slot must self-heal corrupted cached binary');

    // Missing custom font file later restored on disk must invalidate snapshot cache immediately without touching preset.json
    const restoredFile = path.join(store.filesDir, healed.slots.description.file);
    const savedBytes = fs.readFileSync(restoredFile);
    fs.unlinkSync(restoredFile);
    assert.equal(store.read().slots.description.mode, 'base', 'missing file falls back to base');
    fs.writeFileSync(restoredFile, savedBytes);
    assert.equal(store.read().slots.description.mode, 'custom', 'restored file must invalidate snapshot cache and reactivate custom slot');

    // Same-size corrupted body bytes must still be repaired on re-import
    const sameSizeBad = Buffer.from(savedBytes);
    sameSizeBad[sameSizeBad.length - 1] ^= 0xff;
    fs.writeFileSync(restoredFile, sameSizeBad);
    store.setSlot('description', proseFont);
    assert.deepEqual(fs.readFileSync(restoredFile), savedBytes, 're-import must overwrite same-size corrupted cached binary');

    // Misnamed webfont (wOF2 bytes saved with .ttf extension) normalizes stored extension, format & MIME to woff2 while preserving label
    const misnamedWoff2 = path.join(temp, 'MisnamedWebFont.ttf');
    fs.writeFileSync(misnamedWoff2, Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(60, 0x33)]));
    const fixedWoff2 = store.setSlot('body', misnamedWoff2);
    assert.equal(fixedWoff2.slots.body.format, 'woff2');
    assert.equal(fixedWoff2.slots.body.label, 'MisnamedWebFont.ttf');
    assert.match(fixedWoff2.slots.body.file, /\.woff2$/);
    assert.equal(store.readFileBuffer(fixedWoff2.slots.body.file)?.mime, 'font/woff2');

    const allBase = store.resetAll();
    assert.equal(allBase.customCount, 0);
    assert.equal(fs.readdirSync(store.filesDir).length, 0);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('Go installer fontSlots match Node font-store SLOTS 1:1', () => {
  const goSrc = fs.readFileSync(path.join(__dirname, '../src/gui/fonts_preset.go'), 'utf8');
  const goIds = [...goSrc.matchAll(/\{ID:\s*"([a-z]+)",\s*BaseLabel:/g)].map(m => m[1]);
  assert.deepEqual(goIds, fontStore.SLOTS.map(s => s.id));
});
