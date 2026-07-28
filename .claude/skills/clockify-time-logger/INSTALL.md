# Installing clockify-time-logger

This skill is versioned in the `concerts_app` repo only because that's how it got
delivered. It isn't part of the concerts app, and it shouldn't live here at
runtime — logging work hours has nothing to do with any particular repo.

Install it as a **personal skill**, so it's available in every project without
opening a specific one:

```bash
mkdir -p ~/.claude/skills
cp -r .claude/skills/clockify-time-logger ~/.claude/skills/
```

Then start a new Claude Code session — skills are discovered at session start, so
an already-running session won't see it. Invoke it by just asking ("zaloguj
hodiny na dnes") or explicitly with `/clockify-time-logger`.

## Where it works

| Surface | Works? | Why |
|---|---|---|
| Terminal CLI, local | yes | reads `~/.claude/skills/` and `~/.mcp.json` |
| Desktop app, local session | yes | same local config as the CLI |
| Desktop app, cloud session | no | doesn't inherit local MCP config or API keys |
| claude.ai/code (web) | no | ephemeral container, no local credentials |
| SSH session | only if installed on the remote host | reads the remote `~/.claude/` |

The deciding factor is always whether the session can reach your local
credentials. The skill needs a Clockify API key and, for the ticket list, an ADO
PAT — both of which live in your local config and don't travel to remote
sessions. Run `whoami` first if you're unsure which kind of session you're in;
a missing-key error is the tell.

## Credentials

The Clockify key is read from, in order:

1. the `CLOCKIFY_API_TOKEN` environment variable
2. `~/.mcp.json` → `clockify-time-entries` → `env` → `CLOCKIFY_API_TOKEN`
3. `~/.claude.json`, same shape

The ADO PAT comes from `~/.claude.json` → `mcpServers` → `azure-devops` → `env` →
`AZURE_DEVOPS_PAT`, and is only needed for fetching the ticket list — you can log
time without it by naming tickets and Epics yourself.

Verify both are reachable before relying on it:

```bash
python3 ~/.claude/skills/clockify-time-logger/scripts/clockify.py whoami
```

## First run — verify before trusting it

The local logic (time zones, validation, billable, totals) is tested, but every
constant in the script and every request shape came from a spec rather than from
a successful API call. So make the first run a deliberate check, in this order,
and only then trust it with a full day.

Steps 1–3 cannot write anything: `whoami` and `entries` are GETs, and `plan`
only reads existing entries to compare against. `create --dry-run` prints the
exact request bodies without sending them.

```bash
C="python3 ~/.claude/skills/clockify-time-logger/scripts/clockify.py"

$C whoami                          # 1. key works; check the user-ID line says True
$C entries --date $(date +%F)      # 2. read path works; times look like local time
```

Then a draft with a single short entry you don't mind deleting:

```bash
$C plan --file /tmp/probe.json     # 3. read-only: table + duplicate check
$C create --file /tmp/probe.json --dry-run   # 4. inspect the JSON bodies
$C create --file /tmp/probe.json   # 5. for real
```

After step 5, open Clockify and confirm four things on that entry, because these
are exactly what a wrong constant would break: the **project**, the **tag**, the
**billable** flag, and above all the **time** — an entry that landed an hour off
means the timezone handling disagrees with the workspace, and that is much easier
to spot on one probe entry than buried in a six-entry day.

If `whoami` prints `User ID matches constant: False`, stop and fix `USER_ID` in
the script before creating anything; entries would be written against the wrong
user.

The ADO side (ticket list, Epic resolution) has never been exercised at all — no
MCP server and no PAT were available when this was written. Expect to iterate on
the queries in `references/ado.md` the first time.

## Updating

The Epic → tag cache in `references/reference_clockify_ids.md` gets written as
the skill runs, so after installing, `~/.claude/skills/` holds the live copy. If
you later pull a newer version from the repo, don't blind-copy over it — the
repo's copy has a stale cache. Copy `SKILL.md` and `scripts/` and merge the
reference files by hand.
