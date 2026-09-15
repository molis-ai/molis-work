import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
#!/usr/bin/env node
/**
 * 创建或重建 Molis Work 自带的可再生演示项目。
 *
 * 这个脚本保留给仓库开发和截图流程；产品用户应优先使用：
 *   molis-work demo create --confirm
 *   molis-work demo reset --confirm
 */
import os from "node:os";
import path from "node:path";


const force = process.argv.includes("--force");
const homeIndex = process.argv.indexOf("--home");
const homeDirectory = path.resolve(
  homeIndex >= 0 && process.argv[homeIndex + 1]
    ? process.argv[homeIndex + 1]
    : process.env.MOLIS_WORK_HOME ?? path.join(os.homedir(), ".molis-work"),
);

const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
try {
  const existing = catalog.listProjects().find((project) => project.data_class === "regenerable_demo");
  const result = force && existing
    ? await catalog.resetDemoProject({ actor_id: "demo-script", user_confirmed: true })
    : await catalog.ensureDemoProject({ actor_id: "demo-script", user_confirmed: true });
  console.log(`${result.status === "created" ? "已创建" : result.status === "reset" ? "已重建" : "已存在"}：${result.project.display_name}`);
  console.log(`分类：${result.project.data_class}（普通卸载可以清理，用户项目不受影响）`);
  console.log(`打开：http://127.0.0.1:4173/projects/${encodeURIComponent(result.project.project_id)}/`);
} finally {
  catalog.close();
}
