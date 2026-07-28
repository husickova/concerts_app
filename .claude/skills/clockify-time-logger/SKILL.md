---
name: clockify-time-logger
description: >-
  Log worked hours to Clockify, using the current sprint's Azure DevOps tickets
  as the list of things to log against. Fetches active work items assigned to the
  user from ADO, resolves each ticket's parent Epic into a Clockify tag, then
  creates time entries with the right project, tag, and billable flag. Use this
  skill whenever the user wants to record, log, fill in, or fix time — including
  phrasings like "zaloguj hodiny", "vykaž čas", "log my time", "fill in my
  timesheet", "I worked on 204929 from 9 to 12", "kolik mám nalogováno", "add
  standup to Clockify", or just "clockify". Also use it when the user lists
  tickets and hours together without naming a tool, or asks what they have left
  to report for a day or week, since Clockify is where that time belongs.
---

# Clockify Time Logger

Pull the user's active ADO tickets, ask what they actually worked on, then write
it to Clockify with the correct project, Epic tag, and billable flag.

The work happens in three phases with a human gate between each. Those gates
exist because time entries are tedious to undo by hand — a wrong project or a
missed duplicate means the user has to go clean up in the Clockify UI. Getting
confirmation costs one message; getting it wrong costs them ten minutes.

Everything talks to Clockify through `scripts/clockify.py`, which handles the
Prague DST offset, tag creation, duplicate detection, and batch creation. Use it
rather than hand-rolling curl calls — the timezone math in particular is easy to
get subtly wrong, and a one-hour shift in a time entry is hard to spot in review.

## Setup

Every command below runs the bundled script, so resolve its path once per
session from this skill's own base directory (Claude Code prints that directory
when the skill loads) and reuse the variable:

```bash
SKILL_DIR=~/.claude/skills/clockify-time-logger   # personal install
CLOCKIFY="python3 $SKILL_DIR/scripts/clockify.py"
```

Deriving it from the skill's base directory rather than assuming a repo-relative
path matters because this skill is meant to live in `~/.claude/skills/` — a
relative path only works when the session happens to start in the repo that
carries a copy.

Constants (workspace, user, project IDs, billable defaults) live in the script.
Read `references/reference_clockify_ids.md` for the Epic → tag cache and
`references/feedback_clockify_projects.md` for the meeting → project rules —
both sit next to SKILL.md, so read them relative to the same base directory.

The Clockify API key is read automatically from `CLOCKIFY_API_TOKEN` or from
`~/.mcp.json` / `~/.claude.json` under the `clockify-time-entries` server env.
Never echo the key, and never write it into a draft file or a commit.

Confirm access before doing anything else, so an auth problem surfaces now
rather than after the user has typed out their whole week:

```bash
$CLOCKIFY whoami
```

A missing key means the session can't reach Clockify at all — say so and stop,
rather than collecting the user's hours into a draft that can't be submitted.
This is the usual symptom of running in a cloud or remote session, which doesn't
inherit local MCP config; the fix is to run in a local session, not to retry.

## Phase 1 — Fetch tickets and show the list

### 1.1 Get active work items from ADO

Prefer the MCP tools (`mcp__azure-devops__search_work_items`). If they are
missing or return an auth error, fall back to the REST API with the PAT — see
`references/ado.md` for both paths and the exact queries.

The ADO account name is `Katerina EXT Husickova <extHusickova@dr-max.global>`,
not the Czech spelling. Searching for "Kateřina Husičková" returns nothing,
which looks like "no tickets assigned" rather than a bad query — so if the
result set is empty, check the name before reporting that to the user.

Query for `Task`, `User Story`, and `Bug` in state `Active`, `New`, or
`In Progress`, in project `Dynamic Pricing` (org `drmaxglobal`).

### 1.2 Resolve Epics lazily

Fetch the list of open Epics once via WIQL, then resolve the parent Epic only
for the tickets the user actually picks. Walk `Hierarchy-Reverse` (Parent) links
upward until the parent's type is `Epic`.

Resolve against ADO rather than trusting the cached mapping in
`references/reference_clockify_ids.md`. Tickets get re-parented and Epics get
retired and split — Epic 196333 was retired and became 209373 (eComm) and
209374 (B&M). The cache speeds up the common case; ADO is the source of truth.

When anything has changed, update `references/reference_clockify_ids.md`: add
new Epic → tag IDs, mark retired Epics as retired instead of deleting them (the
old number still shows up in historical entries), fix drifted titles, and
refresh the `verified` date. That is what keeps the next run fast.

### 1.3 Show a numbered list

```
1. #204929 — AA test analysis on historical data (Epic: #209373)
2. #211761 — POL adding to evaluation dataset (Epic: #209373)
...
Also available: Ceremonies, Meetings, Internal meetings
```

Then ask, and wait — do not draft anything yet:

> Na kterých jsi pracovala, kolik hodin a kdy? Můžeš zadat víc dní najednou.
> Např.: 1 — 9:00-12:00, meetings — 13:00-14:00, standup — 9:00-9:30

## Phase 2 — Parse and draft

### 2.1 Interpret the answer

Map each item the user names — a list number, a ticket number, or a keyword like
"standup" — to its ticket ID, title, Epic tag, and project. Apply the project
rules in `references/feedback_clockify_projects.md`.

Use today's date unless the user says otherwise. They will often write Czech
weekday names (`pondělí`, `úterý`, `středa`, `čtvrtek`, `pátek`, or short forms
`po`/`út`/`st`/`čt`/`pá`), and a bare weekday means the most recent one, not a
future date — people log time after the fact, not before.

Two things are worth a question rather than a guess:

- **Only a duration, no start time** ("1 — 3h"). Clockify entries are intervals,
  so a start time has to come from somewhere. Ask instead of inventing one.
- **A ticket with no parent Epic.** Ask which tag to use, since the tag is what
  makes the entry show up in the right reporting bucket.

Write descriptions in English even when the user writes in Czech — the Clockify
workspace is shared and reports get read by people who don't read Czech. Keep
the ticket number in the description (`#204929 AA test analysis`) so an entry
can be traced back to its work item.

Tags are only `Meetings`, `Ceremonies`, or a bare Epic number. Anything else
pollutes the tag list for everyone in the workspace.

### 2.2 Build the draft file

Write a draft JSON to a scratch path (not into the repo) and let the script
validate it. Project name is enough — billable follows from the project, so
there is no way to get that pairing wrong:

```json
{
  "timezone": "Europe/Prague",
  "entries": [
    {
      "date": "2026-04-10",
      "start": "09:00",
      "end": "09:30",
      "description": "Daily standup",
      "project": "Dynamic Pricing",
      "tags": ["Ceremonies"]
    },
    {
      "date": "2026-04-10",
      "start": "09:30",
      "end": "12:00",
      "description": "#204929 AA test analysis on historical data",
      "project": "Dynamic Pricing",
      "tags": ["209373"]
    }
  ]
}
```

### 2.3 Show the draft and the duplicate check

```bash
$CLOCKIFY plan --file /tmp/draft.json
```

This prints the table with per-day and overall totals, and flags overlaps both
inside the draft and against entries already in Clockify. Show that output to
the user, including any warnings — a flagged overlap is usually the user
re-logging something they already logged, and they are the only one who can tell
you whether it's a genuine duplicate or two different meetings back to back.

If Clockify is unreachable — no API key, or a session whose egress policy blocks
`api.clockify.me` — `plan --offline` still validates the draft and prints the
table. That's worth doing even when the entries can't be created from here: the
part that needs the user (what they worked on, which project, which Epic) gets
settled while they're present, and the draft file carries it over to a session
that can submit. Save the draft somewhere durable in that case, and tell the user
where it is and which command finishes the job. Never present an offline run as
if the time had been logged.

Then ask, and wait:

> Souhlasíš? Můžeš upravit cokoliv, nebo řekni OK pro vytvoření.

Only an explicit yes (`OK`, `souhlasím`, `ano`, `jo`) means go. Edits mean
rebuild the draft and show the table again.

## Phase 3 — Create

```bash
$CLOCKIFY create --file /tmp/draft.json
```

The script resolves each tag (creating Epic tags that don't exist yet), creates
every entry, and prints a per-entry status table with a created/failed count. It
refuses to run if the overlap check still finds problems; pass `--force` only
when the user has looked at those warnings and confirmed they're fine.

`create --dry-run` prints the exact request bodies and sends nothing. Reach for
it when something about the setup is unverified — a constant that might be wrong,
a first run on a new machine, or a day where the entries look surprising — since
seeing the UTC timestamps and resolved tag IDs before they're written is cheaper
than deleting entries afterwards.

Report the result table back. If any entry failed, show the error and offer to
retry just the failures — a partial success is normal (a network blip on entry 4
of 6) and the user should not have to re-enter the whole day.

If the script created any new tags, record them in
`references/reference_clockify_ids.md` so the next run resolves them from cache.

## Reading time back

For "kolik mám nalogováno" style questions, no gates and no drafting are needed
— just read and report:

```bash
$CLOCKIFY entries --date 2026-04-10 --date 2026-04-11
```
