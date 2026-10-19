import { codingDraft, type CodingDraft, type DraftPorts } from "./draft.js";

/**
 * The bundle's entry. It runs inside the factory `(ports, draft) => { … return draft }` that the build wraps around it
 * (package.json's banner and footer), so `ports` is the factory's own. The caller passes only the ports; `draft` is the
 * factory's slot for what it hands back, filled here.
 */
declare const ports: DraftPorts;
declare let draft: CodingDraft;
draft = codingDraft(ports);
