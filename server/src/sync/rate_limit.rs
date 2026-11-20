use crate::protocol::{ApiResult, Failure};
use serde_json::Value;
use worker::{D1Database, Env};

/// Edge admission has no D1 write. Keys contain a verified space ID or a digest of the client IP.
pub(crate) async fn admit(env: &Env, bucket: &str) -> ApiResult<()> {
    if !env
        .rate_limiter("SYNC_RATE_LIMIT")?
        .limit(bucket.to_owned())
        .await?
        .success
    {
        return Err(Failure(429, "SYNC_RATE_LIMITED"));
    }
    Ok(())
}

/// Maintenance keeps a strict shared limit across Cloudflare locations.
pub(crate) async fn admit_maintenance(db: &D1Database, bucket: &str) -> ApiResult<()> {
    let row=db.prepare("INSERT INTO sync_rate_windows VALUES (?,unixepoch()/60,1) ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN sync_rate_windows.window=unixepoch()/60 THEN sync_rate_windows.hits+1 ELSE 1 END,window=unixepoch()/60 RETURNING hits")
        .bind(&[bucket.into()])?.first::<Value>(None).await?.ok_or(Failure(503,"SYNC_UNAVAILABLE"))?;
    if row["hits"].as_i64().is_none_or(|hits| hits > 20) {
        return Err(Failure(429, "SYNC_RATE_LIMITED"));
    }
    Ok(())
}
