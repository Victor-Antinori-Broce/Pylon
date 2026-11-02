#!/usr/bin/env bash
#
# Reparte en tandas revisables lo que hay pendiente en el arbol de trabajo.
# ============================================================================
#
# POR QUE EXISTE
#
# El arbol tenia ~1500 ficheros sin trackear o modificados. Un `git add .` los
# mete todos en un commit que nadie puede revisar; ir uno a uno no acaba nunca.
# Esto los agrupa en tandas coherentes y ordenadas por dependencia: lo que
# importan los demas va primero.
#
# ESTE SCRIPT NO COMMITEA. Escenifica una tanda y te ensena que ha escenificado,
# junto con el mensaje de commit sugerido. El commit lo haces tu.
#
# USO
#   scripts/stage-batches.sh list          ver las tandas y cuantos ficheros hay
#   scripts/stage-batches.sh check         comprobar que ningun fichero se queda fuera
#   scripts/stage-batches.sh <tanda>       escenificar esa tanda (sin commitear)
#   scripts/stage-batches.sh <tanda> --dry  ver que escenificaria, sin tocar el indice
#
# ORDEN SUGERIDO
#   infra → base → kons → api → admin → grimoires → tooling → tests → docs
#
# La tanda `scratch` esta a proposito fuera de ese orden: son ficheros sueltos
# de trabajo (volcados de errores de tsc, scripts de comprobar la base a mano).
# Revisalos antes de decidir; lo mas probable es que toque borrarlos, no
# commitearlos.

set -euo pipefail
cd "$(dirname "$0")/.."

TANDAS=(infra base kons api admin grimoires tooling tests docs scratch)

descripcion() {
  case "$1" in
    infra)     echo "configuracion del repo, docker y CI" ;;
    base)      echo "shared + engine + core + schemas (lo que importa todo lo demas)" ;;
    kons)      echo "los 33 kons" ;;
    api)       echo "apps/api" ;;
    admin)     echo "packages/admin" ;;
    grimoires) echo "grimoires, starters y realms" ;;
    tooling)   echo "cli, mcp-server, sdks, codegen, testing y scripts" ;;
    tests)     echo "suite de tests" ;;
    docs)      echo "documentacion" ;;
    scratch)   echo "ficheros sueltos de trabajo — REVISAR, probablemente borrar" ;;
  esac
}

mensaje() {
  case "$1" in
    infra)     echo "chore: versionar configuracion de repo, docker y CI" ;;
    base)      echo "feat: versionar shared, engine, core y schemas" ;;
    kons)      echo "feat: versionar los kons" ;;
    api)       echo "feat: versionar apps/api" ;;
    admin)     echo "feat: versionar el panel de administracion" ;;
    grimoires) echo "feat: versionar grimoires, starters y realms" ;;
    tooling)   echo "feat: versionar cli, sdks y utilidades" ;;
    tests)     echo "test: versionar la suite" ;;
    docs)      echo "docs: versionar la documentacion" ;;
    scratch)   echo "chore: ficheros sueltos (revisar antes)" ;;
  esac
}

# A que tanda pertenece un fichero. Primer patron que encaja gana, asi que el
# orden de los casos importa: lo especifico antes que lo general.
tanda_de() {
  case "$1" in
    .claude/*.py) echo scratch ;;
    .claude/*) echo infra ;;
    check-db*.mjs|test-kon-mount.mjs|test-grimoire-mount.mjs|fix_a11y.py|tmp_audit_imports.py) echo scratch ;;
    tserrors-*.txt|build-diag*.txt|progress.txt|gremius_progress.txt|tests.json|mcp-agent.sql|update-scopes.sql|.cl.json) echo scratch ;;

    .github/*|.gitignore|.dockerignore|.prettierignore|docker/*|docker-compose*.yml) echo infra ;;
    package.json|pnpm-*.yaml|pnpm-*.lock|tsconfig.json|eslint.config.js|vitest.config.ts) echo infra ;;
    playwright.config.ts|bunfig.toml|.env*|start.bat|LICENSE|bun.lock) echo infra ;;

    packages/shared/*|packages/engine/*|packages/core/*|packages/schemas/*) echo base ;;
    packages/kons/*) echo kons ;;
    apps/*) echo api ;;
    packages/admin/*) echo admin ;;
    packages/grimoires/*|packages/starters/*|packages/realms/*) echo grimoires ;;
    packages/cli/*|packages/mcp-server/*|packages/sdk*|packages/codegen/*) echo tooling ;;
    packages/testing/*|packages/kitsuden/*|packages/orm/*|scripts/*) echo tooling ;;
    tests/*|specs/*) echo tests ;;
    docs/*|*.md) echo docs ;;

    *) echo SIN_TANDA ;;
  esac
}

# Lo que esta pendiente de escenificar: sin trackear (??) o cambiado en el
# arbol respecto al indice (segunda columna del porcelain). Lo que ya esta
# SOLO en el indice queda fuera a proposito — ver avisar_si_indice_sucio.
pendientes() {
  git status --porcelain --untracked-files=all \
    | grep -E '^(\?\?|.[MDAR])' \
    | sed 's/^...//' | sed 's/^"\(.*\)"$/\1/'
}

# El indice ya traia 425 borrados escenificados cuando se escribio esto: el
# `test-vibecoder-app` que genera la CLI, los lockfiles y packages/orm. Es un
# commit a medio preparar y coherente, de la campana de desrastreo de la rama.
# Escenificar una tanda encima haria que el commit siguiente se lo tragara todo
# junto, y eso ya no hay quien lo revise.
avisar_si_indice_sucio() {
  local n
  n=$(git diff --cached --name-only | grep -c . || true)
  [ "$n" -eq 0 ] && return 0

  echo "El indice ya tiene $n ficheros escenificados que NO son de esta tanda."
  echo
  git diff --cached --stat | tail -3 | sed 's/^/  /'
  echo
  echo "Resuelvelo antes, o se colara en el commit de la tanda:"
  echo "  git diff --cached --stat | less     # ver que es"
  echo "  git commit -m \"...\"                 # si es tuyo y esta bien"
  echo "  git restore --staged .              # si prefieres empezar limpio"
  exit 1
}

# Los ficheros de una tanda. Siempre sale con estado 0: un `[ ]` en falso al
# final del bucle mataria el script entero por el `set -e`.
ficheros_de() {
  pendientes | while read -r f; do
    if [ "$(tanda_de "$f")" = "$1" ]; then echo "$f"; fi
  done
  return 0
}

case "${1:-list}" in
  list)
    printf "%-11s %6s  %s\n" TANDA FICHEROS DESCRIPCION
    for t in "${TANDAS[@]}"; do
      n=$(ficheros_de "$t" | grep -c . || true)
      printf "%-11s %6s  %s\n" "$t" "$n" "$(descripcion "$t")"
    done
    ;;

  check)
    huerfanos=$(ficheros_de SIN_TANDA)
    if [ -n "$huerfanos" ]; then
      echo "Ficheros que no encajan en ninguna tanda (se quedarian fuera en silencio):"
      echo "$huerfanos" | sed 's/^/  /'
      exit 1
    fi
    echo "OK: los $(pendientes | wc -l) ficheros pendientes estan cubiertos."
    ;;

  *)
    t="$1"
    printf '%s\n' "${TANDAS[@]}" | grep -qx "$t" || { echo "Tanda desconocida: $t"; exit 1; }

    ficheros=$(ficheros_de "$t")
    [ -n "$ficheros" ] || { echo "La tanda '$t' no tiene nada pendiente."; exit 0; }

    if [ "${2:-}" != "--dry" ]; then avisar_si_indice_sucio; fi

    if [ "${2:-}" = "--dry" ]; then
      echo "Escenificaria $(echo "$ficheros" | wc -l) ficheros de '$t':"
      echo "$ficheros" | sed 's/^/  /'
      exit 0
    fi

    echo "$ficheros" | tr '\n' '\0' | xargs -0 git add --
    echo
    git diff --cached --stat | tail -20
    echo
    echo "Escenificado. Revisa con:  git diff --cached"
    echo "Y commitea tu:             git commit -m \"$(mensaje "$t")\""
    ;;
esac
