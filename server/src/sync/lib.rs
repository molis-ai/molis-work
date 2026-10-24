mod blob_store;
mod blobs;
mod changes;
mod history;
mod identity;
mod maintenance;
mod protocol;
mod quota;
mod rate_limit;
mod retention;
mod round;
mod write_mode;
use identity::identity;
use protocol::{ApiResult, Failure, body, event, fields, integer, namespace, require};
use serde_json::{Value, json};
use wasm_bindgen::JsValue;
use worker::*;

pub(crate) async fn policy(db: &D1Database, space: &str) -> ApiResult<Value> {
    let row = db
        .prepare("SELECT json FROM sync_policy WHERE space=?")
        .bind(&[space.into()])?
        .first::<Value>(None)
        .await?;
    match row {
        Some(row) => Ok(serde_json::from_str(
            row["json"]
                .as_str()
                .ok_or(Failure(503, "INVALID_STORAGE"))?,
        )?),
        None => Ok(json!({"spaceId":space,"revision":0,"selections":[]})),
    }
}
async fn handle(mut req: Request, env: Env) -> ApiResult<Response> {
    let url = req.url()?;
    if url.path() == "/health" && req.method() == Method::Get {
        return Ok(Response::from_json(&json!({"ok":true}))?);
    }
    let db = env.d1("DB")?;
    quota::check_schema(&db).await?;
    let address = req
        .headers()
        .get("CF-Connecting-IP")?
        .unwrap_or_else(|| "unknown".to_owned());
    let address = blob_store::checksum(address.as_bytes()).await?;
    rate_limit::admit(&db, &format!("ip:{address}"), 600).await?;
    let space = identity(&req, &env).await?;
    rate_limit::admit(&db, &format!("account:{space}"), 600).await?;
    let writable = write_mode::writable(&env)?;
    if req.method() != Method::Get {
        require(writable, 503, "SYNC_READ_ONLY")?;
    }
    if url.path() == "/v1/maintenance" {
        rate_limit::admit(&db, &format!("maintenance:{space}"), 20).await?;
    }
    if url.path().starts_with("/v1/blobs/") {
        return blobs::handle(&mut req, &env, &db, &space).await;
    }
    if url.path().starts_with("/v1/history") {
        return history::handle(&mut req, &db, &space).await;
    }
    let value = match (req.method(), url.path()) {
        (Method::Get, "/v1/round") => round::read(&db, &space).await,
        (Method::Get, "/v1/policy") => policy(&db, &space).await,
        (Method::Get, "/v1/quota") => quota::read(&db, &space).await,
        (Method::Get, "/v1/trash") => retention::list(&req, &db, &space).await,
        (Method::Post, "/v1/trash/restore") => retention::restore(&mut req, &db, &space).await,
        (Method::Post, "/v1/trash/purge") => retention::purge(&mut req, &db, &space).await,
        (Method::Post, "/v1/maintenance") => {
            let value = body(&mut req).await?;
            fields(&value, &[])?;
            maintenance::sweep(&env, Some(&space)).await
        }
        (Method::Put, "/v1/policy") => {
            let mut value = body(&mut req).await?;
            fields(&value, &["spaceId", "revision", "selections"])?;
            require(value["spaceId"] == space, 403, "WRONG_SPACE")?;
            let revision = integer(&value, "revision")?;
            let selections = value["selections"]
                .as_array()
                .ok_or(Failure(400, "INVALID_SELECTIONS"))?;
            require(
                selections.len() <= 1000 && revision < 9_007_199_254_740_991,
                400,
                "POLICY_LIMIT",
            )?;
            let mut namespaces = Vec::new();
            let mut identities = Vec::new();
            for selection in selections {
                let n = namespace(selection)?;
                let identity = json!([
                    selection["plugin_id"],
                    selection["publisher_id"],
                    selection["publisher_signature"],
                    selection["collection_id"]
                ])
                .to_string();
                require(!identities.contains(&identity), 400, "DUPLICATE_SELECTION")?;
                identities.push(identity);
                namespaces.push(n);
            }
            value["revision"] = json!(revision + 1);
            let empty = json!({"spaceId":space,"revision":0,"selections":[]}).to_string();
            db.prepare("INSERT OR IGNORE INTO sync_policy VALUES (?,0,?,'[]')")
                .bind(&[space.clone().into(), empty.into()])?
                .run()
                .await?;
            let changed=db.prepare("UPDATE sync_policy SET revision=?,json=?,namespaces=? WHERE space=? AND revision=? RETURNING revision").bind(&[JsValue::from_f64((revision+1)as f64),value.to_string().into(),serde_json::to_string(&namespaces)?.into(),space.into(),JsValue::from_f64(revision as f64)])?.first::<Value>(None).await?;
            require(changed.is_some(), 409, "POLICY_CONFLICT")?;
            Ok(value)
        }
        (Method::Get, "/v1/changes") => {
            let query = |name: &str| {
                url.query_pairs()
                    .find(|(k, _)| k == name)
                    .map(|(_, v)| v.into_owned())
                    .unwrap_or_default()
            };
            let namespace = query("namespace");
            require(
                !namespace.is_empty() && namespace.len() <= 2500,
                400,
                "INVALID_NAMESPACE",
            )?;
            let current = policy(&db, &space).await?;
            require(
                current["selections"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .any(|s| self::namespace(s).ok().as_deref() == Some(&namespace)),
                403,
                "COLLECTION_DISABLED",
            )?;
            let after = query("after")
                .parse::<i64>()
                .map_err(|_| Failure(400, "INVALID_CURSOR"))?;
            require(after >= 0, 400, "INVALID_CURSOR")?;
            let rows=db.prepare("SELECT revision,operation,key,base,value,attachments FROM sync_events WHERE space=? AND namespace=? AND action<>'archive' AND revision>? ORDER BY revision LIMIT 5").bind(&[space.into(),namespace.into(),JsValue::from_f64(after as f64)])?.all().await?.results::<Value>()?;
            let more = rows.len() > 4;
            let events = rows
                .iter()
                .take(4)
                .map(event)
                .collect::<ApiResult<Vec<_>>>()?;
            Ok(json!({"events":events,"more":more}))
        }
        (Method::Post, "/v1/changes") => changes::upload(&mut req, &db, &space).await,
        _ => Err(Failure(404, "NOT_FOUND")),
    }?;
    Ok(Response::from_json(&value)?)
}
/// Run one bounded maintenance pass using the configured write mode.
pub async fn scheduled(env: Env) {
    match write_mode::writable(&env) {
        Ok(false) => return,
        Err(_) => {
            console_error!("sync.invalid_write_mode");
            return;
        }
        Ok(true) => {}
    }
    if maintenance::sweep(&env, None).await.is_err() {
        console_error!("sync.maintenance_failed");
    }
}
/// Serve the sync HTTP API, preserving its status and cache policy.
pub async fn fetch(req: Request, env: Env) -> Result<Response> {
    let mut response = match handle(req, env).await {
        Ok(value) => value,
        Err(Failure(status, code)) => {
            Response::from_json(&json!({"error":code}))?.with_status(status)
        }
    };
    response.headers_mut().set("Cache-Control", "no-store")?;
    if response.status_code() == 429 {
        response.headers_mut().set("Retry-After", "60")?;
    }
    if response.status_code() == 503 {
        response.headers_mut().set("Retry-After", "60")?;
    }
    Ok(response)
}
