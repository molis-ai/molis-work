# macOS 目录与资料准备验证

2026-09-26。需求书：`specs/molis-work-context-onboarding/spec.md` 的当日扩展。目标为功能可用；此记录不代表发布包或用户本人验收。

## 当前实现

清单内下载、文稿、桌面、其他文件夹独立授权；只在用户点击准备时打开系统选择器。原生只读 security-scoped bookmark 持久化，取消连接清除本应用记录。目录访问仅允许主窗口、本机 4173 的 `/onboarding`。

目录预览仅返回元数据和文件身份，支持 7/30/90 天、全部时间，最多展示 200 项。开始前可排除文件及子目录。文件身份包含 device/inode、纳秒 mtime/ctime；读取前后重新校验，符号链接和越界不读取。点击开始后才读取选中正文，本轮最多 50 份、6 MB。

PDF 使用文本层（不做 OCR），DOCX 本地抽取正文。单个损坏或无正文文件显示跳过原因。原始文件和抽取文本先暂存在 journey；采用后通过项目 Actions 注册 Host Artifacts 固定版本，Pages 保存可编辑正文。摘要仍通过 `createCogniaProloguePort` → Prologue 完成，没有继续调用旧 Cognia 的资料存储动作。旧未完成 Cognia 批次保留记录并提示重新选择，避免混用身份。

## 工程证据

- 原生目录 9 项测试与 Cargo build 通过，含真实临时目录书签恢复、时间过滤、越界/符号链接、同大小同 mtime 文件替换、部分失败及容量限制。
- `tests/context-onboarding.test.ts`：17/17 完整回归通过；新增第 18 项资料直接采用的容量边界后，定向 2/2 通过（含无模型场景复测），未将其标记成 18/18 完整重跑。覆盖 OAuth 范围及回跳、分批摘要恢复、无模型、真实项目/Pages/Artifacts 保存、幂等重试、空白开始、旧批次保护。
- `tests/context-onboarding-documents.test.ts`：2/2 通过；真实 PDF/DOCX 抽取、原字节保存、损坏与空白文档、元数据预览及排除约束。
- `tests/context-onboarding-artifacts.test.ts`：1/1 通过；原始字节和准确版本、跨项目隔离、重复导入复用、无效/过大原文件拒绝。此测试发现并修正了存储规范化嵌套对象键顺序导致重复新建版本的问题。

真实资料采用测试使用隔离 Home 和虚构资料。未重新读取个人邮件、下载、文稿或桌面内容。模型单测为受控测试返回；2026-09-25 的真实 Gmail → Prologue 证据属于上一轮，不能替代此次新原生目录 UI 的验收。

## 原生交互与视觉

在隔离 Home `/tmp/molis-mac-onboarding-20260926/home` 和当前源码编译的临时 macOS App 上实际执行：

1. 勾选下载与其他文件夹，统一继续后打开真正的 NSOpenPanel。取消下载，流程继续到下一项；仅授权虚构 fixture 目录，没有授权个人下载目录。下载保留为未就绪，可明确跳过。
2. 预览显示 6 个候选、2 个未列入项；选择最近 7 天，排除 `团队资料` 子目录和 `暂不带入.txt`。通过 API 核对仅有 metadata/excluded，没有文件正文或 references。
3. 退出并重开 App 后，授权书签仍有效；继续上次整理，时间范围和两项排除仍保留。
4. 原生读取 4 个选中文件；PDF、DOCX、Markdown 3 份正文成功暂存，损坏 DOCX 独立报告跳过原因。
5. 最终构建在浏览器继续同一批次，显示“资料已经准备好”，无需模型即可命名、采用并打开真实 Pages 文档。项目 `project-onboarding-6dd9655e-9ae7-43a1-a0b2-036cb0d0ca4b` 状态 complete；4 个 Pages 文档、4 个准确 ArtifactReference。经项目公开查询接口逐一比对，3 份原始字节完全一致；排除项未进入项目正文。

浏览器单文件选择也单独实操：选择 Markdown/PDF → 仅读元数据预览 → 开始后读取 → 无模型保存 → 项目中打开来源文档。最终保存采用统一构建产物；Workbench/Local Host/Desktop 及依赖的 TypeScript 构建通过，Connector Host 补编后 Host import smoke 通过。

真实原生最后采用未在本轮最终构建上完整重做：忙碌时 `/health` 一次响应 4.18 秒，原生 400ms 探针误判并显示未安装。已交给宿主启动 owner；后续 CUA 原生通道另出现 -10005 故障。原生授权、重启恢复和读取的已完成证据有效，最终采用明确为浏览器实操，不将两者写成整轮原生验收通过。隔离 4173 服务已停止并交还并行任务；临时 QA App 最后退出指令受 CUA 故障影响。

生产截图在 `.impeccable/review/onboarding-mac-20260926/`：`desktop-checklist.png`、`desktop-preview.png`、`mobile-preview-dark.png`、`mobile-materials-ready-dark.png`、`desktop-directory-materials-ready.png`。桌面 CSS 视口 1180×760、窄屏 390×844，DOM 宽度与视口一致；全页截图像素受浏览器缩放影响。上述 5 张均已打开确认有效；原生截图的空白填充异常未用作视觉门槛证据。

Impeccable detector 仅有两条 incumbent Inter 字体警告，按现有视觉方向保留。新上下文的独立 finish reviewer 给出 **ship**，范围为这 5 张截图及相关 UI 代码，无 Blocker/P1。非阻塞项记录为后续：整理中步骤仍高亮预览、勾选重绘后的键盘焦点恢复、原生授权抛出异常时后续队列的继续处理。设计原型 `index.html` 为明确标注的模拟，不作为生产能力证据。

证据日志：`/tmp/molis-context-regression-v2.log`、`/tmp/molis-onboarding-final-boundaries.log`、`/tmp/molis-onboarding-documents-tests.log`、`/tmp/molis-onboarding-artifacts-tests.log`、`/tmp/molis-native-context-tests.log`、`/tmp/molis-native-context-build.log`、`/tmp/molis-onboarding-native-adoption-proof.log`。本轮目标达到功能可用；原生最终采用、发布安装包及用户本人验收仍分别未完成。
