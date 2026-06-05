#!/usr/bin/env bash

load_node_tools() {
  if [ -n "${SYNRA_NODE_BIN:-}" ] && [ -x "${SYNRA_NODE_BIN:-}" ]; then
    NODE_BIN="$SYNRA_NODE_BIN"
  else
    NODE_BIN=""
  fi

  if [ -n "${SYNRA_NPM_BIN:-}" ] && [ -x "${SYNRA_NPM_BIN:-}" ]; then
    NPM_BIN="$SYNRA_NPM_BIN"
  else
    NPM_BIN=""
  fi

  if { [ -z "$NODE_BIN" ] || [ -z "$NPM_BIN" ]; } && [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    # shellcheck disable=SC1090
    . "$HOME/.nvm/nvm.sh"
  fi

  if [ -z "$NODE_BIN" ] && command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
  fi

  if [ -z "$NPM_BIN" ] && command -v npm >/dev/null 2>&1; then
    NPM_BIN="$(command -v npm)"
  fi

  if [ -z "$NODE_BIN" ]; then
    for candidate in /usr/bin/node /usr/local/bin/node "$HOME/.local/bin/node"; do
      if [ -x "$candidate" ]; then
        NODE_BIN="$candidate"
        break
      fi
    done
  fi

  if [ -z "$NPM_BIN" ]; then
    for candidate in /usr/bin/npm /usr/local/bin/npm "$HOME/.local/bin/npm"; do
      if [ -x "$candidate" ]; then
        NPM_BIN="$candidate"
        break
      fi
    done
  fi

  if [ -z "$NODE_BIN" ] || [ -z "$NPM_BIN" ]; then
    echo "Synra Jetson Station requires Node.js and npm." >&2
    echo "Install Node.js 20+ on the Jetson, or set SYNRA_NODE_BIN and SYNRA_NPM_BIN." >&2
    return 1
  fi

  export NODE_BIN
  export NPM_BIN
}
