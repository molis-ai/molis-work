import { isAccountConnectorSyncKind } from "@molis-ai/molis-work-contracts/modules/sources";
import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import type { ConfigureFeedSourceScheduleInput, UpdateFeedSourceInput } from "./source-ports.js";
import type { SourceHistoryDecision } from "./projection.js";
import { requireParam, requireProvider, sourceRegistrationInput } from "./route-input.js";
import type { FeedPluginRouteHandler } from "./routes.js";
import type { FeedRouteHandlerPorts } from "./route-handler-ports.js";

export function createFeedSourceRouteHandlers(options: FeedRouteHandlerPorts): Record<string, FeedPluginRouteHandler> {
  const feed = () => options.feed();
  const sources = () => options.sources();
  const connectors = () => options.connectors();
  const changed = () => options.changed();
  return {
    "feed.sources.create": ({ request }) => {
      const input = sourceRegistrationInput(request.body);
      if (!input) return { status: 400, body: { error: "来源参数无效" } };
      const result = sources().register(input);
      changed();
      return { status: result.registered ? 201 : 200, body: result };
    },
    "feed.sources.update": ({ params, request }) => {
      const input: UpdateFeedSourceInput = {
        ...(typeof request.body.name === "string" ? { name: request.body.name } : {}),
        ...(typeof request.body.description === "string" ? { description: request.body.description } : {}),
        ...(typeof request.body.scope === "string" ? { scope: request.body.scope } : {}),
        ...(typeof request.body.feed_url === "string" ? { feed_url: request.body.feed_url } : {}),
      };
      const source = sources().update(requireParam(params.source_id, "Feed 来源不存在"), input);
      changed();
      return { status: 200, body: { source } };
    },
    "feed.sources.delete": ({ params, request }) => {
      const sourceId = requireParam(params.source_id, "Feed 来源不存在");
      const historyDecision = request.body.history_decision as SourceHistoryDecision;
      if (historyDecision !== "retain_history" && historyDecision !== "delete_local_history") {
        return { status: 400, body: { error: "删除来源前必须选择保留或删除本地历史" } };
      }
      const deleted = sources().delete(sourceId, historyDecision);
      changed();
      return { status: 200, body: { source: deleted, history_decision: historyDecision } };
    },
    "feed.sources.schedule": ({ params, request }) => {
      const input: ConfigureFeedSourceScheduleInput | null = request.body.mode === "manual"
        ? { mode: "manual" }
        : request.body.mode === "interval"
            && typeof request.body.enabled === "boolean"
            && Number.isInteger(request.body.interval_minutes)
          ? {
              mode: "interval",
              enabled: request.body.enabled,
              interval_minutes: Number(request.body.interval_minutes),
            }
          : null;
      if (!input) return { status: 400, body: { error: "拉取计划参数无效" } };
      const source = sources().configureSchedule(requireParam(params.source_id, "Feed 来源不存在"), input);
      changed();
      return { status: 200, body: { source } };
    },
    "feed.sources.action": async ({ params, request }) => {
      const sourceId = requireParam(params.source_id, "Feed 来源不存在");
      const action = requireParam(params.action, "来源动作不存在");
      const current = feed().getSource(options.boardId, sourceId);
      if (action === "pause" || action === "resume") {
        const source = sources().setEnabled(sourceId, action === "resume");
        changed();
        return { status: 200, body: { source } };
      }
      if (action === "disconnect") {
        if (!isAccountConnectorSyncKind(current.sync_kind)) {
          throw new FeedDomainError("公开来源不需要断开账号；可以暂停或删除", "feed_source_invalid_state");
        }
        const source = sources().disconnect(sourceId);
        changed();
        return { status: 200, body: { source } };
      }
      const idempotencyKey = typeof request.body.idempotency_key === "string"
        ? request.body.idempotency_key
        : "";
      const result = current.sync_kind === "public_source"
        ? await sources().sync(sourceId, { idempotencyKey, signal: AbortSignal.timeout(current.kind === "research_library" ? 180_000 : 45_000) })
        : isAccountConnectorSyncKind(current.sync_kind)
          ? await connectors().sync(sourceId, {
              idempotencyKey,
              mode: request.body.mode === "rebuild_cursor" ? "rebuild_cursor" : "normal",
            })
          : (() => { throw new FeedDomainError("这个来源没有同步能力", "feed_source_not_syncable"); })();
      changed();
      return { status: 200, body: result };
    },
    "feed.connector.token.set": ({ params, request }) => {
      const status = connectors().bindToken(
        requireProvider(params.provider),
        typeof request.body.token === "string" ? request.body.token : "",
      );
      changed();
      return { status: 200, body: { connector_auth: status } };
    },
    "feed.connector.token.delete": ({ params }) => {
      const status = connectors().unbind(requireProvider(params.provider));
      changed();
      return { status: 200, body: { connector_auth: status } };
    },
    "feed.connector.github.client": ({ request }) => ({
      status: 200,
      body: {
        connector_auth: connectors().configureGithubClient(
          typeof request.body.client_id === "string" ? request.body.client_id : "",
        ),
      },
    }),
    "feed.connector.github.device.start": async ({ request }) => ({
      status: 200,
      body: await connectors().startGithubDevice(
        typeof request.body.client_id === "string" ? request.body.client_id : undefined,
      ),
    }),
    "feed.connector.github.device.poll": async ({ request }) => {
      const result = await connectors().pollGithubDevice(
        typeof request.body.device_code === "string" ? request.body.device_code : "",
        typeof request.body.client_id === "string" ? request.body.client_id : undefined,
      );
      changed();
      return { status: 200, body: result };
    },
    "feed.connector.gmail.client": ({ request }) => ({
      status: 200,
      body: {
        connector_auth: connectors().configureGmailClient(
          typeof request.body.client_id === "string" ? request.body.client_id : "",
          typeof request.body.client_secret === "string" ? request.body.client_secret : undefined,
        ),
      },
    }),
    "feed.connector.gmail.oauth.start": async ({ request }) => ({
      status: 200,
      body: await connectors().startGmailOAuth({
        clientId: typeof request.body.client_id === "string" ? request.body.client_id : undefined,
        clientSecret: typeof request.body.client_secret === "string" ? request.body.client_secret : undefined,
        redirectUri: typeof request.body.redirect_uri === "string" ? request.body.redirect_uri : undefined,
      }),
    }),
    "feed.connector.gmail.oauth.callback": async ({ request }) => {
      await connectors().completeGmailOAuth({
        code: request.query.get("code") ?? "",
        state: request.query.get("state") ?? undefined,
      });
      changed();
      return { status: 302, redirect: "/settings/connectors?connected=gmail" };
    },
  };
}
