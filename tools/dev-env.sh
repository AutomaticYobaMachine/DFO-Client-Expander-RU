#!/usr/bin/env bash
# Среда разработки DFO-Client-Expander-RU для Linux/WSL и облачных сессий Claude Code.
#
# Готовит то, что нужно тестам и стендам, но не хранится в репозитории:
#   * исходники оригинала (sparse-клон: src/, vendor/, package.json и три тестовых
#     помощника из test/) с node_modules/acorn и eslint-scope;
#   * чанки опубликованного релиза игры (через tools/fetch-build.mjs);
#   * Node 24+ (документация использует node --test --test-isolation=none);
#   * Playwright и Chromium для tools/test-*-browser.cjs.
# Итог — $DFO_DEV_HOME/env.sh с переменными DFO_*. В облаке его подключает хук
# .claude/hooks/session-start.sh; локально: source ~/.cache/dfo-dev/env.sh
#
#   bash tools/dev-env.sh            подготовить недостающее (повторный запуск быстрый)
#   bash tools/dev-env.sh --update   обновить клон оригинала и взять последний релиз игры
#   bash tools/dev-env.sh --status   показать состояние и проверить, не вышел ли новый релиз
# Ключи: --no-browser, --no-node, --quiet.
# Переменные: DFO_DEV_HOME (по умолчанию ~/.cache/dfo-dev), DFO_GAME_VERSION
# (закрепить версию игры, например 0.1.14550), DFO_DEV_UPSTREAM (готовый checkout
# оригинала вместо клона).
set -uo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
DEV=${DFO_DEV_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/dfo-dev}
ENV_FILE=$DEV/env.sh
BUILDS=$DEV/builds
UPSTREAM_URL=${DFO_UPSTREAM_URL:-https://github.com/Lattymoy/daggerfall-js-source}
UP=${DFO_DEV_UPSTREAM:-$DEV/upstream}
# Что тесты и стенды берут из оригинала (DFO_UPSTREAM_DIR); при новой зависимости дописать сюда.
SPARSE=(/src/ /vendor/ /package.json /test/modsOff.js /test/hostText.mjs /test/net/bodyLootHarness.mjs)
UPDATE=0 STATUS=0 BROWSER=1 WANT_NODE=1 QUIET=0
for arg in "$@"; do
  case $arg in
    --update) UPDATE=1 ;;
    --status) STATUS=1 ;;
    --no-browser) BROWSER=0 ;;
    --no-node) WANT_NODE=0 ;;
    -q | --quiet) QUIET=1 ;;
    -h | --help) sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "dev-env: неизвестный ключ $arg (см. --help)" >&2; exit 2 ;;
  esac
done

say() { if [ "$QUIET" = 0 ]; then printf '%s\n' "$*" >&2; fi; }
warn() { printf 'dev-env: %s\n' "$*" >&2; }
have() { command -v "$1" >/dev/null 2>&1; }
fetch() { curl -fsSL --retry 2 --connect-timeout 20 "$@"; }
newer() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n1)" = "$1" ]; }
latest_game() {
  timeout 20 git ls-remote --tags --refs "$UPSTREAM_URL" 'refs/tags/app-v*' 2>/dev/null |
    sed 's#.*refs/tags/app-v##' | grep -E '^[0-9]+(\.[0-9]+)+$' | sort -V | tail -n1
}
local_builds() { ls -1 "$BUILDS" 2>/dev/null | grep -E '^[0-9]+(\.[0-9]+)+$' | sort -V; }

print_status() {
  (
    set +u
    # shellcheck source=/dev/null
    . "$ENV_FILE"
    echo "Среда DFO подключена ($ENV_FILE, Node $(node -v 2>/dev/null))."
    if [ -n "$DFO_UPSTREAM_DIR" ]; then
      echo "- Исходники оригинала: \$DFO_UPSTREAM_DIR, снимок $(git -C "$DFO_UPSTREAM_DIR" log -1 --format='%h от %cs' 2>/dev/null || echo '?')."
    else
      echo "- Исходников оригинала нет: тесты, которым нужен DFO_UPSTREAM_DIR, пропускаются (skip)."
    fi
    build=
    if [ -n "$DFO_BUILD_DIR" ]; then
      build=${DFO_BUILD_DIR##*/}
      echo "- Чанки релиза игры $build: \$DFO_BUILD_DIR."
    else
      echo "- Релиза игры нет: тесты, которым нужен DFO_BUILD_DIR, пропускаются (skip)."
    fi
    latest=$(latest_game)
    if [ -n "$latest" ] && { [ -z "$build" ] || newer "$latest" "$build"; }; then
      echo "- Опубликован более новый релиз игры $latest: bash tools/dev-env.sh --update, затем node tools/check-build.cjs \"\$DFO_BUILD_DIR\"."
    fi
    if [ -n "$DFO_CHROMIUM_PATH" ]; then
      pw=$(sed -n 's/^ *"version": *"\([^"]*\)".*/\1/p' "$DFO_PLAYWRIGHT_MODULE/package.json" 2>/dev/null | head -n1)
      echo "- Браузерные стенды: Playwright ${pw:-?}, $("$DFO_CHROMIUM_PATH" --version 2>/dev/null | head -n1 | sed 's/ *$//')."
    else
      echo "- Chromium не подготовлен: tools/test-*-browser.cjs не запустятся."
    fi
    if [ -z "$DFO_ARENA2_DIR" ]; then
      echo "- Данных Daggerfall (ARENA2) нет: проверки с DFO_ARENA2_DIR пропускаются; в репозиторий их не добавлять."
    fi
  )
}

if [ "$STATUS" = 1 ]; then
  if [ ! -f "$ENV_FILE" ]; then
    echo "Среда DFO не подготовлена: bash tools/dev-env.sh"
    exit 1
  fi
  print_status
  exit 0
fi

mkdir -p "$DEV" || exit 1
if [ -n "${HTTPS_PROXY:-${https_proxy:-}}" ]; then export NODE_USE_ENV_PROXY=1; fi

# --- Node 24+ -----------------------------------------------------------------
node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
pick_node() {
  local n
  for n in "$(command -v node 2>/dev/null)" /opt/node2[4-9]/bin/node /opt/node[3-9][0-9]/bin/node "$DEV/node/bin/node"; do
    if [ -x "$n" ] && [ "$(node_major "$n")" -ge 24 ]; then echo "$n"; return 0; fi
  done
  return 1
}
install_node() {
  local arch base sums line file tmp
  case $(uname -m) in x86_64 | amd64) arch=x64 ;; aarch64 | arm64) arch=arm64 ;; *) return 1 ;; esac
  base=https://nodejs.org/dist/latest-v24.x
  say "Скачиваю Node 24 с nodejs.org..."
  sums=$(fetch "$base/SHASUMS256.txt") || return 1
  line=$(printf '%s\n' "$sums" | grep -E "  node-v24\.[0-9.]+-linux-$arch\.tar\.xz\$" | head -n1)
  [ -n "$line" ] || return 1
  file=${line##* }
  tmp=$(mktemp -d "$DEV/tmp.XXXXXX") || return 1
  if fetch -o "$tmp/$file" "$base/$file" && (cd "$tmp" && printf '%s\n' "$line" | sha256sum -c --quiet -) &&
    mkdir "$tmp/node" && tar -xJf "$tmp/$file" -C "$tmp/node" --strip-components=1; then
    rm -rf "$DEV/node" && mv "$tmp/node" "$DEV/node"
  fi
  rm -rf "$tmp"
  [ -x "$DEV/node/bin/node" ]
}
NODE_DIR=
NODE=$(pick_node) || NODE=
if [ -z "$NODE" ] && [ "$WANT_NODE" = 1 ]; then
  install_node || warn "Node 24 не установлен (nodejs.org недоступен?)"
  NODE=$(pick_node) || NODE=
fi
if [ -n "$NODE" ]; then
  if [ "$NODE" != "$(command -v node 2>/dev/null)" ]; then NODE_DIR=$(dirname "$NODE"); fi
else
  NODE=$(command -v node) || { warn "Node.js не найден"; exit 1; }
  warn "Node 24+ нет: вместо --test-isolation=none используйте --experimental-test-isolation=none"
fi

# --- Исходники оригинала ------------------------------------------------------
if [ -n "${DFO_DEV_UPSTREAM:-}" ]; then
  [ -d "$UP/src" ] || warn "DFO_DEV_UPSTREAM=$UP не похож на checkout оригинала (нет src/)"
elif [ ! -d "$UP/.git" ]; then
  say "Клонирую исходники оригинала (sparse: ${SPARSE[*]})..."
  rm -rf "$UP.tmp"
  if git clone -q --depth 1 --filter=blob:none --sparse "$UPSTREAM_URL" "$UP.tmp" &&
    git -C "$UP.tmp" sparse-checkout set --no-cone "${SPARSE[@]}"; then
    rm -rf "$UP" && mv "$UP.tmp" "$UP"
  else
    rm -rf "$UP.tmp"
    warn "не удалось клонировать $UPSTREAM_URL"
  fi
elif [ "$UPDATE" = 1 ]; then
  say "Обновляю исходники оригинала..."
  git -C "$UP" fetch -q --depth 1 origin HEAD && git -C "$UP" reset -q --hard FETCH_HEAD ||
    warn "клон оригинала не обновлён"
fi
if [ -z "${DFO_DEV_UPSTREAM:-}" ] && [ -d "$UP/.git" ] &&
  [ "$(git -C "$UP" sparse-checkout list 2>/dev/null)" != "$(printf '%s\n' "${SPARSE[@]}")" ]; then
  git -C "$UP" sparse-checkout set --no-cone "${SPARSE[@]}" || warn "не удалось расширить sparse-checkout оригинала"
fi

# --- acorn и Playwright -------------------------------------------------------
NPM_DIR=$DEV/npm
NPM_ROOT=$(npm root -g 2>/dev/null) || NPM_ROOT=
find_mod() {
  local d
  for d in "$NPM_DIR/node_modules/$1" "/opt/npm-tools/node_modules/$1" "/opt/node-tools/node_modules/$1" \
    ${NPM_ROOT:+"$NPM_ROOT/$1"} "/usr/local/lib/node_modules/$1"; do
    if [ -f "$d/package.json" ] && "$NODE" -e 'require(process.argv[1])' "$d" >/dev/null 2>&1; then
      echo "$d"
      return 0
    fi
  done
  return 1
}
need=()
ACORN=$(find_mod acorn) || { ACORN=; need+=("acorn@^8.18.0"); }
SCOPE=$(find_mod eslint-scope) || { SCOPE=; need+=("eslint-scope@^9"); }
PW=
if [ "$BROWSER" = 1 ]; then PW=$(find_mod playwright) || { PW=; need+=("playwright@^1.56.0"); }; fi
if [ ${#need[@]} -gt 0 ]; then
  say "Устанавливаю ${need[*]} в $NPM_DIR..."
  mkdir -p "$NPM_DIR"
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --prefix "$NPM_DIR" --no-audit --no-fund --loglevel=error "${need[@]}" >&2 ||
    warn "npm install ${need[*]} не удался"
  [ -n "$ACORN" ] || ACORN=$(find_mod acorn) || ACORN=
  [ -n "$SCOPE" ] || SCOPE=$(find_mod eslint-scope) || SCOPE=
  if [ "$BROWSER" = 1 ] && [ -z "$PW" ]; then PW=$(find_mod playwright) || PW=; fi
fi
[ -n "$ACORN" ] || warn "acorn не найден"
[ -n "$SCOPE" ] || warn "eslint-scope не найден"
[ "$BROWSER" = 0 ] || [ -n "$PW" ] || warn "Playwright не найден"
# Тесты и стенды берут acorn, eslint-scope и иногда playwright из node_modules оригинала.
link_mod() {
  local dst=$UP/node_modules/$1
  if [ -n "$2" ] && [ -d "$UP/src" ] && { [ -L "$dst" ] || [ ! -e "$dst" ]; }; then
    mkdir -p "$UP/node_modules" && ln -sfn "$2" "$dst"
  fi
}
link_mod acorn "$ACORN"
link_mod eslint-scope "$SCOPE"
link_mod playwright "$PW"

# --- Chromium -----------------------------------------------------------------
CHROME=
chrome_works() {
  [ -n "$1" ] && [ -x "$1" ] || return 1
  timeout 90 "$NODE" -e '
const {chromium}=require(process.argv[1]);
(async()=>{const b=await chromium.launch({executablePath:process.argv[2],headless:true,args:["--no-sandbox"]});
try{const p=await b.newPage();await p.setContent("<b>ok</b>");if(await p.textContent("b")!=="ok")throw new Error("пустая страница")}
finally{await b.close()}})().catch(e=>{console.error(String(e&&e.message||e));process.exit(1)})' "$PW" "$1" >"$DEV/chromium-check.log" 2>&1
}
pw_chrome() { "$NODE" -e 'process.stdout.write(require(process.argv[1]).chromium.executablePath())' "$PW" 2>/dev/null; }
pick_chrome() {
  local c
  for c in "${DFO_CHROMIUM_PATH:-}" "$(pw_chrome)" "$(PLAYWRIGHT_BROWSERS_PATH=$DEV/ms-playwright pw_chrome)" \
    $(ls -1d "$DEV"/chrome-*/chrome-linux64/chrome 2>/dev/null | sort -rV) \
    $(ls -1d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux*/chrome 2>/dev/null | sort -rV) \
    "$(command -v chromium 2>/dev/null)" "$(command -v google-chrome-stable 2>/dev/null)" "$(command -v google-chrome 2>/dev/null)"; do
    if chrome_works "$c"; then echo "$c"; return 0; fi
  done
  return 1
}
chrome_error() { [ -s "$DEV/chromium-check.log" ] && tail -n2 "$DEV/chromium-check.log" | tr '\n' ' '; }
install_chrome_pw() {
  say "Скачиваю Chromium через Playwright..."
  env -u PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD PLAYWRIGHT_BROWSERS_PATH="$DEV/ms-playwright" \
    timeout 600 "$NODE" "$PW/cli.js" install chromium >&2
}
# Сборки Chromium у Playwright — это Chrome for Testing; его архивы лежат на storage.googleapis.com.
install_chrome_cft() {
  local ver tmp
  [ "$(uname -m)" = x86_64 ] || return 1
  ver=$("$NODE" -e '
const path=require("path");require(process.argv[1]);
const k=Object.keys(require.cache).find(k=>/[\\/]playwright-core[\\/]/.test(k));
const root=k.slice(0,k.lastIndexOf("playwright-core")+"playwright-core".length);
const b=require(path.join(root,"browsers.json")).browsers.find(b=>b.name==="chromium");
process.stdout.write(b.browserVersion)' "$PW" 2>/dev/null) || return 1
  say "Скачиваю Chrome for Testing $ver..."
  tmp=$(mktemp -d "$DEV/tmp.XXXXXX") || return 1
  if fetch -o "$tmp/chrome.zip" "https://storage.googleapis.com/chrome-for-testing-public/$ver/linux64/chrome-linux64.zip" &&
    python3 -I -c '
import os, sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    for i in z.infolist():
        p = z.extract(i, sys.argv[2]); m = i.external_attr >> 16
        if m: os.chmod(p, m & 0o777)' "$tmp/chrome.zip" "$tmp/x"; then
    rm -rf "$DEV/chrome-$ver" && mv "$tmp/x" "$DEV/chrome-$ver"
  fi
  rm -rf "$tmp"
  [ -x "$DEV/chrome-$ver/chrome-linux64/chrome" ]
}
if [ "$BROWSER" = 1 ] && [ -n "$PW" ]; then
  rm -f "$DEV/chromium-check.log"
  CHROME=$(pick_chrome) || CHROME=
  if [ -z "$CHROME" ]; then
    install_chrome_pw || install_chrome_cft || warn "Chromium не скачан (ни через Playwright, ни как Chrome for Testing)"
    CHROME=$(pick_chrome) || CHROME=
  fi
  if [ -z "$CHROME" ] && [ "$(id -u)" = 0 ] && have apt-get; then
    say "Ставлю системные библиотеки для Chromium (playwright install-deps)..."
    timeout 900 "$NODE" "$PW/cli.js" install-deps chromium >&2 || warn "playwright install-deps не удался"
    CHROME=$(pick_chrome) || CHROME=
  fi
  if [ -z "$CHROME" ]; then
    err=$(chrome_error)
    warn "Chromium не найден или не запускается${err:+: $err}"
  fi
fi

# --- Чанки опубликованного релиза игры ----------------------------------------
VER=${DFO_GAME_VERSION:-}
if [ -z "$VER" ]; then
  VER=$(local_builds | tail -n1)
  if [ -z "$VER" ] || [ "$UPDATE" = 1 ]; then
    LATEST=$(latest_game)
    if [ -n "$LATEST" ]; then VER=$LATEST; else warn "не удалось узнать последний релиз оригинала"; fi
  fi
fi
if [ -n "$VER" ] && [ ! -d "$BUILDS/$VER/assets" ]; then
  say "Скачиваю чанки релиза игры $VER..."
  mkdir -p "$BUILDS" && rm -rf "$BUILDS/$VER.tmp"
  if (cd "$REPO" && "$NODE" tools/fetch-build.mjs "$VER" "$BUILDS/$VER.tmp" >&2) && [ -d "$BUILDS/$VER.tmp/assets" ]; then
    mv "$BUILDS/$VER.tmp" "$BUILDS/$VER"
  else
    rm -rf "$BUILDS/$VER.tmp"
    warn "релиз игры $VER не скачан"
    VER=$(local_builds | tail -n1)
  fi
fi
# Хранить три последних релиза (и выбранный).
local_builds | head -n -3 | while read -r old; do
  if [ "$old" != "$VER" ]; then rm -rf "${BUILDS:?}/$old"; fi
done

# --- env.sh -------------------------------------------------------------------
ex() { if [ -n "$2" ]; then printf 'export %s=%q\n' "$1" "$2"; fi; }
{
  echo "# Создано tools/dev-env.sh $(date -u '+%Y-%m-%d %H:%M UTC'). Не править: перезапустите скрипт."
  if [ -n "$NODE_DIR" ]; then
    printf 'case ":$PATH:" in *:%s:*) ;; *) PATH=%q:$PATH ;; esac\nexport PATH\n' "$NODE_DIR" "$NODE_DIR"
  fi
  ex DFO_DEV_HOME "$DEV"
  if [ -d "$UP/src" ]; then ex DFO_UPSTREAM_DIR "$UP"; fi
  if [ -n "$VER" ] && [ -d "$BUILDS/$VER/assets" ]; then ex DFO_BUILD_DIR "$BUILDS/$VER"; fi
  ex DFO_ACORN_MODULE "$ACORN"
  ex DFO_PLAYWRIGHT_MODULE "$PW"
  ex DFO_CHROMIUM_PATH "$CHROME"
  ex DFO_CHROMIUM "$CHROME"
  if [ -n "${NODE_USE_ENV_PROXY:-}" ]; then echo 'export NODE_USE_ENV_PROXY=1'; fi
} >"$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE" || { warn "не удалось записать $ENV_FILE"; exit 1; }

if [ "$QUIET" = 0 ]; then print_status; fi
exit 0
