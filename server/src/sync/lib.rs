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
mod signed_identity;
mod write_mode;
use identity::identity;
use protocol::{ApiResult, Failure, body, fields, integer, namespace, require};
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
    let address = req
        .headers()
        .get("CF-Connecting-IP")?
        .unwrap_or_else(|| "unknown".to_owned());
    let address = blob_store::checksum(address.as_bytes()).await?;
    rate_limit::admit(&env, &format!("ip:{address}")).await?;
    let db = env.d1("DB")?;
    if req.method() == Method::Get {
        quota::check_schema(&db).await?;
    } else {
        // Mutations must still prove the schema and its guards are present before writing.
        quota::validate_schema(&db).await?;
    }
    let space = identity(&req, &env).await?;
    rate_limit::admit(&env, &format!("account:{space}")).await?;
    let writable = write_mode::writable(&env)?;
    if req.method() != Method::Get {
        require(writable, 503, "SYNC_READ_ONLY")?;
    }
    let permanent_cleanup = env
        .var("SYNC_PERMANENT_CLEANUP")
        .is_ok_and(|value| value.to_string() == "enabled");
    if req.method() == Method::Post && matches!(url.path(), "/v1/trash/purge" | "/v1/history/purge")
    {
        require(permanent_cleanup, 409, "SYNC_PURGE_DISABLED")?;
    }
    if req.method() == Method::Post && url.path() == "/v1/maintenance" {
        rate_limit::admit_maintenance(&db, &format!("maintenance:{space}")).await?;
    }
    if url.path().starts_with("/v1/blobs/") {
        return blobs::handle(&mut req, &env, &db, &space).await;
    }
    if url.path().starts_with("/v1/history") {
        return history::handle(&mut req, &db, &space, permanent_cleanup && writable).await;
    }
    let value = match (req.method(), url.path()) {
        (Method::Get, "/v1/round") => round::read(&db, &space).await,
        (Method::Get, "/v1/policy") => policy(&db, &space).await,
        (Method::Get, "/v1/quota") => quota::read(&db, &space).await,
        (Method::Get, "/v1/quota/breakdown") => quota::breakdown(&db, &space).await,
        (Method::Get, "/v1/trash") => {
            let mut list = retention::list(&req, &db, &space).await?;
            if permanent_cleanup && writable {
                list["permanentCleanup"] = json!(true);
            }
            Ok(list)
        }
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
            let selected = db.prepare("SELECT 1 AS selected FROM sync_policy p,json_each(p.namespaces) n WHERE p.space=? AND n.value=?").bind(&[space.clone().into(),namespace.clone().into()])?.first::<Value>(None).await?;
            require(selected.is_some(), 403, "COLLECTION_DISABLED")?;
            let after = query("after")
                .parse::<i64>()
                .map_err(|_| Failure(400, "INVALID_CURSOR"))?;
            require(after >= 0, 400, "INVALID_CURSOR")?;
            // The selection is checked again by the read itself, so a deselection racing this request returns nothing.
            changes::page(&db, &space, &namespace, after).await
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
            if matches!(
                code,
                "SYNC_UNAVAILABLE" | "INVALID_STORAGE" | "SYNC_SCHEMA_MISMATCH"
            ) {
                quota::invalidate_schema();
            }
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
