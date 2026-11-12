/** Failures created by the common browser request helper; owner/server failures may carry other codes. */
export const UI_HOST_CLIENT_CODES = {
  crossOrigin: "ui_host.cross_origin", unreachable: "ui_host.unreachable", outcomeUnknown: "ui_host.outcome_unknown",
  invalidResponse: "ui_host.invalid_response", uncoded: "ui_host.uncoded",
} as const;
export type UiHostClientCode = typeof UI_HOST_CLIENT_CODES[keyof typeof UI_HOST_CLIENT_CODES];
