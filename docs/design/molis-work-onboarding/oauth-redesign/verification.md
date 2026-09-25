# 验证记录 · 2026-09-25

完成程度：核心动线功能可用。imagegen 图稿、高保真交互、生产接线及真实 Gmail → Cognia → Prologue → Projects/Pages 闭环均已完成。本记录区分工程、自动化实操和用户授权；不代表一骏已认可最终体验或产品可发布。

## 真实 Gmail 闭环

用户确认 Relay 是其自有 OAuth 测试应用、选择现有账号并亲自完成 Google 授权。随后明确批准读取最近 7 天最多 20 封正文、不含附件，经 Prologue 发送 MiniMax-M3 并在本机保存原文与摘要。授权、正文和凭据均未写入仓库。

- 正式清单发起 Google 官方 OAuth；真实回调完成交换并记录 connected，保留原批次和来源选择。auto_start=false，授权后仍由“开始整理”触发正文读取。
- 真实读取 20 封邮件，Cognia 固定版本正文合计 475,543 字符。7 批真实模型事实提取后最终汇总；重试复用了 7 份已保存中间结果，不重读邮箱。
- 最终初稿仍有冗余与不必要建议，已通过 UI 审阅、精炼为 758 字符并修改名称。显式“完成编辑”保存，刷新后内容一致。此次最终文档是经人工编辑的模型摘要，不是未经修改的自动输出。
- 采用时长邮件标题触发 Pages 的 80 字限制；修复边界转换后，从失败处继续保存同一项目。完整原标题和原文仍保留，只缩短文档显示标题。
- 最终状态 complete，error=null；项目中恰有 21 份 Pages 文档（1 份摘要、20 份来源）。程序核对全部 Cognia 原文与版本、Pages 原文块、摘要全部来源链接及已接受摘要均一致。UI 打开摘要和第 20 份来源，正文可编辑、版本可读。

批次：`803a77fa-a21a-481d-a22d-565ff8331293`。项目：`project-onboarding-803a77fa-a21a-481d-a22d-565ff8331293`。摘要：`9af4b36a-c1d0-454c-90ff-fa0ab074c7ca`。

[实际项目预览](http://127.0.0.1:4339/projects/project-onboarding-803a77fa-a21a-481d-a22d-565ff8331293/) 使用当前真实 Home，仅本机可访问。仓库仅记录非内容性验收结果，没有真实邮箱截图或正文副本。

## 工程检查

相关包构建通过：

```sh
pnpm --filter @molis-ai/molis-work-app-workbench build
pnpm --filter @molis-ai/molis-work-app-local-host build
pnpm --filter @molis-ai/molis-work-integration-gmail build
pnpm --filter @molis-ai/molis-work-storage build
```

定向业务测试 22 项通过（context 14 项，Gmail/连接选择 8 项）：

```sh
node --import tsx --test tests/context-onboarding.test.ts tests/gmail-oauth.test.ts tests/connector-oauth-choice.test.ts
```

覆盖目录范围（隐藏文件/符号链接排除）、正文持久化、有效来源引用、缺模型恢复、导入预览丢失、并发采用与重复请求、创建响应丢失恢复、用户后续编辑不被重试覆盖、空白项目无 Goal、Gmail 时间/账号/MIME/附件范围、state/PKCE、取消/过期/迟到/重放回调。新增长材料末尾完整保留、成功批次续跑、批次非法引用拒绝、长标题与 Unicode 边界保留等回归。模型和网络注入测试支持契约结论，真实提供商证据以上一节为准。

入口回归 3 项通过：

```sh
node --import tsx --test --test-name-pattern='onboarding' tests/web.test.ts
```

旧 initialize API 兼容用例仍创建根 Goal；新 UI 使用独立 context 路径，新增测试确认不自动创建 Goal。客户端脚本语法和相关 diff 空白检查通过。未运行全仓测试：工作树存在大量本任务前已有修改。

## 浏览器与恢复实操

- 隔离 Home（4337）：首次和新项目清单、全选/半选/零选择、缺 OAuth 配置说明；空材料主动作先添加内容。真实粘贴 → Cognia → 缺模型保留材料 → 带入资料 → 项目 Pages → 来源可读。
- 测试专用固定模型端口（4338，已关闭）：引用弹窗、编辑刷新、采用后的真实持久化；截图明确标记模型为 fixture，没有冒充真实模型结果。
- 普通入口“继续上次整理”恢复有内容的未完成批次；空批次不遮蔽它。回清单调整失败来源，未变更成功来源保留版本，只有改变范围的来源重读。
- 模拟创建后响应丢失，继续保存回到同一项目；真实 Gmail 的长标题失败亦经 UI 恢复同一项目，最终无重复文档。
- 新项目存在多个已连接 Google 账号时显示“选择已有账号”；已实操选择本次连接后变为可读取，无需重走 OAuth。
- 桌面 1505×1045、390px 窄屏及浅深主题已核对，临时 viewport 已恢复。Chrome 自动上传被扩展 file URL 权限限制，未修改用户权限；后端文件解析和原生选择器另有通过证据，不能将其称为 Chrome 上传实操。

## 原生桌面

当前源码 `cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml --bin molis-work-desktop` 通过，以 `/tmp/molis-onboarding-native-20260924/Molis Work QA.app` 测试壳连接 4173 隔离 Home；不是发布安装包验收。旧 embedded runtime 缺少 plugin-sdk，未修改旧产物，使用无旧资源的当前源码开发壳。

- 新 Home 首次显示新清单；macOS 单文件与文件夹选择器通过；退出重开后恢复原批次。无模型导入并采用，Pages 原文/路径/版本可读。见 [native-imported-source.png](review/native-imported-source.png)。自动化 AX 表单提交点击未触发，键盘提交通过，不据此宣称该鼠标操作通过。
- 项目菜单 → 管理项目 → 新建项目进入同一流程。授权超时 fixture 恢复后提示重新连接并保留内容，见 [native-oauth-expired.png](review/native-oauth-expired.png)。
- 在 QA Home 配置用户已批准应用的公共 Client ID；原生“连接 Google”确实打开系统 Chrome 的官方账号页。选择现有账号后，在 Google 未验证应用提示选择“返回到安全网页”，未绕过提示或授予新权限。
- 浏览器回到绑定批次的 desktop=1 回调页；原生轮询结束等待、保留 Gmail 选择、显示失败提示并允许重试。见 [native-provider-return.png](review/native-provider-return.png)。正向授权交换由真实 web 流程证明，原生仅实测打开与拒绝返回，未重复正向授权。
- QA 应用和 4173 后端已退出，避免占用正常桌面端口。

## 设计与其他真实模型证据

imagegen 图稿及精确 prompt 已保存。五项视觉修复（可读数量与主动作、Gmail 状态、深色、总结眉题、标题字距）经独立 reviewer 复核；视觉结论不替代集成验收。Inter 沿用产品字体，进度动画使用 transform。

此前还使用生产 `createCogniaProloguePort` 和 `createPrologueNodeAdapter` 在隔离 Home 对两份虚构发布文档调用真实 MiniMax-M3，识别日期冲突与负责人缺失、保留 S1/S2 引用，采用后保存三份 Pages 文档。非私密示例见 [real-prologue-summary.md](review/real-prologue-summary.md)。

## 明确边界

- Relay 是用户批准的测试客户端；Molis 正式 OAuth 品牌、提供商审核和发布安装包尚未验收。
- 自动摘要已真实生成，但本次最终结果经人工精炼；更广泛材料质量仍需评估。
- 浏览器目前粘贴正文、IM 导入导出文本；自动标签页捕获、实时 IM Connector、多项目自动归类和持续同步未实现。
- 用户已完成账号授权并批准材料范围，不等于用户已验收最终产品体验。
