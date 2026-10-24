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
