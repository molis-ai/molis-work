import { readFile } from "node:fs/promises";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import { actionErrorFromResponse } from "@molis-ai/molis-work-plugin-sdk";
import { actionGatewayHomeId } from "./action-gateway.js";
import { PLUGIN_INSTALL_PATH } from "./plugin-install-gateway.js";
import { resolveConfiguredHome } from "./product-home.js";
import { DEFAULT_RESIDENT_HOST_URL, RESIDENT_HOST_URL_ENV, postToResidentHost, residentHostOrigin } from "./resident-host-request.js";

export interface LocalPluginInstallInput {
  bundle_path: string;
  project_id: string;
  /** Installs. Without it the Host only previews and nothing changes. */
  confirm: boolean;
  /** The name the person gives a publisher they have not pinned; confirming without one is refused for such a publisher. */
  pin_label?: string;
  home?: string;
}

/**
 * Installing a package is asked of this Home's resident Host and of no one else: it is the process that runs the Home's plugins and the
 * only one that may write their installations. When nothing answers, or the answer is lost, the command stops; it never installs in its
 * own process, and a lost answer is checked by running it again without `confirm` (the preview then shows whether it is already in).
 */
export async function runLocalPluginInstall(input: LocalPluginInstallInput): Promise<Record<string, unknown>> {
  const home = input.home ?? resolveConfiguredHome();
  const address = process.env[RESIDENT_HOST_URL_ENV]?.trim() || DEFAULT_RESIDENT_HOST_URL;
  let bundle: unknown;
  try { bundle = JSON.parse(await readFile(input.bundle_path, "utf8")); }
  catch { throw pluginErrors.package_invalid(`读不了插件包文件：${input.bundle_path}`); }
  const answer = await postToResidentHost({ origin: residentHostOrigin(address), homeDirectory: home, path: PLUGIN_INSTALL_PATH,
    retryHint: "先不带 --confirm 再运行一次，看这个包是否已经装上",
    body: { home_id: actionGatewayHomeId(home), project_id: input.project_id, bundle, ...(input.confirm ? { confirm: true } : {}),
      ...(input.pin_label !== undefined ? { pin_label: input.pin_label } : {}) } });
  if (!answer) throw new ActionError("actions.service_unavailable", `这个 Home 的常驻服务没有响应（${address}）；安装只交给它来做。先打开 Molis Work；它不在这个地址时用环境变量 ${RESIDENT_HOST_URL_ENV} 指定`);
  if (!answer.ok) throw actionErrorFromResponse(answer.status, answer.body);
  return answer.body;
}
