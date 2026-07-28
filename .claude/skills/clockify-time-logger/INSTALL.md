# Installing clockify-time-logger

## One command

```bash
git clone --depth 1 -b claude/clockify-skill-mcp-98fyx3 \
  https://github.com/husickova/concerts_app.git /tmp/clockify-skill \
  && /tmp/clockify-skill/.claude/skills/clockify-time-logger/setup.sh; \
  rm -rf /tmp/clockify-skill
```

`setup.sh` copies the skill to `~/.claude/skills/`, asks for the two tokens with
the terminal echo off, writes them to `~/.mcp.json` (chmod 600), and checks that
Clockify answers. Then the clone is deleted — the skill lives in your home
directory and has nothing further to do with that repository.

After that, in any directory:

```
claude
> zaloguj hodiny na dnes
```

Start a new session if one is already open — skills are discovered at startup.

To re-check access later, or after rotating a token:

```bash
~/.claude/skills/clockify-time-logger/setup.sh --check
```

## Tokens

`setup.sh` prompts for both and skips whichever is already configured. If you'd
rather set them up by hand, it reads from `CLOCKIFY_API_TOKEN` /
`AZURE_DEVOPS_PAT` in the environment, or from `~/.mcp.json` or `~/.claude.json`
at any nesting depth.

- **Clockify API key** — [app.clockify.me/user/settings](https://app.clockify.me/user/settings),
  API section. Required; without it nothing can be logged.
- **Azure DevOps PAT** — `https://dev.azure.com/drmaxglobal/_usersSettings/tokens`,
  scope **Work Items (Read)**. Optional — it only fetches the ticket list, and
  time can still be logged by naming tickets yourself.

## Where it works

Only in sessions that can reach your local config and the Clockify API:

| Surface | Works? |
|---|---|
| Terminal CLI | yes |
| Desktop app, local session | yes |
| Desktop app, cloud session | no — no local credentials |
| claude.ai/code (web) | no — ephemeral, and egress policy may block Clockify |
| SSH session | only if installed on the remote host |

If `setup.sh` reports Clockify as unreachable in a session that should work, the
usual causes are a mistyped key or being in a cloud session by accident.

## First real run

There's nothing to rehearse — the skill shows you a draft table and waits for
your approval before writing anything, so the first run is its own safety check.
Two things are worth a look that first time:

- `setup.sh` prints `User ID matches constant`. If that says **False**, tell
  Claude before logging anything; entries would be written against the wrong
  user and `USER_ID` in `scripts/clockify.py` needs a one-line fix.
- After the first day is logged, open Clockify and check the **times**. An entry
  an hour off means the timezone handling disagrees with the workspace — easy to
  spot now, annoying to find later.

The ADO side has never been exercised against a real server, so expect to iterate
on the queries in `references/ado.md` the first time.
