use crate::protocol::{ApiResult, Failure, body, event, fields, integer, require, string};
use serde_json::{Value, json};
use wasm_bindgen::JsValue;
use worker::{D1Database, Request};

const MAX_PAGE_EVENTS: usize = 20;
const MAX_PAGE_BYTES: usize = 2 * 1024 * 1024;

pub(crate) async fn page(
    db: &D1Database,
    space: &str,
    namespace: &str,
    after: i64,
) -> ApiResult<Value> {
    // Keep the selection guard in the read itself. Use a cumulative size estimate to avoid
    // transferring a full page of large events out of D1 just to discard most of them.
    let rows = db.prepare(
        "WITH candidates AS (
            SELECT revision,operation,key,base,value,attachments FROM sync_events
            WHERE space=? AND namespace=? AND action<>'archive' AND revision>?
              AND EXISTS(SELECT 1 FROM sync_policy p,json_each(p.namespaces) n
                         WHERE p.space=sync_events.space AND n.value=sync_events.namespace)
            ORDER BY revision LIMIT ?
        ), sized AS (
            SELECT *, row_number() OVER (ORDER BY revision) AS position,
                sum(length(CAST(value AS BLOB))+length(CAST(attachments AS BLOB))
                  +length(CAST(json_quote(key) AS BLOB))+length(CAST(json_quote(operation) AS BLOB))
                  +128) OVER (ORDER BY revision) AS bytes
            FROM candidates
        )
        SELECT revision,operation,key,base,
               CASE WHEN position=1 OR (position<=? AND bytes<=?) THEN value END AS value,
               CASE WHEN position=1 OR (position<=? AND bytes<=?) THEN attachments END AS attachments
        FROM sized ORDER BY revision",
    )
    .bind(&[
        space.into(),
        namespace.into(),
        JsValue::from_f64(after as f64),
        JsValue::from_f64((MAX_PAGE_EVENTS + 1) as f64),
        JsValue::from_f64(MAX_PAGE_EVENTS as f64),
        JsValue::from_f64(MAX_PAGE_BYTES as f64),
        JsValue::from_f64(MAX_PAGE_EVENTS as f64),
        JsValue::from_f64(MAX_PAGE_BYTES as f64),
    ])?
    .all()
    .await?
    .results::<Value>()?;
    let mut bytes = br#"{"events":[],"more":false}"#.len();
    let mut events = Vec::new();
    for row in &rows {
        if row["value"].is_null() {
            break;
        }
        let item = event(row)?;
        let item_bytes = serde_json::to_vec(&item)?.len() + usize::from(!events.is_empty());
        if !events.is_empty() && bytes + item_bytes > MAX_PAGE_BYTES {
            break;
        }
        bytes += item_bytes;
        events.push(item);
    }
    let more = events.len() < rows.len();
    Ok(json!({"events":events,"more":more}))
}

pub(crate) async fn replay(
    db: &D1Database,
    space: &str,
    namespace: &str,
    mutation: &Value,
    fingerprint: &str,
) -> ApiResult<Option<i64>> {
    let previous = db
        .prepare(
            "SELECT fingerprint,revision FROM sync_receipts WHERE space=? AND namespace=? AND operation=?",
        )
        .bind(&[
            space.into(),
            namespace.into(),
            string(mutation, "operationId", 150)?.into(),
        ])?
        .first::<Value>(None)
        .await?;
    if let Some(previous) = previous {
        require(
            previous["fingerprint"] == fingerprint,
            409,
            "IDEMPOTENCY_CONFLICT",
        )?;
        return Ok(Some(integer(&previous, "revision")?));
    }
    Ok(None)
}

pub(crate) async fn upload(req: &mut Request, db: &D1Database, space: &str) -> ApiResult<Value> {
    let value = body(req).await?;
    upload_value(value, db, space, "write", None).await
}
pub(crate) async fn fingerprint_for(
    value: &Value,
    action: &str,
    source_revision: Option<i64>,
) -> ApiResult<String> {
    fields(
        value,
        &["namespace", "policyRevision", "mutation", "attachments"],
    )?;
    let references = value["attachments"]
        .as_array()
        .ok_or(Failure(400, "INVALID_BLOBS"))?;
    require(references.len() <= 2000, 400, "INVALID_BLOBS")?;
    let mut seen = std::collections::HashSet::new();
    for reference in references {
        fields(reference, &["digest", "size"])?;
        let digest = crate::blobs::digest(reference)?;
        require(seen.insert(digest), 400, "INVALID_BLOBS")?;
        require(
            (1..=100000000).contains(&integer(reference, "size")?),
            400,
            "INVALID_BLOBS",
        )?;
    }
    string(value, "namespace", 2500)?;
    integer(value, "policyRevision")?;
    let m = &value["mutation"];
    fields(m, &["operationId", "key", "base", "value"])?;
    require(
        !m["value"].is_null() || references.is_empty(),
        400,
        "INVALID_BLOBS",
    )?;
    string(m, "operationId", 150)?;
    string(m, "key", 500)?;
    integer(m, "base")?;
    let payload = m["value"].to_string();
    require(payload.len() <= 524288, 413, "ITEM_TOO_LARGE")?;
    let mut identity = json!([
        m["key"],
        m["base"],
        m["value"],
        value["attachments"],
        action
    ]);
    if let Some(source) = source_revision {
        identity.as_array_mut().unwrap().push(json!(source));
    }
    crate::blob_store::checksum(identity.to_string().as_bytes()).await
}

pub(crate) async fn upload_value(
    value: Value,
    db: &D1Database,
    space: &str,
    action: &str,
    source_revision: Option<i64>,
) -> ApiResult<Value> {
    let fingerprint = fingerprint_for(&value, action, source_revision).await?;
    let attachments = value["attachments"].to_string();
    let namespace = string(&value, "namespace", 2500)?;
    let policy_revision = integer(&value, "policyRevision")?;
    let m = &value["mutation"];
    let operation = string(m, "operationId", 150)?;
    let key = string(m, "key", 500)?;
    let base = integer(m, "base")?;
    let payload = m["value"].to_string();
    if let Some(revision) = replay(db, space, namespace, m, &fingerprint).await? {
        return Ok(json!({"accepted":true,"revision":revision}));
    }
    let result=db.prepare("INSERT INTO sync_events(space,namespace,operation,key,base,value,attachments,policy_revision,fingerprint,action,source_revision) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .bind(&[space.into(),namespace.into(),operation.into(),key.into(),JsValue::from_f64(base as f64),payload.clone().into(),attachments.clone().into(),JsValue::from_f64(policy_revision as f64),fingerprint.clone().into(),action.into(),source_revision.map_or(JsValue::NULL,|value|JsValue::from_f64(value as f64))])?.run().await;
    if let Err(error) = result {
        // Another request may have committed this exact operation after the initial lookup.
        if let Some(revision) = replay(db, space, namespace, m, &fingerprint).await? {
            return Ok(json!({"accepted":true,"revision":revision}));
        }
        let text = error.to_string();
        if text.contains("SYNC_RECOVERY_MISSING") {
            return Err(Failure(404, "SYNC_RECOVERY_MISSING"));
        }
        if text.contains("SYNC_ITEM_PURGED") {
            return Err(Failure(409, "SYNC_ITEM_PURGED"));
        }
        if text.contains("SYNC_ITEM_EXPIRED") {
            return Err(Failure(409, "SYNC_ITEM_EXPIRED"));
        }
        if text.contains("SYNC_BLOB_NOT_READY") {
            return Err(Failure(409, "SYNC_BLOB_NOT_READY"));
        }
        if text.contains("SYNC_QUOTA_EXCEEDED") {
            return Err(Failure(413, "SYNC_QUOTA_EXCEEDED"));
        }
        if text.contains("SYNC_VERSION_CONFLICT")
            || text.contains("SYNC_POLICY_CONFLICT")
            || text.contains("UNIQUE constraint")
        {
            return Err(Failure(409, "SYNC_CONFLICT"));
        }
        return Err(Failure(503, "SYNC_UNAVAILABLE"));
    }
    let revision = replay(db, space, namespace, m, &fingerprint)
        .await?
        .ok_or(Failure(503, "SYNC_UNAVAILABLE"))?;
    if action == "write" && !m["value"].is_null() && base > 0 {
        fold_continuous_edit(db, space, namespace, key, base, revision).await?;
    }
    Ok(json!({"accepted":true,"revision":revision}))
}

/// Shorten intermediate continuous-edit retention to 24h and fold rapid middle drafts within a
/// 5-minute editing burst. Pinned conflict branches, deleted tombstones, and the burst baseline
/// keep full 30-day retention; receipts remain intact for idempotent replay.
async fn fold_continuous_edit(
    db: &D1Database,
    space: &str,
    namespace: &str,
    key: &str,
    superseded: i64,
    current: i64,
) -> ApiResult<()> {
    let args = [
        space.into(),
        namespace.into(),
        key.into(),
        JsValue::from_f64(superseded as f64),
        JsValue::from_f64(current as f64),
    ];
    db.batch(vec![
        db.prepare(
            "UPDATE sync_version_retention
             SET retained_until = MIN(retained_until, (
               SELECT e.created_at + 86400000 FROM sync_events e
               WHERE e.space=?1 AND e.namespace=?2 AND e.key=?3 AND e.revision=?4
             ))
             WHERE space=?1 AND namespace=?2 AND key=?3 AND revision=?4
               AND NOT EXISTS(SELECT 1 FROM sync_history_pins p WHERE p.space=?1 AND p.namespace=?2 AND p.revision=?4)
               AND EXISTS(SELECT 1 FROM sync_heads h WHERE h.space=?1 AND h.namespace=?2 AND h.key=?3 AND h.revision=?5 AND h.deleted_at IS NULL)
               AND EXISTS(SELECT 1 FROM sync_events e WHERE e.space=?1 AND e.namespace=?2 AND e.key=?3 AND e.revision=?4 AND e.action='write' AND e.value<>'null' AND e.created_at>=unixepoch()*1000-86400000
                 AND EXISTS(SELECT 1 FROM sync_events older WHERE older.space=?1 AND older.namespace=?2 AND older.key=?3 AND older.revision<?4 AND older.action='write' AND older.value<>'null' AND older.created_at>=e.created_at-86400000))",
        )
        .bind(&args)?,
        db.prepare(
            "DELETE FROM sync_events
             WHERE space=?1 AND namespace=?2 AND key=?3 AND revision=?4
               AND action='write' AND value<>'null'
               AND created_at>=unixepoch()*1000-300000
               AND NOT EXISTS(SELECT 1 FROM sync_history_pins p WHERE p.space=?1 AND p.namespace=?2 AND p.revision=?4)
               AND EXISTS(SELECT 1 FROM sync_heads h WHERE h.space=?1 AND h.namespace=?2 AND h.key=?3 AND h.revision=?5 AND h.deleted_at IS NULL)
               AND EXISTS(SELECT 1 FROM sync_events older WHERE older.space=?1 AND older.namespace=?2 AND older.key=?3 AND older.revision<?4 AND older.action='write' AND older.value<>'null' AND older.created_at>=unixepoch()*1000-300000)",
        )
        .bind(&args)?,
    ])
    .await?;
    Ok(())
}
