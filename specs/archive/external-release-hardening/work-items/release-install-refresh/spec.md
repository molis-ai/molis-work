# 安装、构建与同版本刷新

## 目标

任何安装路径都不能悄悄安装旧 `dist`，同一个语义版本的开发快照内容变化也必须能安全刷新；
用户清楚知道为何当前 Runtime Session 仍需重启以及如何续接。

## 范围

- release manifest 记录 `content_digest`，覆盖发布时实际复制的程序、Skill、package 元数据与
  生产依赖清单；同版本摘要不同按受控 refresh 原子替换。
- 提供唯一仓库本地安装脚本，固定 `build -> install --source`；直接从带 `src` 的仓库 source
  安装时检查构建新鲜度，过期则明确失败并给出正确命令。
- npm pack 继续依赖 `prepack` build；安装结果区分 unchanged 与 refreshed。
- 接入完成提示明确说明：宿主在 Session 启动时读取 MCP/Skill 清单，所以当前 Session 不会
  动态出现工具；提供“重启后继续”的可复制提示和状态检查。
- 同版本刷新后由 service manager/明确命令重启 Web；不静默杀死未知进程。

## 验收

- 修改源码但不 build 后直接本地 install 会失败，不会复制旧产物。
- 唯一本地安装脚本总是先 build。
- version 相同、digest 不同时 release 被原子刷新；相同时 unchanged。
- 失败回滚保留上一份可用 release、launchers 和用户项目。
- Codex/Claude 接入文案解释重启原因和续接步骤。

## 修改边界与验证

- `src/install/home.ts`、`src/cli/main.ts`、`src/install/runtime-integration.ts`、package scripts、文档与测试。

```bash
node --import tsx --test tests/install.test.ts tests/runtime-integration.test.ts tests/e2e.test.ts
pnpm typecheck
```
