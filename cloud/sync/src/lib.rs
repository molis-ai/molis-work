use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use wasm_bindgen::JsValue;
use worker::*;

struct Failure(u16, &'static str);
type ApiResult<T> = std::result::Result<T, Failure>;
impl From<worker::Error> for Failure {
    fn from(_: worker::Error) -> Self {
        Self(503, "SYNC_UNAVAILABLE")
    }
}
impl From<serde_json::Error> for Failure {
    fn from(_: serde_json::Error) -> Self {
        Self(400, "INVALID_JSON")
    }
}
fn require(ok: bool, status: u16, code: &'static str) -> ApiResult<()> {
    if ok {
        Ok(())
    } else {
        Err(Failure(status, code))
    }
}
fn fields(v: &Value, allowed: &[&str]) -> ApiResult<()> {
    let object = v.as_object().ok_or(Failure(400, "INVALID_OBJECT"))?;
    require(
        object.len() == allowed.len() && allowed.iter().all(|key| object.contains_key(*key)),
        400,
        "INVALID_FIELDS",
    )
}
fn string<'a>(v: &'a Value, key: &str, max: usize) -> ApiResult<&'a str> {
    let s = v[key].as_str().ok_or(Failure(400, "INVALID_FIELD"))?;
    require(
        !s.is_empty() && s.len() <= max && s.trim() == s,
        400,
        "INVALID_FIELD",
    )?;
    Ok(s)
}
fn integer(v: &Value, key: &str) -> ApiResult<i64> {
    let n = v[key].as_i64().ok_or(Failure(400, "INVALID_NUMBER"))?;
    require(
        (0..=9_007_199_254_740_991).contains(&n),
        400,
        "INVALID_NUMBER",
    )?;
    Ok(n)
}
fn namespace(v: &Value) -> ApiResult<String> {
    fields(
        v,
        &[
            "plugin_id",
            "publisher_id",
            "publisher_signature",
            "collection_id",
            "schema_version",
        ],
    )?;
    let fields = [
        "plugin_id",
        "publisher_id",
        "publisher_signature",
        "collection_id",
    ];
    let mut parts = Vec::new();
    for field in fields {
        parts.push(json!(string(v, field, 500)?));
    }
    let version = integer(v, "schema_version")?;
    require(version > 0, 400, "INVALID_SCHEMA")?;
    parts.push(json!(version));
    Ok(serde_json::to_string(&parts)?)
}
fn event(row: &Value) -> ApiResult<Value> {
    Ok(
        json!({"operationId":row["operation"],"key":row["key"],"base":row["base"],"value":serde_json::from_str::<Value>(row["value"].as_str().ok_or(Failure(503,"INVALID_STORAGE"))?)?,"revision":row["revision"]}),
    )
}

async fn identity(req: &Request, env: &Env) -> ApiResult<String> {
    let origin = env.var("AUTH_ORIGIN")?.to_string();
    let parsed = Url::parse(&origin).map_err(|_| Failure(503, "INVALID_AUTH_CONFIG"))?;
    require(
        (parsed.scheme() == "https"
            || (parsed.scheme() == "http" && parsed.host_str() == Some("127.0.0.1")))
            && parsed.username().is_empty()
            && parsed.password().is_none()
            && parsed.path() == "/"
            && parsed.query().is_none()
            && parsed.fragment().is_none(),
        503,
        "INVALID_AUTH_CONFIG",
    )?;
    let authorization = req
        .headers()
        .get("Authorization")?
        .ok_or(Failure(401, "UNAUTHORIZED"))?;
    require(
        authorization.starts_with("Bearer ") && authorization.len() < 16384,
        401,
        "UNAUTHORIZED",
    )?;
    let headers = Headers::new();
    headers.set("Authorization", &authorization)?;
    // Workers supports manual/follow. Never follow an Auth redirect with the Bearer token.
    let request = Request::new_with_init(
        &format!("{}/api/v1/users/me", origin.trim_end_matches('/')),
        RequestInit::new()
            .with_headers(headers)
            .with_redirect(RequestRedirect::Manual),
    )?;
    let mut response = Fetch::Request(request).send().await?;
    require(response.status_code() == 200, 401, "UNAUTHORIZED")?;
    let identity: Value = response.json().await?;
    let data = &identity["data"];
    let user = string(data, "userId", 500)?;
    let application = string(data, "applicationId", 500)?;
    require(
        application == env.var("APPLICATION_ID")?.to_string(),
        403,
        "WRONG_APPLICATION",
    )?;
    // Same canonical tuple as the local space owner; request bodies cannot select another owner.
    let tuple = serde_json::to_string(&[origin.trim_end_matches('/'), application, user])?;
    Ok(format!(
        "space_{}",
        hex::encode(Sha256::digest(tuple.as_bytes()))
    ))
}
async fn body(req: &mut Request) -> ApiResult<Value> {
    let bytes = req.bytes().await?;
    require(bytes.len() <= 530_000, 413, "ITEM_TOO_LARGE")?;
    Ok(serde_json::from_slice(&bytes)?)
}
async fn policy(db: &D1Database, space: &str) -> ApiResult<Value> {
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
async fn handle(mut req: Request, env: Env) -> ApiResult<Value> {
    let url = req.url()?;
    if url.path() == "/health" && req.method() == Method::Get {
        return Ok(json!({"ok":true}));
    }
    let space = identity(&req, &env).await?;
    let db = env.d1("DB")?;
    match (req.method(), url.path()) {
        (Method::Get, "/v1/policy") => policy(&db, &space).await,
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
            let rows=db.prepare("SELECT revision,operation,key,base,value FROM sync_events WHERE space=? AND namespace=? AND revision>? ORDER BY revision LIMIT 5").bind(&[space.into(),namespace.into(),JsValue::from_f64(after as f64)])?.all().await?.results::<Value>()?;
            let more = rows.len() > 4;
            let events = rows
                .iter()
                .take(4)
                .map(event)
                .collect::<ApiResult<Vec<_>>>()?;
            Ok(json!({"events":events,"more":more}))
        }
        (Method::Post, "/v1/changes") => {
            let value = body(&mut req).await?;
            let namespace = string(&value, "namespace", 2500)?;
            let policy_revision = integer(&value, "policyRevision")?;
            let m = &value["mutation"];
            let operation = string(m, "operationId", 150)?;
            let key = string(m, "key", 500)?;
            let base = integer(m, "base")?;
            require(m.get("value").is_some(), 400, "VALUE_REQUIRED")?;
            let payload = m["value"].to_string();
            require(payload.len() <= 524288, 413, "ITEM_TOO_LARGE")?;
            let previous=db.prepare("SELECT revision,operation,key,base,value FROM sync_events WHERE space=? AND namespace=? AND operation=?").bind(&[space.clone().into(),namespace.into(),operation.into()])?.first::<Value>(None).await?;
            if let Some(previous) = previous {
                require(
                    previous["key"] == key
                        && previous["base"] == base
                        && previous["value"] == payload,
                    409,
                    "IDEMPOTENCY_CONFLICT",
                )?;
                return Ok(json!({"accepted":true}));
            }
            let result=db.prepare("INSERT INTO sync_events(space,namespace,operation,key,base,value,policy_revision) VALUES (?,?,?,?,?,?,?)").bind(&[space.into(),namespace.into(),operation.into(),key.into(),JsValue::from_f64(base as f64),payload.into(),JsValue::from_f64(policy_revision as f64)])?.run().await;
            match result {
                Ok(_) => Ok(json!({"accepted":true})),
                Err(error) => {
                    let text = error.to_string();
                    if text.contains("SYNC_VERSION_CONFLICT")
                        || text.contains("SYNC_POLICY_CONFLICT")
                        || text.contains("UNIQUE constraint")
                    {
                        Err(Failure(409, "SYNC_CONFLICT"))
                    } else {
                        Err(Failure(503, "SYNC_UNAVAILABLE"))
                    }
                }
            }
        }
        _ => Err(Failure(404, "NOT_FOUND")),
    }
}
#[event(fetch)]
pub async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let (status, value) = match handle(req, env).await {
        Ok(value) => (200, value),
        Err(Failure(status, code)) => (status, json!({"error":code})),
    };
    let mut response = Response::from_json(&value)?.with_status(status);
    response.headers_mut().set("Cache-Control", "no-store")?;
    Ok(response)
}
