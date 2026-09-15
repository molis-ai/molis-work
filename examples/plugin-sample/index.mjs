import { definePollingIntegrationPlugin } from "@molis-ai/molis-work-plugin-sdk";
import manifest from "./manifest.json" with { type: "json" };

export default definePollingIntegrationPlugin({
  manifest,
  createProvider(context) {
    const services = context.services;
    if (!services?.storage) throw new Error("This sample requires the Molis Work application Host");
    const storage = services.storage;
    const artifactId = context.install_id + ":sample-result";
    function savedCount() {
      const value = storage.get("saved-count");
      const count = value === null ? 0 : Number(value);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid saved counter");
      return count;
    }
    services.ui.register({
      descriptor: {
        contribution_id: manifest.ui.contributions[0], plugin_id: manifest.plugin_id,
        kind: "primary-page", label: "Local Plugin Sample", slots: [],
        surfaces: [{ surface_id: "main", target_slot_id: "plugin.main", format: "html" }],
      },
      render() {
        return "<section><h2>Local Plugin Sample</h2><p>Saved results: " + savedCount() + "</p></section>";
      },
    });
    return {
      type: "local-sample",
      async health() { return { ok: true, status: "connected", message: "Local sample is ready" }; },
      async sync() {
        const version = savedCount() + 1;
        const result = services.artifacts.publish({
          artifact_id: artifactId, version, artifact_type_id: "io.molis.work.example.note", schema_version: 1,
          content: { kind: "inline", payload: { title: "Local sample result", sequence: version } },
        });
        // Publish first: if interrupted before this write, the same version/content can replay safely.
        storage.set("saved-count", String(version));
        const consumed = services.artifacts.read({ artifact_id: artifactId, version });
        if (!consumed) throw new Error("Published result could not be read");
        return { ok: true, mode: "live", cursor: { version }, items: [{
          externalId: artifactId + "@" + version, title: "Local sample result", kind: "update",
          summary: "Saved personal Artifact version " + result.artifact.version,
        }] };
      },
    };
  },
});
