//! The one-time adoption of the public process-items collection (specs/batch-06-shared-tools/sync-cutover.md and
//! current-version-adoption.md). Clients only ever name the public collection N; the private stream A is derived here
//! from the account's seal and is never accepted from a request. Every condition that guards a state change is checked
//! inside the same D1 batch as the change: a failed `sync_checks` insert aborts the whole batch.
use crate::protocol::{ApiResult, Failure, body, fields, integer, require, string};
use serde_json::{Value, json};
use wasm_bindgen::JsValue;
use worker::{D1Database, D1PreparedStatement, Env, Method, Request, Response};

pub(crate) const PUBLIC: &str =
    r#"["io.molis.work.artifacts","molis","official-artifacts-binding","process_items",1]"#;
const PRIVATE: &str = r#"["process_items_adopted","#;
pub(crate) const HEADER: &str = "X-Molis-Process-Items-Cutover";
const ITEM_MAX: usize = 524_288;

fn n(value: i64) -> JsValue {
    JsValue::from_f64(value as f64)
}
fn private(id: &str) -> String {
    json!(["process_items_adopted", id]).to_string()
}
pub(crate) fn internal(namespace: &str) -> bool {
    namespace.starts_with(PRIVATE)
}
fn id(value: &Value, key: &str) -> ApiResult<String> {
    let text = value[key]
        .as_str()
        .ok_or(Failure(400, "INVALID_CUTOVER_ID"))?;
    require(
        (16..=64).contains(&text.len())
            && text
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'),
        400,
        "INVALID_CUTOVER_ID",
    )?;
    Ok(text.to_owned())
}
fn selection() -> Value {
    json!({"plugin_id":"io.molis.work.artifacts","publisher_id":"molis","publisher_signature":"official-artifacts-binding","collection_id":"process_items","schema_version":1})
}
fn check(
    db: &D1Database,
    code: &'static str,
    condition: &str,
    binds: &[JsValue],
) -> ApiResult<D1PreparedStatement> {
    Ok(db
        .prepare(format!(
            "INSERT INTO sync_checks SELECT '{code}' WHERE {condition}"
        ))
        .bind(binds)?)
}
const CODES: [(&str, u16); 18] = [
    ("SYNC_CUTOVER_SEALED", 409),
    ("SYNC_COLLECTION_SEALED", 409),
    ("SYNC_CUTOVER_SEEDING", 409),
    ("SYNC_CUTOVER_SCOPE", 403),
    ("SYNC_CONSENT_REQUIRED", 403),
    ("SYNC_SOURCE_CHANGED", 409),
    ("SYNC_PLAN_STALE", 409),
    ("SYNC_PLAN_CONFLICT", 409),
    ("SYNC_PLAN_MISMATCH", 409),
    ("SYNC_SEED_MISMATCH", 409),
    ("SYNC_SEED_INCOMPLETE", 409),
    ("SYNC_ITEM_RETIRED", 409),
    ("SYNC_BLOB_NOT_READY", 409),
    ("SYNC_BLOB_CONFLICT", 409),
    ("SYNC_QUOTA_EXCEEDED", 413),
    ("SYNC_POLICY_CONFLICT", 409),
    ("SYNC_VERSION_CONFLICT", 409),
    ("COLLECTION_DISABLED", 403),
];
/// Map an aborted batch or trigger back to its code; anything unrecognised stays a transient failure.
pub(crate) fn refusal(error: &worker::Error) -> Failure {
    let text = error.to_string();
    CODES
        .iter()
        .find(|(code, _)| text.contains(code))
        .map_or(Failure(503, "SYNC_UNAVAILABLE"), |&(code, status)| {
            Failure(status, code)
        })
}
async fn batch(db: &D1Database, statements: Vec<D1PreparedStatement>) -> ApiResult<()> {
    db.batch(statements)
        .await
        .map_err(|error| refusal(&error))?;
    Ok(())
}

pub(crate) async fn seal(db: &D1Database, space: &str) -> ApiResult<Option<Value>> {
    Ok(db
        .prepare("SELECT cutover_id AS cutoverId,namespace,sealed_policy_revision AS sealedPolicyRevision,source_head AS sourceHead,reserved_bytes AS reservedBytes,consent_revision AS consentRevision,adopting,history_read AS historyRead,selected,completion_head AS completionHead,completed_at AS completedAt FROM sync_cutovers WHERE space=?")
        .bind(&[space.into()])?
        .first::<Value>(None)
        .await?)
}
async fn source_head(db: &D1Database, space: &str) -> ApiResult<i64> {
    let row = db
        .prepare("SELECT COALESCE(MAX(revision),0) AS head FROM sync_receipts WHERE space=? AND namespace=?")
        .bind(&[space.into(), PUBLIC.into()])?
        .first::<Value>(None)
        .await?
        .ok_or(Failure(503, "INVALID_STORAGE"))?;
    integer(&row, "head").map_err(|_| Failure(503, "INVALID_STORAGE"))
}

/// The request's view of the collection: an unscoped request is the original client, a scoped one is the Host that holds this seal.
pub(crate) struct Scope {
    header: Option<String>,
    seal: Option<Value>,
}
impl Scope {
    pub(crate) async fn load(req: &Request, db: &D1Database, space: &str) -> ApiResult<Self> {
        let header = req.headers().get(HEADER)?;
        let seal = seal(db, space).await?;
        if let Some(header) = &header {
            require(
                seal.as_ref()
                    .is_some_and(|seal| seal["cutoverId"] == header.as_str()),
                403,
                "SYNC_CUTOVER_SCOPE",
            )?;
        }
        Ok(Self { header, seal })
    }
    pub(crate) fn sealed(&self) -> bool {
        self.seal.is_some()
    }
    fn complete(&self) -> bool {
        self.seal
            .as_ref()
            .is_some_and(|seal| !seal["completedAt"].is_null())
    }
    /// Only a completed cutover, asked for by its own scope, makes the public collection the private stream.
    pub(crate) fn current(&self) -> bool {
        self.header.is_some() && self.complete()
    }
    fn selected(&self) -> bool {
        self.seal.as_ref().is_some_and(|seal| seal["selected"] == 1)
    }
    fn stream(&self) -> ApiResult<&str> {
        self.seal
            .as_ref()
            .and_then(|seal| seal["namespace"].as_str())
            .ok_or(Failure(503, "INVALID_STORAGE"))
    }
    /// The stored namespace a public request names. Internal names are refused before any lookup.
    pub(crate) fn route(&self, public: &str) -> ApiResult<String> {
        require(!internal(public), 400, "INVALID_NAMESPACE")?;
        if public != PUBLIC || self.header.is_none() {
            return Ok(public.to_owned());
        }
        require(self.complete(), 409, "SYNC_CUTOVER_SEEDING")?;
        Ok(self.stream()?.to_owned())
    }
    /// The public name of a stored namespace in this view, or None where this view must not see it.
    pub(crate) fn public(&self, stored: &str) -> Option<String> {
        if internal(stored) {
            return (self.current() && self.selected() && self.stream().ok() == Some(stored))
                .then(|| PUBLIC.to_owned());
        }
        Some(stored.to_owned())
    }
    pub(crate) fn view(&self, mut policy: Value) -> Value {
        if self.current()
            && self.selected()
            && let Some(list) = policy["selections"].as_array_mut()
        {
            list.push(selection());
        }
        policy
    }
    /// Policy PUT after the seal. Unscoped requests can never select N again; a scoped request on a completed cutover
    /// turns the private stream on or off. Returns the stored selections, the stored namespaces and the new selected flag.
    pub(crate) fn place(
        &self,
        selections: &[Value],
        namespaces: &[String],
    ) -> ApiResult<(Vec<Value>, Vec<String>, bool)> {
        let wants = namespaces.iter().any(|namespace| namespace == PUBLIC);
        if wants {
            require(self.header.is_some(), 409, "SYNC_COLLECTION_SEALED")?;
            require(self.complete(), 409, "SYNC_CUTOVER_SEEDING")?;
        }
        let keep = if self.current() {
            wants
        } else {
            !self.complete() || self.selected()
        };
        let mut stored = namespaces
            .iter()
            .filter(|namespace| *namespace != PUBLIC)
            .cloned()
            .collect::<Vec<_>>();
        if keep {
            stored.push(self.stream()?.to_owned());
        }
        let kept = selections
            .iter()
            .zip(namespaces)
            .filter(|(_, namespace)| *namespace != PUBLIC)
            .map(|(selection, _)| selection.clone())
            .collect();
        Ok((
            kept,
            stored,
            if self.current() {
                wants
            } else {
                self.selected()
            },
        ))
    }
    pub(crate) fn guard(
        &self,
        db: &D1Database,
        space: &str,
        revision: i64,
    ) -> ApiResult<Vec<D1PreparedStatement>> {
        let seal = self.seal.as_ref().ok_or(Failure(503, "INVALID_STORAGE"))?;
        Ok(vec![
            check(
                db,
                "SYNC_POLICY_CONFLICT",
                "NOT EXISTS(SELECT 1 FROM sync_policy WHERE space=? AND revision=?)",
                &[space.into(), n(revision)],
            )?,
            check(
                db,
                "SYNC_POLICY_CONFLICT",
                "NOT EXISTS(SELECT 1 FROM sync_cutovers WHERE space=? AND cutover_id=? AND selected=? AND (completed_at IS NOT NULL)=?)",
                &[
                    space.into(),
                    seal["cutoverId"].as_str().unwrap_or_default().into(),
                    n(i64::from(self.selected())),
                    n(i64::from(self.complete())),
                ],
            )?,
        ])
    }
}

async fn status(db: &D1Database, space: &str) -> ApiResult<Value> {
    let policy = crate::policy(db, space).await?;
    let mut out = json!({"phase":"open","policyRevision":policy["revision"],"sourceHead":source_head(db,space).await?});
    if let Some(seal) = seal(db, space).await? {
        out["phase"] = json!(if seal["completedAt"].is_null() {
            "seeding"
        } else {
            "complete"
        });
        for key in [
            "cutoverId",
            "consentRevision",
            "completionHead",
            "reservedBytes",
            "sealedPolicyRevision",
            "completedAt",
        ] {
            out[key] = seal[key].clone();
        }
        out["adoptProcessItems"] = json!(seal["adopting"] == 1);
        out["historyRead"] = json!(seal["historyRead"] == 1);
        out["selected"] = json!(seal["selected"] == 1);
    }
    let plan = db
        .prepare("SELECT p.plan_id AS planId,p.policy_revision AS policyRevision,p.source_head AS sourceHead,COUNT(i.key) AS items,COALESCE(SUM(i.content_bytes),0) AS contentBytes FROM sync_cutover_plans p LEFT JOIN sync_cutover_items i ON i.space=p.space AND i.plan_id=p.plan_id WHERE p.space=? GROUP BY p.plan_id")
        .bind(&[space.into()])?
        .first::<Value>(None)
        .await?;
    out["plan"] = plan.unwrap_or(Value::Null);
    Ok(out)
}

fn query(req: &Request, allowed: &[&str]) -> ApiResult<Value> {
    let mut values = serde_json::Map::new();
    for (key, value) in req.url()?.query_pairs() {
        require(
            allowed.contains(&key.as_ref()) && !values.contains_key(key.as_ref()),
            400,
            "INVALID_FIELDS",
        )?;
        values.insert(key.into_owned(), Value::String(value.into_owned()));
    }
    Ok(Value::Object(values))
}
fn number(value: &Value, key: &str) -> ApiResult<Option<i64>> {
    value[key]
        .as_str()
        .map(|text| {
            text.parse::<i64>()
                .map_err(|_| Failure(400, "INVALID_NUMBER"))
        })
        .transpose()
}

/// Bounded pages of the old stream's heads, live ones with their exact value, each page tied to one source observation.
async fn source(req: &Request, db: &D1Database, space: &str) -> ApiResult<Value> {
    let value = query(req, &["after", "policyRevision", "sourceHead"])?;
    let after = value["after"].as_str().unwrap_or("").to_owned();
    let policy = crate::policy(db, space).await?;
    let (revision, head) = (
        policy["revision"]
            .as_i64()
            .ok_or(Failure(503, "INVALID_STORAGE"))?,
        source_head(db, space).await?,
    );
    let sealed = seal(db, space).await?.is_some();
    if let Some(expected) = number(&value, "policyRevision")? {
        require(sealed || expected == revision, 409, "SYNC_SOURCE_CHANGED")?;
    }
    if let Some(expected) = number(&value, "sourceHead")? {
        require(expected == head, 409, "SYNC_SOURCE_CHANGED")?;
    }
    // Before the seal the reader must still select N; after it, only the account's live history grant opens the old stream.
    let rows = db
        .prepare("SELECT h.key,h.revision AS headRevision,CASE WHEN h.purged_at IS NOT NULL THEN 'purged' WHEN h.deleted_at IS NOT NULL THEN 'deleted' WHEN e.revision IS NULL THEN 'expired' ELSE 'live' END AS state,e.value,e.attachments FROM sync_heads h LEFT JOIN sync_events e ON e.space=h.space AND e.namespace=h.namespace AND e.key=h.key AND e.revision=h.revision AND h.deleted_at IS NULL AND h.purged_at IS NULL WHERE h.space=? AND h.namespace=? AND h.key>? AND (EXISTS(SELECT 1 FROM sync_cutovers c WHERE c.space=h.space AND c.history_read=1) OR (NOT EXISTS(SELECT 1 FROM sync_cutovers c WHERE c.space=h.space) AND EXISTS(SELECT 1 FROM sync_policy p,json_each(p.namespaces) n WHERE p.space=h.space AND n.value=h.namespace))) ORDER BY h.key LIMIT 21")
        .bind(&[space.into(), PUBLIC.into(), after.into()])?
        .all()
        .await?
        .results::<Value>()?;
    if rows.is_empty() {
        let readable = if sealed {
            seal(db, space)
                .await?
                .is_some_and(|seal| seal["historyRead"] == 1)
        } else {
            db.prepare("SELECT 1 AS ok FROM sync_policy p,json_each(p.namespaces) n WHERE p.space=? AND n.value=?")
                .bind(&[space.into(), PUBLIC.into()])?
                .first::<Value>(None)
                .await?
                .is_some()
        };
        require(
            readable,
            403,
            if sealed {
                "SYNC_CONSENT_REQUIRED"
            } else {
                "COLLECTION_DISABLED"
            },
        )?;
    }
    // Tail check: the page belongs to the observation it reports.
    require(
        source_head(db, space).await? == head,
        409,
        "SYNC_SOURCE_CHANGED",
    )?;
    let mut items = Vec::new();
    for row in rows.iter().take(20) {
        let mut item =
            json!({"key":row["key"],"headRevision":row["headRevision"],"state":row["state"]});
        if row["state"] == "live" {
            item["value"] = serde_json::from_str(
                row["value"]
                    .as_str()
                    .ok_or(Failure(503, "INVALID_STORAGE"))?,
            )?;
            item["attachments"] = serde_json::from_str(
                row["attachments"]
                    .as_str()
                    .ok_or(Failure(503, "INVALID_STORAGE"))?,
            )?;
        }
        items.push(item);
    }
    Ok(
        json!({"policyRevision":revision,"sourceHead":head,"items":items,"more":rows.len()>20,"next":rows.get(19).map(|row|row["key"].clone())}),
    )
}

struct Frozen {
    key: String,
    value: String,
    attachments: String,
    fingerprint: String,
    parsed: Value,
    references: Value,
}
/// The exact wire a seed will carry: same bounds, serialisation and fingerprint as an ordinary first write.
async fn frozen(value: &Value) -> ApiResult<Frozen> {
    let key = string(value, "key", 500)?.to_owned();
    require(!value["value"].is_null(), 400, "INVALID_VALUE")?;
    let references = value["attachments"]
        .as_array()
        .ok_or(Failure(400, "INVALID_BLOBS"))?;
    require(references.len() <= 2000, 400, "INVALID_BLOBS")?;
    let mut seen = std::collections::HashSet::new();
    for reference in references {
        fields(reference, &["digest", "size"])?;
        require(
            seen.insert(crate::blobs::digest(reference)?),
            400,
            "INVALID_BLOBS",
        )?;
        require(
            (1..=100_000_000).contains(&integer(reference, "size")?),
            400,
            "INVALID_BLOBS",
        )?;
    }
    let payload = value["value"].to_string();
    require(payload.len() <= ITEM_MAX, 413, "ITEM_TOO_LARGE")?;
    let identity = json!([key, 0, value["value"], value["attachments"], "write"]);
    Ok(Frozen {
        fingerprint: crate::blob_store::checksum(identity.to_string().as_bytes()).await?,
        attachments: value["attachments"].to_string(),
        value: payload,
        parsed: value["value"].clone(),
        references: value["attachments"].clone(),
        key,
    })
}
async fn operation(plan: &str, key: &str) -> ApiResult<String> {
    Ok(format!(
        "seed:{}",
        crate::blob_store::checksum(format!("{plan}\n{key}").as_bytes()).await?
    ))
}
const LIVE_HEAD: &str = "EXISTS(SELECT 1 FROM sync_heads WHERE space=? AND namespace=? AND key=? AND revision=? AND deleted_at IS NULL AND purged_at IS NULL)";
const SELECTED: &str = "EXISTS(SELECT 1 FROM sync_policy p,json_each(p.namespaces) n WHERE p.space=? AND p.revision=? AND n.value=?)";
const SOURCE_HEAD: &str =
    "(SELECT COALESCE(MAX(revision),0) FROM sync_receipts WHERE space=? AND namespace=?)";
/// A planned reference `ref` is usable when its item's own source event holds it as a ready blob of that size, or when no
/// blob of that digest exists yet (new bytes the conversion made). Knowing another digest is never proof of holding it.
macro_rules! usable {
    ($source:literal) => {
        concat!(
            "(EXISTS(SELECT 1 FROM sync_events e,json_each(e.attachments) s JOIN sync_blobs b ON b.space=e.space AND b.digest=json_extract(s.value,'$.digest') WHERE ",
            $source,
            " AND json_extract(s.value,'$.digest')=json_extract(ref.value,'$.digest') AND json_extract(s.value,'$.size')=json_extract(ref.value,'$.size') AND b.size=json_extract(ref.value,'$.size') AND b.ready=1 AND b.deleting=0) OR NOT EXISTS(SELECT 1 FROM sync_blobs n WHERE n.space=? AND n.digest=json_extract(ref.value,'$.digest')))"
        )
    };
}
/// Distinct planned attachments no blob holds yet: the bytes the seed-blob routes will add.
const ABSENT: &str = "(SELECT COALESCE(SUM(size),0) FROM (SELECT DISTINCT json_extract(ref.value,'$.digest') AS digest,json_extract(ref.value,'$.size') AS size FROM sync_cutover_items i,json_each(i.attachments) ref WHERE i.space=? AND i.plan_id=? AND NOT EXISTS(SELECT 1 FROM sync_blobs b WHERE b.space=i.space AND b.digest=json_extract(ref.value,'$.digest'))))";

async fn plan_item(req: &mut Request, db: &D1Database, space: &str) -> ApiResult<Value> {
    let value = body(req).await?;
    fields(
        &value,
        &[
            "planId",
            "expectedPolicyRevision",
            "expectedSourceHead",
            "key",
            "sourceRevision",
            "value",
            "attachments",
        ],
    )?;
    let plan = id(&value, "planId")?;
    let (policy, head, source) = (
        integer(&value, "expectedPolicyRevision")?,
        integer(&value, "expectedSourceHead")?,
        integer(&value, "sourceRevision")?,
    );
    let item = frozen(&value).await?;
    let op = operation(&plan, &item.key).await?;
    let s = || JsValue::from_str(space);
    batch(db, vec![
        check(db, "SYNC_CUTOVER_SEALED", "EXISTS(SELECT 1 FROM sync_cutovers WHERE space=?)", &[s()])?,
        check(db, "SYNC_POLICY_CONFLICT", &format!("NOT {SELECTED}"), &[s(), n(policy), PUBLIC.into()])?,
        check(db, "SYNC_SOURCE_CHANGED", &format!("{SOURCE_HEAD}<>?"), &[s(), PUBLIC.into(), n(head)])?,
        check(db, "SYNC_SOURCE_CHANGED", &format!("NOT {LIVE_HEAD}"), &[s(), PUBLIC.into(), item.key.clone().into(), n(source)])?,
        // An attachment is either one the exact source event already holds, or new bytes the conversion made: those are uploaded
        // only through the seed-blob routes, only for digests frozen here, and begin reserves room for them.
        check(db, "SYNC_BLOB_NOT_READY", concat!("EXISTS(SELECT 1 FROM json_each(?) ref WHERE NOT ", usable!("e.space=? AND e.namespace=? AND e.key=? AND e.revision=?"), ")"), &[item.attachments.clone().into(), s(), PUBLIC.into(), item.key.clone().into(), n(source), s()])?,
        // A plan made against an older observation is replaced; a different plan for the same observation is a conflict.
        db.prepare("DELETE FROM sync_cutover_plans WHERE space=? AND plan_id<>? AND (policy_revision<>? OR source_head<>?)").bind(&[s(), plan.clone().into(), n(policy), n(head)])?,
        db.prepare("INSERT INTO sync_cutover_plans(space,plan_id,policy_revision,source_head) VALUES (?,?,?,?) ON CONFLICT(space) DO NOTHING").bind(&[s(), plan.clone().into(), n(policy), n(head)])?,
        check(db, "SYNC_PLAN_CONFLICT", "NOT EXISTS(SELECT 1 FROM sync_cutover_plans WHERE space=? AND plan_id=? AND policy_revision=? AND source_head=?)", &[s(), plan.clone().into(), n(policy), n(head)])?,
        // One digest has one size across the whole plan, so its reservation is counted once and exactly.
        check(db, "SYNC_BLOB_CONFLICT", "EXISTS(SELECT 1 FROM json_each(?) ref,sync_cutover_items i,json_each(i.attachments) other WHERE i.space=? AND i.plan_id=? AND i.key<>? AND json_extract(other.value,'$.digest')=json_extract(ref.value,'$.digest') AND json_extract(other.value,'$.size')<>json_extract(ref.value,'$.size'))", &[item.attachments.clone().into(), s(), plan.clone().into(), item.key.clone().into()])?,
        db.prepare("INSERT INTO sync_cutover_items(space,plan_id,key,source_revision,operation,value,attachments,fingerprint) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(space,key) DO UPDATE SET plan_id=excluded.plan_id,source_revision=excluded.source_revision,operation=excluded.operation,value=excluded.value,attachments=excluded.attachments,fingerprint=excluded.fingerprint")
            .bind(&[s(), plan.clone().into(), item.key.clone().into(), n(source), op.clone().into(), item.value.clone().into(), item.attachments.clone().into(), item.fingerprint.clone().into()])?,
    ]).await?;
    Ok(
        json!({"planId":plan,"key":item.key,"sourceRevision":source,"operationId":op,"fingerprint":item.fingerprint,"value":item.parsed,"attachments":item.references,"contentBytes":item.value.len()}),
    )
}

async fn begin(req: &mut Request, db: &D1Database, space: &str) -> ApiResult<Value> {
    let value = body(req).await?;
    fields(
        &value,
        &[
            "planId",
            "expectedPolicyRevision",
            "expectedSourceHead",
            "adoptProcessItems",
            "allowRetainedRead",
        ],
    )?;
    let plan = id(&value, "planId")?;
    let (policy, head) = (
        integer(&value, "expectedPolicyRevision")?,
        integer(&value, "expectedSourceHead")?,
    );
    require(
        value["adoptProcessItems"] == true,
        400,
        "SYNC_CONSENT_REQUIRED",
    )?;
    let history = value["allowRetainedRead"]
        .as_bool()
        .ok_or(Failure(400, "INVALID_FIELD"))?;
    if let Some(seal) = seal(db, space).await? {
        // A lost response finds the same seal; any other plan meets a permanent seal.
        require(
            seal["cutoverId"] == plan.as_str(),
            409,
            "SYNC_CUTOVER_SEALED",
        )?;
        return status(db, space).await;
    }
    let current = crate::policy(db, space).await?;
    require(current["revision"] == policy, 409, "SYNC_POLICY_CONFLICT")?;
    let stream = private(&plan);
    let mut kept = Vec::new();
    let mut namespaces = Vec::new();
    for selection in current["selections"]
        .as_array()
        .ok_or(Failure(503, "INVALID_STORAGE"))?
    {
        let namespace = crate::protocol::namespace(selection)?;
        if namespace != PUBLIC {
            kept.push(selection.clone());
            namespaces.push(namespace);
        }
    }
    namespaces.push(stream.clone());
    let stored = json!({"spaceId":space,"revision":policy+1,"selections":kept});
    let s = || JsValue::from_str(space);
    let p = || JsValue::from_str(&plan);
    batch(db, vec![
        check(db, "SYNC_CUTOVER_SEALED", "EXISTS(SELECT 1 FROM sync_cutovers WHERE space=?)", &[s()])?,
        check(db, "SYNC_POLICY_CONFLICT", &format!("NOT {SELECTED}"), &[s(), n(policy), PUBLIC.into()])?,
        check(db, "SYNC_SOURCE_CHANGED", &format!("{SOURCE_HEAD}<>?"), &[s(), PUBLIC.into(), n(head)])?,
        // An old stream with no live item adopts through an empty plan made here; a plan for an older observation is dropped.
        db.prepare("DELETE FROM sync_cutover_plans WHERE space=? AND plan_id<>? AND (policy_revision<>? OR source_head<>?)").bind(&[s(), p(), n(policy), n(head)])?,
        db.prepare("INSERT INTO sync_cutover_plans(space,plan_id,policy_revision,source_head) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM sync_cutover_plans WHERE space=?) AND NOT EXISTS(SELECT 1 FROM sync_heads WHERE space=? AND namespace=? AND deleted_at IS NULL AND purged_at IS NULL)").bind(&[s(), p(), n(policy), n(head), s(), s(), PUBLIC.into()])?,
        check(db, "SYNC_PLAN_STALE", "NOT EXISTS(SELECT 1 FROM sync_cutover_plans WHERE space=? AND plan_id=? AND policy_revision=? AND source_head=?)", &[s(), p(), n(policy), n(head)])?,
        // Exact membership: every live old head has its item at that revision, and no item names anything else.
        check(db, "SYNC_PLAN_MISMATCH", "EXISTS(SELECT 1 FROM sync_heads h WHERE h.space=? AND h.namespace=? AND h.deleted_at IS NULL AND h.purged_at IS NULL AND NOT EXISTS(SELECT 1 FROM sync_cutover_items i WHERE i.space=h.space AND i.plan_id=? AND i.key=h.key AND i.source_revision=h.revision)) OR EXISTS(SELECT 1 FROM sync_cutover_items i WHERE i.space=? AND i.plan_id=? AND NOT EXISTS(SELECT 1 FROM sync_heads h WHERE h.space=i.space AND h.namespace=? AND h.key=i.key AND h.revision=i.source_revision AND h.deleted_at IS NULL AND h.purged_at IS NULL))", &[s(), PUBLIC.into(), p(), s(), p(), PUBLIC.into()])?,
        check(db, "SYNC_BLOB_NOT_READY", concat!("EXISTS(SELECT 1 FROM sync_cutover_items i,json_each(i.attachments) ref WHERE i.space=? AND i.plan_id=? AND NOT ", usable!("e.space=i.space AND e.namespace=? AND e.key=i.key AND e.revision=i.source_revision"), ")"), &[s(), p(), PUBLIC.into(), s()])?,
        check(db, "SYNC_CUTOVER_SCOPE", "EXISTS(SELECT 1 FROM sync_events WHERE space=? AND namespace=?)", &[s(), stream.clone().into()])?,
        // The reservation is the frozen text plus the new attachments; ready blobs the account already pays for cost nothing more.
        check(db, "SYNC_QUOTA_EXCEEDED", &format!("COALESCE((SELECT used_bytes FROM sync_usage WHERE space=?),0)+(SELECT COALESCE(SUM(content_bytes),0) FROM sync_cutover_items WHERE space=? AND plan_id=?)+{ABSENT}>100000000"), &[s(), s(), p(), s(), p()])?,
        db.prepare(format!("INSERT INTO sync_cutovers(space,cutover_id,namespace,sealed_policy_revision,source_head,reserved_bytes,consent_revision,adopting,history_read,selected) SELECT ?,?,?,?,?,(SELECT COALESCE(SUM(content_bytes),0) FROM sync_cutover_items WHERE space=? AND plan_id=?)+{ABSENT},1,1,?,0"))
            .bind(&[s(), p(), stream.clone().into(), n(policy + 1), n(head), s(), p(), s(), p(), n(i64::from(history))])?,
        db.prepare("UPDATE sync_policy SET revision=?,json=?,namespaces=? WHERE space=? AND revision=?")
            .bind(&[n(policy + 1), stored.to_string().into(), serde_json::to_string(&namespaces)?.into(), s(), n(policy)])?,
        // Generations the sealed stream references stay protected until their last reference and their bytes are gone.
        db.prepare("INSERT OR IGNORE INTO sync_cutover_blobs SELECT DISTINCT b.space,b.digest,b.generation FROM sync_events e,json_each(e.attachments) ref JOIN sync_blobs b ON b.space=e.space AND b.digest=json_extract(ref.value,'$.digest') WHERE e.space=? AND e.namespace=?")
            .bind(&[s(), PUBLIC.into()])?,
    ]).await?;
    status(db, space).await
}

async fn sealed(db: &D1Database, space: &str, cutover: &str) -> ApiResult<Value> {
    let seal = seal(db, space)
        .await?
        .ok_or(Failure(409, "SYNC_CUTOVER_SCOPE"))?;
    require(seal["cutoverId"] == cutover, 409, "SYNC_CUTOVER_SCOPE")?;
    Ok(seal)
}
async fn receipt(db: &D1Database, space: &str, stream: &str, op: &str) -> ApiResult<Option<Value>> {
    Ok(db
        .prepare("SELECT fingerprint,revision FROM sync_receipts WHERE space=? AND namespace=? AND operation=?")
        .bind(&[space.into(), stream.into(), op.into()])?
        .first::<Value>(None)
        .await?)
}

async fn seed(req: &mut Request, db: &D1Database, space: &str) -> ApiResult<Value> {
    let value = body(req).await?;
    fields(
        &value,
        &[
            "cutoverId",
            "expectedPolicyRevision",
            "expectedConsentRevision",
            "key",
            "sourceRevision",
            "value",
            "attachments",
        ],
    )?;
    let cutover = id(&value, "cutoverId")?;
    let (policy, consent, source) = (
        integer(&value, "expectedPolicyRevision")?,
        integer(&value, "expectedConsentRevision")?,
        integer(&value, "sourceRevision")?,
    );
    let seal = sealed(db, space, &cutover).await?;
    let stream = seal["namespace"]
        .as_str()
        .ok_or(Failure(503, "INVALID_STORAGE"))?
        .to_owned();
    let item = frozen(&value).await?;
    let op = operation(&cutover, &item.key).await?;
    let replayed = |previous: Value| -> ApiResult<Value> {
        require(
            previous["fingerprint"] == item.fingerprint.as_str(),
            409,
            "IDEMPOTENCY_CONFLICT",
        )?;
        Ok(json!({"accepted":true,"revision":previous["revision"],"operationId":op}))
    };
    if let Some(previous) = receipt(db, space, &stream, &op).await? {
        return replayed(previous);
    }
    let s = || JsValue::from_str(space);
    let result = batch(db, vec![
        check(db, "SYNC_CONSENT_REQUIRED", "NOT EXISTS(SELECT 1 FROM sync_cutovers WHERE space=? AND cutover_id=? AND consent_revision=? AND adopting=1 AND completed_at IS NULL)", &[s(), cutover.clone().into(), n(consent)])?,
        check(db, "SYNC_SEED_MISMATCH", "NOT EXISTS(SELECT 1 FROM sync_cutover_items WHERE space=? AND plan_id=? AND key=? AND source_revision=?)", &[s(), cutover.clone().into(), item.key.clone().into(), n(source)])?,
        db.prepare("INSERT INTO sync_events(space,namespace,operation,key,base,value,attachments,policy_revision,fingerprint,action) VALUES (?,?,?,?,0,?,?,?,?,'write')")
            .bind(&[s(), stream.clone().into(), op.clone().into(), item.key.clone().into(), item.value.clone().into(), item.attachments.clone().into(), n(policy), item.fingerprint.clone().into()])?,
    ]).await;
    if let Err(failure) = result {
        // A concurrent retry may have committed the same seed after the first lookup.
        if let Some(previous) = receipt(db, space, &stream, &op).await? {
            return replayed(previous);
        }
        return Err(failure);
    }
    replayed(
        receipt(db, space, &stream, &op)
            .await?
            .ok_or(Failure(503, "SYNC_UNAVAILABLE"))?,
    )
}

/// The authorised read-back of what was actually seeded, beside the frozen plan, for the Host to compare before finish.
async fn seeds(req: &Request, db: &D1Database, space: &str) -> ApiResult<Value> {
    let value = query(req, &["cutoverId", "after"])?;
    let cutover = id(&value, "cutoverId")?;
    let seal = sealed(db, space, &cutover).await?;
    let stream = seal["namespace"]
        .as_str()
        .ok_or(Failure(503, "INVALID_STORAGE"))?
        .to_owned();
    let after = value["after"].as_str().unwrap_or("").to_owned();
    let rows = db
        .prepare("SELECT i.key,i.source_revision AS sourceRevision,i.operation AS operationId,i.fingerprint,e.revision,e.value,e.attachments FROM sync_cutover_items i JOIN sync_cutovers c ON c.space=i.space AND c.cutover_id=i.plan_id AND c.adopting=1 LEFT JOIN sync_events e ON e.space=i.space AND e.namespace=? AND e.operation=i.operation WHERE i.space=? AND i.plan_id=? AND i.key>? ORDER BY i.key LIMIT 21")
        .bind(&[stream.into(), space.into(), cutover.into(), after.into()])?
        .all()
        .await?
        .results::<Value>()?;
    require(
        !rows.is_empty() || seal["adopting"] == 1,
        403,
        "SYNC_CONSENT_REQUIRED",
    )?;
    let mut items = Vec::new();
    for row in rows.iter().take(20) {
        let mut item = json!({"key":row["key"],"sourceRevision":row["sourceRevision"],"operationId":row["operationId"],"fingerprint":row["fingerprint"],"seeded":!row["revision"].is_null()});
        if !row["revision"].is_null() {
            item["revision"] = row["revision"].clone();
            item["value"] = serde_json::from_str(
                row["value"]
                    .as_str()
                    .ok_or(Failure(503, "INVALID_STORAGE"))?,
            )?;
            item["attachments"] = serde_json::from_str(
                row["attachments"]
                    .as_str()
                    .ok_or(Failure(503, "INVALID_STORAGE"))?,
            )?;
        }
        items.push(item);
    }
    Ok(json!({"items":items,"more":rows.len()>20,"next":rows.get(19).map(|row|row["key"].clone())}))
}

async fn finish(req: &mut Request, db: &D1Database, space: &str) -> ApiResult<Value> {
    let value = body(req).await?;
    fields(
        &value,
        &[
            "cutoverId",
            "expectedPolicyRevision",
            "expectedConsentRevision",
        ],
    )?;
    let cutover = id(&value, "cutoverId")?;
    let (policy, consent) = (
        integer(&value, "expectedPolicyRevision")?,
        integer(&value, "expectedConsentRevision")?,
    );
    let seal = sealed(db, space, &cutover).await?;
    if !seal["completedAt"].is_null() {
        return status(db, space).await;
    }
    let stream = seal["namespace"]
        .as_str()
        .ok_or(Failure(503, "INVALID_STORAGE"))?
        .to_owned();
    let s = || JsValue::from_str(space);
    let c = || JsValue::from_str(&cutover);
    batch(db, vec![
        check(db, "SYNC_CONSENT_REQUIRED", "NOT EXISTS(SELECT 1 FROM sync_cutovers WHERE space=? AND cutover_id=? AND consent_revision=? AND adopting=1 AND completed_at IS NULL)", &[s(), c(), n(consent)])?,
        check(db, "SYNC_POLICY_CONFLICT", "NOT EXISTS(SELECT 1 FROM sync_policy WHERE space=? AND revision=?)", &[s(), n(policy)])?,
        // Every old live head is planned, and every planned item has its own seed receipt as the live head in the stream.
        check(db, "SYNC_PLAN_MISMATCH", "EXISTS(SELECT 1 FROM sync_heads h WHERE h.space=? AND h.namespace=? AND h.deleted_at IS NULL AND h.purged_at IS NULL AND NOT EXISTS(SELECT 1 FROM sync_cutover_items i WHERE i.space=h.space AND i.plan_id=? AND i.key=h.key AND i.source_revision=h.revision))", &[s(), PUBLIC.into(), c()])?,
        check(db, "SYNC_SEED_INCOMPLETE", "EXISTS(SELECT 1 FROM sync_cutover_items i WHERE i.space=? AND i.plan_id=? AND NOT EXISTS(SELECT 1 FROM sync_receipts r JOIN sync_heads h ON h.space=r.space AND h.namespace=r.namespace AND h.key=r.key AND h.revision=r.revision AND h.deleted_at IS NULL AND h.purged_at IS NULL JOIN sync_events e ON e.space=r.space AND e.namespace=r.namespace AND e.revision=r.revision AND e.value<>'null' WHERE r.space=i.space AND r.namespace=? AND r.operation=i.operation AND r.fingerprint=i.fingerprint AND r.key=i.key))", &[s(), c(), stream.clone().into()])?,
        check(db, "SYNC_BLOB_NOT_READY", "EXISTS(SELECT 1 FROM sync_cutover_items i,json_each(i.attachments) ref WHERE i.space=? AND i.plan_id=? AND NOT EXISTS(SELECT 1 FROM sync_blobs b WHERE b.space=i.space AND b.digest=json_extract(ref.value,'$.digest') AND b.ready=1 AND b.deleting=0))", &[s(), c()])?,
        db.prepare("UPDATE sync_cutovers SET completed_at=unixepoch()*1000,reserved_bytes=0,selected=1,completion_head=(SELECT COALESCE(MAX(r.revision),0) FROM sync_receipts r WHERE r.space=? AND r.namespace=? AND r.operation LIKE 'seed:%') WHERE space=? AND cutover_id=?")
            .bind(&[s(), stream.into(), s(), c()])?,
        db.prepare("DELETE FROM sync_cutover_plans WHERE space=? AND plan_id=?").bind(&[s(), c()])?,
    ]).await?;
    status(db, space).await
}

async fn consent(req: &mut Request, db: &D1Database, space: &str) -> ApiResult<Value> {
    let value = body(req).await?;
    fields(
        &value,
        &[
            "cutoverId",
            "consentRevision",
            "adoptProcessItems",
            "allowRetainedRead",
        ],
    )?;
    let cutover = id(&value, "cutoverId")?;
    let revision = integer(&value, "consentRevision")?;
    let adopt = value["adoptProcessItems"]
        .as_bool()
        .ok_or(Failure(400, "INVALID_FIELD"))?;
    let read = value["allowRetainedRead"]
        .as_bool()
        .ok_or(Failure(400, "INVALID_FIELD"))?;
    sealed(db, space, &cutover).await?;
    let changed = db
        .prepare("UPDATE sync_cutovers SET adopting=?,history_read=?,consent_revision=consent_revision+1 WHERE space=? AND cutover_id=? AND consent_revision=? RETURNING consent_revision")
        .bind(&[n(i64::from(adopt)), n(i64::from(read)), space.into(), cutover.into(), n(revision)])?
        .first::<Value>(None)
        .await?;
    require(changed.is_some(), 409, "SYNC_CONSENT_CONFLICT")?;
    status(db, space).await
}

const GRANT: &str = "EXISTS(SELECT 1 FROM sync_cutovers c WHERE c.space=? AND c.cutover_id=? AND c.consent_revision=? AND c.history_read=1)";

/// Retained old history under the live grant: a key's versions, or one exact version with its archive and restore facts.
async fn history(req: &Request, db: &D1Database, space: &str) -> ApiResult<Value> {
    let value = query(
        req,
        &["cutoverId", "consentRevision", "key", "revision", "before"],
    )?;
    let cutover = id(&value, "cutoverId")?;
    let consent = number(&value, "consentRevision")?.ok_or(Failure(400, "INVALID_NUMBER"))?;
    let key = string(&value, "key", 500)?.to_owned();
    sealed(db, space, &cutover).await?;
    let grant = || -> Vec<JsValue> { vec![space.into(), cutover.clone().into(), n(consent)] };
    if let Some(revision) = number(&value, "revision")? {
        let mut binds = grant();
        binds.extend([space.into(), PUBLIC.into(), key.into(), n(revision)]);
        let row = db
            .prepare(format!("SELECT revision,operation,key,base,value,attachments,action,source_revision AS sourceRevision,created_at AS createdAt FROM sync_events WHERE {GRANT} AND space=? AND namespace=? AND key=? AND revision=?"))
            .bind(&binds)?
            .first::<Value>(None)
            .await?;
        let row = match row {
            Some(row) => row,
            None => {
                return Err(denied(db, space, &cutover, consent)
                    .await?
                    .unwrap_or(Failure(404, "SYNC_RECOVERY_MISSING")));
            }
        };
        return Ok(
            json!({"event":crate::protocol::event(&row)?,"action":row["action"],"sourceRevision":row["sourceRevision"],"createdAt":row["createdAt"]}),
        );
    }
    let before = number(&value, "before")?
        .unwrap_or(i64::MAX)
        .min(9_007_199_254_740_991);
    let mut binds = grant();
    binds.extend([space.into(), PUBLIC.into(), key.into(), n(before)]);
    let rows = db
        .prepare(format!("SELECT revision,action,source_revision AS sourceRevision,created_at AS createdAt FROM sync_events WHERE {GRANT} AND space=? AND namespace=? AND key=? AND revision<? ORDER BY revision DESC LIMIT 21"))
        .bind(&binds)?
        .all()
        .await?
        .results::<Value>()?;
    if rows.is_empty()
        && let Some(failure) = denied(db, space, &cutover, consent).await?
    {
        return Err(failure);
    }
    Ok(
        json!({"items":rows.iter().take(20).collect::<Vec<_>>(),"more":rows.len()>20,"next":rows.get(19).map(|row|row["revision"].clone())}),
    )
}
async fn denied(
    db: &D1Database,
    space: &str,
    cutover: &str,
    consent: i64,
) -> ApiResult<Option<Failure>> {
    let row = db
        .prepare(format!("SELECT 1 AS granted WHERE {GRANT}"))
        .bind(&[space.into(), cutover.into(), n(consent)])?
        .first::<Value>(None)
        .await?;
    Ok(row
        .is_none()
        .then_some(Failure(403, "SYNC_CONSENT_REQUIRED")))
}

/// One part of an attachment the old stream still references, delivered only while the same grant and generation hold
/// on both sides of the R2 read.
async fn blob(req: &Request, env: &Env, db: &D1Database, space: &str) -> ApiResult<Response> {
    let value = query(req, &["cutoverId", "consentRevision", "digest", "part"])?;
    let cutover = id(&value, "cutoverId")?;
    let consent = number(&value, "consentRevision")?.ok_or(Failure(400, "INVALID_NUMBER"))?;
    let digest = crate::blobs::digest(&value)?.to_owned();
    let part = number(&value, "part")?.ok_or(Failure(400, "INVALID_PART"))?;
    sealed(db, space, &cutover).await?;
    let lookup = || async {
        db.prepare(format!("SELECT b.generation,p.checksum FROM sync_blobs b JOIN sync_blob_parts p ON p.space=b.space AND p.digest=b.digest AND p.generation=b.generation AND p.part=? WHERE {GRANT} AND b.space=? AND b.digest=? AND b.ready=1 AND b.deleting=0 AND EXISTS(SELECT 1 FROM sync_events e,json_each(e.attachments) a WHERE e.space=b.space AND e.namespace=? AND json_extract(a.value,'$.digest')=b.digest)"))
            .bind(&[n(part), space.into(), cutover.clone().into(), n(consent), space.into(), digest.clone().into(), PUBLIC.into()])?
            .first::<Value>(None)
            .await
            .map_err(Failure::from)
    };
    let row = match lookup().await? {
        Some(row) => row,
        None => {
            return Err(denied(db, space, &cutover, consent)
                .await?
                .unwrap_or(Failure(404, "SYNC_BLOB_MISSING")));
        }
    };
    let bytes = crate::blob_store::read(
        &env.bucket("FILES")?,
        space,
        &digest,
        string(&row, "generation", 32)?,
        part,
        string(&row, "checksum", 64)?,
    )
    .await?;
    // A revoke, re-grant or new generation during the R2 await drops the bytes.
    require(
        lookup().await?.is_some_and(|after| after == row),
        403,
        "SYNC_CONSENT_REQUIRED",
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

/// The size a digest has in the frozen plan; a digest the plan never named is not a seed upload.
async fn planned(db: &D1Database, space: &str, cutover: &str, digest: &str) -> ApiResult<i64> {
    db.prepare("SELECT json_extract(a.value,'$.size') AS size FROM sync_cutover_items i,json_each(i.attachments) a WHERE i.space=? AND i.plan_id=? AND json_extract(a.value,'$.digest')=? LIMIT 1")
        .bind(&[space.into(), cutover.into(), digest.into()])?
        .first::<Value>(None)
        .await?
        .ok_or(Failure(409, "SYNC_SEED_MISMATCH"))?["size"]
        .as_i64()
        .ok_or(Failure(503, "INVALID_STORAGE"))
}
/// New attachment bytes a conversion made, uploaded into the account's ordinary blob store while the seeding runs. Each call
/// needs the live adoption consent and a digest frozen in the plan; reserve also needs the planned size.
async fn seed_blobs(
    req: &mut Request,
    env: &Env,
    db: &D1Database,
    space: &str,
    path: &str,
) -> ApiResult<Response> {
    let bucket = env.bucket("FILES")?;
    if path.ends_with("/status") || path.ends_with("/chunk") {
        let input = json!({
            "cutoverId": crate::blobs::query(req, "cutoverId")?,
            "digest": crate::blobs::query(req, "digest")?,
        });
        let cutover = id(&input, "cutoverId")?;
        let digest = crate::blobs::digest(&input)?.to_owned();
        let consent = crate::blobs::query(req, "consentRevision")?
            .parse::<i64>()
            .map_err(|_| Failure(400, "INVALID_FIELD"))?;
        sealed(db, space, &cutover).await?;
        planned(db, space, &cutover, &digest).await?;
        let permit = crate::blobs::Permit::Seed {
            cutover: &cutover,
            consent,
        };
        if path.ends_with("/status") {
            require(req.method() == Method::Get, 405, "METHOD_NOT_ALLOWED")?;
            return Ok(Response::from_json(
                &crate::blobs::status(db, space, &digest, &permit).await?,
            )?);
        }
        let part = crate::blobs::query(req, "part")?
            .parse::<i64>()
            .map_err(|_| Failure(400, "INVALID_PART"))?;
        return crate::blobs::chunk(req, db, &bucket, space, &digest, part, &permit).await;
    }
    require(req.method() == Method::Post, 405, "METHOD_NOT_ALLOWED")?;
    let value = body(req).await?;
    let reserving = path.ends_with("/reserve");
    let mut allowed = vec!["cutoverId", "expectedConsentRevision", "digest"];
    if reserving {
        allowed.push("size");
    }
    fields(&value, &allowed)?;
    let cutover = id(&value, "cutoverId")?;
    let digest = crate::blobs::digest(&value)?.to_owned();
    let consent = integer(&value, "expectedConsentRevision")?;
    sealed(db, space, &cutover).await?;
    let size = planned(db, space, &cutover, &digest).await?;
    let permit = crate::blobs::Permit::Seed {
        cutover: &cutover,
        consent,
    };
    let result = match path {
        "/v1/process-items/cutover/seed-blobs/reserve" => {
            require(integer(&value, "size")? == size, 409, "SYNC_SEED_MISMATCH")?;
            crate::blobs::reserve(db, space, &digest, size, &permit).await?
        }
        "/v1/process-items/cutover/seed-blobs/complete" => {
            crate::blobs::complete(db, &bucket, space, &digest, &permit).await?
        }
        _ => return Err(Failure(404, "NOT_FOUND")),
    };
    Ok(Response::from_json(&result)?)
}

pub(crate) async fn handle(
    req: &mut Request,
    env: &Env,
    db: &D1Database,
    space: &str,
) -> ApiResult<Response> {
    let path = req.url()?.path().to_owned();
    let value = match (req.method(), path.as_str()) {
        (Method::Get, "/v1/process-items/cutover") => status(db, space).await,
        (Method::Get, "/v1/process-items/cutover/source") => source(req, db, space).await,
        (Method::Put, "/v1/process-items/cutover/plan/item") => plan_item(req, db, space).await,
        (Method::Post, "/v1/process-items/cutover/begin") => begin(req, db, space).await,
        (Method::Post, "/v1/process-items/cutover/seed") => seed(req, db, space).await,
        (Method::Get, "/v1/process-items/cutover/seeds") => seeds(req, db, space).await,
        (Method::Post, "/v1/process-items/cutover/finish") => finish(req, db, space).await,
        (Method::Post, "/v1/process-items/cutover/consent") => consent(req, db, space).await,
        (Method::Get, "/v1/process-items/cutover/history") => history(req, db, space).await,
        (Method::Get, "/v1/process-items/cutover/blob") => return blob(req, env, db, space).await,
        (_, route) if route.starts_with("/v1/process-items/cutover/seed-blobs/") => {
            return seed_blobs(req, env, db, space, route).await;
        }
        _ => Err(Failure(404, "NOT_FOUND")),
    }?;
    Ok(Response::from_json(&value)?)
}
