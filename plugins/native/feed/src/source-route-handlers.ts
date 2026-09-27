import type { SourceHistoryDecision } from "./projection.js";
import { requireParam, requireProvider } from "./route-input.js";
import type { FeedPluginRouteHandler } from "./routes.js";
import type { FeedRouteHandlerPorts } from "./route-handler-ports.js";
import { feedSourceActions, type FeedSourceRegistration } from "./source-actions.js";

export function createFeedSourceRouteHandlers(options: FeedRouteHandlerPorts): Record<string, FeedPluginRouteHandler> {
  const connectors = () => options.connectors();
  const changed = () => options.changed();
  return {
    // Source routes translate the old URLs; every caller manages sources through the same registered Feed actions.
    "feed.sources.create": async ({ request }) => {
      const fields = ["kind", "name", "repository", "research_source", "definition_id", "query", "channel_id", "feed_url"];
      const result = await options.actions.invoke(feedSourceActions.register,
        Object.fromEntries(fields.flatMap(key => typeof request.body[key] === "string" ? [[key, request.body[key]]] : [])) as FeedSourceRegistration);
      changed();
      return { status: result.registered ? 201 : 200, body: result };
    },
    "feed.sources.update": async ({ params, request }) => {
      const result = await options.actions.invoke(feedSourceActions.update, { source_id: requireParam(params.source_id, "Feed 来源不存在"),
        ...Object.fromEntries(["name", "description", "scope", "feed_url", "connection_id"].flatMap(key => typeof request.body[key] === "string" ? [[key, request.body[key]]] : [])) });
      changed();
      return { status: 200, body: result };
    },
    "feed.sources.delete": async ({ params, request }) => {
      const historyDecision = request.body.history_decision as SourceHistoryDecision;
      if (historyDecision !== "retain_history" && historyDecision !== "delete_local_history") {
        return { status: 400, body: { error: "删除来源前必须选择保留或删除本地历史" } };
      }
      const result = await options.actions.invoke(feedSourceActions.delete, { source_id: requireParam(params.source_id, "Feed 来源不存在"), history_decision: historyDecision });
      changed();
      return { status: 200, body: result };
    },
    "feed.sources.schedule": async ({ params, request }) => {
      const valid = request.body.mode === "manual" || (request.body.mode === "interval" && typeof request.body.enabled === "boolean" && Number.isInteger(request.body.interval_minutes));
      if (!valid) return { status: 400, body: { error: "拉取计划参数无效" } };
      const result = await options.actions.invoke(feedSourceActions.schedule, request.body.mode === "manual"
        ? { source_id: requireParam(params.source_id, "Feed 来源不存在"), mode: "manual" }
        : { source_id: requireParam(params.source_id, "Feed 来源不存在"), mode: "interval", enabled: request.body.enabled as boolean, interval_minutes: Number(request.body.interval_minutes) });
      changed();
      return { status: 200, body: result };
    },
    "feed.sources.action": async ({ params, request }) => {
      const sourceId = requireParam(params.source_id, "Feed 来源不存在");
      const action = requireParam(params.action, "来源动作不存在");
      const result = action === "pause" || action === "resume" ? await options.actions.invoke(feedSourceActions.enabled, { source_id: sourceId, enabled: action === "resume" })
        : action === "disconnect" ? await options.actions.invoke(feedSourceActions.disconnect, { source_id: sourceId })
        : await options.actions.invoke(feedSourceActions.sync, { source_id: sourceId,
          ...(typeof request.body.idempotency_key === "string" ? { idempotency_key: request.body.idempotency_key } : {}),
          ...(request.body.mode === "rebuild_cursor" ? { mode: "rebuild_cursor" as const } : {}) });
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
      const project = /^\/projects\/([^/]+)$/u.exec(options.routePrefix)?.[1];
      return {
        status: 302,
        redirect: `/settings/connectors?connected=gmail${project ? `&project=${project}` : ""}`,
      };
    },
  };
}
