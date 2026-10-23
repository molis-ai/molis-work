/**
 * What a page holds after a garbage collection (specs/visual-ui-experience VUX-36): Chrome's own node and listener counters
 * and how many arrays its heap holds. Repeat a thing, count before and after: what grows with the count is kept for good.
 */
type Command = <T = unknown>(method: string, params: Record<string, unknown>, sessionId?: string) => Promise<T>;

export async function domCounters(command: Command, sessionId: string) {
  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  for (let i = 0; i < 2; i++) { await command("HeapProfiler.collectGarbage", {}, sessionId); await pause(200); }
  const { nodes, jsEventListeners } = await command<{ nodes: number; jsEventListeners: number }>("Memory.getDOMCounters", {}, sessionId);
  const count = async (kind: string) => {
    const proto = await command<{ result: { objectId: string } }>("Runtime.evaluate", { expression: `${kind}.prototype` }, sessionId);
    const found = await command<{ objects: { objectId: string } }>("Runtime.queryObjects", { prototypeObjectId: proto.result.objectId }, sessionId);
    const length = (await command<{ result: { value: number } }>("Runtime.callFunctionOn", { objectId: found.objects.objectId, functionDeclaration: "function () { return this.length; }", returnByValue: true }, sessionId)).result.value;
    // The list holds every array of the heap and whatever they hold, for as long as DevTools keeps it: let it go.
    for (const objectId of [found.objects.objectId, proto.result.objectId]) await command("Runtime.releaseObject", { objectId }, sessionId);
    return length;
  };
  return { nodes, listeners: jsEventListeners, arrays: await count("Array") };
}
