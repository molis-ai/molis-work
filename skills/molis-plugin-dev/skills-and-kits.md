# 技能与能力包

给 Agent 一份做事的做法（技能，Skill），或者想知道你的插件在「设置 › 能力包」里怎样出现，读这一章。命令原文、包格式和上限的细则在 `docs/platform/PLUGIN-DEVELOPMENT.md` 的「给 Agent 用的技能」「沙箱包格式与安装」两节；合同在 `specs/skill-packs/contract-design.md`（技能）与 `specs/capability-pack/contract-design.md`（能力包）。

## 技能是什么

一份按需读取的文字做法：名称、什么时候用、正文，可附带参考文件。它**不授予任何权限**：声明的 `tools` 只是说明，一轮里能用什么仍由角色的工具名单和动作授权决定。技能只有一种声明（`PluginMethodDeclaration`，`packages/contracts/src/platform/plugin-agent.ts`），写在 Manifest 的 `methods` 里；内置插件、沙箱包和只有声明的插件写的是同一种，过同一套检查（SDK 的 `parsePluginManifest` 里那一份）。

## 只做技能：只有声明的插件

只带技能、不带代码的包叫只有声明的插件（`kind: "content"`），安装包叫内容包。它不起进程、不挂路由、不进 MCP 工具表；你不写 Manifest，打包命令替你生成。从空目录做一个：

1. **目录**：每个技能一个文件夹，文件夹名就是 `skill_id`（小写字母、数字、连字符，至多 64 字）。正文是 `SKILL.md`；附带文件只能放在 `references/`、`scripts/`、`assets/` 下。一个包至多 128 个技能（`SKILL_LIMITS`）。

   ```text
   my-skills/
     weekly-review/
       SKILL.md
       references/checklist.md
   ```

2. **`SKILL.md` 的开头**：一段扁平的 frontmatter，每行 `键: 值`，值是一行文字、`true`／`false`、整数或一行的 `[a, b]`；多行或嵌套的值被拒，不猜。键一律用下划线（写 `user_invocable`，写成 `user-invocable` 会被点名拒绝）。

   ```markdown
   ---
   name: weekly-review
   description: 每周五回顾本周完成的事与下周计划时用
   applies_to: both
   when_not_to_use: 只想看一条任务的进度时
   ---

   # 每周回顾

   1. 读本周关闭的任务。
   2. 按项目分组，写三句总结。
   3. 列下周最重要的三件事，问本人是否同意。
   ```

   - 必填：`description`（什么时候用，1–1024 字）和 `applies_to`（`assistant`、`coding` 或 `both`，谁能用它）。
   - 可选：`summary`（不写取 `description` 的开头）、`version`（不写是 1）、`when_to_use`、`when_not_to_use`、`user_invocable`（`false` 时本人不能点名）、`argument_hint`（点名时名字后面写什么，至多 80 字）、`tools`、`connector_categories`（正文里 `~~project tracker` 一类占位指的连接器类别）、`native_only_reason`（只能由本地 Agent 用时写原因）。
   - 正文：严格 UTF-8、非空白，至多 500 行、20,000 个 UTF-16 单元。正文写步骤和边界，不写死对象标识；要改数据的步骤照常经 `change-capability`，由本人确认。
   - 正文变了就升 `version`：宿主按 `skill_id` 加版本认一份技能，同一版本两份正文会被当成同一份。

3. **发布身份**：生成一对 Ed25519 密钥，取公钥的身份。

   ```bash
   openssl genpkey -algorithm ed25519 -out key.pem
   ```

   ```bash
   openssl pkey -in key.pem -pubout -out public.pem
   ```

   ```bash
   molis-work-plugin identity public.pem
   ```

   输出的 `publisher_identity`（`ed25519:sha256:…`）就是下一步的 `--publisher-key-id`。私钥只留在你自己手里。

4. **打包**：`plugin_id` 必须以 `io.molis.work.` 开头；版本是 SemVer；范围 `--scope project`（默认）或 `home`（个人空间的技能，跨项目都在）。

   ```bash
   molis-work-plugin pack-content my-skills weekly.json --plugin-id io.molis.work.example.weekly --name 每周回顾 --version 1.0.0 --publisher-id example --publisher-key-id ed25519:sha256:… --scope home
   ```

   打包时就过 Manifest 与技能声明的全部检查，不过就不写输出（符号链接、别处的文件、超上限都拒绝，不会悄悄丢掉）。附带文件的大小与 SHA-256 由命令算好写进声明。

5. **签名与核验**：

   ```bash
   molis-work-plugin sign weekly.json key.pem weekly.signed.json
   ```

   ```bash
   molis-work-plugin verify weekly.signed.json public.pem
   ```

   想单独看生成的 Manifest，把包里的 `payload.manifest` 存成 `manifest.json`，跑 `molis-work-plugin validate manifest.json`。

6. **安装**：在 Molis Work 的「设置 › 插件」里「安装插件」选这个文件，或 `molis-work plugin install weekly.signed.json <project-id> --pin-as <发布者名称> --confirm`（先不带 `--confirm` 看预览）。确认里列出每个技能的用途、给助理还是 Coding、会不会执行脚本、用到的连接器类别；第一次见这个发布者要给它取个名字（固定发布者）。

本人也可以不打包：「设置 › 能力包 › 从本机导入」把本机 Agent（Claude Code、Codex 等）已有的 Skills 文件夹导进来。它用的是同一个打包函数（SDK 的 `skillFromFolder`、`contentPackagePayload`），签名用这个 Home 自己的发布身份。

**`scripts/` 里的脚本今天不会执行**：宿主只把它们标成「会运行」，不跑（等操作系统沙盒，见 `specs/backlog/BL-skill-scripts-sandbox.md`）。正文不要写成「先跑某个脚本才能继续」。

## 插件顺带提供技能

你的插件本来就有代码，也可以把本领域的做法给助理和 Coding 用（例如 Pages 的「会议纪要整理」）：

- 内置插件与按源码装的插件：Manifest 的 `methods` 写声明（同上面 frontmatter 的字段，外加 `skill_id`、`version`、`name`、`summary`、`tools`），正文放在 `PluginDefinition.methods`（`AgentSkillDefinition[]`），标识与版本和声明一致；插件启动时登记，停用、卸载时收回。
- 签名沙箱包：`methods` 每项必须写 `body: "skills/<skill_id>/SKILL.md"`，`tools` 必须是空列表；`molis-work-plugin pack-sandbox … --methods <JSON>`。
- `tools` 只能写 `SKILL_TOOLS` 里的名字（能力网关和不碰目录的业务工具）。它永远不扩大角色的工具：一轮开始时宿主只取「技能写的 ∩ 角色有的」。
- 与 `agent.skills` 的区别：`agent.skills` 是你自己的 Agent 用的；`methods` 给别的 Agent 用。

## 装上以后谁在用

- **目录**：一个范围（某个项目，或个人空间）里装着的全部技能，每项带精确引用 `SkillRef`。读写都经系统动作 `skills.catalog.list@1`、`skills.body.read@1`、`skills.settings.set@1` 等，宿主每次按安装、签名与授权现算，没有第二份注册表。
- **三档**：装上默认**关**，本人在「设置 › 能力包」里每个技能选一档：自动（助理或 Coding 按适用条件自己选用，只把名称和说明放进每轮，合适时才读正文）、仅手动（只有本人点名的那一轮才用：助理里打 `/`，Coding 里「选择方法」）、关。升级与重新启用不重置本人选的仅手动。
- **一轮怎样用**：开轮时宿主核对 `SkillRef` 并冻结这一版正文；升级、停用、卸载之后旧引用要重选，不会悄悄换成新版本。助理交活给 Coding 时，这一轮点名的技能随交接带过去（委派协议里也是 `SkillRef`）。
- **用量**：一轮真正接受了正文之后才记一次使用，记下当时的引用和名字；卸载后历史照样能读。

## 能力包：你的插件怎样出现在里面

能力包是设置里把「做一类事要用的东西」放在一起看的地方：技能、MCP、工具，以及搭配的角色和角色的提示词。

- **插件就是包**：每个插件安装是一个包，Manifest 不加任何键。包里有什么由各自的主人替你上报：你的角色（`agent.roles`）、提示词（`agent.prompts` 和你登记的模型指令）、技能（`methods`、`agent.skills`）、你的角色 `host_tools` 里的工具、你提供连接驱动的连接所带的 MCP。另有两个包不属于任何插件：「Molis Work 自带」和「你的角色」。
- **一般不用写上报动作**：上面这些由各自的主人替你报（宿主的 Agent 定义登记、技能目录、Agent Host、连接器和插件安装服务）。只有你的插件自己保存了别的提示词、角色或 MCP 服务器（不经 Agent 定义登记、不在 Agent Host 的 MCP 库）时，才写一个上报动作：`defineKitReportAction`（`@molis-ai/molis-work-contracts/platform/kit-report`），只读、不连服务器，只能报 `prompt`、`role`、`mcp` 三类；来源和所属的包由汇总处按你的安装盖，回答里自称的丢掉；技能、工具和包头报了也不认。写法见能力包设计稿第 4.6 节。
- **提示词属于哪个角色**：`agent.prompts` 按角色的 `prompts` 点名归属（不写就归这个插件的全部角色）。直接调模型的指令（`defineInstructionPrompt`）可选写 `role_id`，说这段指令为哪个角色做事；必须是你自己在 `agent.roles` 里声明的角色，否则登记被拒（`agent_definitions.instruction_role_unknown`）。不写就归个人助理，因为默认都由个人助理执行。
- **包的状态**：从条目读出，不另存。条目缺能力、缺连接、只能本地 Agent 用时，包标「有要处理的」，并写清是哪一条、为什么。所以 `requires`、`connector_categories`、`native_only_reason` 写实，本人才看得懂。
- **导出导回**：本人可以把一个包导出成文件（`format: "molis.kit-pack"`）：内容包原样带签名，加上本人的提示词改写，以及角色、工具、MCP 的引用（只带名字和版本，不带配置、地址和凭据）。导回时各部分走各自的路：内容包走插件的安装确认；提示词改写逐条看过、版本对得上才套用；引用只核对这里有没有。
- **为什么内容包不带提示词改写**：装一个包不能改任何提示词。提示词改写是本人自己的数据，单独成文件、只给本人、逐条确认；如果装包就能带改写，任何人发的包都能悄悄改掉别的插件给模型的话。所以作者不要把「改过的提示词」塞进包里，要改默认就发新版本、升提示词的 `version`。

## 自检

- [ ] 只有声明的插件：`pack-content` 通过、`verify` 通过，装上后在「设置 › 能力包」里看到它，把技能调成「自动」或「仅手动」。
- [ ] 在助理里用 `/` 点名一次、在 Coding 的「选择方法」里选一次（`applies_to` 写了 `both` 才两边都有）。
- [ ] 正文改了就升了 `version`；`tools` 没写超出 `SKILL_TOOLS` 的名字；没指望 `scripts/` 被执行。
- [ ] 插件的提示词：要归某个角色的写了 `role_id` 或角色的 `prompts`，其余的默认归个人助理是你想要的。
