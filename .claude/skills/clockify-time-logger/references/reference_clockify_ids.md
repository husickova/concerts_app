# Clockify / ADO ID reference

A cache, not an authority. It exists so a normal run doesn't have to re-discover
every ID, but Epics get retired, split, and re-parented, so anything in the Epic
section below must be re-checked against ADO before it's used (SKILL.md step
1.2). Update this file whenever a run discovers something new or something wrong,
and refresh the `verified` line so the next run knows how stale it is.

## Workspace

| Item | Value |
|---|---|
| Clockify workspace ID | `675ff85fda3e54359bc36917` |
| Clockify user ID | `6822f417ef0c956e4344f20e` |
| Clockify API base | `https://api.clockify.me/api/v1` |
| Timezone | Europe/Prague (CET +01:00 / CEST +02:00) |

These are also constants in `scripts/clockify.py`; if one ever changes, change
it in both places.

## Projects

| Project | ID | Billable |
|---|---|---|
| Dynamic Pricing | `693029ce5f60712723decb2c` | true |
| Internal Activities | `67601a2a83977f787f5014e6` | false |

Billable is a property of the project, so the script derives it — pass
`"project": "Dynamic Pricing"` in a draft and don't set `billable` by hand.

## Fixed tags

| Tag | ID |
|---|---|
| Ceremonies | `67af3a375ff11f700fa1f421` |
| Meetings | `67efa9aaed9bd639cfb354e9` |

Only these two plus bare Epic numbers are valid tags. The tag list is shared
across the workspace, so inventing new tag names creates mess for everyone.

## Epic → Clockify tag

Epic tags in Clockify are named with the bare ADO Epic number (e.g. `209373`).
Tag IDs below are filled in as runs resolve them; blank means "not resolved
yet" — run `clockify.py resolve-tags <number>`, which finds or creates the tag,
then record the ID here.

Open Epics — **verified: never** (populate on the first real run against ADO)

| Epic | Title | Clockify tag ID | Status |
|---|---|---|---|
| 209373 | eComm (split from 196333) | _unresolved_ | open |
| 209374 | B&M (split from 196333) | _unresolved_ | open |

### Retired Epics

Keep retired Epics listed rather than deleting them — the numbers still appear
in historical time entries, so a reader tracing an old entry needs to find them.

| Epic | Title | Replaced by | Note |
|---|---|---|---|
| 196333 | (retired) | 209373 eComm, 209374 B&M | do not tag new entries with this |

## Maintenance

When a run discovers a change, edit this file in the same turn:

- New Epic → add a row with its resolved tag ID.
- Epic retired or split → move it to the retired table and note the successors.
- Title drifted in ADO → correct it here.
- Re-checked the open-Epic list against ADO → update the `verified` date, even
  if nothing changed, so the next run can tell fresh from stale.
