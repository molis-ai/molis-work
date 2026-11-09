import assert from "node:assert/strict";
import { projectPluginRevision } from "@molis-ai/molis-work-test-kit/local-host-http";

/** For HTTP fixtures that assert the raw response status or body themselves. */
export function projectPluginRevisionAt(origin: string, projectId: string): Promise<string> {
  return projectPluginRevision({ async get<Answer>(path: string): Promise<Answer> {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json() as Promise<Answer>;
  } }, projectId);
}
