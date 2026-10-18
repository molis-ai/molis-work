补充防腐 spec §10.26 的独立复查，按具体 head 区分已合入与在途变更，核对行为变化依据、断言替换、合并冲突和资源预算许可的消耗顺序。

提交前以 main `4b063bf98` 补核 #667、#669、#671、#672、#674、#677、#679、#682，并确认 #681 已将对象引用种类边界改为 S-32。其余在途记录明确保留原审阅 head；#683～#685 不冒称已经复核。仅修改 `specs/repository-anti-corruption/spec.md`，不修改产品、测试或门禁。

验证：`node scripts/check-health-gates.mjs --base origin/main`、`git diff --check`、提交后的 `node scripts/check-secrets.mjs`。不加标签，后续排队与合并由统筹处理。
