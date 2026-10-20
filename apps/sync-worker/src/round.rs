use crate::protocol::{ApiResult, Failure, require};
use serde_json::{Value, json};
use wasm_bindgen::JsValue;
use worker::D1Database;

/** Account-scoped hints only: a head is never a client receipt or permission to advance its cursor. */
pub(crate) async fn read(db: &D1Database, space: &str) -> ApiResult<Value> {
    let policy = crate::policy(db, space).await?;
    let revision = policy["revision"]
        .as_i64()
        .ok_or(Failure(503, "INVALID_STORAGE"))?;
    let selected = policy["selections"]
        .as_array()
        .ok_or(Failure(503, "INVALID_STORAGE"))?;
    // The existing pull index finds the last ordinary event for each selected namespace; archives are not downloads.
    // Pin the same policy revision. A concurrent selection change refuses rather than returning a partial summary.
    let heads = db.prepare("SELECT n.value AS namespace,COALESCE((SELECT e.revision FROM sync_events e WHERE e.space=p.space AND e.namespace=n.value AND e.action<>'archive' ORDER BY e.revision DESC LIMIT 1),0) AS revision FROM sync_policy p,json_each(p.namespaces) n WHERE p.space=? AND p.revision=? ORDER BY CAST(n.key AS INTEGER)")
        .bind(&[space.into(),JsValue::from_f64(revision as f64)])?.all().await?.results::<Value>()?;
    require(heads.len() == selected.len(), 409, "POLICY_CONFLICT")?;
    Ok(
        json!({"format":1,"policy":policy,"quota":crate::quota::read(db,space).await?,"heads":heads}),
    )
}
