use crate::{
    blob_store as store,
    protocol::{ApiResult, Failure, body, fields, integer, require, string},
};
use serde_json::{Value, json};
use wasm_bindgen::JsValue;
use worker::*;

pub(crate) fn digest(value: &Value) -> ApiResult<&str> {
    let text = string(value, "digest", 64)?;
    require(
        text.len() == 64
            && text
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
        400,
        "INVALID_DIGEST",
    )?;
    Ok(text)
}
async fn enabled(db: &D1Database, space: &str, namespace: &str) -> ApiResult<()> {
    require(
        !namespace.is_empty() && namespace.len() <= 2500,
        400,
        "INVALID_NAMESPACE",
    )?;
    let row=db.prepare("SELECT 1 AS enabled FROM sync_policy p,json_each(p.namespaces) n WHERE p.space=? AND n.value=?").bind(&[space.into(),namespace.into()])?.first::<Value>(None).await?;
    require(row.is_some(), 403, "COLLECTION_DISABLED")
}
/// A generation the sealed process-items stream referenced is reachable from another collection only through a reference
/// of that collection's own; knowing the digest and size is not proof of holding the bytes.
async fn unprotected(db: &D1Database, space: &str, namespace: &str, digest: &str) -> ApiResult<()> {
    let row=db.prepare("SELECT 1 AS protected FROM sync_cutover_blobs p JOIN sync_blobs b ON b.space=p.space AND b.digest=p.digest AND b.generation=p.generation WHERE p.space=? AND p.digest=? AND NOT EXISTS(SELECT 1 FROM sync_events e,json_each(e.attachments) a WHERE e.space=p.space AND e.namespace=? AND json_extract(a.value,'$.digest')=p.digest)").bind(&[space.into(),digest.into(),namespace.into()])?.first::<Value>(None).await?;
    require(row.is_none(), 403, "SYNC_BLOB_PROTECTED")
}
/// Who may write or read a blob right now, both before the work and inside the statement that publishes it. An ordinary
/// collection needs its live selection (and, for a protected generation, a reference of its own); a seed upload needs the
/// sealed account's live adoption consent and the digest in its frozen plan.
pub(crate) enum Permit<'a> {
    Collection { namespace: &'a str },
    Seed { cutover: &'a str, consent: i64 },
}
impl Permit<'_> {
    fn sql(&self, space: &str, digest: &str) -> (&'static str, Vec<JsValue>) {
        match self {
            Permit::Collection { namespace } => (
                "EXISTS(SELECT 1 FROM sync_policy p,json_each(p.namespaces) n WHERE p.space=? AND n.value=?)",
                vec![space.into(), (*namespace).into()],
            ),
            Permit::Seed { cutover, consent } => (
                "EXISTS(SELECT 1 FROM sync_cutovers c JOIN sync_cutover_items i ON i.space=c.space AND i.plan_id=c.cutover_id,json_each(i.attachments) a WHERE c.space=? AND c.cutover_id=? AND c.consent_revision=? AND c.adopting=1 AND c.completed_at IS NULL AND json_extract(a.value,'$.digest')=?)",
                vec![
                    space.into(),
                    (*cutover).into(),
                    JsValue::from_f64(*consent as f64),
                    digest.into(),
                ],
            ),
        }
    }
    async fn check(&self, db: &D1Database, space: &str, digest: &str) -> ApiResult<()> {
        match self {
            Permit::Collection { namespace } => {
                enabled(db, space, namespace).await?;
                unprotected(db, space, namespace, digest).await
            }
            Permit::Seed { .. } => {
                let (sql, binds) = self.sql(space, digest);
                let row = db
                    .prepare(format!("SELECT 1 AS permitted WHERE {sql}"))
                    .bind(&binds)?
                    .first::<Value>(None)
                    .await?;
                require(row.is_some(), 403, "SYNC_CONSENT_REQUIRED")
            }
        }
    }
}
async fn blob(db: &D1Database, space: &str, digest: &str) -> ApiResult<Value> {
    db.prepare(
        "SELECT size,ready,generation FROM sync_blobs WHERE space=? AND digest=? AND deleting=0",
    )
    .bind(&[space.into(), digest.into()])?
    .first::<Value>(None)
    .await?
    .ok_or(Failure(404, "SYNC_BLOB_MISSING"))
}
pub(crate) async fn status(
    db: &D1Database,
    space: &str,
    digest: &str,
    permit: &Permit<'_>,
) -> ApiResult<Value> {
    permit.check(db, space, digest).await?;
    let row = blob(db, space, digest).await?;
    Ok(
        json!({"digest":digest,"size":row["size"],"ready":row["ready"]==1,"parts":store::parts(db,space,digest).await?}),
    )
}
pub(crate) async fn reserve(
    db: &D1Database,
    space: &str,
    digest: &str,
    size: i64,
    permit: &Permit<'_>,
) -> ApiResult<Value> {
    require((1..=100000000).contains(&size), 400, "INVALID_BLOB_SIZE")?;
    permit.check(db, space, digest).await?;
    let (sql, mut binds) = permit.sql(space, digest);
    let mut args: Vec<JsValue> = vec![
        space.into(),
        digest.into(),
        JsValue::from_f64(size as f64),
        space.into(),
        digest.into(),
    ];
    args.append(&mut binds);
    // Conditional insert avoids quota admission on a replay. The trigger serializes new reservations.
    let result = db
        .prepare(format!("INSERT INTO sync_blobs(space,digest,size) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM sync_blobs WHERE space=? AND digest=?) AND {sql}"))
        .bind(&args)?
        .run()
        .await;
    if let Err(error) = result {
        if error.to_string().contains("SYNC_QUOTA_EXCEEDED") {
            return Err(Failure(413, "SYNC_QUOTA_EXCEEDED"));
        }
        return Err(Failure(503, "SYNC_BLOB_UNAVAILABLE"));
    }
    permit.check(db, space, digest).await?;
    let row = blob(db, space, digest).await?;
    require(row["size"] == size, 409, "SYNC_BLOB_CONFLICT")?;
    Ok(
        json!({"digest":digest,"size":size,"ready":row["ready"]==1,"parts":store::parts(db,space,digest).await?}),
    )
}
pub(crate) async fn complete(
    db: &D1Database,
    bucket: &Bucket,
    space: &str,
    digest: &str,
    permit: &Permit<'_>,
) -> ApiResult<Value> {
    permit.check(db, space, digest).await?;
    let row = blob(db, space, digest).await?;
    if row["ready"] == 1 {
        return Ok(json!({"ready":true}));
    }
    let size = integer(&row, "size")? as usize;
    let parts = store::parts(db, space, digest).await?;
    require(
        parts.len() == size.div_ceil(store::CHUNK),
        409,
        "SYNC_BLOB_INCOMPLETE",
    )?;
    let (stream, writer) = store::hasher()?;
    for (index, part) in parts.iter().enumerate() {
        require(part["part"] == index, 409, "SYNC_BLOB_INCOMPLETE")?;
        let bytes = store::read(
            bucket,
            space,
            digest,
            string(&row, "generation", 32)?,
            index as i64,
            string(part, "checksum", 64)?,
        )
        .await?;
        require(
            bytes.len() == (size - index * store::CHUNK).min(store::CHUNK),
            409,
            "SYNC_BLOB_INCOMPLETE",
        )?;
        store::feed(&writer, &bytes).await?;
    }
    require(
        store::finish(stream, writer).await? == digest,
        409,
        "SYNC_BLOB_DIGEST_MISMATCH",
    )?;
    let (sql, mut binds) = permit.sql(space, digest);
    let mut args: Vec<JsValue> = vec![
        space.into(),
        digest.into(),
        string(&row, "generation", 32)?.into(),
    ];
    args.append(&mut binds);
    db.prepare(format!("UPDATE sync_blobs SET ready=1 WHERE space=? AND digest=? AND generation=? AND deleting=0 AND {sql}"))
        .bind(&args)?
        .run()
        .await?;
    permit.check(db, space, digest).await?;
    let current = blob(db, space, digest).await?;
    require(
        current["generation"] == row["generation"] && current["ready"] == 1,
        409,
        "SYNC_BLOB_CONFLICT",
    )?;
    Ok(json!({"ready":true}))
}
pub(crate) async fn chunk(
    req: &mut Request,
    db: &D1Database,
    bucket: &Bucket,
    space: &str,
    digest: &str,
    part: i64,
    permit: &Permit<'_>,
) -> ApiResult<Response> {
    permit.check(db, space, digest).await?;
    let row = blob(db, space, digest).await?;
    let size = integer(&row, "size")? as usize;
    require(
        part >= 0 && (part as usize) < size.div_ceil(store::CHUNK),
        400,
        "INVALID_PART",
    )?;
    if req.method() == Method::Put {
        let expected = (size - part as usize * store::CHUNK).min(store::CHUNK);
        let declared = req
            .headers()
            .get("Content-Length")?
            .and_then(|s| s.parse::<usize>().ok());
        require(declared == Some(expected), 411, "INVALID_PART_LENGTH")?;
        let bytes = req.bytes().await?;
        require(bytes.len() == expected, 400, "INVALID_PART_SIZE")?;
        let checksum = store::checksum(&bytes).await?;
        let previous = store::parts(db, space, digest)
            .await?
            .into_iter()
            .find(|p| p["part"] == part);
        if let Some(previous) = previous {
            require(previous["checksum"] == checksum, 409, "SYNC_BLOB_CONFLICT")?;
            return Ok(Response::from_json(&json!({"stored":true}))?);
        }
        require(row["ready"] == 0, 409, "SYNC_BLOB_CONFLICT")?;
        let generation = string(&row, "generation", 32)?;
        let object_key = store::key(space, digest, generation, part, &checksum);
        bucket.put(object_key.clone(), bytes).execute().await?;
        // The part is published only while the generation is current, not ready, and the permit still holds.
        let (sql, mut binds) = permit.sql(space, digest);
        let mut args: Vec<JsValue> = vec![
            space.into(),
            digest.into(),
            JsValue::from_f64(part as f64),
            checksum.clone().into(),
            generation.into(),
            space.into(),
            digest.into(),
            generation.into(),
        ];
        args.append(&mut binds);
        let inserted = db
            .prepare(format!("INSERT OR IGNORE INTO sync_blob_parts SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sync_blobs WHERE space=? AND digest=? AND generation=? AND deleting=0 AND ready=0) AND {sql}"))
            .bind(&args)?
            .run()
            .await?;
        if inserted.meta()?.and_then(|meta| meta.changes).unwrap_or(0) == 0 {
            // A loser removes only its own object: an identical recorded part has the same key and stays for the winner.
            let recorded = store::parts(db, space, digest)
                .await?
                .into_iter()
                .any(|p| p["part"] == part && p["checksum"] == checksum.as_str());
            let current = blob(db, space, digest).await;
            if !recorded
                || !current
                    .as_ref()
                    .is_ok_and(|current| current["generation"] == generation)
            {
                if !recorded {
                    bucket.delete(object_key).await?;
                }
                permit.check(db, space, digest).await?;
                return Err(Failure(409, "SYNC_BLOB_CONFLICT"));
            }
        }
        let actual = store::parts(db, space, digest).await?;
        require(
            actual
                .iter()
                .any(|p| p["part"] == part && p["checksum"] == checksum),
            409,
            "SYNC_BLOB_CONFLICT",
        )?;
        return Ok(Response::from_json(&json!({"stored":true}))?);
    }
    require(req.method() == Method::Get, 405, "METHOD_NOT_ALLOWED")?;
    require(row["ready"] == 1, 409, "SYNC_BLOB_NOT_READY")?;
    let parts = store::parts(db, space, digest).await?;
    let p = parts
        .iter()
        .find(|p| p["part"] == part)
        .ok_or(Failure(503, "SYNC_BLOB_UNAVAILABLE"))?;
    let bytes = store::read(
        bucket,
        space,
        digest,
        string(&row, "generation", 32)?,
        part,
        string(p, "checksum", 64)?,
    )
    .await?;
    // Tail check: a seal, withdrawal, deselection or new generation during the R2 await drops the bytes.
    permit.check(db, space, digest).await?;
    require(
        blob(db, space, digest).await?["generation"] == row["generation"],
        409,
        "SYNC_BLOB_CONFLICT",
    )?;
    let mut response = Response::from_bytes(bytes)?;
    response
        .headers_mut()
        .set("Content-Type", "application/octet-stream")?;
    response
        .headers_mut()
        .set("X-Content-Type-Options", "nosniff")?;
    Ok(response)
}
pub(crate) fn query(req: &Request, name: &str) -> ApiResult<String> {
    Ok(req
        .url()?
        .query_pairs()
        .find(|(k, _)| k == name)
        .map(|(_, v)| v.into_owned())
        .unwrap_or_default())
}
pub(crate) async fn handle(
    req: &mut Request,
    env: &Env,
    db: &D1Database,
    space: &str,
    scope: &crate::cutover::Scope,
) -> ApiResult<Response> {
    let path = req.url()?.path().to_owned();
    let bucket = env.bucket("FILES")?;
    if path == "/v1/blobs/status" || path == "/v1/blobs/chunk" {
        let namespace = scope.route(&query(req, "namespace")?)?;
        let permit = Permit::Collection {
            namespace: &namespace,
        };
        let input = json!({"digest":query(req, "digest")?});
        let digest = digest(&input)?;
        if path == "/v1/blobs/status" {
            require(req.method() == Method::Get, 405, "METHOD_NOT_ALLOWED")?;
            return Ok(Response::from_json(
                &status(db, space, digest, &permit).await?,
            )?);
        }
        let part = query(req, "part")?
            .parse::<i64>()
            .map_err(|_| Failure(400, "INVALID_PART"))?;
        return chunk(req, db, &bucket, space, digest, part, &permit).await;
    }
    require(req.method() == Method::Post, 405, "METHOD_NOT_ALLOWED")?;
    let value = body(req).await?;
    let result = match path.as_str() {
        "/v1/blobs/reserve" => {
            fields(&value, &["namespace", "digest", "size"])?;
            let namespace = scope.route(string(&value, "namespace", 2500)?)?;
            reserve(
                db,
                space,
                digest(&value)?,
                integer(&value, "size")?,
                &Permit::Collection {
                    namespace: &namespace,
                },
            )
            .await?
        }
        "/v1/blobs/complete" => {
            fields(&value, &["namespace", "digest"])?;
            let namespace = scope.route(string(&value, "namespace", 2500)?)?;
            complete(
                db,
                &bucket,
                space,
                digest(&value)?,
                &Permit::Collection {
                    namespace: &namespace,
                },
            )
            .await?
        }
        _ => return Err(Failure(404, "NOT_FOUND")),
    };
    Ok(Response::from_json(&result)?)
}
