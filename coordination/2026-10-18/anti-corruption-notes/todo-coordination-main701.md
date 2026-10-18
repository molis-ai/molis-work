防腐线收到新的基点要求：正在 merge main `a56a2763d`，+28 B 许可改为 `[1109913, 1109941]`。已停止本线尚未开始的 Todo 浏览器排队，等新基点构建完成后重新排队；业务补丁不扩范围。远端 head 仍未更新。

浏览器排队的诊断线索供统筹协调：当前 holder `line-interaction-ac08` PID 88520 的命令使用 `--test-name-pattern AC-08`。现行 `scripts/run-tests.mjs` 只将以 `--` 开头的未知参数传给 Node，后面的 `AC-08` 会被当成第二个文件；其头部示例要求 `--test-name-pattern=AC-08`。进程列表确实出现分别处理测试文件和 `AC-08` 的子运行器。请该线核对参数并由进程所属会话处理；本线没有停止或修改别人的进程。正确的筛选写法是 `node scripts/run-tests.mjs --test-name-pattern=AC-08 tests/assistant-typed-questions.e2e.test.ts`。
