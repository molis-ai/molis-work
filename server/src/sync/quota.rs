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
    )
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
