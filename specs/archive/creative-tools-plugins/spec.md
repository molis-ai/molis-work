# Adeptify 问卷 / 数据表 / PPT 复刻为 GoalBoard 插件

完成等级：**4 内部完整**。不宣称可发布。不发 Artifact。对外 MCP 按 `specs/archive/plugin-outbound-mcp/spec.md` 登记，默认关。

## 背景目标

Adeptify 里这三件事是真实产品面：问卷（Form）、数据表（Dataset）、演示稿（PPT）。新栈 UI 已在 2026-06-28 删掉；PPT 的 SVG→PPTX 生成链更早随旧 frontend/backend 清掉。GoalBoard 要把人能用的工作台接回来，接法跟 Functions：个人插件、本机 SQLite、declarative HTML。

## 当前行为与问题证据

- 工作台壳只有 Home / Goals / Feed / Inbox / Schedule / Shelf / Functions / Artifacts 等；没有问卷、表格、演示入口。
- Adeptify 证据：`modules/form/FormPage.tsx`（编辑/预览/结果）、`modules/dataset/DatasetPage.tsx`（表格工作台）、旧 `create/ppt` 生成向导 + `PresentationService`。
- 旧 Form/Dataset 的 AI 出题/加列在 next-gen service 里是本地 stub，不是真模型。

## 范围

1. 三个 native 个人插件，始终在项目侧栏，不进项目启用名单。
2. **Forms**：列表、新建、标题/说明、六种题型、选项、必填、排序删除、预览填写提交、结果计数与导出。出题沿用旧 stub：按提示加一题。
3. **Dataset**：列表、新建、列/行增删改、筛选、CSV 粘贴导入（按整列值推断 text / number / date）、JSON/CSV 导出、版本快照与回滚。加列 stub 同旧 DatasetService。
4. **PPT**：列表、新建、主题色、幻灯片增删排序、页标题/要点/备注、幻灯片预览、JSON 导出。不做 SVG 生成、不做 PPTX、不接材料/文档自动生成。
5. 数据在 `{home}/{form|dataset|ppt}/*.db`，同一库内按当前 `project_id` 分区。个人插件始终在侧栏，内容仍属当前项目。
6. 编辑时自动保存不得重挂正在改的 DOM，不得丢掉光标。请求失败写进工作台 note。
7. 加题 / 加列 / 导入按钮不得因包在 column flex label 里被拉成通栏。
8. Forms 题目可上下移动；预览里单选是 radio、多选是 checkbox、下拉是 select。
9. 删除问卷/表/演示稿要确认；CSV 导入覆盖当前表要确认。
10. 市场「已添加」与侧栏直达面从 catalog 的 `personal` / `summary` 推导，Host 不再手写 form/dataset/ppt 名单。
11. 工作台视觉打磨（仍用 `mw-*` 与现有色板，不另做皮肤）：Forms 编辑/预览/结果标签带语义色；列表与顶栏状态用 `mw-status` 色块而不是纯文字；标题+说明同一行；预览是一张填写纸；加题/加列/加页有短到达动效；尊重 `prefers-reduced-motion`。切 Forms 页签不得整页从透明起跳闪白。
12. Dataset 删行必须从当前草稿里拿掉并写回库；筛选藏起来的行仍保住。筛光时说明「没有匹配」，不是一张空表头。PPT 列表状态格不假装「草稿」。
13. Forms 结果请求返回后，若已经换了问卷就丢掉；列类型变更不得整表重挂。

## 非目标

- LLM / TypeSafe
- Adeptify 的 SVG→PPTX、风格卡、材料选择器
- Form→Dataset 跨插件导入
- 未登录公开填写页、邮件收集
- 看板/仪表盘完整版（Dataset 以表格为主）

## 使用场景

1. 侧栏打开 Forms，建问卷，加单选题，预览提交，结果里看到 1 份答卷。刷新还在。
2. Dataset 建表，加列加行，粘贴两行 CSV，导出能看到这些格子。存一版再改，能回滚。
3. PPT 建稿，加两页要点，预览区按页展示，导出 JSON 含标题和要点。

## 方案与关键决策

- 个人插件，对齐 Functions/Shelf：人打开就能用。内容按项目隔离，避免两个项目看到同一份问卷。
- UI 用现有 `plugin-stage-shell` + `mw-*`，不搬 Adeptify React/CSS。空态、列表、编辑器、预览按现有工作台气质打磨，不另做一套视觉。
- 自动保存只更新列表元数据和预览；打开记录、生成题目、导入 CSV 才重绘编辑器。
- 确认用工作台内 `dialog.mw-dialog`，不用 `window.confirm`。
- AI 入口保留，语义与旧 stub 一致，避免假装已接模型。
- PPT 复刻的是「能改、能看的演示稿」，不是旧生成工厂。
- 市场文案挂在 catalog `summary` 上；个人插件「已添加」读 `PERSONAL_PLUGIN_IDS`。

## 输入输出与依赖

输入：用户在工作台的编辑与提交。  
输出：本机 SQLite 记录、列表/编辑/预览 UI、JSON/CSV 导出。  
依赖：Plugin Manifest、Workbench catalog、Local Host `/api/{form,dataset,ppt}`、Design System。

## 文件 / 模块边界

允许：`specs/archive/creative-tools-plugins/`；`packages/contracts` 三个 module；`plugins/native/{form,dataset,ppt}`；Workbench catalog/壳接线；Local Host HTTP；`scripts/workspace-packages.mjs`；SSOT 三行；对应测试。

禁止：改 Goals/Artifacts 事实；把开关写进 Functions 设置；新建 MCP 包。对外 MCP 的目录合成、闸门、Host 适配表以 `specs/archive/plugin-outbound-mcp/spec.md` 为准。

## 验收标准

1. 三个插件出现在项目侧栏，不经项目「添加插件」。
2. Forms：创建→改题→上下移动→预览提交（多选为真实选项）→结果计数；必填未填会提示且不写答卷；重启进程记录仍在。
3. Dataset：行列编辑（删行后保存再打开行已不在）、CSV 导入前确认覆盖、导出、版本回滚；筛选无匹配时有说明；重启仍在。
4. PPT：多页编辑、预览随改随看、JSON 导出；列表不显示假的「草稿」；重启仍在。
5. 工作台 HTML 含 `data-form=workbench`、`data-dataset=workbench`、`data-ppt=workbench`。
6. 未接模型：出题/加列不调用外部 provider。
7. 同一 home 库里，项目 A 的问卷/表/演示稿不出现在项目 B。
8. 客户端 `save` 不调用 `fillEditor`；输入过程中光标不被重置。
9. 异步 click 失败会 `showNote`；删除与 CSV 覆盖弹出确认。
10. 加题/加列/导入按钮在 toolbar 里，宽度跟随内容。
11. 市场卡片来自 `pluginMarketCards()`；个人插件在市场显示「已添加」。
12. Forms 三个标签页用不同语义色；草稿/已发布、草稿/已就绪是带底的状态色块；加题或加页时新行有到达动效；窄屏标题说明改单列；切预览/结果不从全透明起跳。
13. Dataset `mergeDatasetDraftRows`：筛掉的行留下，已从 DOM 删掉且仍匹配**画出这些 DOM 时的筛选**的行丢掉；改筛选词时先按旧筛选提交 DOM，再按新筛选重画。工作台删行走这条合并。
14. PPT 列表状态格为空占位，不写「草稿」。

## 验证命令

```bash
pnpm --filter @molis-ai/molis-work-contracts --filter @molis-ai/molis-work-plugin-form --filter @molis-ai/molis-work-plugin-dataset --filter @molis-ai/molis-work-plugin-ppt --filter @molis-ai/molis-work-app-workbench --filter @molis-ai/molis-work-app-local-host --filter @molis-ai/molis-work-design-system build
node --import tsx --test --test-concurrency=1 tests/creative-tools-plugins.test.ts tests/plugin-catalog-companions.test.ts
```

## 假设与开放问题

- 假设落在 GoalBoard 个人插件，不是搬回 Adeptify。
- PPTX 真导出记 later。
- 真模型出题/分析记 later。
