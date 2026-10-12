export interface RecommendationState {
  visible: boolean;
  eligible: boolean;
  focused: boolean;
  hovered: boolean;
  composing: boolean;
}
export function createRecommendation(): RecommendationState {
  return { visible: true, eligible: true, focused: false, hovered: false, composing: false };
}
/** A stale action disables immediately, but retains its slot until interaction ends. */
export function syncRecommendation(state: RecommendationState): void {
  if (!state.focused && !state.hovered && !state.composing) state.visible = state.eligible;
}
export function setEligible(state: RecommendationState, eligible: boolean): void {
  state.eligible = eligible;
  syncRecommendation(state);
}
export function setInteraction(state: RecommendationState, kind: "focused" | "hovered" | "composing", value: boolean): void {
  state[kind] = value;
  syncRecommendation(state);
}
