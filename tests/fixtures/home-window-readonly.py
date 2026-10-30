#!/usr/bin/env python3
"""Explicit, metadata-only maintenance preflight. No default Home, service operation, key access or database writeback."""
import argparse
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile

SKIP = {"releases", "bin", "backups", "cache", "browser", "agent-runtime"}
JSON_COPIES = {"config/mcp-tools.json", "shelf/catalog.json"}
CHARACTERS = ("io.molis.work.characters", "io.molis.work.native.characters")


def within(child, parent):
    return child == parent or parent in child.parents


def readonly(file):
    return sqlite3.connect(file.as_uri() + "?mode=ro&immutable=1", uri=True, timeout=0)


def copy_home(given, destination, approved=False):
    raw = Path(given).absolute()
    real_home = Path.home() / ".molis-work"
    if within(raw, real_home) and not approved:
        raise ValueError("real Home copy requires the coordinator's explicit user consent")
    if raw.is_symlink() or not raw.is_dir():
        raise ValueError("source must be an ordinary directory")
    source = raw.resolve()
    if not within(source, Path(tempfile.gettempdir()).resolve()) and not approved:
        raise ValueError("non-temporary source copy requires explicit user consent")
    target = Path(destination).absolute()
    if target.exists() or target.is_symlink() or within(target.resolve(), source):
        raise ValueError("destination must be new and outside the source")
    target.mkdir(parents=True, mode=0o700)
    target.chmod(0o700)
    report = {"copied": [], "not_read": [], "encrypted_records_not_read": 0}
    for directory, names, files in os.walk(source, followlinks=False):
        base = Path(directory)
        relative = base.relative_to(source)
        names[:] = [name for name in names if not (base / name).is_symlink()
                    and not (relative == Path(".") and name in SKIP)]
        for name in files:
            file = base / name
            item = file.relative_to(source).as_posix()
            if not (name.endswith((".db", ".sqlite")) or item in JSON_COPIES):
                continue
            if file.is_symlink() or file.stat().st_nlink != 1:
                report["not_read"].append({"file": item, "reason": "LINKED_FILE"})
                continue
            wal = Path(str(file) + "-wal")
            if wal.exists() and wal.stat().st_size:
                report["not_read"].append({"file": item, "reason": "NONEMPTY_WAL"})
                continue
            output = target / file.relative_to(source)
            output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            try:
                before = file.stat()
                if item in JSON_COPIES:
                    shutil.copyfile(file, output)
                else:
                    db = readonly(file)
                    try:
                        db.execute("VACUUM INTO ?", (str(output),))
                    finally:
                        db.close()
                after = file.stat()
                if ((wal.exists() and wal.stat().st_size) or (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns)):
                    output.unlink()
                    report["not_read"].append({"file": item, "reason": "CHANGED_DURING_COPY"})
                    continue
                output.chmod(0o600)
                report["copied"].append(item)
            except sqlite3.Error as error:
                if output.exists():
                    output.unlink()
                report["not_read"].append({"file": item, "reason": getattr(error, "sqlite_errorname", "SQLITE_NOT_READ")})
    runtime = source / "agent-runtime"
    records = runtime / "records"
    if not runtime.is_symlink() and not records.is_symlink() and records.is_dir():
        for directory, names, files in os.walk(records, followlinks=False):
            names[:] = [name for name in names if not (Path(directory) / name).is_symlink()]
            report["encrypted_records_not_read"] += sum(name.endswith(".json") for name in files)
    report["not_read"].append({"file": "agent-runtime/records", "reason": "ENCRYPTED_CONTENT"})
    report["not_read"].append({"file": "feed/secrets.json", "reason": "CREDENTIAL_STORE"})
    report["not_read"].append({"file": "runtime-config-backups", "reason": "MAY_CONTAIN_CREDENTIALS"})
    for directory, _, _ in os.walk(target):
        Path(directory).chmod(0o700)
    return report


def table_exists(db, name):
    return db.execute("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?", (name,)).fetchone() is not None


def columns(db, table):
    return [row[1] for row in db.execute('PRAGMA table_info("' + table.replace('"', '""') + '")')]


def scalar(db, sql, args=()):
    row = db.execute(sql, args).fetchone()
    return row[0] if row else None


def stored_version(db, metadata, store):
    if store:
        if not table_exists(db, "plugin_project_databases"):
            return "NO_PLUGIN_LEDGER"
        return scalar(db, "SELECT version FROM plugin_project_databases WHERE store_name=?", (store,))
    if metadata == "user_version":
        return scalar(db, "PRAGMA user_version")
    table, key = metadata.split(".", 1)
    if not table_exists(db, table):
        return "NO_METADATA"
    if {"key", "value"}.issubset(columns(db, table)):
        return scalar(db, 'SELECT value FROM "' + table.replace('"', '""') + '" WHERE key=?', (key,))
    if key not in columns(db, table):
        return "NO_METADATA"
    return scalar(db, 'SELECT "' + key.replace('"', '""') + '" FROM "' + table.replace('"', '""') + '"')


def title_is_broken(text):
    index = 0
    while index < len(text):
        point = ord(text[index])
        if 0xD800 <= point <= 0xDBFF:
            if index + 1 == len(text) or not 0xDC00 <= ord(text[index + 1]) <= 0xDFFF:
                return True
            index += 1
        elif 0xDC00 <= point <= 0xDFFF:
            return True
        index += 1
    return False


def metadata_counts(db, journey_ids=()):
    result = {}
    if table_exists(db, "workspaces") and table_exists(db, "workspace_project_memberships"):
        result["empty_workspaces"] = scalar(db, "SELECT count(*) FROM workspaces AS workspace WHERE NOT EXISTS (SELECT 1 FROM workspace_project_memberships AS member WHERE member.workspace_id=workspace.workspace_id)")
    if table_exists(db, "plugin_runtime_installs"):
        result["invalid_install_records"] = scalar(db, "SELECT count(*) FROM plugin_runtime_installs WHERE NOT json_valid(record_json)")
        result["disabled_unclassified"] = scalar(db, "SELECT count(*) FROM plugin_runtime_installs WHERE json_valid(record_json) AND json_extract(record_json,'$.state')='disabled'")
        result["characters_installs"] = scalar(db, "SELECT count(*) FROM plugin_runtime_installs WHERE json_valid(record_json) AND json_extract(record_json,'$.plugin_id') IN (?,?)", CHARACTERS)
        result["ui_commands_in_installs"] = scalar(db, "SELECT count(*) FROM plugin_runtime_installs WHERE json_valid(record_json) AND json_type(record_json,'$.manifest.ui.commands') IS NOT NULL")
        installation = "SELECT install_id FROM plugin_runtime_installs WHERE json_valid(record_json) AND json_extract(record_json,'$.plugin_id')=?"
        related = {}
        for table, column in (("plugin_private_values", "install_id"), ("plugin_events", "source_install_id"),
                              ("plugin_event_cursors", "subscriber_install_id"), ("plugin_notifications", "sender_install_id"),
                              ("schedule_action_bindings", "install_id")):
            if table_exists(db, table) and column in columns(db, table):
                related[table] = scalar(db, 'SELECT count(*) FROM "' + table + '" WHERE "' + column + '" IN (' + installation + ')', (CHARACTERS[0],))
        if table_exists(db, "plugin_event_resolutions"):
            related["plugin_event_resolutions"] = scalar(db, "SELECT count(*) FROM plugin_event_resolutions WHERE json_valid(record_json) AND json_extract(record_json,'$.subscriber_install_id') IN (" + installation + ")", (CHARACTERS[0],))
        result["characters_install_scoped_rows"] = related
    if table_exists(db, "plugin_runtime_release_artifacts"):
        result["ui_commands_in_archives"] = scalar(db, "SELECT count(*) FROM plugin_runtime_release_artifacts WHERE json_valid(artifact_json) AND json_type(artifact_json,'$.manifest.ui.commands') IS NOT NULL")
        result["characters_archives"] = scalar(db, "SELECT count(*) FROM plugin_runtime_release_artifacts WHERE plugin_id IN (?,?)", CHARACTERS)
    if table_exists(db, "inbox_entries"):
        owner = " AND owner_plugin_id IS NULL" if "owner_plugin_id" in columns(db, "inbox_entries") else ""
        result["unowned_goal_reminders"] = scalar(db, "SELECT count(*) FROM inbox_entries WHERE subject_type='goal_decision'" + owner)
    if table_exists(db, "library_artifacts"):
        result["native_feed_lines"] = scalar(db, "SELECT count(*) FROM library_artifacts WHERE producer_binding_signature='native:feed' AND producer_plugin_id IN ('io.molis.work.native.feed','io.molis.work.feed')")
    if table_exists(db, "journeys"):
        # SQLite returns only the quoted title token, preserving escaped lone surrogates. Never return or parse a journey body.
        sql = "SELECT journeys.body -> tree.fullkey FROM journeys,json_tree(journeys.body) AS tree WHERE tree.key='title' AND tree.type='text'"
        result["broken_onboarding_titles"] = sum(title_is_broken(json.loads(row[0])) for row in db.execute(sql))
    if table_exists(db, "pages") and table_exists(db, "page_imports"):
        # The old partTitle result was saved in Pages, not back into the journey. A UTF-8 TEXT binding can replace a lone
        # surrogate with U+FFFD: count that as a candidate, never proof that the person's original title was corrupted.
        titles = {}
        sql = "SELECT pages.id,pages.title FROM pages JOIN page_imports AS receipt ON receipt.project_id=pages.project_id JOIN json_each(receipt.document_ids_json) AS ids ON ids.value=pages.id WHERE substr(receipt.request_id,1,length(?))=? AND (substr(receipt.request_id,length(?)+1,9)=':sources:' OR receipt.request_id=?)"
        for journey in journey_ids:
            titles.update(db.execute(sql, (journey, journey, journey, journey + ":summary")).fetchall())
        result["onboarding_page_titles_checked"] = len(titles)
        result["onboarding_page_titles_broken"] = sum(title_is_broken(title) for title in titles.values())
        result["onboarding_page_titles_replacement_candidates"] = sum("\ufffd" in title for title in titles.values())
    if table_exists(db, "todo_batches"):
        sql = "SELECT batch.body_json -> tree.fullkey FROM todo_batches AS batch,json_tree(batch.body_json) AS tree WHERE batch.origin='onboarding' AND tree.key='title' AND tree.type='text'"
        titles = [json.loads(row[0]) for row in db.execute(sql)]
        result["onboarding_todo_titles_broken"] = sum(title_is_broken(title) for title in titles)
        result["onboarding_todo_titles_replacement_candidates"] = sum("\ufffd" in title for title in titles)
    return result


def inventory(given, checklist):
    root = Path(given).resolve()
    if within(root, Path.home() / ".molis-work"):
        raise ValueError("inventory accepts a copy outside the real Home only")
    files = sorted(set(root.rglob("*.db")) | set(root.rglob("*.sqlite")))
    files = [file for file in files if file.is_file() and not file.is_symlink() and within(file.resolve(), root) and file.stat().st_nlink == 1]
    result = {"stores": [], "metadata": {}, "sqlite_files": len(files), "not_read": []}
    projects = {file.parent.name for file in files if file.name == "molis-work.db" and file.parent.parent == root / "projects" and not file.parent.name.startswith(".")}
    catalog = root / "projects/catalog.db"
    if catalog in files:
        db = readonly(catalog)
        try:
            for row in db.execute("SELECT project_id FROM projects"):
                key = row[0]
                if isinstance(key, str) and key not in ("", ".", "..") and not any(char in key for char in "/\\\0"):
                    projects.add(key)
        finally:
            db.close()
    projects = sorted(projects)
    for line in Path(checklist).read_text().splitlines():
        cells = [cell.strip().strip("`") for cell in line.split("|")[1:-1]]
        if len(cells) != 6 or not cells[2].isdigit() or "/" not in cells[1]:
            continue
        position, metadata = cells[1], cells[3]
        file_pattern, _, store = position.partition("#")
        candidates = [root / file_pattern.replace("<project_id>", project) for project in projects] if "<project_id>" in file_pattern else [root / file_pattern]
        actual = []
        for file in candidates:
            if position == "feed/secrets.json":
                actual.append("NOT_READ_CREDENTIAL_STORE")
                continue
            if not file.exists():
                actual.append("MISSING_IN_COPY")
                continue
            try:
                if file.suffix == ".json":
                    value = json.loads(file.read_text()).get("version")
                    actual.append(value if isinstance(value, int) else "INVALID_JSON_VERSION")
                else:
                    db = readonly(file)
                    try:
                        value = stored_version(db, metadata, store)
                        if isinstance(value, str) and value.isdecimal():
                            value = int(value)
                        actual.append(value if isinstance(value, int) else value if value in ("NO_PLUGIN_LEDGER", "NO_METADATA") else "NO_VERSION")
                    finally:
                        db.close()
            except (sqlite3.Error, ValueError, KeyError):
                actual.append("NOT_READ")
        result["stores"].append({"position": position, "expected": int(cells[2]), "actual": actual})
    journey_ids = set()
    for file in files:
        try:
            db = readonly(file)
            try:
                if table_exists(db, "journeys"):
                    journey_ids.update(row[0] for row in db.execute("SELECT id FROM journeys") if isinstance(row[0], str))
            finally:
                db.close()
        except sqlite3.Error:
            result["not_read"].append(file.relative_to(root).as_posix())
    for file in files:
        try:
            db = readonly(file)
            try:
                counts = metadata_counts(db, journey_ids)
                counts["integrity_ok"] = scalar(db, "PRAGMA integrity_check") == "ok"
                counts["foreign_key_errors"] = len(db.execute("PRAGMA foreign_key_check").fetchall())
                result["metadata"][file.relative_to(root).as_posix()] = counts
            finally:
                db.close()
        except (sqlite3.Error, ValueError, UnicodeError):
            result["not_read"].append(file.relative_to(root).as_posix())
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["copy", "list"])
    parser.add_argument("--home", required=True)
    parser.add_argument("--destination")
    parser.add_argument("--approved-copy", action="store_true")
    args = parser.parse_args()
    if args.command == "copy":
        if not args.destination:
            parser.error("copy requires --destination <new directory>")
        result = copy_home(args.home, args.destination, args.approved_copy)
    else:
        result = inventory(args.home, Path(__file__).parents[2] / "docs/releases/CHECKLIST.md")
    print(json.dumps(result, ensure_ascii=True))


if __name__ == "__main__":
    main()
