# Работа над проектом в Claude Code

Репозиторий настроен так, чтобы облачная сессия Claude Code
(claude.ai/code, вкладка Code в приложении Claude или `claude --cloud`) сама
готовила всё, что нужно тестам и стендам, и сразу могла собирать установщик и
проверять мод на последнем опубликованном релизе игры.

## Что лежит в репозитории

| Файл | Назначение |
| --- | --- |
| `CLAUDE.md` | Подключает `AGENTS.md` (общие правила проекта) и добавляет заметки для Claude Code. Правила о самом моде по-прежнему пишутся в `AGENTS.md`. |
| `.claude/settings.json` | Хук запуска сессии, разрешения на обычные проверки, подтверждение перед тегами, релизами и `build-ru-pack.py`. |
| `.claude/hooks/session-start.sh` | В облачной сессии запускает `tools/dev-env.sh` и передаёт переменные `DFO_*` всем командам. Локально ничего не делает. |
| `tools/dev-env.sh` | Готовит среду на Linux/WSL/в облаке; повторный запуск занимает секунды. |
| `.claude/skills/check-game-release/` | Сценарий «проверить мод на новом релизе игры» (команда `/check-game-release`). |

`tools/dev-env.sh` складывает всё в `~/.cache/dfo-dev` (или `$DFO_DEV_HOME`):

- `upstream/` — sparse-снимок оригинала `Lattymoy/daggerfall-js-source`:
  `src/`, `vendor/`, `package.json` и три помощника из `test/`. В
  `upstream/node_modules` — ссылки на acorn, eslint-scope и Playwright.
  Это `DFO_UPSTREAM_DIR`.
- `builds/<версия>/` — чанки опубликованного релиза игры, которые трогает мод
  (`tools/fetch-build.mjs`, около тысячи файлов, полминуты). Это `DFO_BUILD_DIR`.
  Хранятся три последних релиза.
- Node 24 (если в системе нет), Playwright и Chromium — `DFO_PLAYWRIGHT_MODULE`,
  `DFO_CHROMIUM_PATH`/`DFO_CHROMIUM`.
- `env.sh` — итоговые переменные.

Данных Daggerfall (ARENA2) в среде нет и не будет: проверки с `DFO_ARENA2_DIR`
пропускаются. Окна установщика под Windows (`tools/test-installer-ui.py`,
`tools/test-updater-ui.py`) и живая игра в облаке тоже не проверяются.

## Как начать в облаке

1. Откройте [claude.ai/code](https://claude.ai/code) и выберите репозиторий
   `AutomaticYobaMachine/DFO-Client-Expander-RU`. Если его нет в списке,
   установите Claude GitHub App на этот репозиторий.
2. Окружение: подходит **Default** с доступом к сети **Trusted**. В этом списке
   уже есть всё нужное: GitHub (снимок оригинала и релизы игры), nodejs.org,
   registry.npmjs.org, storage.googleapis.com (Chrome for Testing) и
   archive.ubuntu.com (системные библиотеки Chromium). Переменные окружения
   задавать не нужно.
3. Начните сессию. Перед первым ответом хук готовит среду и сообщает Claude, что
   готово: версию релиза игры, снимок оригинала, Chromium и вышел ли новый релиз.
   На чистой машине это занимает от 40 секунд до нескольких минут: если в образе
   нет Chromium, он скачивается вместе с системными библиотеками.

### Необязательно: скрипт настройки для кэша окружения

Каждая новая облачная сессия начинается с чистой машины, поэтому хук готовит
среду заново. Чтобы подготовка попадала в кэш окружения, вставьте в настройках
окружения (Environment → Setup script) следующий скрипт:

```bash
#!/bin/bash
# DFO-Client-Expander-RU: заранее готовим среду, чтобы она попала в кэш окружения.
for f in "$PWD"/tools/dev-env.sh /home/*/*/tools/dev-env.sh /root/*/tools/dev-env.sh; do
  if [ -f "$f" ] && grep -q DFO-Client-Expander-RU "$f"; then
    timeout 280 bash "$f" --quiet || true
    break
  fi
done
exit 0
```

Если репозиторий к моменту запуска этого скрипта ещё не склонирован, скрипт
ничего не сделает, и среду, как и без него, подготовит хук. Кэш живёт до семи дней.
Новый релиз игры хук при этом не пропустит: он сообщит о нём, а
`bash tools/dev-env.sh --update` скачает его за полминуты.

## Повседневные команды

```sh
bash tools/dev-env.sh --status   # что подготовлено и не вышел ли новый релиз игры
bash tools/dev-env.sh --update   # обновить снимок оригинала и взять последний релиз

# как в CI (.github/workflows/build.yml)
sh tools/build.sh
(cd src/gui && go test ./...)
node --test test/*.test.cjs

# хуки на выбранном релизе: только места вставки и синтаксис, не работа в игре
node tools/check-build.cjs "$DFO_BUILD_DIR"

# браузерные стенды
node tools/test-item-card-stand.cjs
node tools/test-dungeons-browser.cjs "$DFO_UPSTREAM_DIR" "$DFO_BUILD_DIR"
node tools/test-dungeon-live-browser.cjs "$DFO_UPSTREAM_DIR" "$DFO_BUILD_DIR"
```

Закрепить конкретную версию игры можно переменной `DFO_GAME_VERSION`
(например, `DFO_GAME_VERSION=0.1.14550 bash tools/dev-env.sh`).

## Релизы

Из облачной сессии теги в GitHub не отправляются: прокси GitHub пропускает
только ветки. Claude готовит ветку с изменениями, `src/mod/version.json` и
`docs/releases/<версия>.md`, а релиз выпускаете вы: тегом `vX.Y.Z` локально или
через GitHub → Releases → Draft a new release. Тег запускает `release.yml`.

## Локальная работа

- **Windows.** Claude Code в папке репозитория (терминал или приложение Claude
  Desktop) читает те же `CLAUDE.md` и `.claude/`. Хук локально ничего не
  скачивает. Для сборки нужны Go 1.24+, Python 3 и `sh` (Git Bash). Тесты, которым
  нужны исходники оригинала, удобнее запускать в WSL.
- **Linux/WSL.** `bash tools/dev-env.sh`, затем `source ~/.cache/dfo-dev/env.sh`.
  Чтобы хук делал это сам и в локальных сессиях, задайте `DFO_DEV_ENV=1`.

## Что проверено при настройке (6 ноября 2026)

- Подготовка с нуля: релиз игры 0.1.14550, снимок оригинала a3eb160
  от 2 ноября 2026, Node 24, Playwright 1.63, Chromium 153.
- `sh tools/build.sh`, `go test ./...`, проверка SHA-256: успешно.
- `node --test test/*.test.cjs`: 156 тестов, 152 прошли, 4 пропущены (нужен
  ARENA2), 0 упали. Для сравнения: без переменных среды тот же запуск даёт
  85 прошедших и 71 пропущенный.
- `node tools/check-build.cjs` на 0.1.14550: все ожидаемые хуки найдены,
  ошибок синтаксиса нет.
- Стенды `test-item-card-stand`, `test-dungeons-browser` и
  `test-dungeon-live-browser` проходят. `test-nearby-loot-browser` падает на
  проверке имени файла при сохранении пресета: Chromium сохраняет его как
  `download` вместо `Лут J.json`. Причина пока не выяснялась.
- Скачивание Node, Chromium и npm-пакетов при их отсутствии написано под
  список Trusted облака, но на этой машине его не проверить: соответствующие
  адреса здесь закрыты. Первая облачная сессия покажет результат в начале
  разговора и в `~/.cache/dfo-dev/dev-env.log`.
