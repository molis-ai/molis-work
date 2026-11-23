# BL-1064 · macOS 插件沙箱的 Node 运行时

> 归档（2026-11-23）：判定为**已实现**。[#2275](https://github.com/molis-ai/molis-work/pull/2275) 已随 `ae014586f4` 合入 main。SBXN-01 至 SBXN-04 均通过，包含真实 Homebrew CLI 安装、Seatbelt 隔离和提示词绑定。

Homebrew `node@24` 24.22.2 的 ARM64 安装包引用 `@rpath/libnode.137.dylib`，`LC_RPATH` 依次是 `@loader_path` 和 `@loader_path/../lib`。常规安装从 `/opt/homebrew/Cellar/node@24/24.22.2/lib/libnode.137.dylib` 加载，`copyLoaderLibraries` 将它拷到复制后的 `runtime/node` 旁边。重定位到临时目录的实测进程共加载 19 个 Homebrew dylib，包含 libnode 和其他 keg 的直接与间接依赖。桌面脚本从 nodejs.org 下载校验过的官方 Node 24.15.0，实测只链接系统库。项目库所需的 Node 版本、发行脚本和安装器复制行为沿用现有约定。[Homebrew 24.22.2 安装包定义](https://github.com/Homebrew/homebrew-core/blob/3508a36bf8ac8d6a8c563998674b9b1ca511ddc2/Formula/n/node%4024.rb)

沙箱启动前以空环境、禁用原生扩展的独立 Node 进程读取 dyld 实际加载的镜像路径，包含间接依赖。允许范围为 Node 旁边或 Node 安装的 `lib/` 内实际加载的 dylib，以及 Homebrew keg 的 `lib/` 内实际加载的 dylib。先解析真实路径，从目录外指进来的链接不能扩大允许范围。Seatbelt 逐个允许库文件读取。预检读不到依赖或依赖不符合边界时，返回带有官方 Node 更换指引的固定诊断。安装入口用现有运行时错误向用户传达该诊断，不转交插件或 dyld 的 stderr。

## 验收

- **SBXN-01** 解析实际的 `@rpath` 目标、间接的 Homebrew 库和复制到 `runtime/node` 旁的库。官方 Node 无需追加库权限。
- **SBXN-02** 真实 Seatbelt 能读取给定库文件，同目录的其他文件、宿主文件和现有隔离断言继续被拒。
- **SBXN-03** 依赖缺失或越界时在执行插件前返回 `sandbox.node_runtime_unavailable`，安装入口返回同一条可读诊断。插件启动时限继续生效。
- **SBXN-04** 用隔离 Home 核对 `tests/generated-plugin-prompt-binding.test.ts` 的基线与修复结果，记录对同因判断的证据。

使用锁定的 Node 与 pnpm 先跑 `pnpm build`，再经机器槽按 `--jobs 1` 跑插件沙箱 README 指定的用例和提示词绑定回归。

## 复现

同一份干净主线 `5bfd52b87b` 和隔离 Home 用例中，官方 Node 24.15.0 跑过提示词绑定测试。换成重定位到临时目录的 Homebrew 24.22.2 bottle 后，同一用例在首次安装报「Plugin entrypoint 启动失败，已记录为 crashed」。用原有 Seatbelt 读权限启动同一份 Homebrew Node，进程以 134 退出。修复以第 47 批合入后的主线 `8192cc7b10` 为基点。

## 本地验证结果

- SBXN-01、SBXN-02、SBXN-03 通过。官方 Node 24.15.0 构建完成，沙箱和安装定向回归 18/18 文件通过。真实 Seatbelt 用例启动带 `@rpath` 的 Node，允许读已加载的库，拒绝读同目录其他文件。越界链接、缺失依赖和已安装插件启用的诊断均按预期返回。
- SBXN-04 通过。修复后官方 Node 和 Homebrew 的提示词绑定回归都通过。Homebrew 24.22.2 另通过实际 CLI 安装和 Seatbelt 隔离测试，共 3 文件 7 条。原提示词基线条目与 BL-1064 同因。

## 合入验证

锁定的官方 Node 24.15.0 下，复查提交通过构建和 15 个定向回归文件。合并队列通过 `Verify`，合入后核对了主线的沙箱、安装入口与回归测试内容。 [PR CI](https://github.com/molis-ai/molis-work/actions/runs/45249740994) · [队列 Verify](https://github.com/molis-ai/molis-work/actions/runs/45273648820/job/138047562002)

队列首轮的旧签名金样读取一度返回 `unexpected_error`。同一组合提交在隔离 Home 按 CI 的并行设置回放三份金样均通过，GitHub 重新入队后也通过三份。 [首轮结果](https://github.com/molis-ai/molis-work/actions/runs/45265930920/job/138015460411) · [回放复验](https://github.com/molis-ai/molis-work/actions/runs/45273648820/job/138039953215)
