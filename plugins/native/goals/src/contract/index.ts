// Goals' public contract (`@molis-ai/molis-work-plugin-goals/contract`, PG-111): its Goals, events, decisions, tree proposals and action
// descriptors. Nothing else in the platform declares them; a caller that needs one field of a Goal declares that field itself and calls the action by id.
export * from "./goals.js";
export * from "./goal-actions.js";
export * from "./governance-collaboration.js";
