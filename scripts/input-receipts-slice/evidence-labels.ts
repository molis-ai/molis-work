/** Where a piece of evidence comes from, as the person reads it. */
const SOURCE: Readonly<Record<string, string>> = { ledger: "SDK 事件", projection: "SDK 投影", queue: "会话排队", molis: "Molis 层（模拟）" };
export const evidenceSourceLabel = (source: string): string => SOURCE[source] ?? source;
