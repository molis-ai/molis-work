use crate::protocol::{ApiResult, Failure, body, event, fields, integer, require, string};
use serde_json::{Value, json};
use wasm_bindgen::JsValue;
use worker::{D1Database, Method, Request, Response};

fn query(req: &Request, allowed: &[&str]) -> ApiResult<Value> {
    let mut values = serde_json::Map::new();
    for (key, value) in req.url()?.query_pairs() {
        require(
            allowed.contains(&key.as_ref()) && !values.contains_key(key.as_ref()),
            400,
            "INVALID_FIELDS",
        )?;
        values.insert(key.into_owned(), Value::String(value.into_owned()));
    }
    Ok(Value::Object(values))
}

fn number(value: &Value, key: &str, default: Option<i64>) -> ApiResult<i64> {
    let result = match value[key].as_str() {
        Some(text) => text
            .parse::<i64>()
            .map_err(|_| Failure(400, "INVALID_NUMBER"))?,
        None => default.ok_or(Failure(400, "INVALID_NUMBER"))?,
    };
    require(
        (1..=9_007_199_254_740_991).contains(&result),
        400,
        "INVALID_NUMBER",
    )?;
    Ok(result)
}

async fn selected(
    db: &D1Database,
    space: &str,
    namespace: &str,
    revision: Option<i64>,
) -> ApiResult<()> {
    let row = db
        .prepare("SELECT revision,namespaces FROM sync_policy WHERE space=?")
        .bind(&[space.into()])?
        .first::<Value>(None)
        .await?
        .ok_or(Failure(403, "COLLECTION_DISABLED"))?;
    let namespaces: Value = serde_json::from_str(string(&row, "namespaces", 3_000_000)?)?;
    require(
        namespaces
            .as_array()
            .is_some_and(|items| items.iter().any(|value| value == namespace)),
        403,
        "COLLECTION_DISABLED",
    )?;
    require(
        revision.is_none_or(|expected| row["revision"] == expected),
        409,
        "SYNC_POLICY_CONFLICT",
    )
}

async fn head(db: &D1Database, space: &str, namespace: &str, key: &str) -> ApiResult<Value> {
    let row=db.prepare("SELECT revision,deleted_at AS deletedAt,purged_at,CASE WHEN deleted_at IS NOT NULL AND deleted_at<=unixepoch()*1000-2592000000 THEN 1 ELSE 0 END AS expired FROM sync_heads WHERE space=? AND namespace=? AND key=?")
        .bind(&[space.into(),namespace.into(),key.into()])?.first::<Value>(None).await?.ok_or(Failure(404,"SYNC_RECOVERY_MISSING"))?;
    require(row["purged_at"].is_null(), 409, "SYNC_ITEM_PURGED")?;
    require(row["expired"] == 0, 409, "SYNC_ITEM_EXPIRED")?;
    Ok(row)
}

async fn version(
    db: &D1Database,
    space: &str,
    namespace: &str,
    key: &str,
    revision: i64,
) -> ApiResult<Value> {
    db.prepare("SELECT revision,operation,key,base,value,attachments,action,created_at AS createdAt,(EXISTS(SELECT 1 FROM sync_history_pins p WHERE p.space=sync_events.space AND p.namespace=sync_events.namespace AND p.revision=sync_events.revision) OR EXISTS(SELECT 1 FROM sync_version_retention r WHERE r.space=sync_events.space AND r.namespace=sync_events.namespace AND r.revision=sync_events.revision AND r.retained_until>unixepoch()*1000)) AS retained FROM sync_events WHERE space=? AND namespace=? AND key=? AND revision=?")
        .bind(&[space.into(),namespace.into(),key.into(),JsValue::from_f64(revision as f64)])?.first::<Value>(None).await?.ok_or(Failure(404,"SYNC_RECOVERY_MISSING"))
}

async fn list(req: &Request, db: &D1Database, space: &str) -> ApiResult<Value> {
    let value = query(req, &["namespace", "key", "before"])?;
    let (namespace, key) = (
        string(&value, "namespace", 2500)?,
        string(&value, "key", 500)?,
    );
    let before = number(&value, "before", Some(9_007_199_254_740_991))?;
    selected(db, space, namespace, None).await?;
    let current = head(db, space, namespace, key).await?;
    let rows=db.prepare("SELECT e.revision,e.created_at AS createdAt,e.action,(EXISTS(SELECT 1 FROM sync_history_pins p WHERE p.space=e.space AND p.namespace=e.namespace AND p.revision=e.revision) OR EXISTS(SELECT 1 FROM sync_version_retention r WHERE r.space=e.space AND r.namespace=e.namespace AND r.revision=e.revision AND r.retained_until>unixepoch()*1000)) AS retained FROM sync_events e WHERE e.space=? AND e.namespace=? AND e.key=? AND e.revision<? ORDER BY e.revision DESC LIMIT 21")
        .bind(&[space.into(),namespace.into(),key.into(),JsValue::from_f64(before as f64)])?.all().await?.results::<Value>()?;
    let items=rows.iter().take(20).map(|row|json!({"revision":row["revision"],"createdAt":row["createdAt"],"action":row["action"],"retained":row["retained"]==1,"current":row["revision"]==current["revision"]})).collect::<Vec<_>>();
    Ok(
        json!({"items":items,"more":rows.len()>20,"next":rows.get(19).map(|row|row["revision"].clone()),"currentRevision":current["revision"]}),
    )
}

async fn keys(req: &Request, db: &D1Database, space: &str) -> ApiResult<Value> {
    let value = query(req, &["namespace", "after"])?;
    let namespace = string(&value, "namespace", 2500)?;
    let after = if value["after"].is_null() {
        ""
    } else {
        string(&value, "after", 500)?
    };
    selected(db, space, namespace, None).await?;
    let rows=db.prepare("SELECT p.key,h.revision AS currentRevision,COUNT(DISTINCT p.revision) AS versions,MAX(p.retained_at) AS retainedAt FROM (SELECT space,namespace,key,revision,retained_at FROM sync_history_pins UNION SELECT space,namespace,key,revision,retained_until-2592000000 AS retained_at FROM sync_version_retention WHERE retained_until>unixepoch()*1000) p JOIN sync_heads h ON h.space=p.space AND h.namespace=p.namespace AND h.key=p.key WHERE p.space=? AND p.namespace=? AND p.key>? AND h.purged_at IS NULL AND (h.deleted_at IS NULL OR h.deleted_at>unixepoch()*1000-2592000000) GROUP BY p.key ORDER BY p.key LIMIT 21")
        .bind(&[space.into(),namespace.into(),after.into()])?.all().await?.results::<Value>()?;
    Ok(
        json!({"items":rows.iter().take(20).collect::<Vec<_>>(),"more":rows.len()>20,"next":rows.get(19).map(|row|row["key"].clone())}),
    )
}

async fn inspect(req: &Request, db: &D1Database, space: &str) -> ApiResult<Value> {
    let value = query(req, &["namespace", "key", "revision"])?;
    let (namespace, key) = (
        string(&value, "namespace", 2500)?,
        string(&value, "key", 500)?,
    );
    selected(db, space, namespace, None).await?;
    let current = head(db, space, namespace, key).await?;
    let row = version(db, space, namespace, key, number(&value, "revision", None)?).await?;
    Ok(
        json!({"event":event(&row)?,"createdAt":row["createdAt"],"retained":row["retained"]==1,"currentRevision":current["revision"]}),
    )
}

async fn archive(req: &mut Request, db: &D1Database, space: &str) -> ApiResult<Value> {
    let value = body(req).await?;
    let (namespace, key) = (
        string(&value, "namespace", 2500)?,
        string(&value["mutation"], "key", 500)?,
    );
    let base = integer(&value["mutation"], "base")?;
    require(base > 0, 400, "INVALID_NUMBER")?;
    selected(
        db,
        space,
        namespace,
        Some(integer(&value, "policyRevision")?),
    )
    .await?;
    head(db, space, namespace, key).await?;
    crate::changes::upload_value(value, db, space, "archive", None).await
}

async fn pin(req: &mut Request, db: &D1Database, space: &str) -> ApiResult<Value> {
    let value = body(req).await?;
    fields(&value, &["namespace", "key", "revision", "policyRevision"])?;
    let (namespace, key) = (
        string(&value, "namespace", 2500)?,
        string(&value, "key", 500)?,
    );
    let (revision, policy) = (
        integer(&value, "revision")?,
        integer(&value, "policyRevision")?,
    );
    selected(db, space, namespace, Some(policy)).await?;
    require(
        head(db, space, namespace, key).await?["revision"] == revision,
        409,
        "SYNC_CONFLICT",
    )?;
    db.prepare("INSERT OR IGNORE INTO sync_history_pins(space,namespace,key,revision) SELECT e.space,e.namespace,e.key,e.revision FROM sync_events e JOIN sync_heads h ON h.space=e.space AND h.namespace=e.namespace AND h.key=e.key JOIN sync_policy p ON p.space=e.space WHERE e.space=? AND e.namespace=? AND e.key=? AND e.revision=? AND h.revision=e.revision AND h.purged_at IS NULL AND (h.deleted_at IS NULL OR h.deleted_at>unixepoch()*1000-2592000000) AND p.revision=? AND EXISTS(SELECT 1 FROM json_each(p.namespaces) n WHERE n.value=e.namespace)")
        .bind(&[space.into(),namespace.into(),key.into(),JsValue::from_f64(revision as f64),JsValue::from_f64(policy as f64)])?.run().await?;
    let row=db.prepare("SELECT retained_at FROM sync_history_pins WHERE space=? AND namespace=? AND key=? AND revision=?")
        .bind(&[space.into(),namespace.into(),key.into(),JsValue::from_f64(revision as f64)])?.first::<Value>(None).await?.ok_or(Failure(409,"SYNC_CONFLICT"))?;
    Ok(json!({"accepted":true,"revision":revision,"retainedAt":row["retained_at"]}))
}

async fn restore(req: &mut Request, db: &D1Database, space: &str) -> ApiResult<Value> {
    let value = body(req).await?;
    fields(
        &value,
        &[
            "namespace",
            "key",
            "sourceRevision",
            "revision",
            "operationId",
            "policyRevision",
        ],
    )?;
    let (namespace, key, operation) = (
        string(&value, "namespace", 2500)?,
        string(&value, "key", 500)?,
        string(&value, "operationId", 150)?,
    );
    let (source, base) = (
        integer(&value, "sourceRevision")?,
        integer(&value, "revision")?,
    );
    selected(
        db,
        space,
        namespace,
        Some(integer(&value, "policyRevision")?),
    )
    .await?;
    let previous=db.prepare("SELECT key,base,action,source_revision,revision FROM sync_receipts WHERE space=? AND namespace=? AND operation=?").bind(&[space.into(),namespace.into(),operation.into()])?.first::<Value>(None).await?;
    if let Some(previous) = previous {
        require(
            previous["key"] == key
                && previous["base"] == base
                && previous["action"] == "restore"
                && previous["source_revision"] == source,
            409,
            "IDEMPOTENCY_CONFLICT",
        )?;
        return Ok(json!({"accepted":true,"revision":previous["revision"]}));
    }
    require(
        head(db, space, namespace, key).await?["revision"] == base,
        409,
        "SYNC_CONFLICT",
    )?;
    require(source != base, 409, "SYNC_HISTORY_CURRENT")?;
    let row = version(db, space, namespace, key, source).await?;
    crate::changes::upload_value(json!({"namespace":namespace,"policyRevision":integer(&value,"policyRevision")?,"mutation":{"operationId":operation,"key":key,"base":base,"value":serde_json::from_str::<Value>(string(&row,"value",524288)?)?},"attachments":serde_json::from_str::<Value>(string(&row,"attachments",524288)?)?}),db,space,"restore",Some(source)).await
}

async fn purge(req: &mut Request, db: &D1Database, space: &str) -> ApiResult<Value> {
    let value = body(req).await?;
    fields(
        &value,
        &["namespace", "key", "sourceRevision", "revision", "confirm"],
    )?;
    require(value["confirm"] == true, 400, "CONFIRM_REQUIRED")?;
    let (namespace, key) = (
        string(&value, "namespace", 2500)?,
        string(&value, "key", 500)?,
    );
    let (source, base) = (
        integer(&value, "sourceRevision")?,
        integer(&value, "revision")?,
    );
    selected(db, space, namespace, None).await?;
    require(
        head(db, space, namespace, key).await?["revision"] == base,
        409,
        "SYNC_CONFLICT",
    )?;
    require(source != base, 409, "SYNC_HISTORY_CURRENT")?;
    db.prepare("DELETE FROM sync_events WHERE space=? AND namespace=? AND key=? AND revision=? AND revision<>? AND EXISTS(SELECT 1 FROM sync_heads h WHERE h.space=sync_events.space AND h.namespace=sync_events.namespace AND h.key=sync_events.key AND h.revision=? AND h.purged_at IS NULL AND (h.deleted_at IS NULL OR h.deleted_at>unixepoch()*1000-2592000000))")
        .bind(&[space.into(),namespace.into(),key.into(),JsValue::from_f64(source as f64),JsValue::from_f64(base as f64),JsValue::from_f64(base as f64)])?.run().await?;
    let remaining=db.prepare("SELECT revision FROM sync_events WHERE space=? AND namespace=? AND key=? AND revision=?").bind(&[space.into(),namespace.into(),key.into(),JsValue::from_f64(source as f64)])?.first::<Value>(None).await?;
    require(remaining.is_none(), 409, "SYNC_CONFLICT")?;
    Ok(json!({"accepted":true}))
}

pub(crate) async fn handle(req: &mut Request, db: &D1Database, space: &str) -> ApiResult<Response> {
    let value = match (req.method(), req.url()?.path()) {
        (Method::Get, "/v1/history") => list(req, db, space).await,
        (Method::Get, "/v1/history/keys") => keys(req, db, space).await,
        (Method::Get, "/v1/history/version") => inspect(req, db, space).await,
        (Method::Post, "/v1/history/archive") => archive(req, db, space).await,
        (Method::Post, "/v1/history/pin") => pin(req, db, space).await,
        (Method::Post, "/v1/history/restore") => restore(req, db, space).await,
        (Method::Post, "/v1/history/purge") => purge(req, db, space).await,
        _ => Err(Failure(404, "NOT_FOUND")),
    }?;
    Ok(Response::from_json(&value)?)
}
