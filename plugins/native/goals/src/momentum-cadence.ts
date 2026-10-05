import type { GoalMomentumGoalInput, GoalMomentumCadence, GoalMomentumCadenceBucket } from "./momentum-model.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_RISK_STATES = new Set(["open", "triggered"]);
const PROGRESS_EVENT_PREFIXES = ["goal.work_event.", "goal.event_state.", "goal.event_config.", "contract_", "relation."];
const WORK_EVENT_PREFIX = "goal.work_event.";
export function time(value: string | null | undefined): number | null {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function utcDateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function windowStart(now: Date, days: 7 | 30): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days + 1);
}

function isProgressEvent(type: string): boolean {
  return PROGRESS_EVENT_PREFIXES.some((prefix) => type.startsWith(prefix));
}

export function goalActivityTimes(goal: GoalMomentumGoalInput): number[] {
  return [
    ...goal.events.filter((event) => isProgressEvent(event.type)).map((event) => time(event.at)),
  ].filter((value): value is number => value !== null);
}

/** Work on a Goal starts with its first recorded work event. */
function firstWorkStart(goal: GoalMomentumGoalInput): number | null {
  const starts = goal.events
    .filter((event) => event.type.startsWith(WORK_EVENT_PREFIX))
    .map((event) => time(event.at))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  return starts[0] ?? null;
}

export function firstSatisfiedAt(goal: GoalMomentumGoalInput): number | null {
  const events = goal.events
    .filter((event) => event.type === "goal.satisfied")
    .map((event) => time(event.at))
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  return events[0] ?? null;
}

export function firstBlockingAt(goal: GoalMomentumGoalInput): number | null {
  const activeBlockingRiskIds = new Set(
    goal.risks
      .filter((risk) => ACTIVE_RISK_STATES.has(risk.state) && risk.blocking_mode !== "none")
      .map((risk) => risk.risk_id),
  );
  if (goal.display_status !== "blocked") return null;
  const eventTimes = goal.events
    .filter((event) => ["risk.created", "risk.added", "risk.open", "risk.triggered"].includes(event.type))
    .map((event) => time(event.at))
    .filter((value): value is number => value !== null);
  const riskTimes = goal.risks
    .filter((risk) => activeBlockingRiskIds.has(risk.risk_id))
    .map((risk) => time(risk.created_at))
    .filter((value): value is number => value !== null);
  return [...eventTimes, ...riskTimes].sort((left, right) => left - right)[0] ?? null;
}

export function cadenceFor(
  goals: readonly GoalMomentumGoalInput[],
  now: Date,
  days: 7 | 30,
): GoalMomentumCadence {
  const start = windowStart(now, days);
  const end = now.getTime();
  const bucketMap = new Map<string, GoalMomentumCadenceBucket>();
  for (let index = 0; index < days; index += 1) {
    const date = utcDateKey(start + index * DAY_MS);
    bucketMap.set(date, { date, started: 0, completed: 0, blockers: 0 });
  }
  const within = (value: number | null): value is number => value !== null && value >= start && value <= end;
  let started = 0;
  let completed = 0;
  let newBlockers = 0;
  let stalled = 0;
  let historyIncomplete = 0;
  for (const goal of goals) {
    const startedAt = firstWorkStart(goal);
    if (within(startedAt)) {
      started += 1;
      const bucket = bucketMap.get(utcDateKey(startedAt));
      if (bucket) bucket.started += 1;
    }
    const satisfiedAt = firstSatisfiedAt(goal);
    if (within(satisfiedAt)) {
      completed += 1;
      const bucket = bucketMap.get(utcDateKey(satisfiedAt));
      if (bucket) bucket.completed += 1;
    }
    const blockingAt = firstBlockingAt(goal);
    if (within(blockingAt)) {
      newBlockers += 1;
      const bucket = bucketMap.get(utcDateKey(blockingAt));
      if (bucket) bucket.blockers += 1;
    }
    if (goal.completed) continue;
    const activity = goalActivityTimes(goal);
    const createdAt = time(goal.created_at);
    const historySufficient = activity.length > 0 || firstSatisfiedAt(goal) !== null || firstBlockingAt(goal) !== null;
    if (!historySufficient) historyIncomplete += 1;
    const freshness = blockingAt === null ? activity : [...activity, blockingAt];
    if (
      historySufficient &&
      createdAt !== null &&
      createdAt < start &&
      freshness.every((activityAt) => activityAt < start)
    ) stalled += 1;
  }
  return {
    days,
    started,
    completed,
    new_blockers: newBlockers,
    stalled,
    history_incomplete: historyIncomplete,
    buckets: [...bucketMap.values()],
  };
}
