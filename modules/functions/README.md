# 判断函数与一次判断

拥有已发布函数和每一次判断记录。插件只做人写和试跑的界面。

包名：`@molis-ai/molis-work-module-functions`。

公开入口是 [src/index.ts](src/index.ts)。Host 注入 TypeSafe provider 与行为名单。

```bash
pnpm --filter @molis-ai/molis-work-module-functions typecheck
pnpm --filter @molis-ai/molis-work-module-functions build
node --import tsx --test --test-concurrency=1 tests/functions-system-capability.test.ts
```

- Status: `partial`
- Contract: `@molis-ai/molis-work-contracts/modules/functions`
- Migration: `goal-reorg-f2`
- SSOT: `specs/functions-system-capability/spec.md`；事件去向动作范围 `specs/function-scene-action-scope/spec.md`
