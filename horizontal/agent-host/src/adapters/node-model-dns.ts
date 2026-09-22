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
    const response = await queryPublicDns(hostname, type, ports.fetch);
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

// Remember only which transport answered, never DNS answers or permissions.
// This avoids paying the same failed endpoint's 8-second timeout for each tool.
const reachableDns = new WeakMap<typeof fetch, string>();
async function queryPublicDns(hostname: string, type: number, fetchDns: typeof fetch): Promise<Response> {
  // Only transport/HTTP availability can choose another resolver. A received
  // DNS answer (including NXDOMAIN, malformed or private data) is never retried
  // against another source to obtain a more permissive result.
  const endpoints = ["https://dns.google/resolve", "https://dns.alidns.com/resolve"];
  const preferred = reachableDns.get(fetchDns);
  if (preferred === endpoints[1]) endpoints.reverse();
  for (const endpoint of endpoints) {
    const url = new URL(endpoint);
    url.searchParams.set("name", hostname);
    url.searchParams.set("type", String(type));
    try {
      const response = await fetchDns(url, { signal: AbortSignal.timeout(8_000), redirect: "error" });
      if (response.ok) { reachableDns.set(fetchDns, endpoint); return response; }
    } catch { /* Try the second HTTPS resolver; never send credentials. */ }
  }
  throw new Error("公共 DNS 查询不可用，请检查代理连接后重试；没有发送模型请求");
}

function isSyntheticProxyAddress(address: string): boolean {
  const parts = address.split(".");
  return parts.length === 4 && parts[0] === "198" && (parts[1] === "18" || parts[1] === "19");
}
