import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { PersonalAssistantStore } from "./personal-assistant-store.js";
import { PersonalAssistantService } from "./personal-assistant-service.js";
import type { PersonalAssistantPorts } from "./personal-assistant-types.js";

export const PERSONAL_ASSISTANT_STORE_NAME = "personal-assistant";
export function openPersonalAssistant(options: { homeDirectory: string; projectId: string; actorId: string; ports: PersonalAssistantPorts }) {
  const db = openHomeSqliteDatabase(options.homeDirectory, PERSONAL_ASSISTANT_STORE_NAME);
  try {
    const store = new PersonalAssistantStore(db, options.projectId, options.actorId);
    return { service: new PersonalAssistantService(store, options.ports, options.projectId, options.actorId), close: () => db.close() };
  } catch (error) { db.close(); throw error; }
}
