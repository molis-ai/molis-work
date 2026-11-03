import type { PluginWorkbenchRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";

/** Existing registered HTTP pages get only these complete method/path pairs, never a prefix proxy. */
export function registeredPageRoutes(routes: NonNullable<PluginWorkbenchRegistration["pageRequests"]>) {
  const compiled = routes.map(route => ({ method: route.method, parts: route.path.split("/") }));
  return (method: string, pathname: string): boolean => {
    const parts = pathname.split("/");
    return compiled.some(route => route.method === method && route.parts.length === parts.length
      && route.parts.every((part, index) => part.startsWith(":")
        ? Boolean(parts[index]) && !/[\\/%]/u.test(parts[index]!) && ![".", ".."].includes(parts[index]!) : part === parts[index]));
  };
}
