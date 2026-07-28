#!/usr/bin/env bash
# One-time setup for the clockify-time-logger skill.
#
#   ./setup.sh          install the skill, ask for tokens, verify access
#   ./setup.sh --check  only re-run the verification
#
# Tokens are read with the terminal echo off and written straight to
# ~/.mcp.json (chmod 600). They are never printed and never reach shell history.

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$HOME/.claude/skills/clockify-time-logger"
CONFIG="$HOME/.mcp.json"
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

say()  { printf '%s\n' "$*"; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null 2>&1 || fail "python3 not found; the skill needs it"

# ---------------------------------------------------------------- install
if [ "$CHECK_ONLY" -eq 0 ]; then
  say "Installing the skill to $DEST"
  mkdir -p "$DEST/scripts" "$DEST/references"
  cp "$SRC/SKILL.md" "$SRC/INSTALL.md" "$SRC/setup.sh" "$DEST/"
  cp "$SRC/scripts/clockify.py" "$DEST/scripts/"
  chmod +x "$DEST/setup.sh"   # so --check can be re-run after the clone is gone

  # Two reference files are written to as the skill runs — the Epic -> tag cache
  # and the accumulated project-mapping corrections — so an installed copy is
  # worth more than the repo's. The rest is documentation and always updates.
  for ref in "$SRC/references/"*.md; do
    name="$(basename "$ref")"
    target="$DEST/references/$name"
    case "$name" in
      reference_clockify_ids.md|feedback_clockify_projects.md)
        if [ -e "$target" ]; then
          say "  keeping your $name (it holds what earlier runs learned)"
          continue
        fi
        ;;
    esac
    cp "$ref" "$target"
  done
fi

SCRIPT="$DEST/scripts/clockify.py"
[ -f "$SCRIPT" ] || fail "$SCRIPT missing — run without --check first"

# ---------------------------------------------------------------- tokens
# The Python helpers go to temp files rather than heredocs: store_token needs
# stdin for the token itself, and a heredoc would occupy stdin instead.
TMPDIR_SETUP="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_SETUP"' EXIT
HAVE_PY="$TMPDIR_SETUP/have.py"
STORE_PY="$TMPDIR_SETUP/store.py"

cat > "$HAVE_PY" <<'PY'
import json, os, pathlib, sys

def find(node, key):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == key and isinstance(v, str) and v.strip():
                return v.strip()
            found = find(v, key)
            if found:
                return found
    elif isinstance(node, list):
        for item in node:
            found = find(item, key)
            if found:
                return found
    return None

key = sys.argv[1]
if os.environ.get(key, "").strip():
    sys.exit(0)
for name in (".mcp.json", ".claude.json"):
    path = pathlib.Path.home() / name
    if path.is_file():
        try:
            if find(json.loads(path.read_text()), key):
                sys.exit(0)
        except (json.JSONDecodeError, OSError):
            pass
sys.exit(1)
PY

cat > "$STORE_PY" <<'PY'
import json, pathlib, shutil, sys

server, key, config = sys.argv[1], sys.argv[2], pathlib.Path(sys.argv[3])
value = sys.stdin.read().strip()
if not value:
    sys.exit("  nothing to save")

data = {}
if config.is_file():
    shutil.copy2(config, str(config) + ".bak")          # never lose the old one
    try:
        data = json.loads(config.read_text())
    except json.JSONDecodeError:
        sys.exit(f"  {config} is not valid JSON; fix or move it, then re-run")

# Preserve whichever shape the file already uses: some configs wrap servers in
# "mcpServers", others list them at the top level.
holder = data.setdefault("mcpServers", {}) if "mcpServers" in data or not data else data
holder.setdefault(server, {}).setdefault("env", {})[key] = value

config.write_text(json.dumps(data, indent=2) + "\n")
config.chmod(0o600)
print(f"  saved to {config}")
PY

have_token()  { python3 "$HAVE_PY" "$1"; }
store_token() { python3 "$STORE_PY" "$1" "$2" "$CONFIG"; }   # value on stdin

ask_token() {    # ask_token LABEL SERVER KEY OPTIONAL_HINT
  local label="$1" server="$2" key="$3" hint="${4:-}" value=""
  if have_token "$key"; then
    say "$label: already configured, leaving it alone"
    return 0
  fi
  say ""
  say "$label is not configured yet."
  [ -n "$hint" ] && say "  $hint"
  printf '  paste it here (input is hidden, Enter to skip): '
  read -r -s value
  printf '\n'
  if [ -z "$value" ]; then
    say "  skipped"
    return 1
  fi
  if printf '%s' "$value" | store_token "$server" "$key"; then
    return 0
  fi
  say "  could not save it — see the message above"
  return 1
}

if [ "$CHECK_ONLY" -eq 0 ]; then
  ask_token "Clockify API key" "clockify-time-entries" "CLOCKIFY_API_TOKEN" \
    "Get one at https://app.clockify.me/user/settings (API section)" || true
  ask_token "Azure DevOps PAT" "azure-devops" "AZURE_DEVOPS_PAT" \
    "https://dev.azure.com/drmaxglobal/_usersSettings/tokens — scope: Work Items (Read). Optional." || true
fi

# ---------------------------------------------------------------- verify
say ""
say "Checking access (nothing is written to Clockify by these):"
say ""

clockify_ok=0
if have_token CLOCKIFY_API_TOKEN; then
  if python3 "$SCRIPT" whoami; then
    clockify_ok=1
    python3 "$SCRIPT" entries --date "$(date +%F)" || true
  fi
else
  say "  no Clockify key configured — the skill cannot log time without it"
fi

say ""
if [ "$clockify_ok" -eq 1 ]; then
  say "Clockify works."
  if have_token AZURE_DEVOPS_PAT; then
    say "Azure DevOps PAT found (the ticket list is fetched on first use)."
  else
    say "No Azure DevOps PAT — you can still log time by naming tickets yourself."
  fi
  say ""
  say "Done. From now on, in any directory:"
  say ""
  say "    claude"
  say "    > zaloguj hodiny na dnes"
  say ""
  say "If 'User ID matches constant' said False above, tell Claude — the entries"
  say "would land under the wrong user and the script needs a one-line fix."
else
  say "Clockify is not reachable yet. Common causes:"
  say "  - the key was pasted wrong: re-run ./setup.sh"
  say "  - you are in a cloud or web session: run this in a local terminal instead"
  say ""
  say "Re-run just this check any time with: $DEST/setup.sh --check"
  exit 1
fi
