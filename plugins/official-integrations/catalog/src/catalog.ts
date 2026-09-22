import type { ConnectorDirectoryGroupId } from "@molis-ai/molis-work-contracts/services/connector-host";
import type { IntegrationProviderItem } from "@molis-ai/molis-work-contracts/platform/plugin";
import { asList, asRecord, bearer, CatalogLiveError, nestedText, splitParts, text, tokenContext, USER_AGENT } from "./http.js";
import { setupLinksFor } from "./setup-links.js";
import type { CatalogAuthContext, CatalogConnectorSpec, CatalogHttpRequest } from "./types.js";

type CatalogConnectorDraft = Omit<CatalogConnectorSpec, "setup_links">;

type CatalogFeedItemInput = Omit<IntegrationProviderItem, "summary"> & { summary?: string };

function item(input: CatalogFeedItemInput): IntegrationProviderItem {
  return {
    kind: "update",
    priority: "medium",
    tags: [],
    summary: "",
    ...input,
  };
}

function mapList(
  json: unknown,
  connectorId: string,
  pick: (row: Record<string, unknown>) => IntegrationProviderItem | null,
): IntegrationProviderItem[] {
  return asList(json).flatMap((entry) => {
    const row = asRecord(entry);
    if (!row) return [];
    const mapped = pick(row);
    if (!mapped?.externalId || !mapped.title) return [];
    return [{ ...mapped, tags: [...new Set(["catalog", connectorId, ...(mapped.tags ?? [])])] }];
  });
}

function get(url: string, headers: Record<string, string>): CatalogHttpRequest {
  return { url, headers };
}

function post(url: string, headers: Record<string, string>, body: unknown): CatalogHttpRequest {
  return { url, method: "POST", headers: { "content-type": "application/json", ...headers }, body };
}

function spec(
  id: string,
  title: string,
  group_id: ConnectorDirectoryGroupId,
  summary: string,
  inbound: string,
  rest: Omit<CatalogConnectorDraft, "id" | "title" | "group_id" | "summary" | "inbound" | "outbound">,
): CatalogConnectorDraft {
  return {
    id,
    title,
    group_id,
    summary,
    inbound,
    outbound: `Functions 可勾查看当前账号（${id}.whoami）`,
    ...rest,
  };
}

function googleBearer(ctx: CatalogAuthContext): Record<string, string> {
  return bearer(ctx);
}

function graphHeaders(ctx: CatalogAuthContext): Record<string, string> {
  return bearer(ctx);
}

const CATALOG: CatalogConnectorDraft[] = [
  spec("google-calendar", "Google Calendar", "mail", "日程与会议。", "Feed 拉日程与会议", {
    token_label: "Google 访问令牌（calendar.readonly）",
    token_placeholder: "ya29.…",
    auth_help: "使用带 calendar.readonly 的 Google 访问令牌。可与 Gmail 同一 OAuth 客户端，但 scope 要包含日历。",
    permission_host: "googleapis.com",
    identity: {
      request: (ctx) => get("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1", googleBearer(ctx)),
      read: (json) => text(nestedText(asRecord(asList(json)[0]), ["id"]), nestedText(asRecord(json), ["summary"])) || "Google Calendar",
    },
    feed: {
      request: (ctx) => get("https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=20&singleEvents=true&orderBy=updated", googleBearer(ctx)),
      read: (json) => mapList(json, "google-calendar", (row) => item({
        externalId: `gcal-${text(row.id)}`,
        title: text(row.summary) || "无标题日程",
        summary: text(nestedText(asRecord(row.start), ["dateTime"]), nestedText(asRecord(row.start), ["date"])),
        url: text(row.htmlLink) || undefined,
        occurredAt: text(row.updated, nestedText(asRecord(row.start), ["dateTime"])),
        author: text(nestedText(asRecord(row.organizer), ["email"])),
        kind: "update",
      })),
    },
  }),
  spec("outlook", "Outlook", "mail", "邮件与日历。", "Feed 拉邮件与日历", {
    token_label: "Microsoft Graph 访问令牌（Mail.Read）",
    token_placeholder: "EwB…",
    auth_help: "使用 Microsoft Graph 委托令牌，需要 Mail.Read。Outlook / OneDrive / Teams / SharePoint 可共用同一 Graph 令牌（需对应 scope）。",
    permission_host: "graph.microsoft.com",
    identity: {
      request: (ctx) => get("https://graph.microsoft.com/v1.0/me", graphHeaders(ctx)),
      read: (json) => text(asRecord(json)?.userPrincipalName, asRecord(json)?.mail, asRecord(json)?.displayName) || "Outlook",
    },
    feed: {
      request: (ctx) => get("https://graph.microsoft.com/v1.0/me/messages?$top=20&$select=id,subject,from,receivedDateTime,webLink,bodyPreview", graphHeaders(ctx)),
      read: (json) => mapList(json, "outlook", (row) => item({
        externalId: `outlook-${text(row.id)}`,
        title: text(row.subject) || "无主题邮件",
        summary: text(row.bodyPreview),
        url: text(row.webLink) || undefined,
        occurredAt: text(row.receivedDateTime),
        author: nestedText(asRecord(row.from), ["emailAddress", "address"]),
        kind: "message",
      })),
    },
  }),
  spec("google-drive", "Google Drive", "files", "Drive、Docs、Sheets、Slides。", "项目资料可读 Drive 文件", {
    token_label: "Google 访问令牌（drive.readonly）",
    token_placeholder: "ya29.…",
    auth_help: "查看列表可使用 drive.metadata.readonly；导入 Google Docs 正文需要 drive.readonly 或 drive.file。",
    permission_host: "googleapis.com",
    identity: {
      request: (ctx) => get("https://www.googleapis.com/drive/v3/about?fields=user", googleBearer(ctx)),
      read: (json) => nestedText(asRecord(json), ["user", "emailAddress"]) || nestedText(asRecord(json), ["user", "displayName"]) || "Google Drive",
    },
    feed: {
      request: (ctx) => get(`https://www.googleapis.com/drive/v3/files?pageSize=20&orderBy=${encodeURIComponent("modifiedTime desc")}&fields=files(id,name,modifiedTime,webViewLink,owners)`, googleBearer(ctx)),
      read: (json) => mapList(json, "google-drive", (row) => item({
        externalId: `gdrive-${text(row.id)}`,
        title: text(row.name) || "未命名文件",
        summary: text(row.modifiedTime),
        url: text(row.webViewLink) || undefined,
        occurredAt: text(row.modifiedTime),
        author: nestedText(asRecord(asList(row.owners)[0]), ["emailAddress"]),
      })),
    },
  }),
  spec("onedrive", "OneDrive", "files", "个人与共享文件。", "项目资料可读 OneDrive 文件", {
    token_label: "Microsoft Graph 访问令牌（Files.Read）",
    token_placeholder: "EwB…",
    auth_help: "使用 Microsoft Graph 令牌，需要 Files.Read。",
    permission_host: "graph.microsoft.com",
    identity: {
      request: (ctx) => get("https://graph.microsoft.com/v1.0/me", graphHeaders(ctx)),
      read: (json) => text(asRecord(json)?.userPrincipalName, asRecord(json)?.displayName) || "OneDrive",
    },
    feed: {
      request: (ctx) => get("https://graph.microsoft.com/v1.0/me/drive/recent", graphHeaders(ctx)),
      read: (json) => mapList(json, "onedrive", (row) => item({
        externalId: `onedrive-${text(row.id)}`,
        title: text(row.name) || "未命名文件",
        url: nestedText(asRecord(row), ["webUrl"]) || undefined,
        occurredAt: text(row.lastModifiedDateTime),
        author: nestedText(asRecord(row.lastModifiedBy), ["user", "displayName"]),
      })),
    },
  }),
  spec("sharepoint", "SharePoint", "files", "站点与文档库。", "项目资料可读站点文档", {
    token_label: "Microsoft Graph 访问令牌（Sites.Read.All）",
    token_placeholder: "EwB…",
    auth_help: "使用 Microsoft Graph 令牌。优先拉已关注站点；没有关注时可能为空。",
    permission_host: "graph.microsoft.com",
    identity: {
      request: (ctx) => get("https://graph.microsoft.com/v1.0/me", graphHeaders(ctx)),
      read: (json) => text(asRecord(json)?.userPrincipalName, asRecord(json)?.displayName) || "SharePoint",
    },
    feed: {
      request: (ctx) => get("https://graph.microsoft.com/v1.0/me/followedSites?$top=20", graphHeaders(ctx)),
      read: (json) => mapList(json, "sharepoint", (row) => item({
        externalId: `sharepoint-${text(row.id)}`,
        title: text(row.displayName, row.name) || "SharePoint 站点",
        url: text(row.webUrl) || undefined,
      })),
    },
  }),
  spec("dropbox", "Dropbox", "files", "云盘文件。", "项目资料可读 Dropbox 文件", {
    token_label: "Dropbox 访问令牌",
    token_placeholder: "sl.…",
    auth_help: "Dropbox App 生成的 access token。只读列出根目录。",
    permission_host: "api.dropboxapi.com",
    identity: {
      request: (ctx) => post("https://api.dropboxapi.com/2/users/get_current_account", bearer(ctx), null),
      read: (json) => text(nestedText(asRecord(json), ["email"]), nestedText(asRecord(json), ["name", "display_name"])) || "Dropbox",
    },
    feed: {
      request: (ctx) => post("https://api.dropboxapi.com/2/files/list_folder", bearer(ctx), { path: "", limit: 20 }),
      read: (json) => mapList(asRecord(json)?.entries, "dropbox", (row) => item({
        externalId: `dropbox-${text(row.id, row.path_lower)}`,
        title: text(row.name, row.path_display) || "Dropbox 文件",
        summary: text(row[".tag"]),
        occurredAt: text(row.server_modified, row.client_modified),
      })),
    },
  }),
  spec("box", "Box", "files", "云盘文件。", "项目资料可读 Box 文件", {
    token_label: "Box 访问令牌",
    token_placeholder: "E…",
    auth_help: "Box 开发者令牌或 OAuth access token。",
    permission_host: "api.box.com",
    identity: {
      request: (ctx) => get("https://api.box.com/2.0/users/me", bearer(ctx)),
      read: (json) => text(asRecord(json)?.login, asRecord(json)?.name) || "Box",
    },
    feed: {
      request: (ctx) => get("https://api.box.com/2.0/folders/0/items?limit=20", bearer(ctx)),
      read: (json) => mapList(asRecord(json)?.entries, "box", (row) => item({
        externalId: `box-${text(row.id)}`,
        title: text(row.name) || "Box 文件",
        summary: text(row.type),
        url: nestedText(asRecord(row), ["shared_link", "url"]) || undefined,
        occurredAt: text(row.modified_at),
      })),
    },
  }),
  spec("notion", "Notion", "files", "页面与数据库。", "Feed 拉页面与数据库更新", {
    token_label: "Notion Internal Integration Token",
    token_placeholder: "ntn_… 或 secret_…",
    auth_help: "Notion 内部集成令牌。集成必须被分享到要读取的页面。",
    permission_host: "api.notion.com",
    identity: {
      request: (ctx) => get("https://api.notion.com/v1/users/me", bearer(ctx, { "Notion-Version": "2022-06-28" })),
      read: (json) => text(
        nestedText(asRecord(json), ["bot", "owner", "user", "name"]),
        nestedText(asRecord(json), ["name"]),
        asRecord(json)?.id as string,
      ) || "Notion",
    },
    feed: {
      request: (ctx) => post("https://api.notion.com/v1/search", bearer(ctx, { "Notion-Version": "2022-06-28" }), {
        page_size: 20,
        sort: { direction: "descending", timestamp: "last_edited_time" },
      }),
      read: (json) => mapList(json, "notion", (row) => {
        const properties = asRecord(row.properties);
        const titleProp = properties ? Object.values(properties).map((value) => asRecord(value)).find((value) => value?.type === "title") : null;
        const titleText = nestedText(asRecord(asList(titleProp?.title)[0]), ["plain_text"]);
        return item({
          externalId: `notion-${text(row.id)}`,
          title: titleText || "无标题页面",
          url: nestedText(asRecord(row), ["url"]) || undefined,
          occurredAt: text(row.last_edited_time),
        });
      }),
    },
  }),
  spec("slack", "Slack", "chat", "频道、消息与 Canvas。", "Feed 拉频道与消息", {
    token_label: "Slack Bot Token",
    token_placeholder: "xoxb-…",
    auth_help: "Slack Bot User OAuth Token。需要 channels:read 或 groups:read。",
    permission_host: "slack.com",
    identity: {
      request: (ctx) => get("https://slack.com/api/auth.test", bearer(ctx)),
      read: (json) => text(asRecord(json)?.user, asRecord(json)?.team) || "Slack",
    },
    feed: {
      request: (ctx) => get("https://slack.com/api/conversations.list?limit=20&exclude_archived=true", bearer(ctx)),
      read: (json) => mapList(asRecord(json)?.channels, "slack", (row) => item({
        externalId: `slack-${text(row.id)}`,
        title: `#${text(row.name) || "channel"}`,
        summary: text(row.topic ? nestedText(asRecord(row.topic), ["value"]) : row.purpose ? nestedText(asRecord(row.purpose), ["value"]) : ""),
        kind: "message",
      })),
    },
  }),
  spec("teams", "Microsoft Teams", "chat", "消息、频道与聊天。", "Feed 拉频道与聊天", {
    token_label: "Microsoft Graph 访问令牌（Chat.Read）",
    token_placeholder: "EwB…",
    auth_help: "使用 Microsoft Graph 令牌，需要 Chat.Read。",
    permission_host: "graph.microsoft.com",
    identity: {
      request: (ctx) => get("https://graph.microsoft.com/v1.0/me", graphHeaders(ctx)),
      read: (json) => text(asRecord(json)?.userPrincipalName, asRecord(json)?.displayName) || "Teams",
    },
    feed: {
      request: (ctx) => get("https://graph.microsoft.com/v1.0/me/chats?$top=20", graphHeaders(ctx)),
      read: (json) => mapList(json, "teams", (row) => item({
        externalId: `teams-${text(row.id)}`,
        title: text(row.topic, row.chatType) || "Teams 聊天",
        url: text(row.webUrl) || undefined,
        occurredAt: text(row.lastUpdatedDateTime),
        kind: "message",
      })),
    },
  }),
  spec("discord", "Discord", "chat", "服务器与频道。", "Feed 拉服务器与频道消息", {
    token_label: "Discord Bot Token",
    token_placeholder: "MTIz…",
    auth_help: "Discord Bot Token。本机用 Bot 前缀调用；Bot 必须在要读的服务器里。",
    permission_host: "discord.com",
    identity: {
      request: (ctx) => get("https://discord.com/api/v10/users/@me", discordHeaders(ctx)),
      read: (json) => text(asRecord(json)?.username, asRecord(json)?.global_name) || "Discord",
    },
    feed: {
      request: (ctx) => get("https://discord.com/api/v10/users/@me/guilds", discordHeaders(ctx)),
      read: (json) => mapList(json, "discord", (row) => item({
        externalId: `discord-${text(row.id)}`,
        title: text(row.name) || "Discord 服务器",
        kind: "message",
      })),
    },
  }),
  spec("feishu", "飞书", "chat", "消息、文档与日历。", "Feed 拉消息、文档与日历", {
    token_label: "飞书应用凭证",
    token_placeholder: "cli_…:app_secret",
    auth_help: "企业自建应用，格式 app_id:app_secret。导入正文需文档只读权限，并将文档共享给应用；知识库链接还需知识库读取权限。Feed 拉会话另需 im 权限。",
    permission_host: "open.feishu.cn",
    parseToken: (raw) => splitParts(raw, ":", 2, ["app_id", "app_secret"]),
    async prepare(ctx, http) {
      const result = await http.json(post("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", { "content-type": "application/json" }, {
        app_id: ctx.extra.app_id,
        app_secret: ctx.extra.app_secret,
      }));
      const token = text(asRecord(result.json)?.tenant_access_token);
      if (!token) throw new CatalogLiveError("configuration", undefined, "飞书 app_id:app_secret 无法换到 tenant_access_token");
      return { ...ctx, accessToken: token };
    },
    identity: {
      request: (ctx) => post("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", { "content-type": "application/json" }, {
        app_id: ctx.extra.app_id,
        app_secret: ctx.extra.app_secret,
      }),
      read: (json, ctx) => text(asRecord(json)?.tenant_access_token) ? (text(ctx.extra.app_id) || "飞书") : "",
    },
    feed: {
      request: (ctx) => get("https://open.feishu.cn/open-apis/im/v1/chats?page_size=20", bearer(ctx)),
      read: (json) => mapList(nestedTextList(asRecord(json), ["data", "items"]), "feishu", (row) => item({
        externalId: `feishu-${text(row.chat_id)}`,
        title: text(row.name) || "飞书会话",
        kind: "message",
      })),
    },
  }),
  spec("lark", "Lark", "chat", "国际版 Lark 的消息与文档。", "Feed 拉会话；Artifact 导入文档", {
    token_label: "Lark 应用凭证",
    token_placeholder: "cli_…:app_secret",
    auth_help: "Lark 国际版自建应用，格式 app_id:app_secret，与飞书凭据分开保存。导入正文需文档只读权限及文档共享，知识库链接还需知识库读取权限。Feed 拉会话另需 im 权限。",
    permission_host: "open.larksuite.com",
    parseToken: (raw) => splitParts(raw, ":", 2, ["app_id", "app_secret"]),
    async prepare(ctx, http) {
      const result = await http.json(post("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", { "content-type": "application/json" }, {
        app_id: ctx.extra.app_id,
        app_secret: ctx.extra.app_secret,
      }));
      const token = text(asRecord(result.json)?.tenant_access_token);
      if (!token) throw new CatalogLiveError("configuration", undefined, "Lark app_id:app_secret 无法换到 tenant_access_token");
      return { ...ctx, accessToken: token };
    },
    identity: {
      request: (ctx) => post("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", { "content-type": "application/json" }, {
        app_id: ctx.extra.app_id,
        app_secret: ctx.extra.app_secret,
      }),
      read: (json, ctx) => text(asRecord(json)?.tenant_access_token) ? (text(ctx.extra.app_id) || "Lark") : "",
    },
    feed: {
      request: (ctx) => get("https://open.larksuite.com/open-apis/im/v1/chats?page_size=20", bearer(ctx)),
      read: (json) => mapList(nestedTextList(asRecord(json), ["data", "items"]), "lark", (row) => item({
        externalId: `lark-${text(row.chat_id)}`,
        title: text(row.name) || "Lark 会话",
        kind: "message",
      })),
    },
  }),
  spec("wechat", "微信", "chat", "企业微信消息。", "Feed 拉企业微信通讯录", {
    token_label: "企业微信 CorpID 与 Secret",
    token_placeholder: "ww…:secret",
    auth_help: "微信个人号没有稳定官方接口。这里连的是企业微信自建应用，格式 corpid:corpsecret。",
    permission_host: "qyapi.weixin.qq.com",
    parseToken: (raw) => splitParts(raw, ":", 2, ["corpid", "corpsecret"]),
    async prepare(ctx, http) {
      const result = await http.json(get(
        `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${encodeURIComponent(ctx.extra.corpid ?? "")}&corpsecret=${encodeURIComponent(ctx.extra.corpsecret ?? "")}`,
        { "User-Agent": USER_AGENT },
      ));
      const token = text(asRecord(result.json)?.access_token);
      if (!token) throw new CatalogLiveError("configuration", undefined, "企业微信 corpid:secret 无法换到 access_token");
      return { ...ctx, accessToken: token };
    },
    identity: {
      request: (ctx) => get(`https://qyapi.weixin.qq.com/cgi-bin/get_api_domain_ip?access_token=${encodeURIComponent(ctx.accessToken)}`, { "User-Agent": USER_AGENT }),
      read: (_json, ctx) => text(ctx.extra.corpid) || "企业微信",
    },
    feed: {
      request: (ctx) => get(`https://qyapi.weixin.qq.com/cgi-bin/department/list?access_token=${encodeURIComponent(ctx.accessToken)}`, { "User-Agent": USER_AGENT }),
      read: (json) => mapList(asRecord(json)?.department, "wechat", (row) => item({
        externalId: `wecom-dept-${text(row.id)}`,
        title: text(row.name) || `部门 ${text(row.id)}`,
        kind: "update",
      })),
    },
  }),
  spec("zoom", "Zoom", "chat", "会议与录制。", "Feed 拉会议与录制", {
    token_label: "Zoom 访问令牌",
    token_placeholder: "eyJ…",
    auth_help: "Zoom OAuth 用户访问令牌，identity 打 /v2/users/me。Server-to-Server 账号令牌没有 /users/me，会 live 失败；请改用用户上下文令牌。",
    permission_host: "api.zoom.us",
    identity: {
      request: (ctx) => get("https://api.zoom.us/v2/users/me", bearer(ctx)),
      read: (json) => text(asRecord(json)?.email, asRecord(json)?.display_name) || "Zoom",
    },
    feed: {
      request: (ctx) => get("https://api.zoom.us/v2/users/me/meetings?page_size=20", bearer(ctx)),
      read: (json) => mapList(asRecord(json)?.meetings, "zoom", (row) => item({
        externalId: `zoom-${text(row.id)}`,
        title: text(row.topic) || "Zoom 会议",
        url: text(row.join_url) || undefined,
        occurredAt: text(row.start_time),
      })),
    },
  }),
  spec("gitlab", "GitLab", "code", "仓库、Issue 与 MR。", "Feed 拉 Issue 与 MR", {
    token_label: "GitLab Personal Access Token",
    token_placeholder: "glpat-…",
    auth_help: "GitLab PAT，需要 read_api 或 read_user。默认 gitlab.com。",
    permission_host: "gitlab.com",
    identity: {
      request: (ctx) => get("https://gitlab.com/api/v4/user", { "PRIVATE-TOKEN": ctx.accessToken, Accept: "application/json", "User-Agent": USER_AGENT }),
      read: (json) => text(asRecord(json)?.username, asRecord(json)?.name) || "GitLab",
    },
    feed: {
      request: (ctx) => get("https://gitlab.com/api/v4/events?per_page=20", { "PRIVATE-TOKEN": ctx.accessToken, Accept: "application/json", "User-Agent": USER_AGENT }),
      read: (json) => mapList(json, "gitlab", (row) => item({
        externalId: `gitlab-${text(row.id)}`,
        title: text(row.action_name, nestedText(asRecord(row.target_title ? { t: row.target_title } : row), ["t"])) || "GitLab 动态",
        summary: text(nestedText(asRecord(row.project), ["path_with_namespace"]), row.target_type),
        occurredAt: text(row.created_at),
        author: nestedText(asRecord(row.author), ["username"]),
        kind: text(row.target_type) === "MergeRequest" ? "pr" : text(row.target_type) === "Issue" ? "issue" : "update",
      })),
    },
  }),
  spec("bitbucket", "Bitbucket", "code", "仓库与 PR。", "Feed 拉仓库与 PR", {
    token_label: "Bitbucket 令牌",
    token_placeholder: "username:app-password 或 Bearer",
    auth_help: "App password 用 username:password；OAuth 直接贴 access token。",
    permission_host: "api.bitbucket.org",
    parseToken: parseBitbucketToken,
    identity: {
      request: (ctx) => get("https://api.bitbucket.org/2.0/user", bitbucketHeaders(ctx)),
      read: (json) => text(asRecord(json)?.display_name, asRecord(json)?.username) || "Bitbucket",
    },
    feed: {
      request: (ctx) => get("https://api.bitbucket.org/2.0/repositories?role=member&pagelen=20", bitbucketHeaders(ctx)),
      read: (json) => mapList(asRecord(json)?.values, "bitbucket", (row) => item({
        externalId: `bitbucket-${text(row.uuid, row.full_name)}`,
        title: text(row.full_name, row.name) || "Bitbucket 仓库",
        url: nestedText(asRecord(row.links), ["html", "href"]) || undefined,
        occurredAt: text(row.updated_on),
      })),
    },
  }),
  spec("vercel", "Vercel", "code", "部署与预览。", "Feed 拉部署与预览", {
    token_label: "Vercel Token",
    token_placeholder: "vercel_…",
    auth_help: "Vercel 账户 Token。只读部署列表。",
    permission_host: "api.vercel.com",
    identity: {
      request: (ctx) => get("https://api.vercel.com/v2/user", bearer(ctx)),
      read: (json) => text(nestedText(asRecord(json), ["user", "username"]), nestedText(asRecord(json), ["user", "email"])) || "Vercel",
    },
    feed: {
      request: (ctx) => get("https://api.vercel.com/v6/deployments?limit=20", bearer(ctx)),
      read: (json) => mapList(asRecord(json)?.deployments, "vercel", (row) => item({
        externalId: `vercel-${text(row.uid, row.id)}`,
        title: text(row.name, row.url) || "Vercel 部署",
        summary: text(row.state, row.readyState),
        url: text(row.url) ? `https://${text(row.url)}` : undefined,
        occurredAt: typeof row.created === "number" ? new Date(row.created).toISOString() : text(row.createdAt),
      })),
    },
  }),
  spec("cloudflare", "Cloudflare", "code", "Workers、Pages 与 DNS。", "Feed 拉 Workers、Pages 与 DNS", {
    token_label: "Cloudflare API Token",
    token_placeholder: "…",
    auth_help: "Cloudflare API Token。identity 打官方 /user/tokens/verify；不要用 Global API Key 的邮箱头。拉域名还需要 Zone.Read。",
    permission_host: "api.cloudflare.com",
    identity: {
      request: (ctx) => get("https://api.cloudflare.com/client/v4/user/tokens/verify", bearer(ctx)),
      read: (json) => text(nestedText(asRecord(json), ["result", "status"]), nestedText(asRecord(json), ["result", "id"])) || "Cloudflare",
    },
    feed: {
      request: (ctx) => get("https://api.cloudflare.com/client/v4/zones?per_page=20", bearer(ctx)),
      read: (json) => mapList(asRecord(json)?.result, "cloudflare", (row) => item({
        externalId: `cloudflare-${text(row.id)}`,
        title: text(row.name) || "Cloudflare Zone",
        summary: text(row.status),
      })),
    },
  }),
  spec("huggingface", "Hugging Face", "code", "模型、数据集与 Spaces。", "Feed 拉模型、数据集与 Spaces", {
    token_label: "Hugging Face Access Token",
    token_placeholder: "hf_…",
    auth_help: "Hugging Face access token。用 whoami 后拉该用户模型。",
    permission_host: "huggingface.co",
    identity: {
      request: (ctx) => get("https://huggingface.co/api/whoami-v2", bearer(ctx)),
      read: (json, ctx) => {
        const name = text(asRecord(json)?.name, asRecord(json)?.email);
        if (name) ctx.extra.name = name;
        return name || "Hugging Face";
      },
    },
    feed: {
      request: (ctx) => get(`https://huggingface.co/api/models?author=${encodeURIComponent(ctx.extra.name || "")}&limit=20`, bearer(ctx)),
      read: (json) => mapList(json, "huggingface", (row) => item({
        externalId: `hf-${text(row.id, row.modelId)}`,
        title: text(row.id, row.modelId) || "Hugging Face 模型",
        url: text(row.id) ? `https://huggingface.co/${text(row.id)}` : undefined,
        occurredAt: text(row.lastModified),
      })),
    },
  }),
  spec("sentry", "Sentry", "code", "错误与性能。", "Feed 拉错误与性能", {
    token_label: "Sentry Auth Token",
    token_placeholder: "sntrys_…",
    auth_help: "Sentry User/Org Auth Token，需要 event:read、org:read。",
    permission_host: "sentry.io",
    identity: {
      request: (ctx) => get("https://sentry.io/api/0/organizations/", bearer(ctx)),
      read: (json, ctx) => {
        const first = asRecord(asList(json)[0]);
        const slug = text(first?.slug);
        if (slug) ctx.extra.org = slug;
        return text(first?.name, first?.slug) || "Sentry";
      },
    },
    feed: {
      request: (ctx) => get(`https://sentry.io/api/0/organizations/${encodeURIComponent(ctx.extra.org || "")}/issues/?limit=20`, bearer(ctx)),
      read: (json) => mapList(json, "sentry", (row) => item({
        externalId: `sentry-${text(row.id)}`,
        title: text(row.title, row.culprit) || "Sentry issue",
        summary: text(row.shortId, row.status),
        url: text(row.permalink) || undefined,
        occurredAt: text(row.lastSeen),
        priority: text(row.level) === "error" || text(row.level) === "fatal" ? "high" : "medium",
        kind: "issue",
      })),
    },
  }),
  spec("supabase", "Supabase", "code", "数据库、认证与存储。", "Feed 拉项目事件", {
    token_label: "Supabase Access Token",
    token_placeholder: "sbp_…",
    auth_help: "Supabase Management API access token。拉项目列表。",
    permission_host: "api.supabase.com",
    identity: {
      request: (ctx) => get("https://api.supabase.com/v1/organizations", bearer(ctx)),
      read: (json) => text(asRecord(asList(json)[0])?.name, asRecord(asList(json)[0])?.slug) || "Supabase",
    },
    feed: {
      request: (ctx) => get("https://api.supabase.com/v1/projects", bearer(ctx)),
      read: (json) => mapList(json, "supabase", (row) => item({
        externalId: `supabase-${text(row.id, row.ref)}`,
        title: text(row.name) || "Supabase 项目",
        summary: text(row.region, row.status),
        occurredAt: text(row.created_at),
      })),
    },
  }),
  spec("linear", "Linear", "work", "Issue、项目与周期。", "Feed 拉 Issue 与周期", {
    token_label: "Linear API Key",
    token_placeholder: "lin_api_…",
    auth_help: "Linear Personal API key。只读 viewer 与最近 Issue。",
    permission_host: "api.linear.app",
    identity: {
      request: (ctx) => post("https://api.linear.app/graphql", bearer(ctx), { query: "{ viewer { id name email } }" }),
      read: (json) => text(nestedText(asRecord(json), ["data", "viewer", "name"]), nestedText(asRecord(json), ["data", "viewer", "email"])) || "Linear",
    },
    feed: {
      request: (ctx) => post("https://api.linear.app/graphql", bearer(ctx), {
        query: "{ issues(first: 20) { nodes { id identifier title url updatedAt assignee { name } } } }",
      }),
      read: (json) => mapList(nestedTextList(asRecord(json), ["data", "issues", "nodes"]), "linear", (row) => item({
        externalId: `linear-${text(row.id)}`,
        title: `${text(row.identifier)} ${text(row.title)}`.trim(),
        url: text(row.url) || undefined,
        occurredAt: text(row.updatedAt),
        author: nestedText(asRecord(row.assignee), ["name"]),
        kind: "issue",
      })),
    },
  }),
  spec("jira", "Jira", "work", "Issue 与项目。", "Feed 拉 Issue 与项目", {
    token_label: "Jira 站点、邮箱与 API token",
    token_placeholder: "your-site.atlassian.net|you@email|api-token",
    auth_help: "Atlassian API token，格式 站点|邮箱|token。Cloud 站点不要带 https://。",
    permission_host: "atlassian.net",
    parseToken: (raw) => splitParts(raw, "|", 3, ["site", "email", "token"]),
    identity: {
      request: (ctx) => get(`https://${jiraHost(ctx)}/rest/api/3/myself`, jiraHeaders(ctx)),
      read: (json) => text(asRecord(json)?.displayName, asRecord(json)?.emailAddress) || "Jira",
    },
    feed: {
      request: (ctx) => get(`https://${jiraHost(ctx)}/rest/api/3/search/jql?jql=${encodeURIComponent("assignee=currentUser() ORDER BY updated DESC")}&maxResults=20&fields=summary,updated`, jiraHeaders(ctx)),
      read: (json, ctx) => mapList(asRecord(json)?.issues, "jira", (row) => {
        const fields = asRecord(row.fields);
        return item({
          externalId: `jira-${text(row.id, row.key)}`,
          title: `${text(row.key)} ${text(fields?.summary)}`.trim(),
          url: text(row.key) ? `https://${jiraHost(ctx)}/browse/${text(row.key)}` : undefined,
          occurredAt: text(fields?.updated),
          kind: "issue",
        });
      }),
    },
  }),
  spec("confluence", "Confluence", "work", "知识库与页面。", "Feed 拉知识库页面", {
    token_label: "Confluence 站点、邮箱与 API token",
    token_placeholder: "your-site.atlassian.net|you@email|api-token",
    auth_help: "与 Jira 相同的 Atlassian API token，格式 站点|邮箱|token。",
    permission_host: "atlassian.net",
    parseToken: (raw) => splitParts(raw, "|", 3, ["site", "email", "token"]),
    identity: {
      request: (ctx) => get(`https://${jiraHost(ctx)}/wiki/rest/api/user/current`, jiraHeaders(ctx)),
      read: (json) => text(asRecord(json)?.displayName, asRecord(json)?.email) || "Confluence",
    },
    feed: {
      request: (ctx) => get(`https://${jiraHost(ctx)}/wiki/rest/api/content/search?cql=${encodeURIComponent("type=page order by lastmodified desc")}&limit=20`, jiraHeaders(ctx)),
      read: (json, ctx) => mapList(asRecord(json)?.results, "confluence", (row) => {
        const path = nestedText(asRecord(row._links), ["webui"]);
        return item({
          externalId: `confluence-${text(row.id)}`,
          title: text(row.title) || "Confluence 页面",
          url: path ? `https://${jiraHost(ctx)}/wiki${path.startsWith("/") ? path : `/${path}`}` : undefined,
          occurredAt: nestedText(asRecord(row.version), ["when"]),
        });
      }),
    },
  }),
  spec("asana", "Asana", "work", "任务与项目。", "Feed 拉任务与项目", {
    token_label: "Asana Personal Access Token",
    token_placeholder: "2/…",
    auth_help: "Asana PAT。拉指派给当前用户且未完成的任务。",
    permission_host: "app.asana.com",
    identity: {
      request: (ctx) => get("https://app.asana.com/api/1.0/users/me", bearer(ctx)),
      read: (json) => text(nestedText(asRecord(json), ["data", "name"]), nestedText(asRecord(json), ["data", "email"])) || "Asana",
    },
    feed: {
      collect: async (ctx, http) => {
        const me = await http.json(get("https://app.asana.com/api/1.0/users/me", bearer(ctx)));
        const workspaceId = text(asRecord(asList(nestedTextList(asRecord(me.json), ["data", "workspaces"]))[0])?.gid);
        if (!workspaceId) return [];
        const tasks = await http.json(get(
          `https://app.asana.com/api/1.0/tasks?assignee=me&workspace=${encodeURIComponent(workspaceId)}&completed_since=now&limit=20&opt_fields=name,modified_at,permalink_url,assignee.name`,
          bearer(ctx),
        ));
        return mapList(asRecord(tasks.json)?.data, "asana", (row) => item({
          externalId: `asana-${text(row.gid, row.id)}`,
          title: text(row.name) || "Asana 任务",
          url: text(row.permalink_url) || undefined,
          occurredAt: text(row.modified_at),
          author: nestedText(asRecord(row.assignee), ["name"]),
        }));
      },
    },
  }),
  spec("clickup", "ClickUp", "work", "任务与文档。", "Feed 拉任务与文档", {
    token_label: "ClickUp API Token",
    token_placeholder: "pk_…",
    auth_help: "ClickUp Settings → Apps 里的 API token。请求头是 Authorization，不加 Bearer。",
    permission_host: "api.clickup.com",
    identity: {
      request: (ctx) => get("https://api.clickup.com/api/v2/user", clickupHeaders(ctx)),
      read: (json) => text(nestedText(asRecord(json), ["user", "username"]), nestedText(asRecord(json), ["user", "email"])) || "ClickUp",
    },
    feed: {
      collect: async (ctx, http) => {
        const teams = await http.json(get("https://api.clickup.com/api/v2/team", clickupHeaders(ctx)));
        const team = asRecord(asList(asRecord(teams.json)?.teams)[0]);
        const teamId = text(team?.id);
        if (!teamId) return [];
        const tasks = await http.json(get(`https://api.clickup.com/api/v2/team/${encodeURIComponent(teamId)}/task?page=0`, clickupHeaders(ctx)));
        return mapList(asRecord(tasks.json)?.tasks, "clickup", (row) => item({
          externalId: `clickup-${text(row.id)}`,
          title: text(row.name) || "ClickUp 任务",
          url: text(row.url) || undefined,
          occurredAt: typeof row.date_updated === "string" || typeof row.date_updated === "number"
            ? new Date(Number(row.date_updated)).toISOString()
            : undefined,
        }));
      },
    },
  }),
  spec("monday", "monday.com", "work", "看板与工作流。", "Feed 拉看板与工作流", {
    token_label: "monday.com API Token",
    token_placeholder: "eyJ…",
    auth_help: "monday.com 个人 API token。官方要求 Authorization 头直接放 token，不要加 Bearer。",
    permission_host: "api.monday.com",
    identity: {
      request: (ctx) => post("https://api.monday.com/v2", mondayHeaders(ctx), { query: "{ me { id name email } }" }),
      read: (json) => text(nestedText(asRecord(json), ["data", "me", "name"]), nestedText(asRecord(json), ["data", "me", "email"])) || "monday.com",
    },
    feed: {
      request: (ctx) => post("https://api.monday.com/v2", mondayHeaders(ctx), { query: "{ boards(limit: 20) { id name url updated_at } }" }),
      read: (json) => mapList(nestedTextList(asRecord(json), ["data", "boards"]), "monday", (row) => item({
        externalId: `monday-${text(row.id)}`,
        title: text(row.name) || "monday 看板",
        url: text(row.url) || undefined,
        occurredAt: text(row.updated_at),
      })),
    },
  }),
  spec("airtable", "Airtable", "work", "表格与记录。", "Feed 拉表格与记录", {
    token_label: "Airtable Personal Access Token",
    token_placeholder: "pat…",
    auth_help: "Airtable PAT，需要 schema.bases:read。",
    permission_host: "api.airtable.com",
    identity: {
      request: (ctx) => get("https://api.airtable.com/v0/meta/whoami", bearer(ctx)),
      read: (json) => text(asRecord(json)?.email, asRecord(json)?.id) || "Airtable",
    },
    feed: {
      request: (ctx) => get("https://api.airtable.com/v0/meta/bases", bearer(ctx)),
      read: (json) => mapList(asRecord(json)?.bases, "airtable", (row) => item({
        externalId: `airtable-${text(row.id)}`,
        title: text(row.name) || "Airtable Base",
        summary: text(row.permissionLevel),
      })),
    },
  }),
  spec("loom", "Loom", "work", "录像与评论。", "Feed 拉录像与评论", {
    token_label: "Loom 访问令牌",
    token_placeholder: "…",
    auth_help: "Atlassian 官方目前不提供开放 PAT。只有企业/合作方发给你的 Loom API token 才能连；identity 打 GET https://api.loom.com/v1/users/me。没有这类令牌时是 live 失败，不是占位。",
    permission_host: "api.loom.com",
    identity: {
      request: (ctx) => get("https://api.loom.com/v1/users/me", bearer(ctx)),
      read: (json) => text(asRecord(json)?.email, asRecord(json)?.name, nestedText(asRecord(json), ["user", "email"])) || "Loom",
    },
    feed: {
      request: (ctx) => get("https://api.loom.com/v1/videos", bearer(ctx)),
      read: (json) => mapList(asRecord(json)?.videos ?? json, "loom", (row) => item({
        externalId: `loom-${text(row.id)}`,
        title: text(row.title, row.name) || "Loom 录像",
        url: text(row.share_url, row.url) || undefined,
        occurredAt: text(row.created_at),
      })),
    },
  }),
  spec("figma", "Figma", "design", "设计稿与标注。", "Feed 拉设计稿与标注", {
    token_label: "Figma Personal Access Token",
    token_placeholder: "figu_… 或 figd_…",
    auth_help: "Figma PAT。先验证 /v1/me；没有 team/project id 时入站列表可能为空。",
    permission_host: "api.figma.com",
    identity: {
      request: (ctx) => get("https://api.figma.com/v1/me", { "X-Figma-Token": ctx.accessToken, Authorization: `Bearer ${ctx.accessToken}`, "User-Agent": USER_AGENT }),
      read: (json) => text(asRecord(json)?.handle, asRecord(json)?.email) || "Figma",
    },
    feed: {
      request: (ctx) => get("https://api.figma.com/v1/me", { "X-Figma-Token": ctx.accessToken, Authorization: `Bearer ${ctx.accessToken}`, "User-Agent": USER_AGENT }),
      read: (json) => {
        const me = asRecord(json);
        const id = text(me?.id, me?.handle);
        if (!id) return [];
        return [item({
          externalId: `figma-me-${id}`,
          title: `${text(me?.handle, me?.email)} · Figma 账号`,
          summary: "已验证身份。文件列表需要团队或项目 id。",
        })];
      },
    },
  }),
  spec("canva", "Canva", "design", "设计与导出。", "Feed 拉设计与导出", {
    token_label: "Canva 访问令牌",
    token_placeholder: "…",
    auth_help: "Canva 没有 PAT。需要自己在 Canva Developer 创建 Connect App，用 OAuth 拿到 access token 再贴进来。identity 打官方 GET /rest/v1/users/me。",
    permission_host: "api.canva.com",
    identity: {
      request: (ctx) => get("https://api.canva.com/rest/v1/users/me", bearer(ctx)),
      read: (json) => text(nestedText(asRecord(json), ["team_user", "user_id"]), nestedText(asRecord(json), ["user", "display_name"]), nestedText(asRecord(json), ["profile", "display_name"])) || "Canva",
    },
    feed: {
      request: (ctx) => get("https://api.canva.com/rest/v1/designs?limit=20", bearer(ctx)),
      read: (json) => mapList(asRecord(json)?.items ?? asRecord(json)?.designs, "canva", (row) => item({
        externalId: `canva-${text(row.id)}`,
        title: text(row.title) || "Canva 设计",
        url: nestedText(asRecord(row.urls), ["edit_url"]) || undefined,
        occurredAt: text(row.updated_at),
      })),
    },
  }),
  spec("adobe", "Adobe", "design", "创意工具。", "Feed 拉创意文件", {
    token_label: "Adobe IMS 访问令牌",
    token_placeholder: "api-key|access-token 或 access-token",
    auth_help: "Adobe IMS access token。官方 UserInfo 要带 client_id：填 api-key|access-token。只贴 access token 时也可能通，但多数情况会 401。",
    permission_host: "adobelogin.com",
    parseToken: parseAdobeToken,
    identity: {
      request: (ctx) => get(adobeUserinfoUrl(ctx), bearer(ctx, adobeApiKey(ctx))),
      read: (json) => text(asRecord(json)?.email, asRecord(json)?.name, asRecord(json)?.sub) || "Adobe",
    },
    feed: {
      request: (ctx) => get(adobeUserinfoUrl(ctx), bearer(ctx, adobeApiKey(ctx))),
      read: (json) => {
        const email = text(asRecord(json)?.email, asRecord(json)?.name);
        if (!email) return [];
        return [item({
          externalId: `adobe-${text(asRecord(json)?.sub, email)}`,
          title: `${email} · Adobe 账号`,
          summary: "已验证 IMS 身份。",
        })];
      },
    },
  }),
  spec("salesforce", "Salesforce", "crm", "CRM 对象与记录。", "Feed 拉 CRM 记录", {
    token_label: "Salesforce 实例与访问令牌",
    token_placeholder: "https://your.my.salesforce.com|00D…",
    auth_help: "格式 instanceUrl|accessToken。instance 用 https://yourorg.my.salesforce.com；漏写 https:// 也会补上。",
    permission_host: "salesforce.com",
    parseToken: (raw) => splitParts(raw, "|", 2, ["instance", "token"]),
    identity: {
      request: (ctx) => get(`${salesforceInstance(ctx)}/services/oauth2/userinfo`, bearer(ctx)),
      read: (json) => text(asRecord(json)?.preferred_username, asRecord(json)?.name) || "Salesforce",
    },
    feed: {
      request: (ctx) => get(`${salesforceInstance(ctx)}/services/data/v60.0/query?q=${encodeURIComponent("SELECT Id,Subject,LastModifiedDate FROM Task ORDER BY LastModifiedDate DESC LIMIT 20")}`, bearer(ctx)),
      read: (json) => mapList(asRecord(json)?.records, "salesforce", (row) => item({
        externalId: `sfdc-${text(row.Id)}`,
        title: text(row.Subject, row.Id) || "Salesforce 记录",
        occurredAt: text(row.LastModifiedDate),
      })),
    },
  }),
  spec("hubspot", "HubSpot", "crm", "CRM 与营销。", "Feed 拉 CRM 与营销", {
    token_label: "HubSpot Private App Token",
    token_placeholder: "pat-na1-…",
    auth_help: "HubSpot private app access token，需要 crm.objects.contacts.read。",
    permission_host: "api.hubapi.com",
    identity: {
      request: (ctx) => get("https://api.hubapi.com/integrations/v1/me", bearer(ctx)),
      read: (json) => text(asRecord(json)?.hub_domain, asRecord(json)?.hub_id) || "HubSpot",
    },
    feed: {
      request: (ctx) => get("https://api.hubapi.com/crm/v3/objects/contacts?limit=20&properties=email,firstname,lastname,lastmodifieddate", bearer(ctx)),
      read: (json) => mapList(asRecord(json)?.results, "hubspot", (row) => {
        const properties = asRecord(row.properties);
        const name = [text(properties?.firstname), text(properties?.lastname)].filter(Boolean).join(" ");
        return item({
          externalId: `hubspot-${text(row.id)}`,
          title: name || text(properties?.email) || "HubSpot 联系人",
          summary: text(properties?.email),
          occurredAt: text(properties?.lastmodifieddate, row.updatedAt),
        });
      }),
    },
  }),
  spec("intercom", "Intercom", "crm", "客户对话。", "Feed 拉客户对话", {
    token_label: "Intercom Access Token",
    token_placeholder: "dG9r…",
    auth_help: "Intercom access token。只读 me 与会话。",
    permission_host: "api.intercom.io",
    identity: {
      request: (ctx) => get("https://api.intercom.io/me", bearer(ctx, { Accept: "application/json", "Intercom-Version": "2.13" })),
      read: (json) => text(asRecord(json)?.email, asRecord(json)?.name) || "Intercom",
    },
    feed: {
      request: (ctx) => get("https://api.intercom.io/conversations?per_page=20", bearer(ctx, { Accept: "application/json", "Intercom-Version": "2.13" })),
      read: (json) => mapList(asRecord(json)?.conversations, "intercom", (row) => item({
        externalId: `intercom-${text(row.id)}`,
        title: text(nestedText(asRecord(row.source), ["subject"]), nestedText(asRecord(row.source), ["body"])) || "Intercom 对话",
        occurredAt: typeof row.updated_at === "number" ? new Date(row.updated_at * 1000).toISOString() : text(row.updated_at),
        kind: "message",
      })),
    },
  }),
  spec("stripe", "Stripe", "crm", "支付与客户。", "Feed 拉支付与客户", {
    token_label: "Stripe Secret Key",
    token_placeholder: "sk_live_… 或 sk_test_…",
    auth_help: "Stripe secret key。只读 account 与 events。不要把密钥提交到 Git。",
    permission_host: "api.stripe.com",
    identity: {
      request: (ctx) => get("https://api.stripe.com/v1/account", bearer(ctx)),
      read: (json) => text(asRecord(json)?.display_name, asRecord(json)?.email, asRecord(json)?.id) || "Stripe",
    },
    feed: {
      request: (ctx) => get("https://api.stripe.com/v1/events?limit=20", bearer(ctx)),
      read: (json) => mapList(asRecord(json)?.data, "stripe", (row) => item({
        externalId: `stripe-${text(row.id)}`,
        title: text(row.type) || "Stripe 事件",
        occurredAt: typeof row.created === "number" ? new Date(row.created * 1000).toISOString() : undefined,
      })),
    },
  }),
  spec("x", "X", "social", "帖子与账号。", "Feed 拉帖子与账号", {
    token_label: "X Bearer / User Token",
    token_placeholder: "AAAA…",
    auth_help: "不要贴开发者后台的 App-Only Bearer（/users/me 会 403）。需要 OAuth 2.0 User Access Token（PKCE）或用户上下文令牌，权限 tweet.read、users.read。开放接口按套餐计费，失败时是 live 错误不是占位。",
    permission_host: "api.x.com",
    identity: {
      request: (ctx) => get("https://api.x.com/2/users/me", bearer(ctx)),
      read: (json, ctx) => {
        const data = asRecord(asRecord(json)?.data) ?? asRecord(json);
        const name = text(data?.username, data?.name);
        if (text(data?.id)) ctx.extra.user_id = text(data?.id);
        return name ? `@${name.replace(/^@/, "")}` : "X";
      },
    },
    feed: {
      request: (ctx) => get(`https://api.x.com/2/users/${encodeURIComponent(ctx.extra.user_id || "me")}/tweets?max_results=20`, bearer(ctx)),
      read: (json) => mapList(asRecord(json)?.data, "x", (row) => item({
        externalId: `x-${text(row.id)}`,
        title: text(row.text)?.slice(0, 80) || "X 帖子",
        url: text(row.id) ? `https://x.com/i/web/status/${text(row.id)}` : undefined,
        occurredAt: text(row.created_at),
        kind: "message",
      })),
    },
  }),
  spec("linkedin", "LinkedIn", "social", "职业社交。", "Feed 拉职业动态", {
    token_label: "LinkedIn 访问令牌",
    token_placeholder: "AQX…",
    auth_help: "LinkedIn OpenID 会员令牌（openid profile）。identity 打官方 /v2/userinfo。帖子列表要 Community Management 权限，多数开发者应用会 403，连接仍以 userinfo 成功为准。",
    permission_host: "api.linkedin.com",
    identity: {
      request: (ctx) => get("https://api.linkedin.com/v2/userinfo", bearer(ctx)),
      read: (json) => text(asRecord(json)?.name, asRecord(json)?.email, asRecord(json)?.sub) || "LinkedIn",
    },
    feed: {
      request: (ctx) => get("https://api.linkedin.com/v2/userinfo", bearer(ctx)),
      read: (json) => {
        const name = text(asRecord(json)?.name, asRecord(json)?.email);
        if (!name) return [];
        return [item({
          externalId: `linkedin-${text(asRecord(json)?.sub, name)}`,
          title: `${name} · LinkedIn 账号`,
          summary: "已验证 OpenID 身份。",
        })];
      },
    },
  }),
];

function nestedTextList(record: Record<string, unknown> | null, path: string[]): unknown {
  let current: unknown = record;
  for (const key of path) {
    const next = asRecord(current);
    if (!next) return current;
    current = next[key];
  }
  return current;
}

function discordHeaders(ctx: CatalogAuthContext): Record<string, string> {
  const token = ctx.accessToken.startsWith("Bot ") ? ctx.accessToken : `Bot ${ctx.accessToken}`;
  return { Authorization: token, "User-Agent": USER_AGENT };
}

function clickupHeaders(ctx: CatalogAuthContext): Record<string, string> {
  return { Authorization: ctx.accessToken, Accept: "application/json", "User-Agent": USER_AGENT };
}

function mondayHeaders(ctx: CatalogAuthContext): Record<string, string> {
  const token = ctx.accessToken.replace(/^Bearer\s+/iu, "");
  return {
    Authorization: token,
    Accept: "application/json",
    "Content-Type": "application/json",
    "API-Version": "2024-10",
    "User-Agent": USER_AGENT,
  };
}

function adobeUserinfoUrl(ctx: CatalogAuthContext): string {
  const clientId = text(ctx.extra.api_key);
  const base = "https://ims-na1.adobelogin.com/ims/userinfo/v2";
  return clientId ? `${base}?client_id=${encodeURIComponent(clientId)}` : base;
}

function jiraHost(ctx: CatalogAuthContext): string {
  return (ctx.extra.site ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function jiraHeaders(ctx: CatalogAuthContext): Record<string, string> {
  const basic = Buffer.from(`${ctx.extra.email}:${ctx.accessToken}`).toString("base64");
  return { Authorization: `Basic ${basic}`, Accept: "application/json", "User-Agent": USER_AGENT };
}

function parseBitbucketToken(raw: string): CatalogAuthContext {
  if (raw.includes(":") && !raw.startsWith("http")) {
    const ctx = splitParts(raw, ":", 2, ["username", "token"]);
    ctx.extra.basic = Buffer.from(`${ctx.extra.username}:${ctx.accessToken}`).toString("base64");
    return ctx;
  }
  return tokenContext(raw);
}

function bitbucketHeaders(ctx: CatalogAuthContext): Record<string, string> {
  if (ctx.extra.basic) {
    return { Authorization: `Basic ${ctx.extra.basic}`, Accept: "application/json", "User-Agent": USER_AGENT };
  }
  return bearer(ctx);
}

function parseAdobeToken(raw: string): CatalogAuthContext {
  if (raw.includes("|")) return splitParts(raw, "|", 2, ["api_key", "token"]);
  return tokenContext(raw);
}

function adobeApiKey(ctx: CatalogAuthContext): Record<string, string> {
  return ctx.extra.api_key ? { "X-Api-Key": ctx.extra.api_key } : {};
}

function salesforceInstance(ctx: CatalogAuthContext): string {
  const raw = (ctx.extra.instance ?? "").replace(/\/$/, "");
  if (!raw) return "";
  return /^https?:\/\//iu.test(raw) ? raw : `https://${raw}`;
}

export const CATALOG_CONNECTORS: readonly CatalogConnectorSpec[] = CATALOG.map((entry) => ({
  ...entry,
  setup_links: setupLinksFor(entry.id),
}));

const BY_ID = new Map(CATALOG_CONNECTORS.map((entry) => [entry.id, entry]));

export function isCatalogConnectorId(id: string): boolean {
  return BY_ID.has(id);
}

export function getCatalogSpec(id: string): CatalogConnectorSpec {
  const spec = BY_ID.get(id);
  if (!spec) throw new Error(`unsupported_catalog_connector:${id}`);
  return spec;
}

export function catalogConnectorIds(): readonly string[] {
  return CATALOG_CONNECTORS.map((entry) => entry.id);
}
