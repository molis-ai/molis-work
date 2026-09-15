# 安装与维护（Molis Work）

> 详细安装、更新、启动、卸载与演示数据说明。快速上手见 [README](../README.zh.md) 的「3 分钟体验」。

## macOS Desktop 安装包

安装实现已迁至 Local Host；从源码安装前需完整构建，包括清理并重建所有 workspace 包。旧构建会被拒绝，已有安装不受这次拒绝影响。当前分发验收、实际 App 升级/恢复和独立 npm 消费证据集中在 [DV4 验收报告](../specs/molis-work-architecture-reorganization/dv4-validation.md)。本机内部包验证不代表 Apple 公证、Intel 实机或公开发布资格。

普通 macOS 用户优先从 [GitHub Releases](https://github.com/molis-ai/molis-work/releases) 下载 `macos-arm64`（Apple Silicon）或 `macos-x64`（Intel）DMG，把 Molis Work 拖入 Applications 后启动。App 内含匹配架构的 Node、Molis Work Core 和生产依赖；首次打开才调用同一套 `molis-work install` 服务写入 `~/.molis-work`，随后启动本地 Web。它不会在首次启动时创建项目、接入 Runtime、创建 demo 或修改用户项目。

开发者可以从仓库运行：

```bash
pnpm desktop:build:macos    # release/macos 中生成 DMG、App zip 与 SHA256
pnpm desktop:install:macos  # 安装到 ~/Applications；旧 Molis Work / 已确认归属的 GoalBoard.app 先移入废纸篓
pnpm desktop:start:macos    # 启动已安装 App
```

自动化或验收时可设置 `MOLIS_WORK_SKIP_OPEN=1`，只安装、不立即打开窗口；也可以用 `MOLIS_WORK_APP_DIR` 指定其他用户级安装目录。

构建脚本下载固定的 Node LTS，并使用 Node 官方 `SHASUMS256.txt` 校验后再生成 payload。Apple Silicon 与 Intel 分别构建，不能把两个架构的 native addon 混成一个伪 universal 包。未显式提供 `APPLE_SIGNING_IDENTITY` 时，脚本固定使用 `-`（内部 ad-hoc），避免 Tauri 自动选择本机其他开发证书；指定身份则原样保留。产物通过 codesign 完整性验证后，输出实际签名信息。签名完整不代表 Apple 公证或 Gatekeeper 放行；脚本不会替用户删除 quarantine 标记。

当前 [发布 workflow](../.github/workflows/release-macos.yml) 仅手动触发，自动 tag 触发已暂停。恢复自动 `v*` 发布前需要另行修改触发器，并配置完整 Apple Secrets；既有公开发布条件要求 Developer ID 签名与 Apple 公证。此重组不修改触发器、不上传发行物，也不把内部验证产物视为公开可发布版本。

## 安装边界

开发者分发 npm 安装包时，先在仓库执行 `pnpm package:npm`，产物在 `release/npm/`。消费者在自己的目录运行 `npm install /absolute/adeptify-molis-work-版本.tgz`，然后使用 `npx --no-install molis-work --help` 或 `npx --no-install molis-work install`。npm 路径要求已有 Node 24+，会正常安装当前平台的原生依赖；不要使用 `--ignore-scripts`。它不依赖源码仓库，也不要求单独发布私有 workspace 子包。安装 npm 包本身不会启动服务或连接 Runtime；`molis-work install` 才写入下面说明的 Home。

`molis-work install` 只维护 `~/.molis-work`：版本化程序与共享 Skill、MCP/Web/CLI 启动入口、项目 DB 根目录、日志和安装清单。它不会创建或启动项目，不会写入用户项目，也不会修改任何 Runtime 的用户级配置。之后若要把 MCP 入口注册到某个 Runtime，必须走用户确认的 Runtime 集成流程。

从仓库本地安装请使用 `pnpm install:local`；这个唯一入口会先重新构建，再安装当前内容。直接对带 `src/` 的仓库执行 `molis-work install --source ...` 时，安装器会核对构建指纹，源码与 `dist` 不一致就停止，不会悄悄复制旧构建。release 同时记录内容摘要：版本相同但程序或 Skill 内容变化时会原子刷新，内容完全相同才返回“已经是最新状态”；刷新失败会恢复上一份 release，项目数据不参与替换。

项目使用不可变的 `project_id` 区分，显示名称可以改名或重名；每个项目都有自己的 `molis-work.db`。`projects/catalog.db` 保存项目身份、DB 位置、可选 Session 绑定、workspace 与多个项目的历史关联、用户显式设置的唯一默认项目，以及删除收据；不复制 Goal 事实，也不依赖 Git。普通项目选择不会自动成为目录默认项，新 Session 会拿到历史候选并询问；只有用户单独设置默认后才会自动恢复。解绑关联不删除项目；删除项目及其 DB 必须单独确认，并会拒绝仍有有效 Claim 或未结束 Run 的项目。

## 更新已有安装

### 离线备份与恢复边界

当前没有通用在线备份命令。备份前退出 App，并按服务的所有权检查停止 Molis Work 服务及其他写入进程；仅退出窗口不保证后台停止。将整个 Molis Work Home 复制到受保护的位置，不要只复制项目 `.db`：Catalog、Session Registry、加密正文 Blob 和对应密钥必须保持同一份快照。外部工作区文件仍需单独备份。

恢复时同样先停止所有写入，保留故障目录供回退，将完整备份恢复到原 Home 绝对路径，再启动并核对项目、Goal 正文/历史、Artifact 版本和 Session 内容。Catalog 保存项目数据库路径，因此此流程不是跨目录或跨机器迁移。Keychain 或环境变量提供的密钥不随 Home 文件复制，必须另行确认其仍可用；不要用新密钥替换丢失的旧密钥。缺密钥时加密内容应保持不可读，而不是生成空数据冒充恢复成功。

离线完整恢复、恢复后续写及缺密钥拒绝的生产路径测试见 [恢复测试](../tests/home-backup-recovery.test.ts)。这不代表在线一致性备份、跨机器 Keychain 恢复或外部工作区内容已验证。

已经从仓库安装过时，先拉取新内容，再走同一个安装入口。即使版本号没有变化，安装器也会比较实际内容并刷新程序和 Skill；用户项目、Runtime 配置和 demo 都不会被自动改写：

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm install:local

# 正在使用常驻 Web 时先检查：旧配置只能用 install 原子修复
"$HOME/.molis-work/bin/molis-work" service status --home "$HOME/.molis-work" --json
"$HOME/.molis-work/bin/molis-work" service install --home "$HOME/.molis-work" --confirm

# 仅当配置无需修复、只需加载新内容时才 restart
"$HOME/.molis-work/bin/molis-work" service restart --home "$HOME/.molis-work" --confirm
```

`status=needs_repair` 时直接执行 `service install`，不要先尝试 `restart`。`install` 会重写 Molis Work 自己拥有的 plist 和 receipt、受控重启并在失败时回滚；未知 LaunchAgent 或外部端口监听者仍不会被接管。

本体升级不会静默改写 Runtime 配置或 Skill 链接。只要这次 Release 改过 MCP 或 `skills/goal-advance`，还必须打开 Molis Work 的“设置 → AI 与执行工具”：已由 Molis Work 管理但仍指向旧 Release 的 Runtime 会显示“需要修复”，先预览，再由用户确认修复。只有该页回到“已接入”、Skill 链接指向安装清单中的当前 Release，才可以对依赖 Runtime 协议的修复报告“已安装”。Core、App 和 Web service 版本一致不能代替这一步；未知同名配置或 Skill 仍保持冲突，不得覆盖。

更新 MCP 或 Skill 后还要新开 Runtime Session，因为已经运行的 Session 不会重新加载工具。若要让内置 demo 使用新版示范内容，再单独执行 `molis-work demo reset --confirm`；它会清除 demo 内的改动，但不会影响用户项目。

### 发布后的最终产物验收

发布者只有逐层完成下面的核对，才能把消费者可见修复标成“已安装”：

1. Git tag、Release 资产和校验和来自同一提交；App 内嵌 Runtime 与 `~/.molis-work` 安装清单版本一致。
2. 常驻服务按 `status` 返回的动作恢复为 `running`，并确认 LaunchAgent、监听端口和 `/health` 属于同一实例。
3. 对每个已经接入且由 Molis Work 管理的 Runtime 检查“设置 → AI 与执行工具”；`needs_repair` 必须经当前用户预览并确认后收敛为 `connected`。这一步同时更新 MCP 配置与 Skill 链接，失败会回滚。
4. 关闭并新建一个 Runtime Session，确认它加载了当前 Release 的工具声明和 Skill；旧 Session 不能作为新版本验收证据。
5. 最后使用真实项目和代表性数据检查用户可见结果。源码、自动化测试、包内字符串、版本号和页面 HTML 只能分别证明对应层，不能代替最终 App 的计算后样式与完整旅程。

如果旧 Session 随后报告 catalog schema 高于当前 reader 支持范围，这表示运行中的 MCP 已过期，不表示数据库损坏。不要回滚 `catalog.db`，也不要用 SQLite、CLI 或 Web 绕过写入。新建或 Fork Session 后，先确认消息确实落在新任务，再只读解析当前 Molis Work 项目；解析成功后才继续写入。宿主显示“已导航”不等于下一条消息一定进入了新任务。

## 演示数据

安装后的 CLI 和 Web“设置 → 项目”都能创建同一份演示数据。先预览，明确确认后才写入：

```bash
"$HOME/.molis-work/bin/molis-work" demo create
"$HOME/.molis-work/bin/molis-work" demo create --confirm
"$HOME/.molis-work/bin/molis-work" demo reset --confirm
"$HOME/.molis-work/bin/molis-work" demo remove --confirm
```

这份项目在 catalog 中明确标记为 `regenerable_demo`，与 `user`、`migrated_user` 用户数据分开。重复创建会打开已有 demo；重建会清除 demo 内的改动；删除和普通卸载都只清理可再生 demo，不会碰用户项目。仓库开发和截图也可以继续使用 `examples/seed-demo.mts`，它调用的是同一套分类和重建逻辑。

## 启动 Web：常驻或临时

已经接入 Molis Work Skill 的 Runtime 中，可以直接说：

> 启动 Molis Work

Runtime 会先只读检查 `molis-work service status`，不会替用户猜运行方式。macOS 上，如果常驻服务尚未配置而用户只说“启动/打开 Molis Work”，Runtime 会一次说明临时打开与启用登录常驻两种真实选择：临时打开只随当前终端或 Session 存活；启用登录常驻会安装 Molis Work 管理的用户级 LaunchAgent，关闭终端后仍运行并在登录后启动。用户明确选择其中一种后就沿该路径执行，不再重复确认同一个选择；选择前不会启动 Web 或写系统配置。

用户一开始已经明确说“临时打开”时，这句话就是前台启动授权，Runtime 说明生命周期后直接执行。用户明确要求“启用登录常驻”时，这句话就是首次安装授权，Runtime 说明 LaunchAgent 影响后直接执行。旧配置需要修复是另一种配置变更，仍要说明将重写和重启哪些受管配置并取得修复授权；未知同名服务或端口冲突不会被覆盖、接管或停止。服务命令只有在页面健康可访问且属于本次受管实例后才报告成功。升级期间若受管旧进程的 health 响应还没有 PID 字段，只有 ownership receipt/plist 均有效、LaunchAgent PID 与 4173 的唯一监听 PID 精确相同时才兼容判为当前实例；PID 不同或无法证明时仍报告冲突。

“用 Molis Work 继续项目”“推进这个 Goal”“连接或打开一个项目/Goal”仍只走 Runtime 的 Goal 工作流，不会启动 Web。Web 不是项目连接、澄清、执行或复核的前置条件；用户接受一次可视化建议后，如果服务尚未配置，也仍使用上面同一轮临时/常驻选择。

如果只想当前终端临时使用，可以直接说：

> 临时打开 Molis Work

这会运行前台 `molis-work-web`；终端或 Runtime Session 关闭后页面也会停止。非 macOS 当前只支持这种前台方式，不会用 `nohup` 或普通后台 shell 冒充系统级常驻服务。

### 手动启动

```bash
# Web 只从 Molis Work 自己的项目目录列出可浏览项目
"$HOME/.molis-work/bin/molis-work-web" --home "$HOME/.molis-work"
```

打开 `http://127.0.0.1:4173` 后，可以在设置中创建、导入、改名和打开项目，也可以先配置 Runtime 接入。选择一个项目只改变网页浏览位置，不会自动绑定或切换当前 Runtime Session；已有旧 DB 只有明确选择并确认后才会迁入项目。macOS 上也可运行 Desktop 安装包，或从仓库执行 `pnpm desktop`；二者都是同一套页面与本地数据的窗口壳。

直接运行 `molis-work-web` 仍是前台模式，适合临时调试；关闭终端会同时关闭页面。macOS 上可改用用户级 LaunchAgent 常驻服务，先预览再确认：

```bash
# 只预览，不写任何系统配置
"$HOME/.molis-work/bin/molis-work" service install --home "$HOME/.molis-work"

# 明确确认后安装并启动；登录自动启动，异常退出自动恢复
"$HOME/.molis-work/bin/molis-work" service install --home "$HOME/.molis-work" --confirm

"$HOME/.molis-work/bin/molis-work" service status --home "$HOME/.molis-work"
```

`stop` 只停止当前服务并保留登录启动；`remove` 才会停止并移除 Molis Work 自己创建且未被改写的 LaunchAgent。日志位于 `~/.molis-work/logs/web-service.log` 和 `web-service.error.log`。非 macOS 会明确显示暂不支持，不会用普通后台 shell 假装安装成功。也可以在 Web 的“设置 → 诊断”中完成同样的预览和确认。

## 安全卸载

普通卸载先生成计划，不带 `--confirm` 不会修改任何文件。确认后只撤销仍由 Molis Work ownership receipt 证明属于自己的 Runtime 接入、LaunchAgent、启动器和 release，并清理明确标记为可重建的 demo；用户项目、catalog、备份和日志都会保留，重新安装后可继续使用：

```bash
"$HOME/.molis-work/bin/molis-work" uninstall
"$HOME/.molis-work/bin/molis-work" uninstall --confirm
```

永久清除用户数据是另一项独立操作，不能复用普通卸载的一次确认。预览会给出精确 home 和用户项目数量；执行时必须把两者原样再提供一次：

```bash
"$HOME/.molis-work/bin/molis-work" uninstall --purge-user-data
"$HOME/.molis-work/bin/molis-work" uninstall --purge-user-data --confirm \
  --confirm-home "$HOME/.molis-work" --confirm-project-count N
```

如果 Runtime 配置、Skill 链接、LaunchAgent 或启动器已被用户改写，卸载会报告冲突并停止，不会扩大删除范围。执行中失败会在 `~/.molis-work/config/uninstall.json` 留下完成步骤、保留项目和错误，可在修复冲突后重新预览并继续。

## 安装后的下一步

`molis-work install` 只完成 Molis Work 本体安装，默认输出安装位置、CLI/MCP/Web 启动器和安全边界；自动化可以使用 `molis-work install --json`。安装不会顺带创建项目、关联 Session、启动服务或修改 Runtime 配置。

安装后的 Runtime 接入由同一领域服务完成。当前 adapter 会只读探测 Codex 和 Claude Code，并先生成包含配置路径、Molis Work MCP entry、Skill 链接、备份位置和重启说明的预览；只有用户对当前 Runtime 和当前 plan 明确确认后才会写入。MCP 与 Skill 作为一个事务验证，失败会恢复原配置字节和原 Skill 状态。移除时只撤销 Molis Work ownership receipt 记录且仍未被用户改写的内容。未知同名配置或 Skill 会显示冲突，不会被覆盖。

接入确认完成后，**必须新开 Codex / Claude Code Session**才会生效：Runtime 只在 Session 启动时读取 MCP 与 Skill 清单，当前对话不会动态出现刚写入的工具。新 Session 可直接复制「继续用 Molis Work」续接；Molis Work 会展示当前目录以前使用过的项目并请你确认。若希望以后自动进入某个项目，需要另外明确把它设为目录默认。接入预览界面会逐条展示改动内容和这段续接说明。

项目创建和当前 Session 关联是独立操作：用户在当前 Runtime 调用统一 Skill 后，Skill 使用 `context-list-projects`、`context-bind` 或 `context-create-and-bind`，并且只在用户明确选择后写入 Molis Work 自己的数据目录。Web 可创建、导入、改名和打开项目，也可管理已经确认过的 Session 与 workspace 关联；网页中的项目选择本身不会改变 Runtime 连接，新 Session 默认仍要先询问，除非用户明确设置了目录默认项目。

Web 只监听 loopback 地址。控制令牌保存在 Molis Work home 的 `config/web-control-token`，并写入本机页面；所有 Web API 写请求还必须通过同源 Origin、控制令牌和一次性操作键校验。非本机 Host、第三方页面盲发、缺少凭据或重复请求都会在进入项目 catalog、Runtime 配置服务或 Goal Coordinator 前被拒绝。这个浏览器门禁不替代各领域流程原有的用户确认和幂等规则。
