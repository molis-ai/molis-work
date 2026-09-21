import { CONNECTOR_ICON_SVG, connectorIconSvg } from "./connector-icons.js";

export interface ConnectorIconSurface {
  readonly on: "light" | "dark";
  readonly pad: boolean;
}

const PAD = new Set(["huggingface", "clickup"]);

export function connectorIconSurface(connectorId: string): ConnectorIconSurface {
  return {
    on: "light",
    pad: PAD.has(connectorId),
  };
}

export function connectorMark(connectorId: string): { svg: string; on: "light" | "dark"; pad: boolean } | undefined {
  const svg = connectorIconSvg(connectorId);
  if (!svg) return undefined;
  return { svg, ...connectorIconSurface(connectorId) };
}

export const CONNECTOR_MARKS = CONNECTOR_ICON_SVG;
