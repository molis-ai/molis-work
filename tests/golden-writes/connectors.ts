import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** connectors/connectors.db: an authorization that was prepared. It is never executed, so nothing leaves the machine. */
export default async function ({ call, tag }: GoldenWriteContext) {
  const prepared = await call("connectors.setup.prepare", { service_id: field(await call("connectors.methods.read"), "connector_id"), method: "token", display_name: `金样连接 ${tag}`, expected_revision: null });
  readsBack(prepared, "authorization_id");
}
