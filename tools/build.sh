#!/bin/sh
# Assemble the distributable folder: dist/DFO_Mod (and dist/DFO_Mod.zip). Needs Go for the installer's window.
set -e
cd "$(dirname "$0")/.."
OUT=dist/DFO_Mod
rm -rf dist && mkdir -p "$OUT/patcher" "$OUT/mod/page" "$OUT/data"
cp src/patcher.cjs src/asar.cjs src/ru-build.cjs "$OUT/patcher/"
cp src/mod/hook.cjs src/mod/transforms.cjs src/mod/version.json "$OUT/mod/"
cp src/mod/page/dfo_marks.js src/mod/page/dfo_town.js src/mod/page/ru_locale.js src/mod/page/ru_items.js "$OUT/mod/page/"
cp -r data/ru data/ru-pack data/ru_shell.json "$OUT/data/"
cp README.txt "$OUT/"
(cd src/gui && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-H windowsgui -s -w" -o "../../$OUT/DFO_Mod.exe" .)
python3 -I tools/zipdir.py dist/DFO_Mod dist/DFO_Mod.zip
echo "built $(du -sh dist/DFO_Mod.zip | cut -f1)"
