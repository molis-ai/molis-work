use crate::protocol::{ApiResult, Failure, body, fields, integer, require, string};
use serde_json::{Value, json};
use wasm_bindgen::JsValue;
use worker::{D1Database, Request};

async fn replay(
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
pub(crate) async fn upload_value(
    value: Value,
    db: &D1Database,
    space: &str,
    action: &str,
    source_revision: Option<i64>,
) -> ApiResult<Value> {
    fields(
        &value,
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
    let attachments = value["attachments"].to_string();
    let namespace = string(&value, "namespace", 2500)?;
    let policy_revision = integer(&value, "policyRevision")?;
    let m = &value["mutation"];
    fields(m, &["operationId", "key", "base", "value"])?;
    require(
        !m["value"].is_null() || references.is_empty(),
        400,
        "INVALID_BLOBS",
    )?;
    let operation = string(m, "operationId", 150)?;
    let key = string(m, "key", 500)?;
    let base = integer(m, "base")?;
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
    let fingerprint = crate::blob_store::checksum(identity.to_string().as_bytes()).await?;
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
    Ok(json!({"accepted":true,"revision":revision}))
}
