import { inDirectoryPass } from "@molis-ai/molis-work-kernel";
const answer: number = inDirectoryPass(() => 42);
declare const thenable: PromiseLike<number>;
declare const mixed: number | Promise<number>;
// @ts-expect-error D0012: an async callback outlives its synchronous pass.
inDirectoryPass(async () => 42);
// @ts-expect-error D0012: structural PromiseLike returns are asynchronous too.
inDirectoryPass(() => thenable);
// @ts-expect-error D0012: a branch may not return a Promise either.
inDirectoryPass(() => mixed);
void answer;
