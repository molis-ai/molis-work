use crate::protocol::{ApiResult, Failure, string};
use serde_json::{Value, json};
use wasm_bindgen::JsValue;
use worker::{Bucket, D1Database, Env};

/** Claim first: restoring a deleted head and purging it compete on the same D1 row. */
pub(crate) async fn claim(
    db: &D1Database,
    space: &str,
    namespace: &str,
    key: &str,
    revision: i64,
    explicit: bool,
) -> ApiResult<()> {
    let changed=db.prepare("UPDATE sync_heads SET purged_at=unixepoch()*1000 WHERE space=? AND namespace=? AND key=? AND revision=? AND deleted_at IS NOT NULL AND purged_at IS NULL AND (?=1 OR deleted_at<=unixepoch()*1000-2592000000) RETURNING revision")
        .bind(&[space.into(),namespace.into(),key.into(),JsValue::from_f64(revision as f64),JsValue::from_f64(if explicit{1.0}else{0.0})])?.first::<Value>(None).await?;
    if changed.is_none() {
        return Err(Failure(409, "SYNC_RETENTION_CONFLICT"));
    }
    Ok(())
}
async fn prune(db: &D1Database, scope: Option<&str>) -> ApiResult<()> {
    let rows=db.prepare("SELECT space,namespace,key,revision,purged_at FROM sync_heads h WHERE deleted_at IS NOT NULL AND ((purged_at IS NULL AND deleted_at<=unixepoch()*1000-2592000000) OR (purged_at IS NOT NULL AND EXISTS(SELECT 1 FROM sync_events e WHERE e.space=h.space AND e.namespace=h.namespace AND e.key=h.key AND e.revision<>h.revision))) AND (? IS NULL OR space=?) ORDER BY revision LIMIT 2")
        .bind(&[scope.map_or(JsValue::NULL,JsValue::from_str),scope.map_or(JsValue::NULL,JsValue::from_str)])?.all().await?.results::<Value>()?;
    for row in rows {
        let (space, namespace, key) = (
            string(&row, "space", 250)?,
            string(&row, "namespace", 2500)?,
            string(&row, "key", 500)?,
        );
        if row["purged_at"].is_null()
            && claim(
                db,
                space,
                namespace,
                key,
                row["revision"]
                    .as_i64()
                    .ok_or(Failure(503, "INVALID_STORAGE"))?,
                false,
            )
            .await
            .is_err()
        {
            continue;
        }
        db.prepare("DELETE FROM sync_events WHERE space=? AND namespace=? AND key=? AND revision<>(SELECT revision FROM sync_heads WHERE space=? AND namespace=? AND key=? AND purged_at IS NOT NULL)")
            .bind(&[space.into(),namespace.into(),key.into(),space.into(),namespace.into(),key.into()])?.run().await?;
    }
    Ok(())
}
async fn enqueue(db: &D1Database, scope: Option<&str>) -> ApiResult<()> {
    // Replaced owner graphs remain protected for 30 days from replacement, including nested deletions.
    // Deleted heads keep their complete retained body until that tombstone's own retention expires.
    db.prepare("DELETE FROM sync_events WHERE revision IN (SELECT e.revision FROM sync_events e JOIN sync_heads h ON h.space=e.space AND h.namespace=e.namespace AND h.key=e.key WHERE h.deleted_at IS NULL AND e.revision<>h.revision AND NOT EXISTS(SELECT 1 FROM sync_history_pins p WHERE p.space=e.space AND p.namespace=e.namespace AND p.revision=e.revision) AND NOT EXISTS(SELECT 1 FROM sync_version_retention r WHERE r.space=e.space AND r.namespace=e.namespace AND r.revision=e.revision AND r.retained_until>unixepoch()*1000) AND e.created_at<unixepoch()*1000-2592000000 AND (? IS NULL OR e.space=?) ORDER BY e.revision LIMIT 20)")
      .bind(&[scope.map_or(JsValue::NULL,JsValue::from_str),scope.map_or(JsValue::NULL,JsValue::from_str)])?.run().await?;
    let claimed=db.prepare("UPDATE sync_blobs SET deleting=1 WHERE (space,digest) IN (SELECT b.space,b.digest FROM sync_blobs b WHERE b.deleting=0 AND b.created_at<unixepoch()*1000-86400000 AND (? IS NULL OR b.space=?) AND NOT EXISTS(SELECT 1 FROM sync_events e,json_each(e.attachments) a WHERE e.space=b.space AND json_extract(a.value,'$.digest')=b.digest) ORDER BY b.created_at LIMIT 2) RETURNING space,digest,generation")
        .bind(&[scope.map_or(JsValue::NULL,JsValue::from_str),scope.map_or(JsValue::NULL,JsValue::from_str)])?.all().await?.results::<Value>()?;
    for row in claimed {
        db.prepare("INSERT OR IGNORE INTO sync_gc_jobs(space,digest,generation) VALUES (?,?,?)")
            .bind(&[
                string(&row, "space", 250)?.into(),
                string(&row, "digest", 64)?.into(),
                string(&row, "generation", 32)?.into(),
            ])?
            .run()
            .await?;
    }
    // A crash after claiming but before enqueuing is resumable without reopening the reservation.
    db.prepare("INSERT OR IGNORE INTO sync_gc_jobs(space,digest,generation) SELECT space,digest,generation FROM sync_blobs WHERE deleting=1 AND (? IS NULL OR space=?) LIMIT 2")
        .bind(&[scope.map_or(JsValue::NULL,JsValue::from_str),scope.map_or(JsValue::NULL,JsValue::from_str)])?.run().await?;
    Ok(())
}
async fn collect(db: &D1Database, bucket: &Bucket, scope: Option<&str>) -> ApiResult<usize> {
    let jobs=db.prepare("SELECT space,digest,generation FROM sync_gc_jobs WHERE state='pending' AND (? IS NULL OR space=?) ORDER BY attempts,space,digest LIMIT 2")
        .bind(&[scope.map_or(JsValue::NULL,JsValue::from_str),scope.map_or(JsValue::NULL,JsValue::from_str)])?.all().await?.results::<Value>()?;
    let mut completed = 0;
    for job in jobs {
        let (space, digest, generation) = (
            string(&job, "space", 250)?,
            string(&job, "digest", 64)?,
            string(&job, "generation", 32)?,
        );
        let args = vec![
            JsValue::from_str(space),
            JsValue::from_str(digest),
            JsValue::from_str(generation),
        ];
        db.prepare("UPDATE sync_gc_jobs SET attempts=attempts+1 WHERE space=? AND digest=? AND generation=?").bind(&args)?.run().await?;
        let result = collect_generation(db, bucket, space, digest, generation).await;
        if result.is_ok() {
            completed += 1;
        } else {
            db.prepare("UPDATE sync_gc_jobs SET last_error='SYNC_GC_FAILED' WHERE space=? AND digest=? AND generation=?").bind(&args)?.run().await?;
        }
    }
    Ok(completed)
}
async fn collect_generation(
    db: &D1Database,
    bucket: &Bucket,
    space: &str,
    digest: &str,
    generation: &str,
) -> ApiResult<()> {
    let prefix = format!("{space}/{digest}/{generation}/");
    let list = bucket.list().prefix(&prefix).limit(100).execute().await?;
    let keys = list
        .objects()
        .into_iter()
        .map(|object| object.key())
        .collect::<Vec<_>>();
    if !keys.is_empty() {
        bucket.delete_multiple(keys).await?;
    }
    if list.truncated() {
        return Err(Failure(503, "SYNC_GC_INCOMPLETE"));
    }
    let args = vec![
        JsValue::from_str(space),
        JsValue::from_str(digest),
        JsValue::from_str(generation),
    ];
    // Byte accounting is released only after R2 deletion succeeds. A newer generation is never touched.
    db.batch(vec![
        db.prepare("DELETE FROM sync_blob_parts WHERE space=? AND digest=? AND generation=? AND EXISTS(SELECT 1 FROM sync_blobs b WHERE b.space=sync_blob_parts.space AND b.digest=sync_blob_parts.digest AND b.generation=sync_blob_parts.generation AND b.deleting=1)").bind(&args)?,
        db.prepare("DELETE FROM sync_blobs WHERE space=? AND digest=? AND generation=? AND deleting=1").bind(&args)?,
        db.prepare("UPDATE sync_gc_jobs SET state='done',last_error=NULL WHERE space=? AND digest=? AND generation=?").bind(&args)?,
    ]).await?;
    Ok(())
}
pub(crate) async fn sweep(env: &Env, scope: Option<&str>) -> ApiResult<Value> {
    crate::write_mode::require_write(env)?;
    let db = env.d1("DB")?;
    crate::quota::check_schema(&db).await?;
    db.prepare("DELETE FROM sync_rate_windows WHERE window<unixepoch()/60-1440")
        .run()
        .await?;
    let bucket = env.bucket("BLOBS")?;
    prune(&db, scope).await?;
    enqueue(&db, scope).await?;
    if scope.is_none() {
        scan_orphans(&db, &bucket).await?;
    }
    let collected = collect(&db, &bucket, scope).await?;
    Ok(json!({"collected":collected}))
}
async fn scan_orphans(db: &D1Database, bucket: &Bucket) -> ApiResult<()> {
    let previous = db
        .prepare("SELECT cursor FROM sync_maintenance_state WHERE id=1")
        .first::<Value>(None)
        .await?;
    let mut builder = bucket.list().limit(5);
    if let Some(cursor) = previous.as_ref().and_then(|row| row["cursor"].as_str()) {
        builder = builder.cursor(cursor);
    }
    let list = builder.execute().await?;
    for object in list.objects() {
        let key = object.key();
        let parts = key.split('/').collect::<Vec<_>>();
        if parts.len() != 5
            || parts[0].len() > 250
            || parts[1].len() != 64
            || parts[2].len() != 32
            || !parts[1..=2].iter().all(|text| {
                text.bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            })
        {
            continue;
        }
        let current = db
            .prepare(
                "SELECT 1 AS present FROM sync_blobs WHERE space=? AND digest=? AND generation=?",
            )
            .bind(&[parts[0].into(), parts[1].into(), parts[2].into()])?
            .first::<Value>(None)
            .await?;
        if current.is_none() {
            db.prepare("INSERT INTO sync_gc_jobs(space,digest,generation) VALUES (?,?,?) ON CONFLICT(space,digest,generation) DO UPDATE SET state='pending'").bind(&[parts[0].into(),parts[1].into(),parts[2].into()])?.run().await?;
        }
    }
    let cursor = if list.truncated() {
        list.cursor()
            .map_or(JsValue::NULL, |value| JsValue::from_str(&value))
    } else {
        JsValue::NULL
    };
    db.prepare("INSERT INTO sync_maintenance_state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET cursor=excluded.cursor").bind(&[cursor])?.run().await?;
    Ok(())
}
