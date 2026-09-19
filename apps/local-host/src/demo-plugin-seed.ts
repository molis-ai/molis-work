import { PROJECT_SCOPED_PLUGIN_IDS } from "@molis-ai/molis-work-app-workbench";
import type { FeedSourceRecord } from "@molis-ai/molis-work-plugin-feed";
import { openShelfStore } from "@molis-ai/molis-work-module-shelf";
import type { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import { DEMO_BOARD_ID } from "./demo-seed.js";
import { LocalProjectDatabase } from "./project-database.js";
import { GoalProjectApplication } from "./goal-project-application.js";
import { createLocalFeedApplication } from "./feed-application.js";
import { createLocalFeedSourceService } from "./feed-source-service.js";
import { openWorkSessionRegistry } from "./session-registry.js";

export const DEMO_GITHUB_SOURCE_ID = "demo-github";
export const DEMO_GMAIL_SOURCE_ID = "demo-gmail";
export const DEMO_CORE_ARTIFACT_ID = "demo/core-lifecycle-record";
export const DEMO_OUT_RULE_NAME = "捕捉首次协作文章";
export const DEMO_YOUTUBE_CHANNEL_ID = "UCmwDemoPublicChannel001";
export const DEMO_WEB_QUERY = "AI 工作台如何保存共同进度";

const DEMO_ACTOR = "demo-user";
const AT = {
  github: "2026-09-16T06:18:00.000Z",
  gmail: "2026-09-16T05:42:00.000Z",
  rss: "2026-09-16T04:25:00.000Z",
  youtube: "2026-09-15T12:00:00.000Z",
  query: "2026-09-15T10:00:00.000Z",
} as const;

/** Project-db facts for Feed, Inbox and Artifacts. Safe to call more than once. */
export function seedDemoPluginSurfaces(databasePath: string, boardId = DEMO_BOARD_ID): void {
  const store = new LocalProjectDatabase(databasePath);
  try {
    if (!store.goalsQuery.getBoard(boardId)) return;
    const feed = createLocalFeedApplication(store.db);
    const sources = createLocalFeedSourceService(store.db, boardId);
    const rss = sources.register({ kind: "rss", definition_id: "solidot" }).source;
    const youtube = sources.register({
      kind: "youtube_channel",
      channel_id: DEMO_YOUTUBE_CHANNEL_ID,
      name: "公开频道 · 工作台演示",
    }).source;
    const query = sources.register({
      kind: "web_query",
      query: DEMO_WEB_QUERY,
      name: "共同进度怎么被记住",
    }).source;
    const github = upsertConnectorSource(feed, {
      source_id: DEMO_GITHUB_SOURCE_ID,
      kind: "github",
      sync_kind: "github",
      name: "GitHub · molis-work",
      description: "示例通知。未连接账号，不会拉取真实仓库。",
      account_label: "demo-user",
      status: "disconnected",
      last_sync_at: AT.github,
      last_outcome: "completed",
      last_error_code: null,
    }, boardId);
    const gmail = upsertConnectorSource(feed, {
      source_id: DEMO_GMAIL_SOURCE_ID,
      kind: "gmail",
      sync_kind: "gmail",
      name: "Gmail · 产品反馈",
      description: "示例邮件。未授权，打开来源后需要真实连接。",
      account_label: "demo@molis.work",
      status: "disconnected",
      last_sync_at: AT.gmail,
      last_outcome: "failed",
      last_error_code: "auth_required",
      config: { scope: "in:inbox" },
    }, boardId);

    if (!feed.listOutRules(boardId).some((rule) => rule.name === DEMO_OUT_RULE_NAME)) {
      feed.createOutRule(boardId, {
        name: DEMO_OUT_RULE_NAME,
        match: { contains: "目标树", source_id: rss.source_id },
        enabled: true,
      });
    }

    const githubReview = ingestOnce(feed, github, {
      externalId: "demo-github-pr-418",
      kind: "github_notification",
      title: "PR #418 请确认完成依据是否写进事件记录",
      summary: "Review 要求核对：工作何时开始、提交了什么、为什么可以算完成。",
      body: "请对照 CORE 的约定：从开始到证据和复核要形成完整记录。这条通知需要人决定是否并入当前 Goal。",
      author: "octocat",
      url: "https://github.com/example/molis-work/pull/418",
      occurredAt: AT.github,
      tags: ["GitHub", "Review"],
      attention: { reason: "source_rule", detail: { source_id: DEMO_GITHUB_SOURCE_ID } },
    });
    ingestOnce(feed, github, {
      externalId: "demo-github-ci",
      kind: "github_notification",
      title: "CI：生命周期自动化检查已通过",
      summary: "与 CORE-C1 对应的检查已经变绿。",
      body: "这条通知只作记录，不需要立刻介入。",
      author: "github-actions",
      occurredAt: "2026-09-16T03:10:00.000Z",
      tags: ["GitHub", "CI"],
    });
    ingestOnce(feed, gmail, {
      externalId: "demo-gmail-landing",
      kind: "gmail_message",
      title: "第一次打开项目时，默认该先看目标还是先开会话？",
      summary: "合作方问首页落点。决定仍在 Goals 的 DECIDE，这里只保留邮件事实。",
      body: "如果两个入口同时强调，新用户会停在选择上。请产品给一个默认落点，另一个入口仍可从同一工作台到达。",
      author: "Mina <partner@example.com>",
      occurredAt: AT.gmail,
      tags: ["Gmail", "产品"],
    });
    const rssArticle = ingestOnce(feed, rss, {
      externalId: "https://example.com/posts/goal-tree-first-run",
      kind: "rss_entry",
      title: "第一次把模糊想法收成目标树",
      summary: "用户要能从列表看出下一步、阻塞和完成依据。",
      body: "长程任务最容易在换对话后丢失共同进度。先把模糊想法收成目标树，再决定谁做下一步。这篇文章和当前示例项目的主 Goal 直接相关。",
      author: "Solidot",
      url: "https://www.solidot.org/",
      occurredAt: AT.rss,
      tags: ["RSS", "产品设计"],
    });
    const youtubeItem = ingestOnce(feed, youtube, {
      externalId: "yt:demo-workbench-tour",
      kind: "youtube_video",
      title: "不切窗口推进 Goal 的工作台演示",
      summary: "目录、舞台和会话如何留在同一个窗口。",
      body: "演示里桌面端把 Goal 导航、当前工作和 Runtime 组合成连续工作面。本条是本地示例，不是当场拉取的频道更新。",
      author: "工作台演示",
      url: "https://www.youtube.com/watch?v=dQw4w9wg",
      occurredAt: AT.youtube,
      tags: ["YouTube"],
    });
    const queryItem = ingestOnce(feed, query, {
      externalId: "query:shared-progress-1",
      kind: "web_query_result",
      title: "不同 Runtime 怎样读同一份项目进度",
      summary: "查询「AI 工作台如何保存共同进度」的本地示例结果。",
      body: "如果每个入口各自记状态，换一次对话就要重新解释整个项目。共同底座应保存 Goal、关系、决定和完成依据。",
      occurredAt: AT.query,
      tags: ["网页查询"],
    });

    if (rssArticle.created) feed.addToInbox(boardId, rssArticle.item.item_id);
    if (youtubeItem.created) {
      const stored = feed.ensureInboxEntryForFeedItem(boardId, youtubeItem.item.item_id, "manual");
      feed.setInboxEntryStatus(boardId, stored.entry.entry_id, "dismissed", stored.entry.revision);
    }
    if (queryItem.created) {
      const stored = feed.ensureInboxEntryForFeedItem(boardId, queryItem.item.item_id, "manual");
      feed.setInboxEntryStatus(boardId, stored.entry.entry_id, "done", stored.entry.revision);
    }
    if (githubReview.created === false) {
      feed.ensureInboxEntryForFeedItem(boardId, githubReview.item.item_id, "source_rule", {
        source_id: DEMO_GITHUB_SOURCE_ID,
      });
    }
    feed.createInboxEntry({
      boardId,
      subjectType: "source_fault",
      subjectId: gmail.source_id,
      reason: "source_fault",
      detail: {
        error_code: "auth_required",
        user_action: "连接 Gmail 后重新同步。未授权前只保留这条故障引用。",
      },
    });

    const coordinator = new GoalProjectApplication(store);
    coordinator.artifacts.commands.registerVersion({
      board_id: boardId,
      actor_id: DEMO_ACTOR,
      artifact_id: DEMO_CORE_ARTIFACT_ID,
      version: 1,
      artifact_type_id: "io.molis.work.goal.delivery",
      schema_version: 1,
      producer: {
        plugin_id: "io.molis.work.native.goals",
        plugin_version: "0.0.0",
        binding_signature: "native:goals",
      },
      content: {
        kind: "inline",
        payload: {
          title: "生命周期记录已接通",
          result: "从约定、报告到收尾形成完整记录",
          goal_id: "CORE",
        },
      },
      metadata: { origin: "demo-seed", goal_id: "CORE" },
    });
    coordinator.artifacts.commands.registerVersion({
      board_id: boardId,
      actor_id: DEMO_ACTOR,
      artifact_id: DEMO_CORE_ARTIFACT_ID,
      version: 2,
      artifact_type_id: "io.molis.work.goal.delivery",
      schema_version: 1,
      producer: {
        plugin_id: "io.molis.work.native.goals",
        plugin_version: "0.0.0",
        binding_signature: "native:goals",
      },
      content: {
        kind: "inline",
        payload: {
          title: "可用的生命周期记录",
          result: "约定要求已有支持事实，演示收尾",
          goal_id: "CORE",
        },
      },
      metadata: { origin: "demo-seed", goal_id: "CORE" },
      supersedes_version: 1,
    });
  } finally {
    store.close();
  }
}

export function enableDemoProjectPlugins(
  projects: Pick<ProjectsModule, "commands" | "query">,
  projectId: string,
  actorId: string,
): void {
  for (const plugin_id of PROJECT_SCOPED_PLUGIN_IDS) {
    if (projects.query.listProjectPlugins(projectId).includes(plugin_id)) continue;
    projects.commands.addProjectPlugin({ project_id: projectId, plugin_id, actor_id: actorId });
  }
}

export async function seedDemoProjectExtras(input: {
  projectId: string;
  homeDirectory: string;
  actorId: string;
}): Promise<void> {
  openShelfStore(input.homeDirectory).seedSample();
  const registry = await openWorkSessionRegistry({ homeDirectory: input.homeDirectory });
  try {
    const existing = registry.list({ project_id: input.projectId })
      .filter((session) => session.metadata.regenerable_demo === true);
    for (const spec of DEMO_SESSIONS) {
      let session = existing.find((item) => item.metadata.seed_key === spec.seed_key);
      if (!session) {
        session = registry.createSession({
          runtime_id: spec.runtime_id,
          actor_id: input.actorId,
          user_confirmed: true,
          project_id: input.projectId,
          current_goal_id: spec.goal_id,
          title: spec.title,
          provenance: "molis_work_created",
          metadata: { regenerable_demo: true, seed_key: spec.seed_key },
        });
      }
      if (registry.eventCount(session.session_id) > 0) continue;
      registry.appendEvent({
        session_id: session.session_id,
        source: "molis_work_tui",
        kind: "terminal_output",
        source_id: `demo-seed:${spec.seed_key}:output:0`,
        source_order: 0,
        content: spec.content,
        metadata: { regenerable_demo: true, partial_terminal_history: true },
      });
    }
  } finally {
    registry.close();
  }
}

const DEMO_SESSIONS = [
  {
    seed_key: "core-lifecycle",
    runtime_id: "codex",
    goal_id: "CORE",
    title: "接通完成依据",
    content: [
      "$ molis-work goal show CORE",
      "工作从开始到证据和复核形成完整记录。",
      "下一步：明确收尾，把可用的生命周期记录交给当前用户确认。",
    ].join("\n"),
  },
  {
    seed_key: "desktop-workbench",
    runtime_id: "claude-code",
    goal_id: "DESKTOP",
    title: "工作台主栏对齐",
    content: [
      "目录、舞台和标签已经能在同一窗口里切换。",
      "核对分屏后 Goal 绑定仍保持。这条 Session 只保留 Molis Work 本地记录，没有原 Runtime 线程。",
    ].join("\n"),
  },
] as const;

function upsertConnectorSource(
  feed: ReturnType<typeof createLocalFeedApplication>,
  input: {
    source_id: string;
    kind: "github" | "gmail";
    sync_kind: "github" | "gmail";
    name: string;
    description: string;
    account_label: string;
    status: FeedSourceRecord["status"];
    last_sync_at: string;
    last_outcome: string | null;
    last_error_code: string | null;
    config?: Record<string, unknown>;
  },
  boardId: string,
): FeedSourceRecord {
  const existing = feed.snapshot(boardId).sources.find((source) => source.source_id === input.source_id);
  if (existing) return existing;
  return feed.upsertSource({
    board_id: boardId,
    source_id: input.source_id,
    kind: input.kind,
    definition_id: input.kind,
    sync_kind: input.sync_kind,
    name: input.name,
    description: input.description,
    status: input.status,
    enabled: false,
    item_count: 0,
    origin: "molis_work",
    config: input.config ?? {},
    schedule: { mode: "manual" },
    cursor: {},
    credential_ref: null,
    account_label: input.account_label,
    last_sync_at: input.last_sync_at,
    last_outcome: input.last_outcome,
    last_error_code: input.last_error_code,
    imported_at: input.last_sync_at,
    updated_at: input.last_sync_at,
  });
}

function ingestOnce(
  feed: ReturnType<typeof createLocalFeedApplication>,
  source: FeedSourceRecord,
  input: {
    externalId: string;
    kind: string;
    title: string;
    summary: string;
    body: string;
    occurredAt: string;
    tags: string[];
    author?: string;
    url?: string;
    attention?: { reason: "manual" | "source_rule"; detail?: Record<string, unknown> };
  },
): { item: { item_id: string }; created: boolean } {
  return feed.ingestItem({
    source,
    externalId: input.externalId,
    kind: input.kind,
    title: input.title,
    summary: input.summary,
    body: input.body,
    url: input.url,
    author: input.author ?? null,
    tags: input.tags,
    occurredAt: input.occurredAt,
    attention: input.attention ?? false,
  });
}
