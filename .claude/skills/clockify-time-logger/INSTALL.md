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

## Updating

The Epic → tag cache in `references/reference_clockify_ids.md` gets written as
the skill runs, so after installing, `~/.claude/skills/` holds the live copy. If
you later pull a newer version from the repo, don't blind-copy over it — the
repo's copy has a stale cache. Copy `SKILL.md` and `scripts/` and merge the
reference files by hand.
