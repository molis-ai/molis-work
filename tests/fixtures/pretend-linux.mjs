// `node --import` this to run a script down the code paths this repository takes on Linux, where the macOS sandbox does not exist. Packages under
// node_modules keep the real answer: a native one picks its prebuilt binary by platform when it loads, and that binary has to be this machine's.
const real = process.platform;
Object.defineProperty(process, "platform", { get: () => new Error().stack.includes("/node_modules/") ? real : "linux" });
