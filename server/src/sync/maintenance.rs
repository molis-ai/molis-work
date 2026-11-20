use crate::protocol::{ApiResult, Failure, string};
use serde_json::{Value, json};
use wasm_bindgen::JsValue;
use worker::{Bucket, D1Database, Env};

const PROJECT_CATALOG_NS: &str = "json_valid(namespace) AND json_extract(namespace,'$[0]') LIKE 'io.molis.work.module.projects.%' AND json_extract(namespace,'$[3]')='projects'";

/** Claim first: restoring a deleted head and purging it compete on the same D1 row. */
pub(crate) async fn claim(
    db: &D1Database,
    space: &str,
    namespace: &str,
    key: &str,
    revision: i64,
) -> ApiResult<()> {
    // An explicit claim never reaches a sealed process-items stream; its trash keeps the ordinary expiry only.
    let args = [
        space.into(),
        namespace.into(),
        key.into(),
        JsValue::from_f64(revision as f64),
    ];
    let mut claim_args = args.to_vec();
    claim_args.push(crate::cutover::PUBLIC.into());
    db.batch(vec![
        db.prepare("UPDATE sync_heads SET purged_at=unixepoch()*1000 WHERE space=?1 AND namespace=?2 AND key=?3 AND revision=?4 AND deleted_at IS NOT NULL AND purged_at IS NULL AND NOT (namespace=?5 AND EXISTS(SELECT 1 FROM sync_cutovers c WHERE c.space=sync_heads.space)) AND EXISTS(SELECT 1 FROM sync_policy p,json_each(p.namespaces) n WHERE p.space=?1 AND n.value=?2)").bind(&claim_args)?,
        db.prepare("DELETE FROM sync_events WHERE space=?1 AND namespace=?2 AND key=?3 AND revision<>?4 AND EXISTS(SELECT 1 FROM sync_heads h WHERE h.space=?1 AND h.namespace=?2 AND h.key=?3 AND h.revision=?4 AND h.purged_at IS NOT NULL)").bind(&args)?,
    ]).await?;
    let purged=db.prepare("SELECT 1 FROM sync_heads WHERE space=?1 AND namespace=?2 AND key=?3 AND revision=?4 AND purged_at IS NOT NULL").bind(&args)?.first::<Value>(None).await?;
    crate::protocol::require(purged.is_some(), 409, "SYNC_RETENTION_CONFLICT")?;
    cascade_expired_projects(db, Some(space)).await?;
    Ok(())
}
/// Cascade purged project-catalog heads to every child head whose composite key begins with that
/// project ID, without naming any plugin in Rust. Purged child heads stay as tombstones to block
/// late offline resurrection while releasing all child event bytes and R2 attachment references.
async fn cascade_expired_projects(db: &D1Database, scope: Option<&str>) -> ApiResult<()> {
    let scope = scope.map_or(JsValue::NULL, JsValue::from_str);
    let args = [scope.clone(), scope];
    let mark_children = format!(
        "UPDATE sync_heads
         SET deleted_at=COALESCE(deleted_at,(
               SELECT p.deleted_at FROM sync_heads p
               WHERE p.space=sync_heads.space AND p.purged_at IS NOT NULL
                 AND p.key=json_extract(sync_heads.key,'$[0]') AND {PROJECT_CATALOG_NS}
               LIMIT 1
             )),
             purged_at=unixepoch()*1000
         WHERE (space,namespace,key) IN (
           SELECT c.space,c.namespace,c.key FROM sync_heads c
           WHERE c.purged_at IS NULL AND (? IS NULL OR c.space=?)
             AND json_valid(c.key) AND json_type(c.key)='array'
             AND EXISTS(
               SELECT 1 FROM sync_heads p
               WHERE p.space=c.space AND p.namespace<>c.namespace AND p.purged_at IS NOT NULL
                 AND p.key=json_extract(c.key,'$[0]')
                 AND json_valid(p.namespace)
                 AND json_extract(p.namespace,'$[0]') LIKE 'io.molis.work.module.projects.%'
                 AND json_extract(p.namespace,'$[3]')='projects'
             )
           ORDER BY c.revision LIMIT 50
         )"
    );
    let release_child_events = "WITH cascaded AS (
        SELECT c.space,c.namespace,c.key FROM sync_heads c
        WHERE c.purged_at IS NOT NULL AND (? IS NULL OR c.space=?)
          AND json_valid(c.key) AND json_type(c.key)='array'
          AND EXISTS(
            SELECT 1 FROM sync_heads p
            WHERE p.space=c.space AND p.namespace<>c.namespace AND p.purged_at IS NOT NULL
              AND p.key=json_extract(c.key,'$[0]')
              AND json_valid(p.namespace)
              AND json_extract(p.namespace,'$[0]') LIKE 'io.molis.work.module.projects.%'
              AND json_extract(p.namespace,'$[3]')='projects'
          )
          AND EXISTS(SELECT 1 FROM sync_events e WHERE e.space=c.space AND e.namespace=c.namespace AND e.key=c.key)
        ORDER BY c.revision LIMIT 50
      )
      DELETE FROM sync_events WHERE revision IN (
        SELECT e.revision FROM cascaded c JOIN sync_events e
          ON e.space=c.space AND e.namespace=c.namespace AND e.key=c.key
      )";
    db.batch(vec![
        db.prepare(&mark_children).bind(&args)?,
        db.prepare(release_child_events).bind(&args)?,
    ])
    .await?;
    Ok(())
}
// Each pass admits a bounded number of keys. Claim and prune in one D1 batch so a racing
// restore either commits first or sees a purged tombstone, never a partially pruned history.
async fn prune(db: &D1Database, scope: Option<&str>) -> ApiResult<()> {
    let scope_val = scope.map_or(JsValue::NULL, JsValue::from_str);
    let args = [scope_val.clone(), scope_val];
    db.batch(vec![
        db.prepare("UPDATE sync_heads SET purged_at=unixepoch()*1000 WHERE (space,namespace,key) IN (
            SELECT space,namespace,key FROM sync_heads
            WHERE deleted_at<=unixepoch()*1000-2592000000 AND purged_at IS NULL
              AND (? IS NULL OR space=?)
            ORDER BY revision LIMIT 20)").bind(&args)?,
        db.prepare("WITH pending AS (
            SELECT h.space,h.namespace,h.key,h.revision FROM sync_heads h
            WHERE purged_at IS NOT NULL AND deleted_at IS NOT NULL AND (? IS NULL OR space=?)
              AND EXISTS(SELECT 1 FROM sync_events e WHERE e.space=h.space AND e.namespace=h.namespace AND e.key=h.key AND e.revision<>h.revision)
            ORDER BY h.revision LIMIT 20
        )
        DELETE FROM sync_events WHERE revision IN (
            SELECT e.revision FROM pending p JOIN sync_events e
              ON e.space=p.space AND e.namespace=p.namespace AND e.key=p.key AND e.revision<>p.revision
        )").bind(&args)?,
    ]).await?;
    cascade_expired_projects(db, scope).await?;
    Ok(())
}
async fn enqueue(db: &D1Database, scope: Option<&str>) -> ApiResult<()> {
    // Replaced long-lived owner graphs remain protected for 30 days from replacement, while
    // intermediate continuous edits expire after their 24-hour retention window.
    // Pinned conflict branches and deleted heads keep their complete retained body for 30 days.
    db.prepare("DELETE FROM sync_events WHERE revision IN (SELECT e.revision FROM sync_events e JOIN sync_heads h ON h.space=e.space AND h.namespace=e.namespace AND h.key=e.key WHERE h.deleted_at IS NULL AND e.revision<>h.revision AND NOT EXISTS(SELECT 1 FROM sync_history_pins p WHERE p.space=e.space AND p.namespace=e.namespace AND p.revision=e.revision) AND NOT EXISTS(SELECT 1 FROM sync_version_retention r WHERE r.space=e.space AND r.namespace=e.namespace AND r.revision=e.revision AND r.retained_until>unixepoch()*1000) AND (e.created_at<unixepoch()*1000-2592000000 OR (e.action='write' AND e.value<>'null' AND e.created_at<unixepoch()*1000-86400000 AND EXISTS(SELECT 1 FROM sync_version_retention r WHERE r.space=e.space AND r.namespace=e.namespace AND r.revision=e.revision AND r.retained_until<=unixepoch()*1000))) AND (? IS NULL OR e.space=?) ORDER BY e.revision LIMIT 20)")
      .bind(&[scope.map_or(JsValue::NULL,JsValue::from_str),scope.map_or(JsValue::NULL,JsValue::from_str)])?.run().await?;
    // Thirty days after a cutover completes, the sealed stream's unpinned current bodies go too. Heads and receipts stay,
    // so the keys remain known (and never become terminal) while their attachments follow the ordinary reference count.
    db.prepare("DELETE FROM sync_events WHERE revision IN (SELECT e.revision FROM sync_events e JOIN sync_heads h ON h.space=e.space AND h.namespace=e.namespace AND h.key=e.key AND h.revision=e.revision JOIN sync_cutovers c ON c.space=e.space AND c.completed_at IS NOT NULL AND c.completed_at<=unixepoch()*1000-2592000000 WHERE e.namespace=? AND h.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM sync_history_pins p WHERE p.space=e.space AND p.namespace=e.namespace AND p.revision=e.revision) AND (? IS NULL OR e.space=?) ORDER BY e.revision LIMIT 20)")
      .bind(&[crate::cutover::PUBLIC.into(),scope.map_or(JsValue::NULL,JsValue::from_str),scope.map_or(JsValue::NULL,JsValue::from_str)])?.run().await?;
    // Enqueue new and interrupted claims together without a D1 round-trip per generation.
    let scope = scope.map_or(JsValue::NULL, JsValue::from_str);
    let args = [scope.clone(), scope];
    db.batch(vec![
        db.prepare("UPDATE sync_blobs SET deleting=1 WHERE (space,digest) IN (
            SELECT b.space,b.digest FROM sync_blobs b
            WHERE b.deleting=0 AND b.created_at<unixepoch()*1000-86400000 AND (? IS NULL OR b.space=?)
              AND NOT EXISTS(SELECT 1 FROM sync_events e,json_each(e.attachments) a WHERE e.space=b.space AND json_extract(a.value,'$.digest')=b.digest)
            ORDER BY b.created_at LIMIT 20)").bind(&args)?,
        db.prepare("INSERT OR IGNORE INTO sync_gc_jobs(space,digest,generation)
            SELECT b.space,b.digest,b.generation FROM sync_blobs b WHERE b.deleting=1 AND (? IS NULL OR b.space=?)
              AND NOT EXISTS(SELECT 1 FROM sync_gc_jobs j WHERE j.space=b.space AND j.digest=b.digest AND j.generation=b.generation)
            ORDER BY b.created_at LIMIT 20").bind(&args)?,
    ]).await?;
    Ok(())
}
async fn collect(db: &D1Database, bucket: &Bucket, scope: Option<&str>) -> ApiResult<usize> {
    let jobs=db.prepare("SELECT space,digest,generation FROM sync_gc_jobs WHERE state='pending' AND (? IS NULL OR space=?) ORDER BY attempts,space,digest LIMIT 20")
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
        db.prepare("DELETE FROM sync_cutover_blobs WHERE space=? AND digest=? AND generation=? AND EXISTS(SELECT 1 FROM sync_blobs b WHERE b.space=sync_cutover_blobs.space AND b.digest=sync_cutover_blobs.digest AND b.generation=sync_cutover_blobs.generation AND b.deleting=1)").bind(&args)?,
        db.prepare("DELETE FROM sync_blob_parts WHERE space=? AND digest=? AND generation=? AND EXISTS(SELECT 1 FROM sync_blobs b WHERE b.space=sync_blob_parts.space AND b.digest=sync_blob_parts.digest AND b.generation=sync_blob_parts.generation AND b.deleting=1)").bind(&args)?,
        db.prepare("DELETE FROM sync_blobs WHERE space=? AND digest=? AND generation=? AND deleting=1").bind(&args)?,
        db.prepare("UPDATE sync_gc_jobs SET state='done',last_error=NULL WHERE space=? AND digest=? AND generation=?").bind(&args)?,
    ]).await?;
    Ok(())
}
pub(crate) async fn sweep(env: &Env, scope: Option<&str>) -> ApiResult<Value> {
    crate::write_mode::require_write(env)?;
    let db = env.d1("DB")?;
    crate::quota::validate_schema(&db).await?;
    db.prepare("DELETE FROM sync_rate_windows WHERE window<unixepoch()/60-1440")
        .run()
        .await?;
    let bucket = env.bucket("FILES")?;
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
    let mut builder = bucket.list().limit(20);
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
        if current.is_some() {
            // In a sealed account, a losing writer's object for a part that is already fixed with another checksum is
            // removed exactly; an object with the recorded checksum is the shared one and stays.
            let stale=db.prepare("SELECT 1 AS stale FROM sync_blob_parts p JOIN sync_blobs b ON b.space=p.space AND b.digest=p.digest AND b.generation=p.generation AND b.ready=1 WHERE p.space=? AND p.digest=? AND p.generation=? AND p.part=? AND p.checksum<>? AND EXISTS(SELECT 1 FROM sync_cutovers c WHERE c.space=p.space)")
                .bind(&[parts[0].into(),parts[1].into(),parts[2].into(),parts[3].parse::<f64>().map_or(JsValue::NULL,JsValue::from_f64),parts[4].into()])?.first::<Value>(None).await?;
            if stale.is_some() {
                bucket.delete(key.clone()).await?;
            }
        } else {
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
