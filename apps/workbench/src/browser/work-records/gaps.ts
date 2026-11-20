import {
  alertHtml,
  btnHtml,
  collapsibleHtml,
  esc,
  fmtDate,
  fmtNum,
  iconBtnHtml,
  itemHtml,
  kindById,
  markHtml,
  readText,
  selectHtml,
  settingHtml,
  settingsHtml,
  statusHtml,
  type KindMeta,
  type WorkRecordsState,
} from "./common.js";

function ownerLabel(owner: string | undefined): string {
  if (!owner) return readText("workbench.catalog-work-records.gap-all-sources");
  if (owner === "shell") return readText("workbench.settings-work-records.src-workbench");
  if (owner === "service:gateway") return readText("workbench.settings-work-records.src-gateway");
  if (owner === "service:agent") return readText("workbench.settings-work-records.src-agent");
  if (owner === "service:assistant") return readText("workbench.settings-work-records.src-assistant");
  if (owner === "service:scheduler") return readText("workbench.settings-work-records.src-scheduler");
  if (owner === "service:grants") return readText("workbench.settings-work-records.src-grants");
  if (owner === "service:connections") return readText("workbench.settings-work-records.src-connections");
  if (owner === "observation") return readText("workbench.settings-work-records.title");
  if (owner.startsWith("plugin:")) return owner.slice(7).replace(/^io\.molis\.work\.(?:native\.)?/, "");
  return owner;
}

function reasonCause(reason: string | null | undefined, count: number): string {
  if (reason === "recording_paused") return readText("workbench.settings-work-records.cause-paused");
  if (reason === "manual_cleanup") return readText("workbench.settings-work-records.cause-manual-cleanup");
  if (reason === "retention_expired") return readText("workbench.settings-work-records.cause-auto-cleanup");
  if (reason === "write_failed" || reason === "store_unavailable") return readText("workbench.settings-work-records.cause-storage-failed", { count: fmtNum(count || 1) });
  if (reason === "queue_full") return readText("workbench.settings-work-records.cause-queue-full", { count: fmtNum(count || 1) });
  if (reason === "plugin_data_cleared") return readText("workbench.settings-work-records.cause-plugin-cleared");
  if (reason === "report_quota") return readText("workbench.settings-work-records.cause-report-quota", { count: fmtNum(count || 1) });
  if (reason === "evidence_key") return readText("workbench.settings-work-records.cause-evidence-key", { count: fmtNum(count || 1) });
  if (reason === "unknown_exit") return readText("workbench.settings-work-records.cause-unknown-exit");
  if (reason === "exit_failed" || reason === "record_failed") return readText("workbench.settings-work-records.cause-record-failed", { count: fmtNum(count || 1) });
  if (reason === "fact_not_owned") return readText("workbench.settings-work-records.cause-fact-not-owned", { count: fmtNum(count || 1) });
  if (reason === "not_connected") return readText("workbench.settings-work-records.cause-not-connected");
  if (reason === "image_resources_not_kept") return readText("workbench.settings-work-records.cause-image-refs");
  if (reason === "child_stream_not_followed") return readText("workbench.settings-work-records.cause-subagent-stream");
  if (reason === "sandbox_callbacks_outside_scope") return readText("workbench.settings-work-records.cause-sandbox-scope");
  if (reason === "isolated_page_scroll_not_seen") return readText("workbench.settings-work-records.cause-plugin-scroll");
  if (reason === "page_read_result_digest_only") return readText("workbench.settings-work-records.cause-page-digest");
  if (reason === "no_home_no_records") return readText("workbench.settings-work-records.cause-no-home");
  if (reason === "no_desktop_work_entry") return readText("workbench.settings-work-records.cause-desktop-ipc");
  if (reason === "unsent_draft_not_kept") return readText("workbench.settings-work-records.cause-unsent-draft");
  if (reason === "reads_coalesced_per_minute") return readText("workbench.settings-work-records.cause-reads-coalesced");
  if (reason === "kept_by_action_exit") return readText("workbench.settings-work-records.cause-action-exit");
  if (reason === "runtime_reports_loop_turns_only") return readText("workbench.settings-work-records.cause-compaction");
  if (reason === "owner_keeps_history") return readText("workbench.settings-work-records.cause-owner-history");
  if (reason === "dwell_summed_per_minute") return readText("workbench.settings-work-records.cause-dwell-minute");
  if (reason === "large_action_result_size_only") return readText("workbench.settings-work-records.cause-large-step");
  if (reason === "report_channel_itself") return readText("workbench.settings-work-records.cause-report-self");
  if (reason === "truncated") return readText("workbench.settings-work-records.cause-truncated", { count: fmtNum(count || 1) });
  if (reason === "redacted") return readText("workbench.settings-work-records.cause-redacted", { count: fmtNum(count || 1) });
  return readText("workbench.settings-work-records.cause-generic");
}

function stateEffect(state: string): string {
  if (state === "lost") return readText("workbench.settings-work-records.effect-lost");
  if (state === "expired") return readText("workbench.settings-work-records.effect-expired");
  if (state === "purged") return readText("workbench.settings-work-records.effect-purged");
  if (state === "truncated") return readText("workbench.settings-work-records.effect-truncated");
  if (state === "redacted") return readText("workbench.settings-work-records.effect-redacted");
  if (state === "not_connected") return readText("workbench.settings-work-records.effect-not-connected");
  if (state === "by_rule") return readText("workbench.settings-work-records.effect-by-rule");
  return readText("workbench.settings-work-records.effect-unavailable");
}

function stateBadge(state: string): string {
  if (state === "complete") return statusHtml(readText("workbench.settings-work-records.st-complete"), "done");
  if (state === "not_connected") return statusHtml(readText("workbench.settings-work-records.st-not-connected"), "idle");
  if (state === "not_applicable") return statusHtml(readText("workbench.settings-work-records.st-na"), "quiet");
  if (state === "by_rule") return statusHtml(readText("workbench.settings-work-records.st-by-rule"), "quiet");
  if (state === "lost") return statusHtml(readText("workbench.catalog-work-records.status-lost"), "blocked");
  if (state === "truncated") return statusHtml(readText("workbench.catalog-work-records.status-truncated"), "attention");
  if (state === "redacted") return statusHtml(readText("workbench.settings-work-records.st-redacted"), "hold");
  if (state === "expired") return statusHtml(readText("workbench.catalog-work-records.status-cleared"), "hold");
  if (state === "purged") return statusHtml(readText("workbench.settings-work-records.st-purged"), "hold");
  return statusHtml(readText("workbench.settings-work-records.st-unavailable"), "attention");
}

interface GapRowItem {
  readonly key: string;
  readonly k: KindMeta | undefined;
  readonly title: string;
  readonly meta: string;
  readonly state: string;
  readonly effect: string;
  readonly spaceJump?: boolean;
}

export function renderGapsTab(S: WorkRecordsState): string {
  const cov = S.coverage!;
  const entries = cov.entries;
  const gaps = cov.gaps;

  const attnRows: GapRowItem[] = [];
  gaps.forEach((g, idx) => {
    const k = g.fact === "*" ? undefined : kindById(g.kind);
    const span = g.started_at && g.ended_at && g.started_at !== g.ended_at
      ? `${fmtDate(g.started_at, "month-day")} – ${fmtDate(g.ended_at, "month-day")}`
      : fmtDate(g.ended_at || g.started_at, "month-day");
    attnRows.push({
      key: `gap-${g.gap_id ?? idx}`,
      k,
      title: ownerLabel(g.owner) + (k ? ` · ${k.name}` : ""),
      meta: (span ? `${span} · ` : "") + reasonCause(g.reason, g.count),
      state: g.state,
      effect: stateEffect(g.state),
      spaceJump: g.state === "lost",
    });
  });

  entries.filter((e) => e.state === "unavailable" || e.truncated > 0 || e.redacted > 0).forEach((e, idx) => {
    const k = kindById(e.kind);
    const st = e.state === "unavailable" ? "unavailable" : e.truncated > 0 ? "truncated" : "redacted";
    const cnt = e.truncated || e.redacted || 0;
    const rsn = e.state === "unavailable" ? e.reason : st;
    attnRows.push({
      key: `ent-attn-${idx}-${e.fact}`,
      k,
      title: ownerLabel(e.owner) + (k ? ` · ${k.name}` : ""),
      meta: reasonCause(rsn, cnt),
      state: st,
      effect: stateEffect(st),
    });
  });

  const notConnRows: GapRowItem[] = entries.filter((e) => e.state === "not_connected").map((e, idx) => {
    const k = kindById(e.kind);
    return {
      key: `ent-nc-${idx}-${e.fact}`,
      k,
      title: ownerLabel(e.owner) + (k ? ` · ${k.name}` : ""),
      meta: reasonCause(e.reason || "not_connected", 0),
      state: "not_connected",
      effect: stateEffect("not_connected"),
    };
  });

  const hasExpiredOnly = gaps.some((g) => g.state === "expired")
    && !gaps.some((g) => g.state === "lost" || g.state === "unavailable" || g.state === "purged")
    && !entries.some((e) => e.state === "unavailable" || e.truncated > 0 || e.redacted > 0);
  const sinceWord = cov.recording.complete_since ? fmtDate(cov.recording.complete_since, "month-day") : "";
  const headSub = sinceWord
    ? readText("workbench.settings-work-records.cov-sub-since", { since: sinceWord, count: fmtNum(notConnRows.length) })
    : readText("workbench.settings-work-records.cov-sub-plain", { count: fmtNum(notConnRows.length) });

  const head = hasExpiredOnly
    ? alertHtml("info", esc(readText("workbench.settings-work-records.cov-cleared-title")), esc(headSub))
    : attnRows.length > 0
      ? alertHtml("warning", esc(readText("workbench.settings-work-records.cov-attn-title", { count: fmtNum(attnRows.length) })), esc(headSub))
      : settingsHtml(settingHtml("wr-cov", readText("workbench.settings-work-records.cov-ok-title"), headSub, statusHtml(readText("workbench.settings-work-records.st-complete"), "done")));

  const filters: readonly [string, string][] = [
    ["all", readText("workbench.settings-work-records.filter-all")],
    ["entry", readText("workbench.settings-work-records.filter-entry")],
    ["plugin", readText("workbench.settings-work-records.filter-plugin")],
    ["flow", readText("workbench.settings-work-records.filter-flow")],
  ];
  const verOpts: readonly [string, string][] = [["all", readText("workbench.settings-work-records.ver-all")], ...cov.versions.map((v): [string, string] => [v, v])];
  const filterBar = `<div class="wr-filter"><div class="mw-toggle-group" data-slot="toggle-group" role="group" aria-label="${esc(readText("workbench.settings-work-records.filter-label"))}">${filters.map(([id, n]) => `<button type="button" class="mw-toggle${S.scopeFilter === id ? " is-current" : ""}" aria-pressed="${S.scopeFilter === id}" data-wr-filter="${id}">${esc(n)}</button>`).join("")}</div>${selectHtml(`data-wr-ver aria-label="${esc(readText("workbench.settings-work-records.ver-label"))}"`, verOpts, S.versionFilter)}</div>`;

  const renderGapItem = (row: GapRowItem) => {
    const open = !!S.open[row.key];
    const mark = row.k ? markHtml(row.k.icon, row.k.hue) : markHtml("database");
    const jump = row.spaceJump ? `<div class="mw-ix-actions">${btnHtml(readText("workbench.settings-work-records.see-space"), { attrs: { "data-wr-goto": "space" } })}</div>` : "";
    const more = open ? `<div><b>${esc(readText("workbench.settings-work-records.label-effect"))}</b>${esc(row.effect)}</div>${jump}` : "";
    return itemHtml(
      mark,
      row.title,
      row.meta,
      stateBadge(row.state) + iconBtnHtml(open ? readText("workbench.settings-work-records.collapse") : readText("workbench.settings-work-records.expand"), open ? "chevron-down" : "chevron-right", { "aria-expanded": open, "data-wr-open": row.key }),
      more,
    );
  };

  const okEntries = entries.filter((e) => e.state === "complete");
  const okByOwner = new Map<string, Set<string>>();
  for (const e of okEntries) {
    const label = ownerLabel(e.owner);
    let set = okByOwner.get(label);
    if (!set) okByOwner.set(label, set = new Set());
    const k = kindById(e.kind);
    if (k) set.add(k.name);
  }
  const okBody = okByOwner.size
    ? `<ul class="mw-items">${[...okByOwner.entries()].map(([owner, kset]) => itemHtml(markHtml("check"), owner, [...kset].join(readText("common.list.separator")), "")).join("")}</ul>`
    : `<p class="wr-sub">${esc(readText("workbench.settings-work-records.empty-group"))}</p>`;

  const naEntries = entries.filter((e) => e.state === "not_applicable" || e.state === "by_rule");
  const naList = naEntries.length
    ? `<ul class="mw-items">${naEntries.map((e) => itemHtml(markHtml("minus"), ownerLabel(e.owner), reasonCause(e.reason, e.by_rule), stateBadge(e.state))).join("")}</ul>`
    : "";
  const naBody = `<p class="wr-sub">${esc(readText("workbench.settings-work-records.na-note"))}</p>${naList}`;

  return `${head}${filterBar}${attnRows.length ? `<section><h2>${esc(readText("workbench.settings-work-records.attn-heading"))}</h2><ul class="mw-items">${attnRows.map(renderGapItem).join("")}</ul></section>` : ""}${notConnRows.length ? `<section><h2>${esc(readText("workbench.settings-work-records.not-conn-heading"))}</h2><ul class="mw-items">${notConnRows.map(renderGapItem).join("")}</ul></section>` : ""}<section>${collapsibleHtml(readText("workbench.settings-work-records.ok-fold", { count: fmtNum(okEntries.length) }), okBody, !!S.open.okList, "okList")}${collapsibleHtml(readText("workbench.settings-work-records.na-fold", { count: fmtNum(naEntries.length) }), naBody, !!S.open.naList, "naList")}</section>`;
}
