use crate::protocol::{ApiResult, Failure, require};
use serde_json::{Value, json};
use std::cell::Cell;
use std::sync::OnceLock;
use worker::{D1Database, Date};

const SCHEMA_TTL_MS: u64 = 30_000;
thread_local! {
    // An isolate belongs to one deployment with a fixed DB binding.
    static VALID_UNTIL: Cell<u64> = const { Cell::new(0) };
}

pub(crate) async fn check_schema(db: &D1Database) -> ApiResult<()> {
    let now = Date::now().as_millis();
    if now >= VALID_UNTIL.get() {
        validate_schema(db).await?;
        VALID_UNTIL.set(now + SCHEMA_TTL_MS);
    }
    Ok(())
}

pub(crate) fn invalidate_schema() {
    VALID_UNTIL.set(0);
}

pub(crate) async fn validate_schema(db: &D1Database) -> ApiResult<()> {
    let version = db
        .prepare("SELECT version FROM sync_schema")
        .first::<Value>(None)
        .await
        .map_err(|_| Failure(503, "SYNC_SCHEMA_MISMATCH"))?;
    require(
        version.as_ref().is_some_and(|row| row["version"] == 6),
        503,
        "SYNC_SCHEMA_MISMATCH",
    )?;
    // Same-version structure: the database must hold exactly the objects of the cutover script. An old v6, a partial
    // adoption or a different definition is refused; nothing is created or patched here.
    static OBJECTS: OnceLock<Vec<(String, String)>> = OnceLock::new();
    let expected = OBJECTS.get_or_init(adoption_objects);
    let names = json!(expected.iter().map(|(name, _)| name).collect::<Vec<_>>()).to_string();
    let rows = db
        .prepare("SELECT name,sql FROM sqlite_master WHERE type IN ('table','trigger') AND name IN (SELECT value FROM json_each(?))")
        .bind(&[names.into()])
        .map_err(|_| Failure(503, "SYNC_SCHEMA_MISMATCH"))?
        .all()
        .await
        .map_err(|_| Failure(503, "SYNC_SCHEMA_MISMATCH"))?
        .results::<Value>()
        .map_err(|_| Failure(503, "SYNC_SCHEMA_MISMATCH"))?;
    require(
        rows.len() == expected.len()
            && expected.iter().all(|(name, sql)| {
                rows.iter()
                    .any(|row| row["name"] == name.as_str() && row["sql"] == sql.as_str())
            }),
        503,
        "SYNC_SCHEMA_MISMATCH",
    )
}

const ADOPTION: &str = include_str!("../../migrations/sync/0002_process_items_cutover.sql");
/// Each table and trigger the cutover script creates, with the exact text SQLite keeps for it.
fn adoption_objects() -> Vec<(String, String)> {
    let mut objects = Vec::new();
    let mut current: Option<(bool, Vec<&str>)> = None;
    for line in ADOPTION.lines() {
        if current.is_none() {
            if line.starts_with("CREATE TABLE ") {
                current = Some((false, Vec::new()));
            } else if line.starts_with("CREATE TRIGGER ") {
                current = Some((true, Vec::new()));
            } else {
                continue;
            }
        }
        if let Some((trigger, lines)) = current.as_mut() {
            lines.push(line);
            let done = if *trigger {
                line == "END;"
            } else {
                line.ends_with(';')
            };
            if done {
                let text = lines.join("\n");
                let text = text.strip_suffix(';').unwrap_or(&text).to_owned();
                let name = text
                    .split_whitespace()
                    .nth(2)
                    .unwrap_or_default()
                    .trim_end_matches('(')
                    .to_owned();
                objects.push((name, text));
                current = None;
            }
        }
    }
    objects
}

pub(crate) async fn read(db: &D1Database, space: &str) -> ApiResult<Value> {
    let row = db
        .prepare("SELECT used_bytes FROM sync_usage WHERE space=?")
        .bind(&[space.into()])?
        .first::<Value>(None)
        .await?;
    let used = match row {
        Some(row) => row["used_bytes"]
            .as_i64()
            .filter(|n| *n >= 0)
            .ok_or(Failure(503, "INVALID_STORAGE"))?,
        None => 0,
    };
    Ok(json!({"limitBytes":100000000,"usedBytes":used}))
}

/// On-demand accounting only. Idle round summaries never scan event or blob references.
pub(crate) async fn breakdown(db: &D1Database, space: &str) -> ApiResult<Value> {
    let space = wasm_bindgen::JsValue::from_str(space);
    let row = db.prepare(
        "WITH events AS (
            SELECT e.content_bytes,e.attachments,CASE
                WHEN e.revision=h.revision AND h.deleted_at IS NULL THEN 3
                WHEN h.deleted_at IS NOT NULL THEN 2
                ELSE 1 END AS category
            FROM sync_events e LEFT JOIN sync_heads h
              ON h.space=e.space AND h.namespace=e.namespace AND h.key=e.key
            WHERE e.space=?1
        ), references_by_digest AS (
            SELECT json_extract(ref.value,'$.digest') AS digest,MAX(events.category) AS category
            FROM events,json_each(events.attachments) ref GROUP BY 1
        ), billed AS (
            SELECT content_bytes AS bytes,category FROM events
            UNION ALL
            SELECT b.size,COALESCE(r.category,0) FROM sync_blobs b
            LEFT JOIN references_by_digest r ON r.digest=b.digest WHERE b.space=?1
        )
        SELECT COALESCE((SELECT used_bytes FROM sync_usage WHERE space=?1),0) AS usedBytes,
               COALESCE(SUM(CASE WHEN category=3 THEN bytes END),0) AS currentBytes,
               COALESCE(SUM(CASE WHEN category=2 THEN bytes END),0) AS trashBytes,
               COALESCE(SUM(CASE WHEN category=1 THEN bytes END),0) AS historyBytes,
               COALESCE(SUM(CASE WHEN category=0 THEN bytes END),0) AS reservedAttachmentBytes,
               COALESCE((SELECT reserved_bytes FROM sync_cutovers WHERE space=?1 AND completed_at IS NULL),0) AS cutoverReservationBytes
        FROM billed",
    ).bind(&[space])?.first::<Value>(None).await?.ok_or(Failure(503,"INVALID_STORAGE"))?;
    Ok(row)
}
