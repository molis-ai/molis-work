use crate::protocol::{ApiResult, Failure};
use serde_json::Value;
use worker::D1Database;

/** Atomic fixed windows. Buckets are trusted identity or a digest, never tokens or asset content. */
pub(crate) async fn admit(db: &D1Database, bucket: &str, limit: i64) -> ApiResult<()> {
    let row=db.prepare("INSERT INTO sync_rate_windows VALUES (?,unixepoch()/60,1) ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN sync_rate_windows.window=unixepoch()/60 THEN sync_rate_windows.hits+1 ELSE 1 END,window=unixepoch()/60 RETURNING hits")
        .bind(&[bucket.into()])?.first::<Value>(None).await?.ok_or(Failure(503,"SYNC_UNAVAILABLE"))?;
    if row["hits"].as_i64().is_none_or(|hits| hits > limit) {
        return Err(Failure(429, "SYNC_RATE_LIMITED"));
    }
    Ok(())
}
