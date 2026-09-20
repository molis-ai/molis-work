import type { ScheduleJobRecord } from "@molis-ai/molis-work-contracts/services/scheduler";
import {
  type ScheduleUiModel,
  type ScheduleUiPrimitives,
  type ScheduleUiSurface,
} from "@molis-ai/molis-work-plugin-schedule";
import { icon } from "@molis-ai/molis-work-design-system";
import { renderScheduleContribution } from "./ui-composition.js";
import type { MolisWorkWebView } from "./page-view.js";

export function createWorkbenchScheduleProjectionRenderer(primitives: {
  L(text: string, values?: Record<string, string | number>): string;
  dateTimeLocale(): string;
}) {
  const { L, dateTimeLocale } = primitives;

  function buildScheduleNativePluginModel(view: MolisWorkWebView): ScheduleUiModel {
    return {
      route_prefix: view.route_prefix,
      jobs: view.schedule_jobs ?? [],
      primitives: scheduleUiPrimitives,
    };
  }

  function renderScheduleNativePluginSurface(view: MolisWorkWebView, surface: ScheduleUiSurface): string {
    return renderScheduleContribution(surface, buildScheduleNativePluginModel(view));
  }

  const scheduleUiPrimitives: ScheduleUiPrimitives = {
    escape: escapeHtml,
    icon,
    text: L,
    formatDate(value) {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return new Intl.DateTimeFormat(dateTimeLocale(), {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    },
  };

  return { buildScheduleNativePluginModel, renderScheduleNativePluginSurface };
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export type { ScheduleJobRecord };
