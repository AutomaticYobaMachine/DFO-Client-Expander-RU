#!/bin/sh
# Build a standalone Windows installer and its optional ZIP. Go 1.24+ and Python 3.
set -e
cd "$(dirname "$0")/.."
VERSION=$(python3 -c 'import json;print(json.load(open("src/mod/version.json"))["version"])')
OUT=dist/DFO-Client-Expander-RU
PAYLOAD=dist/payload
ARCHIVES=$(mktemp -d "${TMPDIR:-/tmp}/dfo-build.XXXXXX")
trap 'rm -rf "$ARCHIVES"' EXIT HUP INT TERM
for archive in dist/DFO_Mod-[0-9]*.zip* dist/DFO-Client-Expander-RU-[0-9]*.zip* dist/DFO-Client-Expander-RU-[0-9]*.exe*; do
  if [ -f "$archive" ]; then cp "$archive" "$ARCHIVES/"; fi
done
rm -rf dist
mkdir -p "$PAYLOAD/patcher" "$PAYLOAD/mod/page" "$PAYLOAD/mod/fonts" "$PAYLOAD/data" "$OUT/licenses"
cp src/patcher.cjs src/asar.cjs src/ru-build.cjs "$PAYLOAD/patcher/"
cp src/mod/inventory-trace-store.cjs src/mod/hook.cjs src/mod/transforms.cjs src/mod/nearby-loot-transform.cjs src/mod/loot-tags-transform.cjs src/mod/dungeon-transform.cjs src/mod/dungeon-live-transform.cjs src/mod/dungeon-nav-transform.cjs src/mod/loot-store.cjs src/mod/inventory-transform.cjs src/mod/version.json "$PAYLOAD/mod/"
cp src/mod/page/dfo_inventory_trace.js src/mod/page/dfo_dungeon_model.js src/mod/page/dfo_dungeons.js src/mod/page/dfo_dungeon_live_model.js src/mod/page/dfo_dungeon_live.js src/mod/page/dfo_dungeon_graph.js src/mod/page/dfo_dungeon_nav_model.js src/mod/page/dfo_dungeon_nav.js src/mod/page/dfo_loot_rules.js src/mod/page/dfo_loot_ui.js src/mod/page/dfo_loot.js src/mod/page/dfo_pack_data.js src/mod/page/dfo_pack_rules.js src/mod/page/dfo_pack.js src/mod/page/dfo_marks.js src/mod/page/dfo_town.js src/mod/page/ru_locale.js src/mod/page/ru_items.js "$PAYLOAD/mod/page/"
cp src/mod/item-cards-transform.cjs "$PAYLOAD/mod/"
cp src/mod/fonts-transform.cjs "$PAYLOAD/mod/"
cp src/mod/ui-calibration-transform.cjs "$PAYLOAD/mod/"
cp src/mod/service-windows-transform.cjs "$PAYLOAD/mod/"
cp src/mod/page/dfo_services.js src/mod/page/dfo_service_details.js "$PAYLOAD/mod/page/"
cp src/mod/font-assets.cjs "$PAYLOAD/mod/"
cp src/mod/page/dfo_fonts.js src/mod/page/dfo_font_data.js "$PAYLOAD/mod/page/"
cp src/mod/page/dfo_item_cards.js "$PAYLOAD/mod/page/"
cp src/mod/item-text.cjs "$PAYLOAD/mod/"
cp src/mod/page/dfo_item_text.js src/mod/page/dfo_ui_text.js "$PAYLOAD/mod/page/"
cp -r src/mod/item-text "$PAYLOAD/mod/"
cp src/mod/fonts/* "$PAYLOAD/mod/fonts/"
cp -r data/ru data/ru-pack data/ru_shell.json "$PAYLOAD/data/"
cp README.txt README-EN.txt "$PAYLOAD/"
python3 - <<'PY'
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED,ZipInfo
root=Path('dist/payload')
with ZipFile('src/gui/payload_windows.zip','w',compression=ZIP_DEFLATED,compresslevel=9) as z:
    for f in sorted(root.rglob('*')):
        if f.is_file():
            info=ZipInfo(f.relative_to(root).as_posix(),(2026,1,1,0,0,0))
            info.compress_type=ZIP_DEFLATED
            z.writestr(info,f.read_bytes())
PY
python3 tools/windows-resources.py
cp README.txt README-EN.txt "$OUT/"
cp data/ru-pack/LICENSE "$OUT/licenses/DG_RU-LICENSE.txt"
cp data/ru-src/en/README.md "$OUT/licenses/Translation-sources.md"
cp src/mod/fonts/FONT-NOTICES.txt "$OUT/licenses/Item-card-fonts.txt"
(cd src/gui && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -s -w" -o "../../$OUT/DFO-Client-Expander-RU.exe" .)
cp "$OUT/DFO-Client-Expander-RU.exe" "dist/DFO-Client-Expander-RU-$VERSION.exe"
python3 -I tools/zipdir.py "$OUT" "dist/DFO-Client-Expander-RU-$VERSION.zip"
python3 - "$VERSION" <<'PY'
import hashlib,pathlib,sys
for ext in ('exe','zip'):
    p=pathlib.Path('dist')/('DFO-Client-Expander-RU-'+sys.argv[1]+'.'+ext)
    p.with_name(p.name+'.sha256').write_text(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n')
PY
for archive in "$ARCHIVES/"*; do
  if [ -f "$archive" ] && [ ! -e "dist/${archive##*/}" ]; then cp "$archive" dist/; fi
done
echo "built DFO-Client-Expander-RU $VERSION ($(du -sh "dist/DFO-Client-Expander-RU-$VERSION.exe" | cut -f1))"
