# 插件创作工作台

自然语言设计 → 候选 → UI 装配与功能连接 → 真实试用 → 独立插件。执行仅通过 Host 的 Prologue capabilities；安装通过 PluginPlatform，草稿与数据经 SQLite private storage CAS 持久化。

项目内入口为插件创作工作台；独立创作页面 `/projects/<project>/plugin-builder`；发布后为 `/projects/<project>/plugins/io.molis.work.generated.<id>`。先配置模型并关联工作区。Jev 可读取 Functions 中已有的 TypeSafe 凭据；缺少时明确采用人工候选，不伪造选择。

生成应用安装固定的解释器 v1，发布的是不可变设计数据版本。每个应用有独立安装身份和数据。修改草稿不改变正式定义；预览和正式记录隔离。破坏已发布字段的升级/回退会被拒绝；新计算必须先通过正式已有记录预检，校验与激活之间不允许异步写入插入。支持本地数据、CSV 与受控派生计算；不执行模型 HTML/JavaScript、不自动连接外部账号。

- Migration: `goal-reorg-f2`
- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/platform/plugin`
- Spec: `specs/plugin-builder/work-items/prologue-runtime/spec.md`

验证：`pnpm --filter @molis-ai/molis-work-plugin-builder build`；`node --import tsx --test tests/plugin-builder-*.test.ts`。

内置灵感库从空画布的“体验灵感库示例”主动创建。四条示例记录进入真实预览存储，可编辑、搜索、筛选、导出；发布的独立插件从空数据开始。其装配回放明确标为示例，不启动模型。自定义插件使用同一套可选表现绑定，把文本、封面、标签、来源和链接字段显示为卡片、列表或表格。

不带模型的本地交互预览：`pnpm exec tsx scripts/preview-plugin-builder.mts`，打开输出地址。它使用独立临时 SQLite 项目和真实 Host 路由，不改正式项目。Prologue 真实生成仍在已配置工作区和模型的项目中执行。

视觉依据为 `specs/plugin-builder/ui/design/approved-comp.png`。覆盖两条真实浏览器路径的命令：`pnpm exec tsx --test tests/plugin-builder-browser.e2e.test.ts tests/plugin-builder-visual.e2e.test.ts`。完整结果见执行需求；真实模型调用和最终用户验收尚未完成。
