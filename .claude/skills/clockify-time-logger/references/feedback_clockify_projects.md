# Meeting / activity → Clockify project mapping

Which Clockify project a recurring activity belongs to. The distinction matters
because it drives billability: Dynamic Pricing is billable, Internal Activities
is not, so a misfiled meeting shows up as a billing error rather than just a
misplaced label.

This file is the accumulated record of corrections. When the user moves an entry
to a different project, or says "that one goes under Internal", add it here so
the same correction isn't needed twice.

## Dynamic Pricing (billable)

| Activity | Tag |
|---|---|
| Standup / Daily | Ceremonies |
| Retrospektiva | Ceremonies |
| Disivo | Ceremonies |
| Sprint planning, refinement, grooming | Ceremonies |
| Portal redesign | Meetings |
| Sharing session | Meetings |
| All ticket work | Epic number |

Anything scheduled by the Dynamic Pricing team, and all work on a Dynamic
Pricing work item, lands here. `Ceremonies` is for the recurring scrum events;
`Meetings` is for other project meetings; ticket work is tagged with its Epic.

## Internal Activities (non-billable)

| Activity | Tag |
|---|---|
| 1on1 Viktor | Meetings |
| RWY meetings | Meetings |
| RWY prep | Meetings |

Internal company activities that aren't billable to the Dynamic Pricing
engagement — line-management 1:1s and RWY.

## Deciding an unlisted activity

Ask: is this work for the Dynamic Pricing engagement, or internal DrMax /
personal-development time? Engagement work is billable and goes to Dynamic
Pricing; the rest goes to Internal Activities.

If it's genuinely ambiguous, ask the user rather than guessing — a wrong
billable flag is worse than one extra question, and the answer becomes a new row
in this file.
