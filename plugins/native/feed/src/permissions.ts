import { HOST_CONNECTIONS_OBSERVE_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin-events";
import { PLUGIN_EVIDENCE_COLLECT_PERMISSION } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import type { PluginPermissionDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * Every permission of Feed's Manifest. Required collection/read permissions stay independent of the optional Functions management grant.
 * Feed's two instances retain their own grants; Home also caps the project's optional permission (specs/archive/dual-instance-plugins, U1).
 * The gate reads this literal list. `tests/feed-runtime-plugin.test.ts` holds it to the actions, jobs and services, so a new permission
 * cannot be used without being listed here.
 */
export const FEED_PERMISSIONS: PluginPermissionDeclaration[] = [
  { permission: "feed:read", required: true, reason: "读取 Feed 里的来源、消息和捕捉规则", reason_text: { key: "feed.permission.feed-read.reason" } },
  { permission: "feed:write", required: true, reason: "管理 Feed 来源、捕捉规则和消息去向", reason_text: { key: "feed.permission.feed-write.reason" } },
  { permission: "goals:read", required: false, reason: "可选：读取与目标关联的消息正文或把消息转为目标", reason_text: { key: "feed.permission.goals-read.reason" } },
  { permission: "goals:write", required: false, reason: "可选：把 Feed 消息转为项目目标", reason_text: { key: "feed.permission.goals-write.reason" } },
  { permission: "model:invoke", required: true, reason: "在筛选和整理 Feed 消息时调用模型", reason_text: { key: "feed.permission.model-invoke.reason" } },
  { permission: "inbox:read", required: true, reason: "读取这个项目里的 Inbox 事项", reason_text: { key: "feed.permission.inbox-read.reason" } },
  { permission: "inbox:write", required: true, reason: "把值得留意的消息加入或移出 Inbox", reason_text: { key: "feed.permission.inbox-write.reason" } },
  { permission: "storage:private", required: true, reason: "保存这个项目的来源、消息和捕捉规则", reason_text: { key: "feed.permission.storage-private.reason" } },
  { permission: "attention:read", required: true, reason: "读取这个项目的 Inbox 事项状态", reason_text: { key: "feed.permission.attention-read.reason" } },
  { permission: "attention:write", required: true, reason: "把消息加入或移出这个项目的 Inbox", reason_text: { key: "feed.permission.attention-write.reason" } },
  { permission: "context-ledger:read", required: true, reason: "读取消息与目标之间的关联记录", reason_text: { key: "feed.permission.context-ledger-read.reason" } },
  { permission: "context-ledger:write", required: true, reason: "记下消息与目标之间的关联", reason_text: { key: "feed.permission.context-ledger-write.reason" } },
  { permission: "artifact:write", required: true, reason: "把捕捉规则选中的消息存进成果库", reason_text: { key: "feed.permission.artifact-write.reason" } },
  { permission: "journal:project", required: true, reason: "把消息的处理变化记进项目历史", reason_text: { key: "feed.permission.journal-project.reason" } },
  { permission: "evidence:read", required: true, reason: "读取本地留存的消息原始正文", reason_text: { key: "feed.permission.evidence-read.reason" } },
  { permission: PLUGIN_EVIDENCE_COLLECT_PERMISSION, required: true, reason: "清理本机已没有任何项目引用的旧消息正文", reason_text: { key: "feed.permission.evidence-collect.reason" } },
  { permission: "plugins:read", required: true, reason: "核对哪些项目启用了 Feed，避免误删仍在使用的留存正文", reason_text: { key: "feed.permission.plugins-read.reason" } },
  { permission: "sources:pull_public_feed", required: true, reason: "按公开订阅目录识别来源并拉取公开订阅源", reason_text: { key: "feed.permission.sources-pull-feed.reason" } },
  { permission: "sources:pull_query", required: true, reason: "拉取你设定的网页查询来源", reason_text: { key: "feed.permission.sources-pull-query.reason" } },
  { permission: "sources:read_repository", required: true, reason: "读取 GitHub 研究库里发布的内容", reason_text: { key: "feed.permission.sources-read-repository.reason" } },
  { permission: "schedule:read", required: true, reason: "查看来源是否已设好定时拉取", reason_text: { key: "feed.permission.schedule-read.reason" } },
  { permission: "schedule:write", required: true, reason: "设置按固定间隔自动拉取到期来源", reason_text: { key: "feed.permission.schedule-write.reason" } },
  { permission: "actions:invoke", required: true, reason: "登记和释放本机留存的消息正文引用", reason_text: { key: "feed.permission.actions-invoke.reason" } },
  { permission: "scenes:use", required: true, reason: "绑定并运行捕捉规则的判断场景", reason_text: { key: "feed.permission.scenes-use.reason" } },
  { permission: "judgments:read", required: true, reason: "读取捕捉规则的判断记录", reason_text: { key: "feed.permission.judgments-read.reason" } },
  { permission: "judgments:write", required: true, reason: "保存捕捉规则的判断结果", reason_text: { key: "feed.permission.judgments-write.reason" } },
  { permission: "functions:manage", required: false, reason: "可选：在来源规则里新建、修改、试跑和发布判断规则，可在权限设置关闭", reason_text: { key: "feed.permission.functions-manage.reason" } },
  { permission: "functions:invoke", required: true, reason: "按你的权限，为新进入 Inbox 的 Feed 消息运行下一步判断规则", reason_text: { key: "feed.permission.functions-invoke.reason" } },
  { permission: "actions:delegate", required: true, reason: "按你的权限请 Inbox 和首页判断下一步，并读取已发布的判断规则", reason_text: { key: "feed.permission.actions-delegate.reason" } },
  { permission: "connections:use", required: true, reason: "检查你为账号来源选好的账号当前是否可用", reason_text: { key: "feed.permission.connections-use.reason" } },
  { permission: "sources:pull_connector", required: true, reason: "用你为账号来源选好的账号拉取新消息", reason_text: { key: "feed.permission.sources-pull-connector.reason" } },
  { permission: HOST_CONNECTIONS_OBSERVE_PERMISSION, required: true, reason: "在账号连接状态变化时及时同步账号来源状态", reason_text: { key: "feed.permission.connections-observe.reason" } },
];
