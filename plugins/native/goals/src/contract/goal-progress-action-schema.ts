import { text, count, boolean, object, progress } from "./goal-event-action-schemas.js";

export const goalProgressResultSchema = object({ event_id: text, observed_event_cursor: count, replayed: boolean, recorded: { const: true }, progress_summary: progress });
