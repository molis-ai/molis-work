# 图片插件验证与使用

## 当前交付

本地代码位于分支 `codex/image-generation-plugin`，基于 `f25ea17` 的独立工作树。未提交、推送、合并或替换已安装 App。现有主工作区的其他修改未搬入或覆盖。

入口：Molis Work 项目 → 图片 → 新建图片 → 管理服务。新增配置填服务名称、API 基址、模型和 API Key；提示词、尺寸 / 宽高比填写完后点击「生成图片」。历史记录中可预览、下载、使用原提示词再次创作。

| 接口 | API 基址示例 | 说明 |
| --- | --- | --- |
| OpenAI Images | `https://api.openai.com/v1` | 默认模型示例 `gpt-image-1.5`，可编辑；请求不发送 GPT Image 不支持的 `response_format` |
| Gemini generateContent | `https://generativelanguage.googleapis.com/v1beta` | 默认模型示例 `gemini-3.1-flash-image`，可编辑；宽高比仅发送给 Gemini |
| 兼容服务 | 厂商提供的完整 API 基址 | 支持同步 `/images/generations`，尺寸按厂商填写；可处理 Base64 或临时 URL |
| 本机兼容工具 | 例如 `http://127.0.0.1:端口/v1` | 仅 loopback 可以使用 HTTP；无鉴权本地服务可不填 Key |

尺寸留空采用厂商默认。不声称每个厂商或账号均已验证。远程 MCP 工具、图生图、蒙版、专有异步接口和 Artifact 发布未在本次范围内。

## 已执行的工程验证

- Workspace 各包构建、根 launcher / SDK TypeScript 编译、PTY 浏览器资源构建通过；新插件、Workbench、Local Host 修改后分别重新编译。
- 图片 provider / service、插件注册 / 路由、完整 HTTP 浏览器链路、创作插件兼容性、声明式挂载和 Workbench 注册边界的定向检查通过。
- 协议覆盖 OpenAI Base64 / URL、Gemini camelCase / snake_case 图片、过滤思考图片、无图响应、401 / 429等错误、体积限制、10 MB Base64、取消、超时与无自动重试。
- 服务覆盖同请求幂等和冲突、项目隔离、密钥不入数据库与任务、端点变更重新填 Key、运行中配置快照、并发限制、取消晚响应、重启恢复、另一个真实进程不能误标运行记录。最终补丁另用故障注入验证 SQLITE_BUSY、关闭失败、初始化清理失败时全部任务中止并释放运行锁。
- 图片 HTTP 使用 Host 解析出的项目，忽略正文伪造的项目 ID；图片下载同样隔离。下载内容与接口返回字节相同。
- `git diff --check` 通过。锁文件仅新增工作区依赖，没有升级外部依赖。

复跑：

```bash
node --import tsx --test --test-concurrency=1 tests/images-service.test.ts tests/images-providers.test.ts tests/images-plugin.test.ts tests/images-plugin.e2e.test.ts tests/creative-tools-plugins.test.ts tests/plugin-declarative-mounting.test.ts tests/workbench-registration-boundaries.test.mjs
```

新工作树离线安装时，已有三个 vendor 包的注册表元数据返回404。已核对仓库内 tgz，单次命令只豁免这三个精确版本的 release-age 元数据检查；没有修改用户或项目安全配置，没有新下载。随后构建既有 better-sqlite3、node-pty 与 esbuild 原生依赖。

## 可见页面实操

在独立示例数据和最终构建的 Web Workbench 中，通过 Codex 浏览器实际点击：打开插件 → 新建 → 保存兼容接口 → 输入提示词 → 生成 → 查看图片 → 下载入口 → 刷新 → 重新打开历史；也检查了地址错误后编辑连接并复用提示词恢复，以及 390px 窄屏的图片显示与返回列表。

受控服务在本机返回明确标注的测试图，界面记录命名为「本地验证接口（非真实生图）」。测试图只证明网络接线、文件保存、浏览器预览和恢复流程；不是模型生成能力或图像质量证据。自动化浏览器另覆盖厂商429失败路径。

## 全仓检查限制与未验证

- Workspace inventory / package boundary 仍报告原有 `plugins/native/pages` 依赖声明与清单不一致。此行在基线已不一致，与图片插件无关，未扩大修改范围。
- `tests/uninstall.test.ts` 的安装fixture在既有 lowlight → `@types/hast` 依赖解析处失败。已将 images 纳入统一 personal home purge 清单，但完整安装 / 卸载链路因此未通过；未宣称桌面发行验收。
- 真实 OpenAI、Gemini、国内兼容厂商的付费请求、账号模型权限、图片质量、原生桌面包、中文输入法与真人主观体验均为 **UNVERIFIED**。需要用户在插件配置自己的服务，再实际生成并验收。
- 当前限时180秒、每台机器同时最多2个任务。停止等待或超时不保证厂商停止生成或计费；不会自动再次发送请求。
- 结果 URL 限制 HTTPS 与已配置本机服务的同源例外，拒绝明显私网地址，下载不携带 Key、不跟随重定向；尚未实现 DNS 解析固定或完整 DNS 重绑定防护。

预览数据目录：`/tmp/molis-images-preview-20260922`。预览服务端口4197；仅供链路演示的本地接口端口49198。两者都与用户正式 Home 分开。
