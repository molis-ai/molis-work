use crate::protocol::{ApiResult, Failure, body, fields, integer, require, string};
use serde_json::{Value, json};
use wasm_bindgen::JsValue;
use worker::{D1Database, Request};

pub(crate) async fn list(
    req: &Request,
    db: &D1Database,
    space: &str,
    scope: &crate::cutover::Scope,
) -> ApiResult<Value> {
    let url = req.url()?;
    let before = url
        .query_pairs()
        .find(|(key, _)| key == "before")
        .map(|(_, value)| value.parse::<i64>())
        .transpose()
        .map_err(|_| Failure(400, "INVALID_CURSOR"))?
        .unwrap_or(i64::MAX);
    require(before > 0, 400, "INVALID_CURSOR")?;
    // Filtered before paging: a sealed public stream is gone from ordinary trash, and the private stream appears (under
    // the public name) only in the scoped view that selects it.
    let rows=db.prepare("SELECT namespace,key,revision,deleted_at AS deletedAt,deleted_at+2592000000 AS expiresAt FROM sync_heads h WHERE space=? AND deleted_at IS NOT NULL AND purged_at IS NULL AND revision<? AND NOT (namespace=? AND EXISTS(SELECT 1 FROM sync_cutovers c WHERE c.space=h.space)) AND (namespace NOT LIKE '[\"process_items_adopted\",%' OR (?=1 AND EXISTS(SELECT 1 FROM sync_cutovers c WHERE c.space=h.space AND c.namespace=h.namespace AND c.selected=1 AND c.completed_at IS NOT NULL))) ORDER BY revision DESC LIMIT 21").bind(&[space.into(),JsValue::from_f64(before.min(9_007_199_254_740_991) as f64),crate::cutover::PUBLIC.into(),JsValue::from_f64(if scope.current(){1.0}else{0.0})])?.all().await?.results::<Value>()?;
    let mut items = Vec::new();
    for row in rows.iter().take(20) {
        let mut row = row.clone();
        row["namespace"] = json!(
            scope
                .public(string(&row, "namespace", 2500)?)
                .ok_or(Failure(503, "INVALID_STORAGE"))?
        );
        items.push(row);
    }
    Ok(
        json!({"items":items,"more":rows.len()>20,"next":rows.get(19).map(|row|row["revision"].clone())}),
    )
}
pub(crate) async fn restore(
    req: &mut Request,
    db: &D1Database,
    space: &str,
    scope: &crate::cutover::Scope,
) -> ApiResult<Value> {
    let value = body(req).await?;
    fields(
        &value,
        &[
            "namespace",
            "key",
            "revision",
            "operationId",
            "policyRevision",
        ],
    )?;
    let routed = scope.route(string(&value, "namespace", 2500)?)?;
    let (namespace, key, operation, revision) = (
        routed.as_str(),
        string(&value, "key", 500)?,
        string(&value, "operationId", 150)?,
        integer(&value, "revision")?,
    );
    let previous=db.prepare("SELECT key,base,action,source_revision FROM sync_receipts WHERE space=? AND namespace=? AND operation=?").bind(&[space.into(),namespace.into(),operation.into()])?.first::<Value>(None).await?;
    if let Some(previous) = previous {
        require(
            previous["key"] == key
                && previous["base"] == revision
                && previous["action"] == "restore"
                && previous["source_revision"].is_null(),
            409,
            "IDEMPOTENCY_CONFLICT",
        )?;
        return Ok(json!({"accepted":true}));
    }
    let row=db.prepare("SELECT e.value,e.attachments FROM sync_events e WHERE e.space=? AND e.namespace=? AND e.key=? AND e.revision<? AND e.value<>'null' AND e.action<>'archive' AND EXISTS(SELECT 1 FROM sync_events d WHERE d.space=e.space AND d.namespace=e.namespace AND d.key=e.key AND d.revision=? AND d.value='null') ORDER BY e.revision DESC LIMIT 1")
        .bind(&[space.into(),namespace.into(),key.into(),JsValue::from_f64(revision as f64),JsValue::from_f64(revision as f64)])?.first::<Value>(None).await?.ok_or(Failure(404,"SYNC_RECOVERY_MISSING"))?;
    crate::changes::upload_value(json!({"namespace":namespace,"policyRevision":integer(&value,"policyRevision")?,"mutation":{"operationId":operation,"key":key,"base":revision,"value":serde_json::from_str::<Value>(string(&row,"value",524288)?)?},"attachments":serde_json::from_str::<Value>(string(&row,"attachments",524288)?)?}),db,space,"restore",None).await
}
pub(crate) async fn purge(
    req: &mut Request,
    db: &D1Database,
    space: &str,
    scope: &crate::cutover::Scope,
) -> ApiResult<Value> {
    let value = body(req).await?;
    fields(&value, &["namespace", "key", "revision", "confirm"])?;
    require(value["confirm"] == true, 400, "CONFIRM_REQUIRED")?;
    let routed = scope.route(string(&value, "namespace", 2500)?)?;
    let (namespace, key, revision) = (
        routed.as_str(),
        string(&value, "key", 500)?,
        integer(&value, "revision")?,
    );
    let head = db
        .prepare(
            "SELECT revision,purged_at FROM sync_heads WHERE space=? AND namespace=? AND key=?",
        )
        .bind(&[space.into(), namespace.into(), key.into()])?
        .first::<Value>(None)
        .await?
        .ok_or(Failure(404, "SYNC_RECOVERY_MISSING"))?;
    require(head["revision"] == revision, 409, "SYNC_RETENTION_CONFLICT")?;
    if head["purged_at"].is_null() {
        crate::maintenance::claim(db, space, namespace, key, revision, true).await?;
    }
    Ok(json!({"accepted":true}))
}
