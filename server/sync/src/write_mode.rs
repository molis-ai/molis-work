use crate::protocol::{ApiResult, Failure, require};
use worker::Env;

/** Operator binding, never a request parameter or a client-controlled maintenance privilege. */
pub(crate) fn writable(env: &Env) -> ApiResult<bool> {
    match env
        .var("SYNC_WRITE_MODE")
        .ok()
        .map(|value| value.to_string())
        .as_deref()
    {
        None | Some("read-write") => Ok(true),
        Some("read-only") => Ok(false),
        _ => Err(Failure(503, "SYNC_INVALID_WRITE_MODE")),
    }
}

pub(crate) fn require_write(env: &Env) -> ApiResult<()> {
    require(writable(env)?, 503, "SYNC_READ_ONLY")
}
