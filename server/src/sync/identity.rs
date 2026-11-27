use crate::protocol::{ApiResult, Failure, require, string};
use serde_json::Value;
use sha2::{Digest, Sha256};
use worker::*;

pub(crate) async fn identity(req: &Request, env: &Env) -> ApiResult<String> {
    let mode = env.var("DEPLOYMENT_MODE")?.to_string();
    require(
        mode == "local" || mode == "cloud",
        503,
        "INVALID_AUTH_CONFIG",
    )?;
    require(
        mode == "local" || req.url()?.scheme() == "https",
        400,
        "HTTPS_REQUIRED",
    )?;
    let origin = env.var("AUTH_ORIGIN")?.to_string();
    let parsed = Url::parse(&origin).map_err(|_| Failure(503, "INVALID_AUTH_CONFIG"))?;
    require(
        (parsed.scheme() == "https"
            || (mode == "local"
                && parsed.scheme() == "http"
                && parsed.host_str() == Some("127.0.0.1")))
            && parsed.username().is_empty()
            && parsed.password().is_none()
            && parsed.path() == "/"
            && origin == parsed.origin().ascii_serialization()
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
    let application = env.var("APPLICATION_ID")?.to_string();
    let signed_reads = env
        .var("SYNC_READ_AUTH")
        .ok()
        .map(|value| value.to_string());
    require(
        signed_reads
            .as_deref()
            .is_none_or(|mode| matches!(mode, "live" | "signed")),
        503,
        "INVALID_AUTH_CONFIG",
    )?;
    // Only polling and incremental reads use a 30-second proof. History, file reads and mutations
    // still check live Auth state. Request bodies cannot pick an account or reuse a proof.
    if signed_reads.as_deref() == Some("signed")
        && req.method() == Method::Get
        && matches!(req.path().as_str(), "/v1/round" | "/v1/changes")
    {
        let token_hash = hex::encode(Sha256::digest(&authorization.as_bytes()[7..]));
        let user = crate::signed_identity::sync_read_identity(
            &origin,
            &application,
            &authorization,
            &token_hash,
        )
        .await
        .map_err(|_| Failure(503, "SYNC_AUTH_UNAVAILABLE"))?
        .as_string()
        .ok_or(Failure(401, "UNAUTHORIZED"))?;
        return space_id(&origin, &application, &user);
    }
    let headers = Headers::new();
    headers.set("Authorization", &authorization)?;
    // Workers supports manual/follow. Never follow an Auth redirect with the Bearer token.
    let request = Request::new_with_init(
        &format!("{}/api/v2/users/me", origin.trim_end_matches('/')),
        RequestInit::new()
            .with_headers(headers)
            .with_redirect(RequestRedirect::Manual),
    )?;
    let mut response = Fetch::Request(request).send().await?;
    let status = response.status_code();
    if status == 429 {
        return Err(Failure(429, "SYNC_AUTH_UNAVAILABLE"));
    }
    if status >= 500 {
        return Err(Failure(503, "SYNC_AUTH_UNAVAILABLE"));
    }
    require(status == 200, 401, "UNAUTHORIZED")?;
    let identity: Value = response.json().await?;
    let data = &identity["data"];
    let user = string(&data["user"], "userId", 500)?;
    require(
        string(&data["user"], "issuer", 2048)? == origin,
        403,
        "WRONG_ISSUER",
    )?;
    require(
        string(&data["session"], "applicationId", 500)? == application,
        403,
        "WRONG_APPLICATION",
    )?;
    space_id(&origin, &application, user)
}

fn space_id(origin: &str, application: &str, user: &str) -> ApiResult<String> {
    // Same canonical tuple as the local space owner.
    let tuple = serde_json::to_string(&[origin.trim_end_matches('/'), application, user])?;
    Ok(format!(
        "space_{}",
        hex::encode(Sha256::digest(tuple.as_bytes()))
    ))
}
