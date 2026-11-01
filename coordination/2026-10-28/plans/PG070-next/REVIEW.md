# PG070 接续页只读评审

结论：接续页可以作为旧候选书在固定 main `3fd857792a27352030ac8f3544a3b57d418febc1` 上的增量准备说明；未发现还需补改的实施前必修项。旧书的 Characters「section 前放 style」不能照做，接续页已明确改为放入被抽取的 section 内，此修正有效。当前仍是 WAIT，没有实现授权。

T146 的 H `1507e2034976650150e8994965db5612a7474727` 不是该 M 的祖先；三点差异仍为六文件，`page-assets.ts` 的设置共用表仍含 `CODING_STYLES`。先准确采用 T146、重冻基点再求路径交集的前置成立；T146 采用不能解除其他 PR 的共享文件占用。这里核的是固定 Git 对象与 SOURCES 原件，未刷新实时 GitHub 状态。

三个消费者的接线与描述一致：`scripts/settings.ts:115` 当前直拼 Shelf/Coding；`scripts/client/initialization.ts:125–126` 已先运行 `pluginWorkbenchClientBootstrap(undefined,true)`，再直拼 Coding；`project-settings-pages.ts:116` 已用 `pluginSettingsClients()`。`plugin-workbench.ts:108–115,144–155` 的聚合已消费 `settingsStylesheet/settingsClient`，deferClients 不跳过 settingsClient。因此登记 Coding、删除两处专用拼接，并在独立页删除 Shelf 旧拼接是完整修法，无需改公开合同或第三消费者。四条 CSS 原值仍位于 `styles/settings.ts:504–507`。

Characters 保留路径已核：`settings-renderer.ts:79–81,108` 直接插入 Host 的 `plugin_settings_html`；`web-composition.ts:36` 允许 inline style；客户端 `scripts/client/settings-directory.ts:123–177` 经 DOMParser 选 `.settings-content/.settings-document`，随后 adopt/append 选中节点，没有清理其子 style 的过滤器。入口 section 前的兄弟 style 会在选择 `.settings-document` 时丢失，section 内 style 则随节点进入目标文档。项目角色舞台由 `web-goals-read.ts:43` 渲染，走本地 surface 搬移；导入和确认 dialog 都在 `characters/ui.ts` 的角色 section 内。两入口分别携带自己所需静态 CSS 的方案有现行路径支撑。

验收已覆盖相关风险：三个消费者要验证有对应 DOM 时一次操作一轮请求及持久化回读，无对应 DOM 时不报错/不额外请求；CSS 搬动仍核级联和桌面/窄屏计算样式。Characters 首开、换项目、重开、dialog/终端以及嵌入节点携带 style 的真实验证不能只以 HTML 字符串存在代替。现行抽取路径支持方案，但本次没有浏览器实证。

资源边界足够：Coding 四条规则经现有聚合进入两共用表；Characters 从两表移除后记录实际 HTML 响应增量，served 资源逐项量测，不能把移入 HTML 当作成本消失。原书 full=true、增长/新增资源的现行裁定、共享账本串行写均保留，不预放行增长，也不以 Coding 子片完成关闭 PG070 整行。未运行构建、测试或浏览器，未改产品、GitHub、协调记录或 refs，仅写本报告。
