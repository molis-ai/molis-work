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
async fn blob(db: &D1Database, space: &str, digest: &str) -> ApiResult<Value> {
    db.prepare(
        "SELECT size,ready,generation FROM sync_blobs WHERE space=? AND digest=? AND deleting=0",
    )
    .bind(&[space.into(), digest.into()])?
    .first::<Value>(None)
    .await?
    .ok_or(Failure(404, "SYNC_BLOB_MISSING"))
}
async fn reserve(db: &D1Database, space: &str, value: &Value) -> ApiResult<Value> {
    fields(value, &["namespace", "digest", "size"])?;
    let namespace = string(value, "namespace", 2500)?;
    enabled(db, space, namespace).await?;
    let digest = digest(value)?;
    let size = integer(value, "size")?;
    require((1..=100000000).contains(&size), 400, "INVALID_BLOB_SIZE")?;
    // Conditional insert avoids quota admission on a replay. The trigger serializes new reservations.
    let result=db.prepare("INSERT INTO sync_blobs(space,digest,size) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM sync_blobs WHERE space=? AND digest=?)").bind(&[space.into(),digest.into(),JsValue::from_f64(size as f64),space.into(),digest.into()])?.run().await;
    if let Err(error) = result {
        if error.to_string().contains("SYNC_QUOTA_EXCEEDED") {
            return Err(Failure(413, "SYNC_QUOTA_EXCEEDED"));
        }
        return Err(Failure(503, "SYNC_BLOB_UNAVAILABLE"));
    }
    let row = blob(db, space, digest).await?;
    require(row["size"] == size, 409, "SYNC_BLOB_CONFLICT")?;
    Ok(
        json!({"digest":digest,"size":size,"ready":row["ready"]==1,"parts":store::parts(db,space,digest).await?}),
    )
}
async fn complete(
    db: &D1Database,
    bucket: &Bucket,
    space: &str,
    value: &Value,
) -> ApiResult<Value> {
    fields(value, &["namespace", "digest"])?;
    enabled(db, space, string(value, "namespace", 2500)?).await?;
    let digest = digest(value)?;
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
    db.prepare(
        "UPDATE sync_blobs SET ready=1 WHERE space=? AND digest=? AND generation=? AND deleting=0",
    )
    .bind(&[
        space.into(),
        digest.into(),
        string(&row, "generation", 32)?.into(),
    ])?
    .run()
    .await?;
    let current = blob(db, space, digest).await?;
    require(
        current["generation"] == row["generation"] && current["ready"] == 1,
        409,
        "SYNC_BLOB_CONFLICT",
    )?;
    Ok(json!({"ready":true}))
}
async fn chunk(
    req: &mut Request,
    db: &D1Database,
    bucket: &Bucket,
    space: &str,
) -> ApiResult<Response> {
    let url = req.url()?;
    let query = |name: &str| {
        url.query_pairs()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.into_owned())
            .unwrap_or_default()
    };
    let namespace = query("namespace");
    enabled(db, space, &namespace).await?;
    let value = json!({"digest":query("digest")});
    let digest = digest(&value)?;
    let part = query("part")
        .parse::<i64>()
        .map_err(|_| Failure(400, "INVALID_PART"))?;
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
        require(
            bytes.len() == (size - part as usize * store::CHUNK).min(store::CHUNK),
            400,
            "INVALID_PART_SIZE",
        )?;
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
        let inserted=db.prepare("INSERT OR IGNORE INTO sync_blob_parts SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sync_blobs WHERE space=? AND digest=? AND generation=? AND deleting=0)")
            .bind(&[
                space.into(),
                digest.into(),
                JsValue::from_f64(part as f64),
                checksum.clone().into(),
                generation.into(),space.into(),digest.into(),generation.into(),
            ])?
            .run()
            .await?;
        if inserted.meta()?.and_then(|meta| meta.changes).unwrap_or(0) == 0 {
            let current = blob(db, space, digest).await;
            if !current
                .as_ref()
                .is_ok_and(|current| current["generation"] == generation)
            {
                bucket.delete(object_key).await?;
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
    let mut response = Response::from_bytes(
        store::read(
            bucket,
            space,
            digest,
            string(&row, "generation", 32)?,
            part,
            string(p, "checksum", 64)?,
        )
        .await?,
    )?;
    response
        .headers_mut()
        .set("Content-Type", "application/octet-stream")?;
    response
        .headers_mut()
        .set("X-Content-Type-Options", "nosniff")?;
    Ok(response)
}
pub(crate) async fn handle(
    req: &mut Request,
    env: &Env,
    db: &D1Database,
    space: &str,
) -> ApiResult<Response> {
    let path = req.url()?.path().to_owned();
    let bucket = env.bucket("FILES")?;
    if path == "/v1/blobs/status" {
        require(req.method() == Method::Get, 405, "METHOD_NOT_ALLOWED")?;
        let url = req.url()?;
        let query = |name: &str| {
            url.query_pairs()
                .find(|(k, _)| k == name)
                .map(|(_, v)| v.into_owned())
                .unwrap_or_default()
        };
        enabled(db, space, &query("namespace")).await?;
        let input = json!({"digest":query("digest")});
        let digest = digest(&input)?;
        let row = blob(db, space, digest).await?;
        return Ok(Response::from_json(
            &json!({"digest":digest,"size":row["size"],"ready":row["ready"]==1,"parts":store::parts(db,space,digest).await?}),
        )?);
    }
    if path == "/v1/blobs/chunk" {
        return chunk(req, db, &bucket, space).await;
    }
    require(req.method() == Method::Post, 405, "METHOD_NOT_ALLOWED")?;
    let value = body(req).await?;
    let result = match path.as_str() {
        "/v1/blobs/reserve" => reserve(db, space, &value).await?,
        "/v1/blobs/complete" => complete(db, &bucket, space, &value).await?,
        _ => return Err(Failure(404, "NOT_FOUND")),
    };
    Ok(Response::from_json(&result)?)
}
