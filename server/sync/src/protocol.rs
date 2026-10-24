use serde_json::{Value, json};
use worker::*;

pub(crate) struct Failure(pub(crate) u16, pub(crate) &'static str);
pub(crate) type ApiResult<T> = std::result::Result<T, Failure>;
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
pub(crate) fn require(ok: bool, status: u16, code: &'static str) -> ApiResult<()> {
    if ok {
        Ok(())
    } else {
        Err(Failure(status, code))
    }
}
pub(crate) fn fields(v: &Value, allowed: &[&str]) -> ApiResult<()> {
    let object = v.as_object().ok_or(Failure(400, "INVALID_OBJECT"))?;
    require(
        object.len() == allowed.len() && allowed.iter().all(|key| object.contains_key(*key)),
        400,
        "INVALID_FIELDS",
    )
}
pub(crate) fn string<'a>(v: &'a Value, key: &str, max: usize) -> ApiResult<&'a str> {
    let s = v[key].as_str().ok_or(Failure(400, "INVALID_FIELD"))?;
    require(
        !s.is_empty() && s.len() <= max && s.trim() == s,
        400,
        "INVALID_FIELD",
    )?;
    Ok(s)
}
pub(crate) fn integer(v: &Value, key: &str) -> ApiResult<i64> {
    let n = v[key].as_i64().ok_or(Failure(400, "INVALID_NUMBER"))?;
    require(
        (0..=9_007_199_254_740_991).contains(&n),
        400,
        "INVALID_NUMBER",
    )?;
    Ok(n)
}
pub(crate) fn namespace(v: &Value) -> ApiResult<String> {
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
pub(crate) fn event(row: &Value) -> ApiResult<Value> {
    Ok(
        json!({"operationId":row["operation"],"key":row["key"],"base":row["base"],"value":serde_json::from_str::<Value>(row["value"].as_str().ok_or(Failure(503,"INVALID_STORAGE"))?)?,"attachments":serde_json::from_str::<Value>(row["attachments"].as_str().ok_or(Failure(503,"INVALID_STORAGE"))?)?,"revision":row["revision"]}),
    )
}

pub(crate) async fn body(req: &mut Request) -> ApiResult<Value> {
    let bytes = req.bytes().await?;
    require(bytes.len() <= 530_000, 413, "ITEM_TOO_LARGE")?;
    Ok(serde_json::from_slice(&bytes)?)
}
