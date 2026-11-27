import { join } from "node:path";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { imagesActions, IMAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-images";

// The person saves an image service in Settings before any MCP client runs (batch 108, UPP-15): the services are the person's
// (`person_settings`), which an MCP client may use but not write. Prints the saved service as JSON on stdout.
const [home, projectId, baseUrl] = process.argv.slice(2);
if (!home || !projectId || !baseUrl) throw new Error("Missing fixture identity");
const host = new MolisWorkLocalHost({ homeDirectory: home });
try {
  const ref = molisWorkHostProjectReference({ databasePath: join(home, `${projectId}.sqlite`), projectId });
  const person = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, audience: "user" as const, permissions: IMAGES_ACTION_PERMISSIONS };
  const { connection } = await host.actionClient(ref).invoke(person, imagesActions.saveConnection,
    { name: "MCP provider", api_format: "openai-images", base_url: baseUrl, model: "fixture-image" }) as { connection: { id: string } };
  process.stdout.write(JSON.stringify(connection));
} finally { await host.close(); }
