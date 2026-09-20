import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Some local proxies return RFC 2544 synthetic addresses for public names.
 * When a proxy is explicitly configured, resolve that name over HTTPS instead.
 * Prologue still checks EVERY returned address, including private answers.
 * Ordinary private DNS never triggers this fallback. No credential goes to DNS.
 */
interface ModelDnsPorts {
  lookup(hostname: string): Promise<readonly string[]>;
  fetch: typeof fetch;
  hasProxy(): boolean;
}
const nodeDns: ModelDnsPorts = {
  lookup: async (hostname) => (await lookup(hostname, { all: true })).map((entry) => entry.address),
  fetch: (...args) => fetch(...args),
  hasProxy: () => ["https_proxy", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"].some((name) => Boolean(process.env[name])),
};

export async function resolveModelHostname(hostname: string, ports: ModelDnsPorts = nodeDns): Promise<readonly string[]> {
  const addresses = await ports.lookup(hostname);
  const hasProxy = ports.hasProxy();
  if (!hasProxy || !addresses.some(isSyntheticProxyAddress)) return addresses;
  const resolved = await Promise.all([1, 28].map(async (type) => {
    const url = new URL("https://dns.google/resolve");
    url.searchParams.set("name", hostname);
    url.searchParams.set("type", String(type));
    const response = await ports.fetch(url, { signal: AbortSignal.timeout(8_000), redirect: "error" });
    if (!response.ok) throw new Error("代理 DNS 查询失败");
    const result = await response.json() as { Status?: number; Answer?: Array<{ type: number; data: string }> };
    if (result.Status !== 0) throw new Error("代理 DNS 没有返回可验证的地址");
    return (result.Answer ?? []).filter((answer) => (answer.type === 1 || answer.type === 28) && isIP(answer.data))
      .map((answer) => answer.data);
  }));
  const publicLookup = [...new Set(resolved.flat())];
  if (publicLookup.length === 0) throw new Error("代理 DNS 没有返回可验证的地址");
  // Never discard an ordinary private/mixed answer. The known synthetic IPv6
  // prefix accompanies Clash's RFC 2544 fake IPv4, and only that pair is replaced.
  const retained = addresses.filter((address) => !isSyntheticProxyAddress(address)
    && !address.toLowerCase().startsWith("fdfe:dcba:9876:"));
  return [...new Set([...publicLookup, ...retained])];
}

function isSyntheticProxyAddress(address: string): boolean {
  const parts = address.split(".");
  return parts.length === 4 && parts[0] === "198" && (parts[1] === "18" || parts[1] === "19");
}
