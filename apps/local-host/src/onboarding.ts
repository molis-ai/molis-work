import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveConfiguredHome } from "./product-home.js";

export const ONBOARDING_STATE_RELATIVE_PATH = path.join("config", "onboarding.json");

export type FirstRunJourneyState = "pending" | "completed" | "dismissed";

export interface MolisWorkOnboardingState {
  schema_version: 1;
  first_run: FirstRunJourneyState;
  completed_project_id: string | null;
  last_presented_step: number;
  last_seen_app_version: string | null;
  started_at: string | null;
  dismissed_at: string | null;
  completed_at: string | null;
  updated_at: string | null;
}

export interface MolisWorkOnboardingStatus {
  state: MolisWorkOnboardingState;
  current_version: string | null;
  first_run_required: boolean;
  update_required: boolean;
}

const DEFAULT_ONBOARDING_STATE: MolisWorkOnboardingState = Object.freeze({
  schema_version: 1,
  first_run: "pending",
  completed_project_id: null,
  last_presented_step: 0,
  last_seen_app_version: null,
  started_at: null,
  dismissed_at: null,
  completed_at: null,
  updated_at: null,
});

function molisWorkHome(homeDirectory?: string): string {
  return path.resolve(homeDirectory ?? resolveConfiguredHome());
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validFirstRun(value: unknown): FirstRunJourneyState {
  return value === "completed" || value === "dismissed" ? value : "pending";
}

function normalizeState(value: unknown): MolisWorkOnboardingState {
  if (!value || typeof value !== "object") return { ...DEFAULT_ONBOARDING_STATE };
  const record = value as Record<string, unknown>;
  const rawStep = Number(record.last_presented_step ?? 0);
  return {
    schema_version: 1,
    first_run: validFirstRun(record.first_run),
    completed_project_id: optionalString(record.completed_project_id),
    last_presented_step: Number.isInteger(rawStep) && rawStep >= 0 && rawStep <= 8 ? rawStep : 0,
    last_seen_app_version: optionalString(record.last_seen_app_version),
    started_at: optionalString(record.started_at),
    dismissed_at: optionalString(record.dismissed_at),
    completed_at: optionalString(record.completed_at),
    updated_at: optionalString(record.updated_at),
  };
}

export function readMolisWorkOnboardingState(homeDirectory?: string): MolisWorkOnboardingState {
  const statePath = path.join(molisWorkHome(homeDirectory), ONBOARDING_STATE_RELATIVE_PATH);
  try {
    return normalizeState(JSON.parse(readFileSync(statePath, "utf8")));
  } catch {
    return { ...DEFAULT_ONBOARDING_STATE };
  }
}

export function readInstalledMolisWorkVersion(homeDirectory?: string): string | null {
  const manifestPath = path.join(molisWorkHome(homeDirectory), "config", "installation.json");
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    return optionalString(manifest.version);
  } catch {
    return null;
  }
}

export function writeMolisWorkOnboardingState(
  homeDirectory: string | undefined,
  state: MolisWorkOnboardingState,
): MolisWorkOnboardingState {
  const home = molisWorkHome(homeDirectory);
  const configDirectory = path.join(home, "config");
  const statePath = path.join(home, ONBOARDING_STATE_RELATIVE_PATH);
  const tempPath = path.join(configDirectory, `.onboarding-${process.pid}-${randomUUID()}.tmp`);
  const normalized = normalizeState(state);
  mkdirSync(configDirectory, { recursive: true });
  writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(tempPath, statePath);
  return normalized;
}

export function molisWorkOnboardingStatus(
  homeDirectory: string | undefined,
  projectCount: number,
): MolisWorkOnboardingStatus {
  const state = readMolisWorkOnboardingState(homeDirectory);
  const currentVersion = readInstalledMolisWorkVersion(homeDirectory);
  return {
    state,
    current_version: currentVersion,
    first_run_required: projectCount === 0 && state.first_run === "pending",
    update_required: projectCount > 0
      && currentVersion !== null
      && currentVersion !== state.last_seen_app_version,
  };
}

export function markMolisWorkOnboardingStarted(
  homeDirectory: string | undefined,
  lastPresentedStep = 0,
  now = new Date(),
): MolisWorkOnboardingState {
  const current = readMolisWorkOnboardingState(homeDirectory);
  const at = now.toISOString();
  return writeMolisWorkOnboardingState(homeDirectory, {
    ...current,
    last_presented_step: lastPresentedStep,
    started_at: current.started_at ?? at,
    updated_at: at,
  });
}

export function completeMolisWorkOnboarding(
  homeDirectory: string | undefined,
  projectId: string,
  now = new Date(),
): MolisWorkOnboardingState {
  const current = readMolisWorkOnboardingState(homeDirectory);
  const at = now.toISOString();
  return writeMolisWorkOnboardingState(homeDirectory, {
    ...current,
    first_run: "completed",
    completed_project_id: projectId.trim() || null,
    last_presented_step: 5,
    last_seen_app_version: readInstalledMolisWorkVersion(homeDirectory) ?? current.last_seen_app_version,
    started_at: current.started_at ?? at,
    dismissed_at: null,
    completed_at: at,
    updated_at: at,
  });
}

export function dismissMolisWorkOnboarding(
  homeDirectory: string | undefined,
  kind: "first_run" | "update",
  now = new Date(),
): MolisWorkOnboardingState {
  const current = readMolisWorkOnboardingState(homeDirectory);
  const at = now.toISOString();
  return writeMolisWorkOnboardingState(homeDirectory, {
    ...current,
    first_run: kind === "first_run" ? "dismissed" : current.first_run,
    last_seen_app_version: readInstalledMolisWorkVersion(homeDirectory) ?? current.last_seen_app_version,
    started_at: current.started_at ?? at,
    dismissed_at: kind === "first_run" ? at : current.dismissed_at,
    updated_at: at,
  });
}
