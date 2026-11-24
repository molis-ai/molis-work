import { platformErrorKind, type ActionErrorKind } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse, type ActionErrorBody } from "@molis-ai/molis-work-plugin-sdk";
import { say } from "@molis-ai/molis-work-plugin-sdk/ui";
import { hasHostUiText } from "./ui-text-provider.js";
import { activeLocale, DEFAULT_WEB_LOCALE, pageLocale } from "./web-locale.js";

// Centralized Host error localization & sanitization edge (Wave 1 trilingual governance).
// Layer 1 maps structured ActionError code / kind / HTTP status to `common.error.*`.
// Layer 2 detects technical/raw/opposite-language leaks (Prologue codes, SYNC_*, AJV pointers,
// raw driver/network/OS paths, horizontal/account English messages in zh/ja, Chinese in en/ja)
// and replaces them cleanly while preserving `code`, `details`, and `call_id` / `diagnostic_id`.

interface TrilingualFallback {
  readonly zh: string;
  readonly en: string;
  readonly ja: string;
}

const ERROR_FALLBACKS = {
  "common.error.invalid": {
    zh: "填写的内容还不完整或格式不对，检查后再试一次。",
    en: "Some details are missing or look off. Check your input and try again.",
    ja: "入力内容が不足しているか、形式が正しくありません。確認してからもう一度お試しください。",
  },
  "common.error.forbidden": {
    zh: "当前没有这项操作的权限，可以在设置里检查授权。",
    en: "You don’t have permission for this action right now. Check your settings to update access.",
    ja: "この操作を行う権限がありません。設定で権限を確認してください。",
  },
  "common.error.not-found": {
    zh: "找不到这项内容，可能已被删除或移动。",
    en: "Couldn’t find this item. It may have been deleted or moved.",
    ja: "対象が見つかりませんでした。削除されたか、移動された可能性があります。",
  },
  "common.error.conflict": {
    zh: "这项内容刚刚有更新，刷新页面核对后再试一次。",
    en: "This item just changed. Refresh to check the latest state and try again.",
    ja: "内容が更新されたばかりです。ページを更新して確認してから、もう一度お試しください。",
  },
  "common.error.too-large": {
    zh: "提交的内容超过大小上限，精简后再试一次。",
    en: "This content is over the size limit. Trim it down and try again.",
    ja: "内容がサイズ上限を超えています。量を減らしてからもう一度お試しください。",
  },
  "common.error.rate-limited": {
    zh: "操作太频繁了，稍等一会儿再试即可。",
    en: "Too many requests right now. Wait a moment and try again.",
    ja: "リクエストが集中しています。少し待ってからもう一度お試しください。",
  },
  "common.error.cancelled": {
    zh: "操作已取消，未完成的改动不会生效。",
    en: "Canceled. Unfinished changes weren’t applied.",
    ja: "操作はキャンセルされました。完了していない変更は反映されません。",
  },
  "common.error.internal": {
    zh: "这次没能完成，请稍后再试。",
    en: "Couldn’t complete that right now. Please try again.",
    ja: "処理を完了できませんでした。少し待ってからもう一度お試しください。",
  },
  "common.error.upstream": {
    zh: "外部服务暂时没能正常回应，已有内容都保留着，稍后再试即可。",
    en: "The connected service didn’t respond as expected. Your content is safe — try again in a moment.",
    ja: "外部サービスから正常な応答がありませんでした。入力内容はそのまま残っていますので、少し待ってからもう一度お試しください。",
  },
  "common.error.unavailable": {
    zh: "这项服务暂时不可用，已有内容都保留着，稍后再试一次即可。",
    en: "This service is temporarily unavailable. Your content is safe — try again in a moment.",
    ja: "このサービスは一時的に利用できません。入力内容はそのまま残っていますので、少し待ってからもう一度お試しください。",
  },
  "common.error.timeout": {
    zh: "等待响应超时了，刷新核对后再试一次。",
    en: "That took too long to respond. Refresh to check and try again.",
    ja: "応答がタイムアウトしました。更新して状態を確認してから、もう一度お試しください。",
  },
  "common.error.account-session-expired": {
    zh: "登录已过期，重新登录后就可以继续。",
    en: "Your session expired. Sign in again to continue.",
    ja: "ログインの有効期限が切れました。もう一度ログインすると続行できます。",
  },
  "common.error.account-service-unavailable": {
    zh: "暂时连不上账号服务，本地工作不受影响，稍后再试即可。",
    en: "Can’t reach the account service right now. Your local work is safe — try again in a moment.",
    ja: "アカウントサービスに一時的に接続できません。ローカルの作業には影響しませんので、少し待ってからもう一度お試しください。",
  },
  "common.error.account-busy": {
    zh: "另一个账号操作还在进行中，请先在原页面完成或取消。",
    en: "Another account action is already in progress. Finish or cancel it on the original page first.",
    ja: "別のアカウント操作が進行中です。元のページで完了またはキャンセルしてください。",
  },
  "common.error.account-config-incomplete": {
    zh: "账号服务配置还不完整，请检查当前环境设置后再试。",
    en: "Account settings aren’t complete yet. Check your environment configuration and try again.",
    ja: "アカウントサービスの設定が完了していません。環境設定を確認してからもう一度お試しください。",
  },
  "common.error.account-config-missing-env": {
    zh: "当前未配置账号服务环境（缺少 MOLIS_WORK_ACCOUNT_CONFIG）。本地测试请使用账号环境启动脚本，或联系管理员提供专用测试配置。",
    en: "Account environment isn’t configured yet (missing MOLIS_WORK_ACCOUNT_CONFIG). Use the account launch script for local testing, or ask your admin for a test configuration.",
    ja: "アカウントサービス環境がまだ設定されていません（MOLIS_WORK_ACCOUNT_CONFIG がありません）。ローカルテストにはアカウント環境起動スクリプトを使用するか、管理者にテスト設定を依頼してください。",
  },
  "common.error.account-config-invalid-env": {
    zh: "账号服务环境配置格式无效，请检查 MOLIS_WORK_ACCOUNT_CONFIG。",
    en: "The account environment configuration format isn’t valid. Check MOLIS_WORK_ACCOUNT_CONFIG.",
    ja: "アカウントサービス環境の設定形式が正しくありません。MOLIS_WORK_ACCOUNT_CONFIG を確認してください。",
  },
  "common.error.account-credential-store": {
    zh: "本机凭据存储暂时不可用，请检查系统钥匙串或凭据存储权限后再试。",
    en: "Local credential storage isn’t available right now. Check your system keychain or storage permissions and try again.",
    ja: "ローカルの認証情報ストレージを利用できません。キーチェーンやストレージの権限を確認してからもう一度お試しください。",
  },
  "common.error.account-changed": {
    zh: "当前空间已经切换，刷新页面后就可以继续。",
    en: "Your workspace space changed. Refresh the page to continue.",
    ja: "スペースが切り替わりました。ページを更新すると続行できます。",
  },
  "common.error.account-not-ready": {
    zh: "账号环境还在准备中，稍等一会儿再试即可。",
    en: "Your account space is still getting ready. Try again in a moment.",
    ja: "アカウント環境の準備中です。少し待ってからもう一度お試しください。",
  },
  "common.error.account-switching": {
    zh: "账号正在切换，稍等片刻即可。",
    en: "Switching accounts — just a moment.",
    ja: "アカウントを切り替えています。少々お待ちください。",
  },
  "common.error.account-page-expired": {
    zh: "页面会话已失效，刷新页面后再试一次。",
    en: "This page session expired. Refresh the page and try again.",
    ja: "ページのセッションが切れました。ページを更新してからもう一度お試しください。",
  },
  "common.error.account-local-only-disabled": {
    zh: "当前安装使用已登录账号空间，不能切换匿名工作区。",
    en: "This installation uses your signed-in account space and can’t switch to an anonymous workspace.",
    ja: "この環境ではログイン中のアカウントスペースのみ使用でき、匿名ワークスペースには切り替えられません。",
  },
  "common.error.sync-unavailable": {
    zh: "同步暂时不可用，本地改动都保留着，稍后再试即可。",
    en: "Sync is temporarily unavailable. Your local changes are safe — try again in a moment.",
    ja: "同期が一時的に利用できません。ローカルの変更はそのまま残っていますので、少し待ってからもう一度お試しください。",
  },
  "common.error.sync-personal-required": {
    zh: "请先切换到个人空间，再进行同步或复制。",
    en: "Switch to your personal space before syncing or copying projects.",
    ja: "同期やコピーを行う前に、パーソナルスペースへ切り替えてください。",
  },
  "common.error.sync-quota-exceeded": {
    zh: "云端同步空间已满，清理不再需要的内容后再试。",
    en: "Your cloud sync storage is full. Free up some space and try again.",
    ja: "クラウド同期の容量がいっぱいです。不要なデータを整理してからもう一度お試しください。",
  },
  "common.error.sync-rate-limited": {
    zh: "同步请求太频繁了，已有内容都保留着，稍等一会儿再试。",
    en: "Sync is being rate-limited right now. Your changes are safe — try again in a moment.",
    ja: "同期リクエストが制限に達しました。変更内容はそのまま残っていますので、少し待ってからもう一度お試しください。",
  },
  "common.error.sync-purge-disabled": {
    zh: "永久清理暂未开放，保留的内容仍会正常保存在云端。",
    en: "Permanent cleanup isn’t available right now. Kept items remain safely stored in the cloud.",
    ja: "完全削除は現在利用できません。保持されている項目はクラウドに安全に残っています。",
  },
  "common.error.sync-confirm-purge": {
    zh: "请先确认后再执行永久清理。",
    en: "Confirm before permanently deleting these items.",
    ja: "完全削除を実行する前に確認してください。",
  },
  "common.error.sync-read-only": {
    zh: "这项同步内容目前是只读状态，暂时无法修改。",
    en: "This synced item is read-only right now and can’t be changed.",
    ja: "この同期項目は現在読み取り専用のため、変更できません。",
  },
  "common.error.sync-conflict-review": {
    zh: "请先查看最新的冲突版本，再选择要保留的内容。",
    en: "Review the latest conflict version first, then choose which copy to keep.",
    ja: "最新の競合バージョンを確認してから、残す内容を選択してください。",
  },
  "common.error.plugin-disabled": {
    zh: "这个插件在当前项目还没有开启，到「插件市场」开启后就能使用。",
    en: "This plugin is turned off in this project. Enable it in the Plugin market to use it.",
    ja: "このプラグインはこのプロジェクトでオフになっています。プラグインマーケットで有効にすると使えます。",
  },
  "common.error.plugin-unavailable": {
    zh: "这个插件暂时没在运行，稍等或重新开启后再试。",
    en: "This plugin isn’t running right now. Wait a moment or re-enable it and try again.",
    ja: "このプラグインは現在停止しています。少し待つか、再度有効にしてからお試しください。",
  },
  "common.error.connection-required": {
    zh: "需要先完成连接或重新授权，才能继续这项操作。",
    en: "Connect or reauthorize this service before continuing.",
    ja: "続行するには、このサービスの接続または再認証が必要です。",
  },
  "common.error.upgrade-in-progress": {
    zh: "Molis Work 正在升级数据，稍等片刻后会自动恢复。",
    en: "Molis Work is upgrading your data. It’ll be back in a moment.",
    ja: "Molis Work のデータをアップグレードしています。完了まで少しお待ちください。",
  },
  "common.error.storage-busy": {
    zh: "数据正被另一个窗口或进程占用，稍后再试一次即可。",
    en: "Your data is currently in use by another window or process. Try again in a moment.",
    ja: "別のウィンドウまたはプロセスがデータを使用中です。少し待ってからもう一度お試しください。",
  },
  "common.error.storage-no-space": {
    zh: "磁盘可用空间不足，腾出一些空间后再试。",
    en: "Not enough disk space available. Free up some space and try again.",
    ja: "ディスクの空き容量が不足しています。空き容量を確保してからもう一度お試しください。",
  },
  "common.error.outcome-unknown": {
    zh: "暂时不确定这次操作有没有完成，请先刷新核对，系统不会自动重做。",
    en: "Couldn’t confirm whether that finished. Refresh to check — it won’t be retried automatically.",
    ja: "操作が完了したか確認できませんでした。自動再実行は行われませんので、更新して状態を確認してください。",
  },
  "common.error.method-not-allowed": {
    zh: "这个入口不支持当前的请求方式。",
    en: "This endpoint doesn’t support that request method.",
    ja: "このエンドポイントでは現在のリクエスト方法は利用できません。",
  },
  "common.error.endpoint-not-found": {
    zh: "找不到对应的功能入口，刷新页面后再试一次。",
    en: "Couldn’t find that endpoint. Refresh the page and try again.",
    ja: "対応する機能が見つかりませんでした。ページを更新してからもう一度お試しください。",
  },
  "common.error.stream-overflow": {
    zh: "返回的进度信息超过上限，已停止接收。",
    en: "Progress updates exceeded the limit, so streaming stopped.",
    ja: "進捗データの上限を超えたため、受信を停止しました。",
  },
  "common.error.service-stopping": {
    zh: "工作台正在关闭，稍后再重新连接。",
    en: "Molis Work is closing. Reconnect in a moment.",
    ja: "Molis Work を終了しています。少し待ってから再接続してください。",
  },
  "common.error.browser-no-page": {
    zh: "侧栏浏览器还没有打开页面。",
    en: "No page is open in the side-panel browser yet.",
    ja: "サイドパネルのブラウザーでページがまだ開かれていません。",
  },
  "common.error.browser-file-too-large": {
    zh: "选择的文件超过了 64 MB 上限，精简后再试一次。",
    en: "The selected files exceed the 64 MB limit. Choose smaller files and try again.",
    ja: "選択したファイルが 64 MB の上限を超えています。サイズを小さくしてもう一度お試しください。",
  },
  "common.error.browser-download-missing": {
    zh: "这个下载不存在，或者还没下载完成。",
    en: "This download isn’t available or hasn’t finished yet.",
    ja: "このダウンロードは存在しないか、まだ完了していません。",
  },
  "common.error.browser-auth-failed": {
    zh: "本地浏览器连接校验没通过，请刷新页面后重试。",
    en: "Browser connection check failed. Refresh the page and try again.",
    ja: "ブラウザー接続の確認に失敗しました。ページを更新してからもう一度お試しください。",
  },
  "common.error.project-rename-stale": {
    zh: "项目名称信息已过期，请重新打开项目设置后再保存。",
    en: "Project name info is out of date. Reopen Project settings before saving.",
    ja: "プロジェクト名の情報が古くなっています。プロジェクト設定を開き直してから保存してください。",
  },
  "common.error.model-auth": {
    zh: "模型的密钥无效或已过期，到「设置 › 模型」检查一下就可以继续。",
    en: "Your model key isn’t valid or has expired. Check Settings › Models to continue.",
    ja: "モデルのキーが無効か期限切れです。「設定 › モデル」で確認すると続行できます。",
  },
  "common.error.model-rate-limit": {
    zh: "模型服务暂时有点忙，已有内容都保留着，稍等一会儿再试即可。",
    en: "The model service is busy right now. Your content is safe — try again in a moment.",
    ja: "モデルサービスが混み合っています。入力内容はそのまま残っていますので、少し待ってからもう一度お試しください。",
  },
  "common.error.model-unavailable": {
    zh: "模型服务暂时连不上，已有内容都保留着，稍后再试一次即可。",
    en: "The model service is temporarily unavailable. Your content is safe — try again in a moment.",
    ja: "モデルサービスに一時的に接続できません。入力内容はそのまま残っていますので、少し待ってからもう一度お試しください。",
  },
  "common.error.model-network": {
    zh: "连不上模型服务，已有内容都保留着。检查一下网络或「设置 › 模型」里的地址就可以继续。",
    en: "Couldn’t reach the model service. Your content is safe — check your network and Settings › Models to continue.",
    ja: "モデルサービスに接続できませんでした。入力内容はそのまま残っていますので、ネットワークと「設定 › モデル」のアドレスを確認してください。",
  },
  "common.error.model-context-overflow": {
    zh: "这次对话内容超出了模型一次能读完的长度，已有内容都保留着。可以新开一项工作，或精简材料后再试。",
    en: "This conversation exceeds the model’s length limit. Your content is safe — start a new work or trim the materials and try again.",
    ja: "会話の内容がモデルの入力上限を超えました。これまでの内容は残っていますので、新しいワークを開くか資料を絞ってからお試しください。",
  },
  "common.error.model-refused": {
    zh: "模型拒绝处理这次请求，已有内容都保留着。可以调整表述后再试。",
    en: "The model declined this request. Your content is safe — try rephrasing and sending again.",
    ja: "モデルがこのリクエストへの応答を見送りました。内容はそのまま残っていますので、表現を変えてもう一度お試しください。",
  },
  "common.error.model-output-truncated": {
    zh: "模型这次回复超过了单次输出长度，已有内容都保留着。发送「继续」可以接着生成。",
    en: "The reply reached the single-response length limit. What was written is kept — say “Continue” to keep going.",
    ja: "1回の応答の長さ上限に達しました。生成された内容はそのまま残っています。「続けて」と送ると続きを生成できます。",
  },
  "common.error.model-failed": {
    zh: "模型服务返回了异常结果，已有内容都保留着，稍后再试一次即可。",
    en: "The model service returned an unexpected response. Your content is safe — try again in a moment.",
    ja: "モデルサービスから予期しない応答が返りました。内容はそのまま残っていますので、少し待ってからもう一度お試しください。",
  },
} as const satisfies Readonly<Record<string, TrilingualFallback>>;

export type CommonErrorKey = keyof typeof ERROR_FALLBACKS;

const KIND_KEYS: Readonly<Record<ActionErrorKind, CommonErrorKey>> = {
  invalid: "common.error.invalid",
  forbidden: "common.error.forbidden",
  not_found: "common.error.not-found",
  conflict: "common.error.conflict",
  too_large: "common.error.too-large",
  rate_limited: "common.error.rate-limited",
  cancelled: "common.error.cancelled",
  internal: "common.error.internal",
  upstream: "common.error.upstream",
  unavailable: "common.error.unavailable",
  timeout: "common.error.timeout",
};

const CODE_KEYS: Readonly<Record<string, CommonErrorKey>> = {
  // Platform codes (strictly validated against ACTION_ERROR_KINDS)
  "actions.input_invalid": "common.error.invalid",
  "actions.input_too_large": "common.error.too-large",
  "actions.forbidden": "common.error.forbidden",
  "actions.scope_mismatch": "common.error.forbidden",
  "actions.owner_mismatch": "common.error.forbidden",
  "actions.plugin_permission": "common.error.forbidden",
  "actions.home_mismatch": "common.error.forbidden",
  "actions.unauthenticated": "common.error.forbidden",
  "actions.plugin_disabled": "common.error.plugin-disabled",
  "actions.missing": "common.error.not-found",
  "actions.binding_missing": "common.error.not-found",
  "actions.scene_missing": "common.error.not-found",
  "actions.recommendation_missing": "common.error.not-found",
  "actions.subject_unavailable": "common.error.not-found",
  "actions.conflict": "common.error.conflict",
  "actions.subject_changed": "common.error.conflict",
  "actions.rate_limited": "common.error.rate-limited",
  "actions.cancelled": "common.error.cancelled",
  "actions.timeout": "common.error.timeout",
  "actions.connection_required": "common.error.connection-required",
  "actions.connection_unavailable": "common.error.connection-required",
  "actions.reauthorize": "common.error.connection-required",
  "actions.binding_required": "common.error.connection-required",
  "actions.binding_disabled": "common.error.connection-required",
  "actions.plugin_unavailable": "common.error.plugin-unavailable",
  "actions.service_unavailable": "common.error.unavailable",
  "actions.unavailable": "common.error.unavailable",
  "actions.host_closed": "common.error.unavailable",
  "actions.delivery_unknown": "common.error.upstream",
  "actions.outcome_unknown": "common.error.outcome-unknown",
  "actions.execution_failed": "common.error.internal",
  "files.too_large": "common.error.too-large",
  // Account & space codes (horizontal/account is upstream English — always localized at Host exit)
  "account.login_required": "common.error.account-session-expired",
  "account.invalid_configuration": "common.error.account-config-incomplete",
  "account.unavailable": "common.error.account-service-unavailable",
  "account.conflict": "common.error.conflict",
  "account.rate_limited": "common.error.rate-limited",
  "account.forbidden": "common.error.forbidden",
  "account.not_found": "common.error.not-found",
  "account.invalid_request": "common.error.invalid",
  "account.upstream_invalid": "common.error.upstream",
  "account.cancelled": "common.error.cancelled",
  "account.timeout": "common.error.timeout",
  "space.changed": "common.error.account-changed",
  "space.unavailable": "common.error.account-not-ready",
  // Storage, host, IM, sandbox, connector, sync codes
  "storage.upgrade_in_progress": "common.error.upgrade-in-progress",
  "storage.owner.busy": "common.error.storage-busy",
  "storage.upgrade_no_space": "common.error.storage-no-space",
  "host.request_path_invalid": "common.error.invalid",
  "im.stopping": "common.error.service-stopping",
  "im.server.host_denied": "common.error.forbidden",
  "im.server.catalog_unavailable": "common.error.unavailable",
  "sandbox.storage_unavailable": "common.error.unavailable",
  "sandbox.storage_unsupported": "common.error.unavailable",
  "sandbox.storage_conflict": "common.error.conflict",
  "connector.check.rate_limited": "common.error.rate-limited",
  "connector.read.refused": "common.error.upstream",
  "connector.read.unreachable": "common.error.upstream",
  "connector.read.answered": "common.error.upstream",
};

const ALWAYS_LOCALIZE_CODES = new Set<string>([
  "space.changed",
  "space.unavailable",
  "storage.upgrade_in_progress",
  "storage.owner.busy",
  "storage.upgrade_no_space",
  "im.stopping",
  "im.server.host_denied",
  "im.server.catalog_unavailable",
  "sandbox.storage_unavailable",
  "sandbox.storage_unsupported",
  "sandbox.storage_conflict",
]);

export function baseLanguageOf(locale: string | null | undefined): "zh" | "en" | "ja" {
  const base = locale?.trim().toLowerCase().split("-")[0];
  if (base === "zh") return "zh";
  if (base === "ja") return "ja";
  return "en";
}

function fallbackFor(key: CommonErrorKey, locale: string | null | undefined): string {
  const entry = ERROR_FALLBACKS[key];
  const base = locale ? baseLanguageOf(locale) : baseLanguageOf(DEFAULT_WEB_LOCALE);
  return entry[base];
}

export function readErrorWord(key: CommonErrorKey, localeOverride?: string | null): string {
  const locale = localeOverride ?? activeLocale() ?? pageLocale() ?? DEFAULT_WEB_LOCALE;
  const fallback = fallbackFor(key, locale);
  if (hasHostUiText()) {
    return say.text({ owner: "workbench", key, fallback }, { locale });
  }
  return fallback;
}

export function statusToErrorKey(status: number): CommonErrorKey {
  if (status === 401) return "common.error.account-session-expired";
  if (status === 403) return "common.error.forbidden";
  if (status === 404) return "common.error.not-found";
  if (status === 405) return "common.error.method-not-allowed";
  if (status === 408 || status === 504) return "common.error.timeout";
  if (status === 409) return "common.error.conflict";
  if (status === 413) return "common.error.too-large";
  if (status === 429) return "common.error.rate-limited";
  if (status === 499) return "common.error.cancelled";
  if (status === 502) return "common.error.upstream";
  if (status === 503) return "common.error.unavailable";
  if (status >= 400 && status < 500) return "common.error.invalid";
  return "common.error.internal";
}

/**
 * Layer 2 detector: recognizes raw technical strings (Prologue error codes, SYNC_*, AJV schema paths,
 * raw network/driver/OS errors, stack traces, file paths, hardcoded fallback) and maps them to a warm
 * `common.error.*` key. Returns null when the message is already clean user-facing prose.
 */
export function classifyTechnicalMessage(message: string): CommonErrorKey | null {
  const trimmed = message.trim();
  if (!trimmed || trimmed === "能力执行失败") return "common.error.internal";

  // Prologue / model codes
  if (/\bMODEL_AUTH\b/u.test(trimmed) || (/\bMODEL_HTTP_ERROR\b/u.test(trimmed) && /\b(?:401|403)\b/u.test(trimmed))) {
    return "common.error.model-auth";
  }
  if (/\bMODEL_RATE_LIMITED\b/u.test(trimmed) || (/\bMODEL_HTTP_ERROR\b/u.test(trimmed) && /\b(?:429|529)\b/u.test(trimmed))) {
    return "common.error.model-rate-limit";
  }
  if (/\b(?:MODEL_CONTEXT_OVERFLOW|CONTEXT_BUDGET_EXCEEDED)\b/u.test(trimmed)) {
    return "common.error.model-context-overflow";
  }
  if (/\bMODEL_NETWORK_FAILED\b/u.test(trimmed)) {
    return "common.error.model-network";
  }
  if (/\bMODEL_REFUSED\b/u.test(trimmed)) {
    return "common.error.model-refused";
  }
  if (/\bMODEL_OUTPUT_TRUNCATED\b/u.test(trimmed)) {
    return "common.error.model-output-truncated";
  }
  if (/\bMODEL_UNAVAILABLE\b/u.test(trimmed) || (/\bMODEL_HTTP_ERROR\b/u.test(trimmed) && /\b50[0234]\b/u.test(trimmed))) {
    return "common.error.model-unavailable";
  }
  if (/\b(?:MODEL|AGENT|CONTEXT|RUN|TOOL|EFFECT|RUNTIME)_[A-Z0-9_]+\b/u.test(trimmed) || /\bMEMORY_SCOPE_DENIED\b/u.test(trimmed)) {
    return "common.error.model-failed";
  }

  // Sync & login codes
  if (/\bSYNC_RATE_LIMITED\b/u.test(trimmed)) return "common.error.sync-rate-limited";
  if (/\b(?:SYNC_QUOTA_EXCEEDED|QUOTA_EXCEEDED)\b/u.test(trimmed)) return "common.error.sync-quota-exceeded";
  if (/\bSYNC_READ_ONLY\b/u.test(trimmed)) return "common.error.sync-read-only";
  if (/\bSYNC_[A-Z0-9_]+\b/u.test(trimmed)) return "common.error.sync-unavailable";
  if (/\bLOGIN_REQUIRED\b/u.test(trimmed)) return "common.error.account-session-expired";
  if (/\bLOGIN_CANCELLED\b/u.test(trimmed)) return "common.error.cancelled";

  // AJV JSON schema validation leaks
  if (
    trimmed.startsWith("输入不符合能力合同：")
    || /(?:^|[\s;,])\/[A-Za-z0-9_/-]+\s+(?:must|minLength|maxLength|minimum|maximum|additionalProperties|required|type|enum|format|pattern|const|oneOf|anyOf|items)\b/u.test(trimmed)
    || /\bmust (?:have required property|NOT have additional properties|match format|be (?:string|number|integer|boolean|object|array))\b/u.test(trimmed)
  ) {
    return "common.error.invalid";
  }

  // Storage / SQLite / OS / network raw driver errors
  if (/\b(?:SQLITE_BUSY|database is locked)\b/iu.test(trimmed)) return "common.error.storage-busy";
  if (/\b(?:ENOSPC|SQLITE_FULL)\b/u.test(trimmed)) return "common.error.storage-no-space";
  if (/\b(?:ECONNREFUSED|ENOTFOUND|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|fetch failed|UND_ERR_[A-Z_]+)\b/iu.test(trimmed)) {
    return "common.error.upstream";
  }
  if (/\b(?:ETIMEDOUT|AbortError|TimeoutError)\b/u.test(trimmed)) return "common.error.timeout";
  if (/\b(?:ENOENT|EACCES|EPERM|EISDIR|ENOTDIR|ERR_SQLITE_ERROR|SQLITE_[A-Z_]+)\b/u.test(trimmed)) {
    return "common.error.internal";
  }

  // Stack traces, JS native error prefixes, raw OS / file paths
  if (/\n\s*at\s+/u.test(trimmed)) return "common.error.internal";
  if (/^(?:TypeError|ReferenceError|RangeError|SyntaxError|URIError|EvalError|AssertionError):/u.test(trimmed)) {
    return "common.error.internal";
  }
  if (/(?:^|[\s(:`"'=])(?:\/Users\/|\/home\/|\/var\/|\/tmp\/|\/private\/|\/etc\/|\/opt\/|\/Library\/|file:\/\/\/|[A-Za-z]:\\)/u.test(trimmed)) {
    return "common.error.internal";
  }
  return null;
}

const QUOTED_SEGMENTS = /「[^」]*」|“[^”]*”|《[^》]*》|"[^"]*"|'[^']*'|`[^`]*`/gu;
const NEUTRAL_PROPER_NOUNS = /\b(?:Molis Work|Molis|JSON|HTTP|HTTPS|URL|URI|API|MCP|OAuth|ID|MB|KB|GB|UTF-8|CSV|PDF|PNG|SVG|HTML|CSS|DOM|SSE|WS|MOLIS_WORK_ACCOUNT_CONFIG|tokens?|GitHub|Slack|Linear|Notion|Google|OpenAI|Anthropic|Gemini|Claude)\b/giu;

/**
 * Layer 2 detector: checks whether an unquoted error sentence is written in a different language
 * than the active UI locale (e.g. raw Chinese backend text in en/ja UI, raw English in zh/ja UI).
 */
export function isWrongLanguageForLocale(message: string, locale: string): boolean {
  const core = message.replace(QUOTED_SEGMENTS, " ").replace(NEUTRAL_PROPER_NOUNS, " ").trim();
  if (!core) return false;
  const hasHan = /\p{Script=Han}/u.test(core);
  const hasKana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(core);
  const hasLatinWord = /[A-Za-z]{2,}/u.test(core);
  const base = baseLanguageOf(locale);
  if (base === "zh") return hasKana || (!hasHan && hasLatinWord);
  if (base === "ja") return !hasKana && (hasHan || hasLatinWord);
  return hasHan || hasKana;
}

function keyForCodeAndMessage(code: string | undefined, rawMessage: string, status: number, kind?: ActionErrorKind): CommonErrorKey {
  if (code) {
    if (code === "account.unavailable" && /\b(?:storage|credential|keychain)\b/iu.test(rawMessage)) {
      return "common.error.account-credential-store";
    }
    if (code === "account.conflict") {
      if (/\b(?:in progress|already)\b/iu.test(rawMessage)) return "common.error.account-busy";
      if (/\bchanged\b/iu.test(rawMessage)) return "common.error.account-changed";
    }
    if (Object.hasOwn(CODE_KEYS, code)) return CODE_KEYS[code]!;
    if (code.startsWith("account.")) return "common.error.account-service-unavailable";
    if (code.startsWith("sync_replication.") || code.startsWith("sync.")) return "common.error.sync-unavailable";
    const platformKind = platformErrorKind(code);
    if (platformKind) return KIND_KEYS[platformKind];
  }
  if (kind) return KIND_KEYS[kind];
  return statusToErrorKey(status);
}

function shouldAlwaysLocalizeCode(code: string | undefined): boolean {
  if (!code) return false;
  return code.startsWith("account.") || ALWAYS_LOCALIZE_CODES.has(code);
}

/**
 * Localize & sanitize a `{ error, code?, details?, ... }` HTTP error body without touching
 * structured fields (`code`, `details`, `call_id`, `diagnostic_id`).
 */
export function localizeWebErrorBody(status: number, value: unknown, localeOverride?: string | null): unknown {
  if (status < 400 || typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (typeof record.error !== "string") return value;

  const raw = record.error;
  const code = typeof record.code === "string" ? record.code : undefined;
  const locale = localeOverride ?? activeLocale() ?? pageLocale();

  const technicalKey = classifyTechnicalMessage(raw);
  if (technicalKey) {
    const resolvedKey = code && (code.startsWith("account.") || code.startsWith("storage.") || code === "actions.outcome_unknown")
      ? keyForCodeAndMessage(code, raw, status)
      : technicalKey;
    return { ...record, error: readErrorWord(resolvedKey, locale) };
  }

  if (shouldAlwaysLocalizeCode(code)) {
    return { ...record, error: readErrorWord(keyForCodeAndMessage(code, raw, status), locale) };
  }

  if (locale && isWrongLanguageForLocale(raw, locale)) {
    return { ...record, error: readErrorWord(keyForCodeAndMessage(code, raw, status), locale) };
  }

  return value;
}

/** Build a localized, sanitized `{ status, body }` from any thrown failure, preserving `code` and `details`. */
export function localizeActionErrorResponse(error: unknown, localeOverride?: string | null): { status: number; body: ActionErrorBody } {
  const response = actionErrorResponse(error);
  const localized = localizeWebErrorBody(response.status, response.body, localeOverride) as ActionErrorBody;
  return { status: response.status, body: localized };
}

/** Convert any caught error into a single localized, leak-free user-facing message string. */
export function localizeWebErrorMessage(
  error: unknown,
  fallbackKey: CommonErrorKey = "common.error.internal",
  localeOverride?: string | null,
): string {
  const locale = localeOverride ?? activeLocale() ?? pageLocale();
  if (typeof error === "string") {
    const technicalKey = classifyTechnicalMessage(error);
    if (technicalKey) return readErrorWord(technicalKey, locale);
    if (locale && isWrongLanguageForLocale(error, locale)) return readErrorWord(fallbackKey, locale);
    return error.trim() || readErrorWord(fallbackKey, locale);
  }
  const response = actionErrorResponse(error);
  const raw = response.body.error;
  const code = response.body.code;
  const technicalKey = classifyTechnicalMessage(raw);
  if (technicalKey) {
    const key = code === "actions.execution_failed" && fallbackKey !== "common.error.internal" && technicalKey === "common.error.internal"
      ? fallbackKey
      : technicalKey;
    return readErrorWord(key, locale);
  }
  if (shouldAlwaysLocalizeCode(code)) {
    return readErrorWord(keyForCodeAndMessage(code, raw, response.status), locale);
  }
  if (locale && isWrongLanguageForLocale(raw, locale)) {
    const key = code === "actions.execution_failed" ? fallbackKey : keyForCodeAndMessage(code, raw, response.status);
    return readErrorWord(key, locale);
  }
  return raw;
}

/**
 * Sanitize an error message before storing/showing it in an assistant notice `{ label, original }`.
 * Keeps clean domain messages in the active locale; replaces technical leaks or opposite-language
 * strings with a warm localized sentence.
 */
export function sanitizeErrorForNotice(error: unknown, fallbackKey: CommonErrorKey = "common.error.internal"): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const code = typeof error === "object" && error !== null && "code" in error && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : undefined;
  const locale = activeLocale() ?? pageLocale();
  const technicalKey = classifyTechnicalMessage(raw);
  if (technicalKey) return readErrorWord(technicalKey, locale);
  if (shouldAlwaysLocalizeCode(code)) return readErrorWord(keyForCodeAndMessage(code, raw, 500), locale);
  if (locale && isWrongLanguageForLocale(raw, locale)) {
    return readErrorWord(code ? keyForCodeAndMessage(code, raw, 500) : fallbackKey, locale);
  }
  return raw.trim() || readErrorWord(fallbackKey, locale);
}
