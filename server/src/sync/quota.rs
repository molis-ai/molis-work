use crate::protocol::{ApiResult, Failure, require};
use serde_json::{Value, json};
use worker::D1Database;

pub(crate) async fn check_schema(db: &D1Database) -> ApiResult<()> {
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
    let expected = adoption_objects();
    let names = serde_json::to_string(&expected.iter().map(|(name, _)| name).collect::<Vec<_>>())
        .map_err(|_| Failure(503, "SYNC_SCHEMA_MISMATCH"))?;
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
