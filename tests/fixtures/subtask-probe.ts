import { createSubtaskConversation } from "@molis-ai/molis-work-plugin-sdk/browser";
import { workOwner, sdkOwner } from "./subtask-owners.js";
export function mountProbe() {
  const root = document.createElement("div"); root.id = "subtask-probe";
  root.style.cssText = "position:fixed;inset:20px 20px auto auto;width:360px;height:600px;z-index:1000;background:var(--surface)"; document.body.append(root);
  const labels = { back: "Back", close: "Close", loading: "Loading", readFailed: "Cannot read", retry: "Read again", latest: "Latest", messages: "Messages", children: "Children", unread: "Unread", working: "Working", actionFailed: "Action failed", unknown: "Unknown", check: "Check" };
  const owner = workOwner(), sdk = sdkOwner(); const backs: string[] = [];
  const options = { labels, source: owner.source, onBack: (parent: { target: string } | undefined) => { backs.push(parent?.target ?? "none"); if (parent?.target === "a") void handle.open("a"); }, onClose() {} };
  let handle = createSubtaskConversation(root, options);
  return { owner, sdk, root, backs, get handle() { return handle; },
    remount() { handle.destroy(); handle = createSubtaskConversation(root, options); },
    useSdk() { handle.destroy(); handle = createSubtaskConversation(root, { ...options, source: sdk.source }); },
    fill(text: string) { const field = root.querySelector("textarea")!; field.value = text; field.dispatchEvent(new Event("input", { bubbles: true })); },
    send() { root.querySelector<HTMLButtonElement>("[data-composer-send]")!.click(); },
  };
}
