// One table for every place that decides "may the host connect to this address on a plugin's or a feed's behalf?" (security
// invariant S-10, docs/system/SECURITY-INVARIANTS.md). There are five implementations (the sandbox proxy, the generated-plugin
// network door, the Jelly source reader, the AnySearch transport and the custom RSS fetch); each test file that owns one
// loops over this table, so a spelling one of them misses shows up as a failing line with its name.
//
// What is NOT in the table, on purpose: 198.18.0.0/15. A proxy in fake-IP mode (Clash, Surge, Stash) answers every name from
// it; the user decided (2026-09-27) that generated plugins, the Coding tools and custom RSS treat it as a normal address, so
// the implementations disagree about it by design and each says so in its own test.

/** Never a public address, in any spelling. */
export const ADDRESSES_NEVER_PUBLIC: readonly string[] = [
  // IPv4: "this network", private, shared address space, loopback, link-local (cloud metadata), protocol and documentation
  // ranges, multicast and reserved
  "0.0.0.0", "0.1.2.3", "10.0.0.1", "10.255.255.255", "100.64.0.1", "100.127.255.255", "127.0.0.1", "127.255.255.254", "169.254.169.254",
  "172.16.0.1", "172.31.255.255", "192.168.0.1", "192.168.255.255", "192.0.0.1", "192.0.2.1", "198.51.100.1", "203.0.113.1",
  "224.0.0.1", "239.255.255.255", "240.0.0.1", "255.255.255.255",
  // IPv6: unspecified, loopback, unique local, link-local, multicast, and every spelling of an embedded IPv4 address
  "::", "::1", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1",
  "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::ffff:a00:1", "0:0:0:0:0:ffff:7f00:1", "::127.0.0.1",
  "64:ff9b::7f00:1", "2002:7f00:1::1", "2001::1", "2001:db8::1",
];

/** Always public. */
export const ADDRESSES_PUBLIC: readonly string[] = ["1.1.1.1", "8.8.8.8", "93.184.216.34", "2606:4700:4700::1111", "2a00:1450:4001:81b::200e"];
