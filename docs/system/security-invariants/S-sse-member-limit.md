# S-sse-member-limit

| ID | 不变量（拒绝什么） | 代码位置 | 测试（CI 里跑） | 测试（只在本机跑） |
| --- | --- | --- | --- | --- |
| S-sse-member-limit | D0027：每个经过身份验证的成员在同一Server实例最多八条项目/群聊SSE连接。超限在写响应头之前以结构化429拒绝，不占新名额。成员身份只来自Session，不取请求参数；访问先核验、持续重查，close/error/客户端取消及授权失效释放名额且仅释放一次，不影响另一成员 | `server/src/events.ts` 的 `ServerEvents.open`；`server/src/http.ts` 的SSE入口 | `tests/cross-device-http.test.ts`「IM SSE checks membership and server shutdown closes streams」 | — |
