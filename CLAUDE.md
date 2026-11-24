@AGENTS.md

# Claude Code

Правила проекта — в AGENTS.md выше; их ведут и другие ассистенты, поэтому новые
правила о самом моде записывайте туда, а не сюда. Здесь — только работа в Claude Code.
Пользователю отвечайте по-русски.

## Среда

- В облачной сессии хук SessionStart (.claude/hooks/session-start.sh) запускает
  tools/dev-env.sh и подключает `$DFO_DEV_HOME/env.sh` ко всем командам:
  DFO_UPSTREAM_DIR (sparse-снимок оригинала), DFO_BUILD_DIR (чанки опубликованного
  релиза игры), DFO_ACORN_MODULE, DFO_PLAYWRIGHT_MODULE, DFO_CHROMIUM_PATH/DFO_CHROMIUM
  и Node 24 в PATH (нужен для `node --test --test-isolation=none` из документации).
- Состояние и наличие нового релиза игры: `bash tools/dev-env.sh --status`.
  Взять новый релиз и обновить снимок оригинала: `bash tools/dev-env.sh --update`.
- Браузерным стендам, которые принимают каталоги аргументами, передавайте
  `"$DFO_UPSTREAM_DIR" "$DFO_BUILD_DIR"`.
- Данных Daggerfall (ARENA2) в среде нет — проверки с DFO_ARENA2_DIR пропускаются.
  Windows-проверки (tools/test-installer-ui.py, tools/test-updater-ui.py, сам EXE)
  в облаке не запускаются: о них говорите честно, что не проверены.
- Подробности и настройка облачного окружения — docs/claude-code.md.

## Проверки

- Как в CI (.github/workflows/build.yml): `sh tools/build.sh`, затем
  `(cd src/gui && go test ./...)` и `node --test` со списком тестов из build.yml.
- Без DFO_UPSTREAM_DIR/DFO_BUILD_DIR/ARENA2 часть тестов помечается `# SKIP`
  (без среды — 71 из 156, со средой — только 4, которым нужен ARENA2).
  Прежде чем писать «тесты прошли», посмотрите строку `ℹ skipped` в итоге и
  назовите пропущенное.
- Совместимость с новым релизом игры: `node tools/check-build.cjs "$DFO_BUILD_DIR"`
  проверяет только места хуков и синтаксис, а не работу в живой игре
  (полный сценарий — навык /check-game-release).
- tools/test-item-card-stand.cjs перезаписывает PNG в docs/. Если картинки
  не входят в задачу, верните их (`git checkout -- docs/*.png`) до коммита.

## Git

- Работайте в отдельной ветке и предлагайте PR в main; коммит и push — когда
  пользователь просит.
- Теги из облачной сессии не отправляются (GitHub-прокси пропускает только ветки).
  Релиз (тег vX.Y.Z → release.yml) выпускает пользователь: локально или через
  GitHub → Releases → Draft a new release. Нужен docs/releases/<версия>.md.
