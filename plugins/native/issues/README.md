# Issue

在个人 Home 记录、查看、编辑和删除自己的问题。项目切换不改变数据；无需项目也能打开 `/plugins/issues`。页面、Work 助理与外部 MCP 调用同一组 `issues.*` 动作。外部 MCP 仍需在能力设置逐客户端授权。

包名：`@molis-ai/molis-work-plugin-issues`。本地开发中的内置 Runtime 插件，不代表已经发布或完成用户验收。

本地使用方法与验收路径见 [V0 试用说明](../../../specs/issue-home-v0/试用说明.md)。

首页及项目右上角的 Issue 在 Host 侧栏打开 `capture` 视图，初次打开直接录入图文，主页面保留。侧栏隐藏或切换标签不销毁表单，返回问题列表可查看及编辑记录；完整舞台入口仍然存在。侧栏位置与宽度归 Host，不保存跨页面草稿。相关回归：`tests/issue-global-navigation.e2e.test.ts`。

## 归属与接入

- 插件 ID `io.molis.work.issues`，Home provider 同名，安装 ID 另行保存。
- 业务 SQL、数据校验、动作、方法与页面归本包；数据库打开、安装、授权、执行和关闭归 Host。
- 数据为 `{home}/issues/issues.db` 的 `issues` 表，当前基线 2；错版拒绝，不自动迁移。
- 原始描述不 trim、不改写；标题与类型必需；描述支持文字和图片，图片随记录保存在同一数据库。
- 页面新建只填写描述、添加图片；Work 助理生成标题与类型，用户可修改并确认保存。只有图片也可交给支持视觉的模型整理。手动录入是明确的后备入口；已有记录默认只读，点编辑后才能修改，保存或取消回到查看态。公共 CRUD 动作仍要求调用方提供标题与类型。
- update/delete 要求读取时的 `expected_version`。beforeEffect 后同步事务提交；冲突不覆盖，结果未知不自动重试。
- 冲突时并列展示最新内容与草稿；选择保留修改只带入自己改过的字段，仍须主动保存。图片也参与对照，未改图片时保留其他入口的最新图片。
- 五个 CRUD 动作及三个录入草稿动作显式声明读、写及不可撤销删除。客户端构建用仓库已有的 esbuild 压缩工厂字符串，源码保持可读，不增加运行时依赖；本轮反馈恢复、阅读层级、固定操作栏和图片预览的首次客户端预算经用户明确批准为 21,500 bytes，已有资源仍只许减小。
- Home Runtime 不提供项目成果、事件和端口，不得虚构项目满足服务。
- 无团队共享、状态流转、被动采集或旧 Casebook 数据导入。

## 图文描述

- 用户用电脑上的工具截图；产品只接收图片，不提供截图或屏幕共享，也不限制图片来自哪个应用。直接把图片文件拖到描述框、复制图片后粘贴，或点击「添加图片」多选导入。
- 描述区域预览图片，点图放大，可在保存前移除；草稿图片不提前落库。
- 文字区按内容自动展开和收回，不固定高度、不单独滚动；图片紧接文字，文字与图片共用一个输入边框。
- 仅 PNG/JPEG/WebP，最多 6 张，保存后单张 2 MiB、总计 8 MiB；导入大图缩放到最长边 2560 并用 WebP 编码。原始文字不变。
- 导入时检查声明类型与图片格式特征并解码；错误扩展名导致类型不符时立即提示，保留原有图文，不等到整理或保存才拒绝。移除图片后键盘焦点回到「添加图片」。
- `images` 是有序的 `{ name, data_url }` 数组；更新时省略表示不改、空数组表示全部移除。列表只返回 `image_count`，详情和写入结果返回完整图片。
- 移除 `supplement` 与 `context.supplement`；list/read/create/update 合同版本为 2，delete 仍为 1。调用方应重新发现当前动作，固定旧版本的引用不会自动替换。
- 服务端独立校验类型、base64、文件头、数量与大小；不接受远程 URL 或 SVG。问题与图片一起事务提交，失败/版本冲突不改持久数据。

## 开发与验收

先从根目录 `pnpm install --frozen-lockfile && pnpm build`，再运行 `node scripts/run-tests.mjs tests/issue-home.test.ts tests/issue-home-runtime.test.ts tests/issue-assistant.test.ts tests/issue-page.e2e.test.ts`。公开 API 仅从本包入口导入。共享合同的改动同时维护 Plugin SDK、手册、Skill 与合同快照。

需求、验收编号与证据维护在 [Issue V0 规格](../../../specs/issue-home-v0/spec.md)。真实界面、助理确认卡与授权 MCP 的实操另行记录；测试通过不代替用户体验认可。

- Status: `partial`
- Migration Goals: `goal-reorg-f2`, `goal-plugin-platform-v2`.
- Contract entrypoint: `@molis-ai/molis-work-contracts/platform/plugin`

## 开发要求

- 负责：个人问题的 schema、业务查询与原子写入，页面、五个 CRUD 动作及录入草稿动作。
- 不负责：安装、数据库连接、授权、模型、项目或团队流程。
- 公开入口：`@molis-ai/molis-work-plugin-issues`；合同 `@molis-ai/molis-work-contracts/platform/plugin`。
- 依赖：`@molis-ai/molis-work-contracts`、`@molis-ai/molis-work-design-system`。
- 不变量：
  - 一个 Home 一份个人数据；没有项目也可用。
  - 原话不改写，类型不默认；可信元数据不从业务输入读取。
  - 提交前复查授权，更新和删除要求版本，冲突不覆盖。
- 改动后必跑：`node scripts/run-tests.mjs tests/issue-home.test.ts tests/issue-home-runtime.test.ts tests/issue-assistant.test.ts tests/issue-page.e2e.test.ts`
- 相关手册：[插件开发](../../../skills/molis-plugin-dev/SKILL.md)、[Home 数据归属](../../../docs/system/HOME-DATA.md)、[开发要求](../../../docs/system/DEVELOPMENT-REQUIREMENTS.md)。

## 助理整理录入

新建默认只填描述、添加图片，点击「交给助理整理」后复用 Work 助理的附件与方法材料；助理通过 `suggest-action` 提出 `issues.capture@1` 建议卡，页面呈现可编辑标题与类型。确认按钮执行原卡，原文、图片由 Issue 保留；取消旧草稿后旧卡无法保存。没有模型时保留输入并提供模型设置、手动录入。手动编辑沿用 CRUD。

查看态仅展示标题、类型、原文、图片和录入信息，图片可放大，删除保留二次确认。点「编辑」后才出现输入区、保存与取消。编辑可直接手动保存，也可主动点「让助理重新整理」；后者使用当前未保存的描述与图片，确认后更新原问题，不新增一条。取消编辑撤销未确认建议并恢复最近读取的内容；修改描述不自动调用助理。

标题以本次描述为准，截图仅辅助理解界面和控件，不能把截图里的旧标题或描述未提到的内容混入标题。普通描述直接放入助理主消息；超过 19000 字符的描述通过完整材料传递，避免超出主消息限制，不截断原文。模型建议仍须用户核对确认。

`issues.prepare@2` / `issues.cancel_capture@1` 只供用户页面调用；prepare 可选 `target: { id, expected_version }` 绑定已有问题，替代 v1，不保留旧合同。草稿存在当前插件 Runtime 内，最多 8 份、30 分钟有效，停止或重启后需重新整理。`issues.capture@1` 仍只接受 draft_id / title / type，不能让模型重选目标；按页面绑定创建或更新，同一草稿重复或并发确认只写入一次。编辑确认保留原录入信息，版本冲突不覆盖。更新失败或结果未知时，已有记录存在不能当作保存成功的凭据。已保存记录格式与库基线不变。截图实际作为 Work 助理视觉附件，不做图片文字识别替代。

改动还需运行 `tests/issue-capture.test.ts`、`tests/issue-capture-page.e2e.test.ts`、`tests/issue-edit-page.e2e.test.ts`；模型回复替身只证明数据流和确认语义，真实生成质量与用户验收单独记录。

### 体验优化（ISSUE-20—22）

整理失败时保留说明与输入，提供重试、修改描述和图片；新建可手动填写，已有问题可继续手动编辑。已执行保存但结果未知时仍先核对，不能盲目重试。错误校验随输入纠正清除，损坏图片使用可理解的提示。助理正文不解析成执行卡。

查看态突出标题和原始描述，录入信息降为辅助文字。长文单独滚动，保存/取消固定在底部；编辑默认可直接保存，整理只是可选。点击「刷新详情」且版本未变化时，查看态仅提示「已是最新版本」；编辑态只有实际改动才提示保留草稿；刚进入编辑或已还原改动同样只提示最新版本，版本变化才比较差异。图片支持适应窗口、原始尺寸和 Escape 关闭。

交互复查（ISSUE-23 / 24）：Home 页面就地打开 Work 原有模型设置，关闭后继续图文草稿，加载失败可重试。助理整理或等待确认时仍可查看截图，原描述和图片修改受保护。图片预览支持点击遮罩或图片外空白关闭，图片点击和拖出不误关；关闭回到缩略图。删除和放弃修改弹窗的遮罩仅取消，编辑取消或保存后焦点回到「编辑」。

20 步自检修复（ISSUE-27）：Home 外壳装配既有 Work 下拉菜单，Issue 类型及模型设置均支持可见选项、键盘选择和关闭返回；助理确认滚动到可见字段容器并保留边缘间距。删除完成回到「记录问题」。逐步操作、修复证据与真人验收范围见 [页面 20 步自检报告](../../../specs/issue-home-v0/页面20步自检报告.md)。

对应回归：`tests/issue-feedback-page.e2e.test.ts`、`tests/issue-capture-page.e2e.test.ts`、`tests/issue-edit-page.e2e.test.ts`；另保留上述 CRUD / Home / MCP 测试。测试模型证明请求、状态与写入边界，真实模型的标题准确性继续由用户确认。

首次整理修复（ISSUE-25）：建议参数缺失时，共享网关通过 SDK 的参数错误返回当前合同，避免普通 Host 异常被截短后助理无法纠正。业务标题、类型和草稿 ID 必须放在 `input`，不能用按钮文案或说明替代。助理可在当前回合核对修正，不新建工作或重新上传图片；不从普通正文拼造确认卡，确认和取消规则不变。回归 `tests/issue-assistant-repair-page.e2e.test.ts` 复现真实空 input，检查同一工作只有一张卡、确认前无写入、确认后持久化一致。

状态文案复查（ISSUE-28）：整理进度和失败说明不假定用户同时提供文字与图片；已有问题的失败后备为「继续手动编辑」。确认失败清除旧确认说明，结果待核对时提供核对入口；已成功保存但详情读取失败仍明确告知已保存，核对成功回到只读。保存/删除与后续列表刷新分别报告，恢复刷新清除旧错误。冲突提示区分继续编辑与放弃草稿后的查看态。回归 `tests/issue-state-feedback.e2e.test.ts` 通过实际持久结果验证故障恢复，其他页面测试覆盖干净编辑、还原改动和助理后备。
