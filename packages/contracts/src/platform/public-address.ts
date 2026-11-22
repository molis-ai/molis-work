/**
 * "Is this address on the public internet?", written once (security invariant S-10). The sandbox proxy, the Host's public HTTPS reads,
 * the material source reader and the custom RSS fetch all ask it; before, each wrote its own table and the tables differed
 * (2026-11-21 review: 3fff::/16, 2001:10::/28 and 192.0.0.0/16 were answered differently). It has no dependencies and no effects, and
 * never resolves DNS: it judges an address a lookup returned.
 *
 * IPv4 refuses "this network", private, shared, loopback, link-local, the protocol and documentation ranges, 6to4 relay, multicast and
 * reserved. IPv6 accepts global unicast (2000::/3) only, without documentation, 6to4, 3fff::/16 and the 2001::/23 protocol block; every
 * spelling of an embedded IPv4 address (mapped, compatible, NAT64) is refused.
 */
export interface PublicAddressOptions {
  /**
   * Also accept 198.18.0.0/15, the block a fake-IP proxy (Clash, Surge, Stash) answers every name from (user decision 2026-09-27). Only a
   * caller that reaches sites by an approved name passes it: the address then stands for that name, never for one a plugin wrote.
   */
  readonly fakeIpProxy?: boolean;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/u;

function publicIpv4(address: string, fakeIpProxy: boolean): boolean {
  const [a, b, c] = address.split(".").map(Number) as [number, number, number, number];
  if (a === 198 && (b === 18 || b === 19)) return fakeIpProxy;
  if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  return !((a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 192 && b === 88 && c === 99) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
}

function publicIpv6(address: string): boolean {
  let normalized: string;
  try { normalized = new URL(`https://[${address}]/`).hostname.slice(1, -1).toLowerCase(); } catch { return false; }
  const [first = "", second = ""] = normalized.split(":");
  const head = Number.parseInt(first, 16), next = Number.parseInt(second || "0", 16);
  if (!Number.isFinite(head) || head < 0x2000 || head > 0x3fff) return false;
  return !(normalized.startsWith("2001:db8:") || head === 0x2002 || head === 0x3fff || (head === 0x2001 && next < 0x200));
}

/** Whether a numeric address is public. A name, a zone id or anything that is not an address is not. */
export function isPublicAddress(address: string, options: PublicAddressOptions = {}): boolean {
  if (IPV4.test(address)) return publicIpv4(address, options.fakeIpProxy === true);
  return address.includes(":") && publicIpv6(address);
}
