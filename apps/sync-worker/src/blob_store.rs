use crate::protocol::{ApiResult, Failure, require};
use wasm_bindgen::JsCast;
use worker::{
    Bucket, D1Database,
    crypto::{DigestStream, DigestStreamAlgorithm},
    js_sys::{Uint8Array, futures::JsFuture},
    web_sys::WritableStreamDefaultWriter,
};

pub(crate) const CHUNK: usize = 4 * 1024 * 1024;
pub(crate) fn key(
    space: &str,
    digest: &str,
    generation: &str,
    part: i64,
    checksum: &str,
) -> String {
    format!("{space}/{digest}/{generation}/{part}/{checksum}")
}
pub(crate) fn hasher() -> ApiResult<(DigestStream, WritableStreamDefaultWriter)> {
    let stream = DigestStream::new(DigestStreamAlgorithm::Sha256);
    let writer = stream
        .raw()
        .get_writer()
        .map_err(|_| Failure(503, "SYNC_BLOB_UNAVAILABLE"))?
        .unchecked_into();
    Ok((stream, writer))
}
pub(crate) async fn feed(writer: &WritableStreamDefaultWriter, bytes: &[u8]) -> ApiResult<()> {
    JsFuture::from(writer.write_with_chunk(&Uint8Array::from(bytes)))
        .await
        .map_err(|_| Failure(503, "SYNC_BLOB_UNAVAILABLE"))?;
    Ok(())
}
pub(crate) async fn finish(
    stream: DigestStream,
    writer: WritableStreamDefaultWriter,
) -> ApiResult<String> {
    JsFuture::from(writer.close())
        .await
        .map_err(|_| Failure(503, "SYNC_BLOB_UNAVAILABLE"))?;
    Ok(hex::encode(stream.digest().await?.to_vec()))
}
pub(crate) async fn checksum(bytes: &[u8]) -> ApiResult<String> {
    let (stream, writer) = hasher()?;
    feed(&writer, bytes).await?;
    finish(stream, writer).await
}
pub(crate) async fn read(
    bucket: &Bucket,
    space: &str,
    digest: &str,
    generation: &str,
    part: i64,
    expected: &str,
) -> ApiResult<Vec<u8>> {
    let object = bucket
        .get(key(space, digest, generation, part, expected))
        .execute()
        .await?
        .ok_or(Failure(503, "SYNC_BLOB_UNAVAILABLE"))?;
    let bytes = object
        .body()
        .ok_or(Failure(503, "SYNC_BLOB_UNAVAILABLE"))?
        .bytes()
        .await?;
    require(
        bytes.len() <= CHUNK && checksum(&bytes).await? == expected,
        503,
        "SYNC_BLOB_CORRUPT",
    )?;
    Ok(bytes)
}
pub(crate) async fn parts(
    db: &D1Database,
    space: &str,
    digest: &str,
) -> ApiResult<Vec<serde_json::Value>> {
    Ok(db
        .prepare(
            "SELECT part,checksum FROM sync_blob_parts WHERE space=? AND digest=? ORDER BY part",
        )
        .bind(&[space.into(), digest.into()])?
        .all()
        .await?
        .results()?)
}
