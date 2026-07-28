# Azure DevOps queries

How to get the ticket list and resolve Epics. Prefer the MCP tools; the REST
fallback exists because the MCP server isn't always connected in every session,
and the skill shouldn't dead-end when it isn't.

## Config

| Item | Value |
|---|---|
| Organization | `drmaxglobal` |
| Project | `Dynamic Pricing` |
| Assigned-to identity | `Katerina EXT Husickova <extHusickova@dr-max.global>` |

The ADO identity uses the ASCII spelling. Querying for `Kateřina Husičková`
returns an empty result set, which reads like "nothing assigned" rather than a
bad query — so treat an empty result as a reason to re-check the name before
telling the user they have no tickets.

## Path A — MCP tools

Try `mcp__azure-devops__search_work_items` first. If the tool is absent, or
returns an authentication or authorization error, switch to path B.

**Active work items assigned to the user:**

```
searchText: "Katerina EXT Husickova"
filters:
  System.AssignedTo:   ["Katerina EXT Husickova <extHusickova@dr-max.global>"]
  System.State:        ["Active", "New", "In Progress"]
  System.WorkItemType: ["Task", "User Story", "Bug"]
```

**Open Epics** (one call, via `mcp__azure-devops__list_work_items`):

```sql
SELECT [System.Id], [System.Title], [System.State] FROM WorkItems
WHERE [System.TeamProject] = 'Dynamic Pricing'
  AND [System.WorkItemType] = 'Epic'
  AND [System.State] IN ('New', 'Active')
```

**Parent Epic of a ticket:** `get_work_item` with `expand: relations`, then
follow the `System.LinkTypes.Hierarchy-Reverse` relation upward until the
parent's `System.WorkItemType` is `Epic`. A Task usually sits under a User Story
which sits under a Feature which sits under the Epic, so this is a walk of
several hops, not a single lookup.

Resolve this only for tickets the user actually picked. Walking the hierarchy for
every open ticket is several API calls each, and most of them get discarded.

## Path B — REST fallback

Read the PAT from `~/.claude.json` → `mcpServers` → `azure-devops` → `env` →
`AZURE_DEVOPS_PAT`. Keep it in a shell variable, never echo it, and never put it
in a file that gets committed.

```bash
PAT=$(python3 -c "
import json, pathlib
cfg = json.loads((pathlib.Path.home() / '.claude.json').read_text())
print(cfg['mcpServers']['azure-devops']['env']['AZURE_DEVOPS_PAT'])
")
ORG=drmaxglobal
PROJECT='Dynamic%20Pricing'
```

ADO uses HTTP basic auth with an empty username and the PAT as the password, so
`curl -u :$PAT` is the right shape.

**Work item search:**

```bash
curl -s -u :"$PAT" -H "Content-Type: application/json" \
  -d '{
        "searchText": "Katerina EXT Husickova",
        "$top": 100,
        "filters": {
          "System.AssignedTo": ["Katerina EXT Husickova <extHusickova@dr-max.global>"],
          "System.State": ["Active", "New", "In Progress"],
          "System.WorkItemType": ["Task", "User Story", "Bug"]
        }
      }' \
  "https://almsearch.dev.azure.com/$ORG/$PROJECT/_apis/search/workitemsearchresults?api-version=7.1"
```

**WIQL (open Epics):**

```bash
curl -s -u :"$PAT" -H "Content-Type: application/json" \
  -d '{"query": "SELECT [System.Id], [System.Title], [System.State] FROM WorkItems WHERE [System.TeamProject] = '\''Dynamic Pricing'\'' AND [System.WorkItemType] = '\''Epic'\'' AND [System.State] IN ('\''New'\'', '\''Active'\'')"}' \
  "https://dev.azure.com/$ORG/$PROJECT/_apis/wit/wiql?api-version=7.1"
```

WIQL returns IDs only. Fetch the titles in one batch rather than one call each:

```bash
curl -s -u :"$PAT" \
  "https://dev.azure.com/$ORG/_apis/wit/workitems?ids=209373,209374&fields=System.Id,System.Title,System.State&api-version=7.1"
```

**One work item with its parent links:**

```bash
curl -s -u :"$PAT" \
  "https://dev.azure.com/$ORG/_apis/wit/workitems/204929?\$expand=relations&api-version=7.1"
```

The parent is the entry in `relations` whose `rel` is
`System.LinkTypes.Hierarchy-Reverse`; its `url` ends in the parent's ID. Fetch
that ID and repeat until `System.WorkItemType` is `Epic`.

## Failure modes worth naming

- **401 / 403** — the PAT is expired or lacks Work Items (read) scope. Say so
  plainly and let the user regenerate it; there's no way around it from here.
- **Empty search results** — check the identity spelling before concluding the
  sprint is empty.
- **A ticket with no Epic ancestor** — happens with standalone tasks. Ask the
  user which tag to use rather than picking one.
