# CGS 固定依赖包

业务源码唯一维护方是 Content Growth Studio。这里消费 `@adeptify/cgs-work` 的固定包；不包含作者数据、凭据、node_modules 或其他实验产物。

构建工具在 CGS 的 `scripts/work/build-package.mjs`，参数是当前 Work 构建目录和一个尚不存在的输出目录；随后在该输出目录运行 `npm pack`。包内 `provenance.json` 记录源码、界面和方法哈希；旁文件记录归档 SHA-256、完整性及来源状态。

当前包 0.26.10 从 Content Growth Studio 提交 `6d2e5e688dffa4545aca237d13e1dc546c9f5ef2` 的源码归档重新构建。该提交包含构建脚本与锁文件；Node 24.19.0，使用本 Work 分支已验证的构建提供 esbuild 和 Design System。包内及旁文件的来源记录均指向该提交，归档 SHA-256 和完整性值按实际字节生成。

与上一轮验收包逐项比较，71 个文件仅 provenance.json 变化，运行代码、类型、方法、提示词和 UI 资源完全相同。此前 0.25.0、0.26.4 和未提交来源的 0.26.10 保存在外置验收证据，不继续作为仓库依赖。用户现已授权提交到远端；发布、主线合并与真实作者验收仍未执行。

验收范围和用户批准的脚本预算见 `specs/cgs-formal-integration/spec.md`。
