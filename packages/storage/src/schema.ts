/** Opaque search state; Storage does not interpret its contents. */
export const LOCAL_OPAQUE_BLOB_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS feed_runtime_blobs (
    namespace TEXT NOT NULL, key TEXT NOT NULL, opaque TEXT NOT NULL, cas_token TEXT NOT NULL,
    PRIMARY KEY (namespace, key)
  );
`;
