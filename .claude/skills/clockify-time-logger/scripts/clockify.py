#!/usr/bin/env python3
"""Clockify helper for the clockify-time-logger skill.

Standard library only, so it runs anywhere without a pip install.

Subcommands:
  whoami                       verify the API key works and print workspace/user
  entries --date D [--date D]  list existing entries for a day (duplicate check)
  resolve-tags NAME [NAME...]  look up tag IDs, creating tags that don't exist
  plan --file draft.json       validate a draft, show the table, flag conflicts
  create --file draft.json     create the entries in the draft

The API key is never printed, including in error output.
"""

import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API_BASE = "https://api.clockify.me/api/v1"
WORKSPACE_ID = "675ff85fda3e54359bc36917"
USER_ID = "6822f417ef0c956e4344f20e"
DEFAULT_TZ = "Europe/Prague"

# Billable follows the project, so the caller only has to name the project.
PROJECTS = {
    "Dynamic Pricing": {"id": "693029ce5f60712723decb2c", "billable": True},
    "Internal Activities": {"id": "67601a2a83977f787f5014e6", "billable": False},
}

# Tags that are stable enough to hardcode. Epic tags are resolved via the API.
KNOWN_TAGS = {
    "Ceremonies": "67af3a375ff11f700fa1f421",
    "Meetings": "67efa9aaed9bd639cfb354e9",
}


# --------------------------------------------------------------------------
# credentials
# --------------------------------------------------------------------------

def _find_token(node):
    """Walk a parsed JSON config looking for CLOCKIFY_API_TOKEN.

    Config layouts differ (~/.mcp.json vs ~/.claude.json, with or without an
    "mcpServers" wrapper), so search rather than assume a fixed path.
    """
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "CLOCKIFY_API_TOKEN" and isinstance(value, str) and value.strip():
                return value.strip()
            found = _find_token(value)
            if found:
                return found
    elif isinstance(node, list):
        for item in node:
            found = _find_token(item)
            if found:
                return found
    return None


def api_key():
    token = os.environ.get("CLOCKIFY_API_TOKEN", "").strip()
    if token:
        return token

    searched = []
    for candidate in (Path.home() / ".mcp.json", Path.home() / ".claude.json"):
        searched.append(str(candidate))
        if not candidate.is_file():
            continue
        try:
            data = json.loads(candidate.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        token = _find_token(data)
        if token:
            return token

    sys.exit(
        "No Clockify API key found. Set CLOCKIFY_API_TOKEN, or add it under the\n"
        "clockify-time-entries server env in one of: " + ", ".join(searched)
    )


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------

def request(method, path, params=None, body=None):
    url = f"{API_BASE}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)

    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("x-api-key", api_key())
    if data:
        req.add_header("Content-Type", "application/json")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:500]
        raise RuntimeError(f"{method} {path} -> HTTP {exc.code}: {detail}") from None
    except urllib.error.URLError as exc:
        raise RuntimeError(f"{method} {path} -> network error: {exc.reason}") from None


# --------------------------------------------------------------------------
# time handling
# --------------------------------------------------------------------------

def _prague_offset(naive):
    """CET/CEST offset by rule: CEST from the last Sunday of March 01:00 UTC
    to the last Sunday of October 01:00 UTC. Only used if zoneinfo is missing.
    """
    def last_sunday(year, month):
        day = 31 if month == 3 else 31
        date = dt.date(year, month, day)
        while date.weekday() != 6:  # 6 == Sunday
            date -= dt.timedelta(days=1)
        return date

    start = dt.datetime.combine(last_sunday(naive.year, 3), dt.time(2, 0))
    end = dt.datetime.combine(last_sunday(naive.year, 10), dt.time(3, 0))
    return dt.timezone(dt.timedelta(hours=2 if start <= naive < end else 1))


def localize(date_str, time_str, tz_name=DEFAULT_TZ):
    """Combine a Y-m-d date and H:M time into an aware datetime."""
    try:
        naive = dt.datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
    except ValueError:
        raise SystemExit(f"Bad date/time: {date_str!r} {time_str!r} (want YYYY-MM-DD and HH:MM)")

    try:
        from zoneinfo import ZoneInfo

        return naive.replace(tzinfo=ZoneInfo(tz_name))
    except Exception:
        if tz_name != DEFAULT_TZ:
            raise SystemExit(f"zoneinfo unavailable, cannot resolve timezone {tz_name!r}")
        return naive.replace(tzinfo=_prague_offset(naive))


def to_utc_z(moment):
    """Clockify stores UTC; send it UTC so no offset ambiguity survives."""
    return moment.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fmt_duration(delta):
    minutes = int(delta.total_seconds() // 60)
    return f"{minutes // 60}:{minutes % 60:02d}"


CZ_DAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"]


def day_label(date_str):
    date = dt.date.fromisoformat(date_str)
    return f"{CZ_DAYS[date.weekday()]} {date.day}.{date.month}."


# --------------------------------------------------------------------------
# tags
# --------------------------------------------------------------------------

def list_tags():
    tags, page = [], 1
    while True:
        batch = request("GET", f"/workspaces/{WORKSPACE_ID}/tags",
                        params={"page": page, "page-size": 200}) or []
        tags.extend(batch)
        if len(batch) < 200:
            return tags
        page += 1


def resolve_tags(names, create_missing=True):
    """Map tag names to IDs, creating any that are missing.

    Epics come and go, so a missing tag is normal rather than an error.
    """
    wanted = [n for n in dict.fromkeys(names) if n]
    resolved, created = {}, []

    pending = []
    for name in wanted:
        if name in KNOWN_TAGS:
            resolved[name] = KNOWN_TAGS[name]
        else:
            pending.append(name)

    if pending:
        existing = {t["name"].strip().lower(): t["id"] for t in list_tags()}
        for name in pending:
            match = existing.get(name.strip().lower())
            if match:
                resolved[name] = match
            elif create_missing:
                new = request("POST", f"/workspaces/{WORKSPACE_ID}/tags", body={"name": name})
                resolved[name] = new["id"]
                created.append(name)
            else:
                resolved[name] = None

    return resolved, created


# --------------------------------------------------------------------------
# existing entries
# --------------------------------------------------------------------------

def entries_for(date_str):
    start = localize(date_str, "00:00")
    end = start + dt.timedelta(days=1)
    return request(
        "GET",
        f"/workspaces/{WORKSPACE_ID}/user/{USER_ID}/time-entries",
        params={"start": to_utc_z(start), "end": to_utc_z(end), "page-size": 200},
    ) or []


def describe_existing(entry, tz_name=DEFAULT_TZ):
    interval = entry.get("timeInterval") or {}
    out = {"description": entry.get("description") or "(no description)",
           "start": None, "end": None, "id": entry.get("id")}
    try:
        from zoneinfo import ZoneInfo

        tz = ZoneInfo(tz_name)
    except Exception:
        tz = None

    for field in ("start", "end"):
        raw = interval.get(field)
        if not raw:
            continue
        moment = dt.datetime.strptime(raw, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=dt.timezone.utc)
        if tz:
            moment = moment.astimezone(tz)
        else:
            moment = moment.astimezone(_prague_offset(moment.replace(tzinfo=None)))
        out[field] = moment
    return out


# --------------------------------------------------------------------------
# drafts
# --------------------------------------------------------------------------

def load_draft(path):
    try:
        data = json.loads(Path(path).read_text())
    except (OSError, json.JSONDecodeError) as exc:
        sys.exit(f"Cannot read draft {path}: {exc}")

    tz_name = data.get("timezone", DEFAULT_TZ)
    raw_entries = data.get("entries")
    if not isinstance(raw_entries, list) or not raw_entries:
        sys.exit("Draft has no 'entries' list.")

    parsed = []
    for index, item in enumerate(raw_entries, 1):
        missing = [f for f in ("date", "start", "end", "description") if not item.get(f)]
        if missing:
            sys.exit(f"Entry {index} is missing: {', '.join(missing)}")

        project_name = item.get("project")
        project_id = item.get("projectId")
        billable = item.get("billable")

        if project_name:
            if project_name not in PROJECTS:
                sys.exit(
                    f"Entry {index}: unknown project {project_name!r}. "
                    f"Known: {', '.join(PROJECTS)}"
                )
            project_id = project_id or PROJECTS[project_name]["id"]
            if billable is None:
                billable = PROJECTS[project_name]["billable"]
        elif not project_id:
            sys.exit(f"Entry {index}: needs 'project' or 'projectId'.")

        if billable is None:
            billable = next(
                (p["billable"] for p in PROJECTS.values() if p["id"] == project_id), True
            )

        start = localize(item["date"], item["start"], tz_name)
        end = localize(item["date"], item["end"], tz_name)
        if end <= start:
            sys.exit(f"Entry {index}: end {item['end']} is not after start {item['start']}.")

        tags = item.get("tags") or []
        if isinstance(tags, str):
            tags = [tags]
        for tag in tags:
            if tag not in KNOWN_TAGS and not re.fullmatch(r"\d{4,}", str(tag).strip()):
                print(
                    f"  note: tag {tag!r} is neither Meetings/Ceremonies nor an Epic number",
                    file=sys.stderr,
                )

        parsed.append({
            "date": item["date"],
            "start_local": start,
            "end_local": end,
            "start_text": item["start"],
            "end_text": item["end"],
            "description": item["description"],
            "project": project_name or project_id,
            "projectId": project_id,
            "billable": bool(billable),
            "tags": list(tags),
        })

    parsed.sort(key=lambda e: e["start_local"])
    return parsed, tz_name


def print_table(entries):
    header = ("Day", "Time", "Description", "Project", "Tags", "Duration")
    rows = [
        (
            day_label(e["date"]),
            f"{e['start_text']}-{e['end_text']}",
            e["description"],
            e["project"],
            ", ".join(e["tags"]) or "-",
            fmt_duration(e["end_local"] - e["start_local"]),
        )
        for e in entries
    ]
    widths = [max(len(str(r[i])) for r in (header, *rows)) for i in range(len(header))]
    line = "  ".join(str(h).ljust(w) for h, w in zip(header, widths))
    print(line)
    print("  ".join("-" * w for w in widths))
    for row in rows:
        print("  ".join(str(c).ljust(w) for c, w in zip(row, widths)))

    per_day = {}
    for e in entries:
        per_day.setdefault(e["date"], dt.timedelta())
        per_day[e["date"]] += e["end_local"] - e["start_local"]
    print()
    for date_str in sorted(per_day):
        print(f"{day_label(date_str)} total: {fmt_duration(per_day[date_str])}")
    if len(per_day) > 1:
        print(f"Overall total: {fmt_duration(sum(per_day.values(), dt.timedelta()))}")


def find_conflicts(entries, tz_name):
    """Report overlaps inside the draft and against what Clockify already has."""
    problems = []

    for a, b in zip(entries, entries[1:]):
        if a["end_local"] > b["start_local"]:
            problems.append(
                f"draft overlap: {a['description']} ({a['start_text']}-{a['end_text']}) "
                f"and {b['description']} ({b['start_text']}-{b['end_text']}) on {a['date']}"
            )

    for date_str in sorted({e["date"] for e in entries}):
        try:
            existing = [describe_existing(x, tz_name) for x in entries_for(date_str)]
        except RuntimeError as exc:
            problems.append(f"could not check existing entries for {date_str}: {exc}")
            continue

        for old in existing:
            if not old["start"]:
                continue
            for new in (e for e in entries if e["date"] == date_str):
                old_end = old["end"] or old["start"]
                if old["start"] < new["end_local"] and new["start_local"] < old_end:
                    when = old["start"].strftime("%H:%M")
                    until = old_end.strftime("%H:%M")
                    problems.append(
                        f"already in Clockify on {date_str}: {old['description']!r} "
                        f"({when}-{until}) overlaps {new['description']!r} "
                        f"({new['start_text']}-{new['end_text']})"
                    )

    return problems


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------

def cmd_whoami(_args):
    me = request("GET", "/user")
    print(f"Authenticated as: {me.get('name')} <{me.get('email')}>")
    print(f"User ID matches constant: {me.get('id') == USER_ID}")
    workspaces = {w["id"]: w["name"] for w in request("GET", "/workspaces") or []}
    print(f"Workspace {WORKSPACE_ID}: {workspaces.get(WORKSPACE_ID, 'NOT ACCESSIBLE')}")


def cmd_entries(args):
    for date_str in args.date:
        rows = [describe_existing(e) for e in entries_for(date_str)]
        print(f"\n{day_label(date_str)} ({date_str}) — {len(rows)} entr{'y' if len(rows) == 1 else 'ies'}")
        for row in sorted(rows, key=lambda r: r["start"] or dt.datetime.max.replace(tzinfo=dt.timezone.utc)):
            start = row["start"].strftime("%H:%M") if row["start"] else "??:??"
            end = row["end"].strftime("%H:%M") if row["end"] else "running"
            print(f"  {start}-{end}  {row['description']}")


def cmd_resolve_tags(args):
    resolved, created = resolve_tags(args.names, create_missing=not args.no_create)
    for name, tag_id in resolved.items():
        note = "  (created)" if name in created else ""
        print(f"{name}: {tag_id or 'NOT FOUND'}{note}")
    if created:
        print(f"\nNew tags created: {', '.join(created)} — record these in "
              f"references/reference_clockify_ids.md")


def cmd_plan(args):
    entries, tz_name = load_draft(args.file)
    print_table(entries)

    if args.offline:
        print("\nOffline: draft validated, but existing Clockify entries were not "
              "checked.\nRe-run `plan` without --offline before creating, so "
              "duplicates get caught.")
        return

    problems = find_conflicts(entries, tz_name)
    if problems:
        print("\nPotential duplicates / conflicts:")
        for problem in problems:
            print(f"  ! {problem}")
    else:
        print("\nNo overlaps with existing Clockify entries.")


def cmd_create(args):
    entries, tz_name = load_draft(args.file)
    print_table(entries)

    problems = find_conflicts(entries, tz_name)
    if problems:
        print("\nPotential duplicates / conflicts:")
        for problem in problems:
            print(f"  ! {problem}")
        if not args.force:
            sys.exit("\nRefusing to create. Resolve these, or pass --force if intended.")

    tag_names = [t for e in entries for t in e["tags"]]
    tag_ids, created = resolve_tags(tag_names) if tag_names else ({}, [])
    if created:
        print(f"\nCreated new tags: {', '.join(created)} — record them in "
              f"references/reference_clockify_ids.md")

    print()
    results, failures = [], 0
    for entry in entries:
        body = {
            "start": to_utc_z(entry["start_local"]),
            "end": to_utc_z(entry["end_local"]),
            "description": entry["description"],
            "projectId": entry["projectId"],
            "billable": entry["billable"],
            "tagIds": [tag_ids[t] for t in entry["tags"] if tag_ids.get(t)],
        }
        label = f"{day_label(entry['date'])} {entry['start_text']}-{entry['end_text']}  {entry['description']}"
        try:
            request("POST", f"/workspaces/{WORKSPACE_ID}/time-entries", body=body)
            results.append(("created", label, ""))
        except RuntimeError as exc:
            failures += 1
            results.append(("FAILED", label, str(exc)))

    for status, label, error in results:
        print(f"{status:8} {label}")
        if error:
            print(f"         -> {error}")

    print(f"\nTotal: {len(results) - failures} created, {failures} failed.")
    if failures:
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    subs = parser.add_subparsers(dest="command", required=True)

    subs.add_parser("whoami", help="verify credentials").set_defaults(func=cmd_whoami)

    p_entries = subs.add_parser("entries", help="list existing entries for a day")
    p_entries.add_argument("--date", action="append", required=True, help="YYYY-MM-DD (repeatable)")
    p_entries.set_defaults(func=cmd_entries)

    p_tags = subs.add_parser("resolve-tags", help="resolve tag names to IDs, creating if needed")
    p_tags.add_argument("names", nargs="+")
    p_tags.add_argument("--no-create", action="store_true", help="report missing instead of creating")
    p_tags.set_defaults(func=cmd_resolve_tags)

    p_plan = subs.add_parser("plan", help="validate a draft and check for duplicates")
    p_plan.add_argument("--file", required=True)
    p_plan.add_argument("--offline", action="store_true",
                        help="validate and show the table without contacting Clockify")
    p_plan.set_defaults(func=cmd_plan)

    p_create = subs.add_parser("create", help="create the entries in a draft")
    p_create.add_argument("--file", required=True)
    p_create.add_argument("--force", action="store_true", help="create despite overlap warnings")
    p_create.set_defaults(func=cmd_create)

    args = parser.parse_args()
    try:
        args.func(args)
    except RuntimeError as exc:
        sys.exit(f"Clockify API error: {exc}")


if __name__ == "__main__":
    main()
