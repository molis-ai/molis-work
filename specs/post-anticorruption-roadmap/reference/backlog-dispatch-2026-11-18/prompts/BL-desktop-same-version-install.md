# BL-desktop-same-version-install · 重新安装同版本开发 App 后，用上刚编出来的版本

两个开发包版本号都一样，后装的 App 已复制成功，打开后 Home 却可能还在运行前一个包。

预计 **6–12 工时**。维护范围为桌面与发版。正式交付项为 [94-1](../../batches/94.md#batch-94-item-1)。[原始待办](../../../../backlog/BL-desktop-same-version-install.md) · [派工总表](../README.md)

## 可复制的开工 Prompt

```text
在 goalboard 仓库完成 BL-desktop-same-version-install。正式交付项为 94-1，批次文件在 specs/post-anticorruption-roadmap/reference/batches/94.md。开工前同步核对当前 main、协调单 #1743 和对应开放 PR，沿原认领交接。读 specs/backlog/BL-desktop-same-version-install.md。产品决定与验收按该 BL 的现行记录。

目标
重新安装同版本开发 App 后，用上刚编出来的版本。两个开发包版本号都一样，后装的 App 已复制成功，打开后 Home 却可能还在运行前一个包。

实施
先在临时安装位置和隔离 Home 里用同版本、内容可区分的 A/B 两个本机构建复现。沿 apps/desktop/tooling/install-macos-app.sh 到 apps/desktop/adapters/tauri/src/web_service.rs 的 embedded_version_is_upgrade 和启动路径，确认旧的是 App 还是 Home 的运行程序。复用可靠的构建身份或明确的本地安装意图，在用户主动重装开发包时只换一次。保留正式升级、较新已装版本与回滚保留的判断。

验收
用 A、B 的实际运行输出证明 A→同版本 B 能换，重开 B 不反复安装。复验较新版本与回滚保留。运行 cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml 与 node scripts/run-tests.mjs tests/desktop-shell-bootstrap.test.ts。用临时位置模拟 Applications。

协作
单独交桌面写手。#1818 在做签名，与此处 Home 启动判断分工不同。无需分发、签名或动日常 Home。

交付时列出实际改动、已通过的定向验证及尚未验证的部分。按仓库约定执行本地开发与验收，推送和开 PR 沿用仓库授权规则。
```
