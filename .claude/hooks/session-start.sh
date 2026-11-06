#!/usr/bin/env bash
# SessionStart (startup|resume): подключает среду разработки DFO в облачной сессии
# Claude Code — запускает tools/dev-env.sh и передаёт переменные DFO_* всем командам
# сессии через CLAUDE_ENV_FILE. Вывод попадает в контекст Claude.
# Локально ничего не делает; включить вручную: DFO_DEV_ENV=1. См. docs/claude-code.md.
[ "${CLAUDE_CODE_REMOTE:-}" = true ] || [ "${DFO_DEV_ENV:-}" = 1 ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
DEV=${DFO_DEV_HOME:-${XDG_CACHE_HOME:-$HOME/.cache}/dfo-dev}
mkdir -p "$DEV" || exit 0

if ! bash tools/dev-env.sh --quiet >"$DEV/dev-env.log" 2>&1; then
  echo "Подготовка среды DFO завершилась с ошибкой, журнал: $DEV/dev-env.log"
fi
if [ -f "$DEV/env.sh" ]; then
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    line=". '$DEV/env.sh'"
    grep -qxF "$line" "$CLAUDE_ENV_FILE" 2>/dev/null || printf '%s\n' "$line" >>"$CLAUDE_ENV_FILE"
  fi
  bash tools/dev-env.sh --status
  grep '^dev-env:' "$DEV/dev-env.log" | head -n5
fi
exit 0
