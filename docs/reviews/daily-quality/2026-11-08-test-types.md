# 2026-11-08 D0069：tests 类型检查阶段交付

状态：2026-11-09 用户批准先交付可运行检查命令与真实诊断；存量修复和必过CI另批。本命令当前非零退出，不表示已通过。

## 命令和口径

先按仓库要求离线安装并整体构建，再执行 `pnpm typecheck:tests`。配置为 `tooling/types/tsconfig.tests.json`，包含全部 `tests/**/*.ts` 根文件及它们的类型依赖。继承根strict、未使用检查与依赖声明检查设置，仅为noEmit关闭声明/声明映射输出，允许现有测试的TS扩展名导入，补DOM/DOM.Iterable与Node类型。ES2024库对应Node 24已提供的Promise.withResolvers等内建能力；不为压低数字更改strict、noUnused、断言或源码。

编译器命令失败如实返回非零。没有接入typecheck:all、Verify或其他必过CI；没有ignore/noCheck、错误白名单、诊断基线门禁或宽松类型替代。

## 冻结起点对照

基点为main `b7c4d4bd92ad342b8eb71f0df6f81a4a0d00233a`，Node 24.15.0、pnpm 11.9.0，已完整构建依赖声明。干净基线与A-1候选使用同一份配置。首次ES2022盘点为3,840条/867文件；将类型库校正到实际运行时的ES2024后，双方均为**3,051条诊断，涉及774个文件**。这个差异来自内建类型库校正，不冒充存量源码修复。依赖传递检查也会报告少量scripts文件，因此774不是仅tests目录的文件数。

本批新增的fetch观察回调显式补类型；连接器读取API增加重载后，旧测试的函数联合调用改为逐入口闭包，保留两个入口全部拒绝断言。按文件与错误码计数对照，候选没有新增诊断。该盘点不能证明不存在别的测试缺陷。

| 错误码 | 起点/候选诊断数 |
| --- | ---: |
| TS7006 | 702 |
| TS2345 | 554 |
| TS2339 | 313 |
| TS2322 | 261 |
| TS6133 | 203 |
| TS18046 | 128 |
| TS7016 | 99 |
| TS2352 | 86 |
| TS2353 | 77 |
| TS2741 | 65 |
| TS18048 | 58 |
| TS2739 | 52 |

## 后续批次

由各测试owner分批修真实问题，优先参数个数、错误的合同输入和缺失字段，再处理fixture上下文推断。每批保留运行时拒绝/副作用断言，不能用any、压制或关闭检查换绿。清完且在Linux验证稳定后，再单独review是否接入必过CI。跨版本数据/SDK合同变动先读现行合同，不批量按旧调用形状改产品。

本批D0012的编译期负向单独可复验：`pnpm exec tsc --noEmit --strict --skipLibCheck --module nodenext --target es2022 tests/types/directory-pass.ts`；同步返回通过，Promise、PromiseLike和含Promise的联合返回均必须报错（由expect-error验证）。
