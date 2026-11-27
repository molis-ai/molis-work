import { defineErrorCodes, definePlugin, defineAction, definePollingIntegrationPlugin, bindActionHandler, bindOwnerPluginAction, bindArtifactPreview } from "@molis-ai/molis-work-plugin-sdk";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { defineStateMachine } from "@molis-ai/molis-work-plugin-sdk/state-machine";
import manifest from "./manifest.json" with { type: "json" };

const noteErrors = defineErrorCodes("notes", {
  not_found: "not_found",
  setting_invalid: "invalid",
  setting_conflict: "conflict",
});

/** Where the sample says its results come from. */
const SAMPLE_SOURCE = "Tom's R&D notes";
const resultMachine = defineStateMachine({
  ...manifest.state_machines[0],
  transitions: { save: { from: ["empty", "saved"], to: "saved" } },
});

export default definePlugin({
  manifest,
  async start(context) {
    const services = context.services;
    if (!services?.storage || !services.actions) throw new Error("This sample requires the Molis Work application Host");
    const storage = services.storage;
    const artifactId = context.install_id + ":sample-result";
    const definition = name => manifest.actions.find(action => action.capability_id === manifest.plugin_id + "." + name);
    const healthAction = definition("health"), readAction = definition("results.read"), publishAction = definition("results.publish"), previewAction = definition("results.preview");
    function savedCount() {
      const value = storage.get("saved-count");
      const count = value === null ? 0 : Number(value);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid saved counter");
      return count;
    }
    function resultAt(version) {
      const result = services.artifacts.read({ artifact_id: artifactId, version });
      if (!result) throw new Error("Published result could not be read");
      return { artifact_id: artifactId, version, payload: result.payload };
    }
    function publishResult() {
      const count = savedCount();
      resultMachine.assert(count === 0 ? "empty" : "saved", "save");
      const version = count + 1;
      services.artifacts.publish({
        artifact_id: artifactId, version, artifact_type_id: "com.example.note", schema_version: 1,
        content: { kind: "inline", payload: { title: "Local sample result", sequence: version } },
        // A 成果 says what it pins, what it is called and what its content is.
        origin: { kind: "pinned", subject: { kind: "counter", id: "sample" }, revision: String(version) },
        title: "Local sample result", media_type: "application/json",
      });
      // Publish first: if interrupted before this write, the same version/content can replay safely.
      storage.set("saved-count", String(version));
      return resultAt(version);
    }
    services.ui.register({
      descriptor: {
        contribution_id: manifest.ui.contributions[0],
        kind: "primary-page", label: "Local Plugin Sample", slots: [],
        surfaces: [{ surface_id: "main", target_slot_id: "plugin.main", format: "html" }],
      },
      render() {
        // The words are in locales/<language>.json; `t` takes the language from the page. A name may hold ' and &: `t` escapes it for HTML.
        const count = savedCount();
        return "<section><h2>" + t("notes.main.title") + "</h2><p>" + t("notes.main.saved", { count }) + "</p><p>" + t("notes.main.saved-count", { count })
          + "</p><p>" + t("notes.main.source", { name: SAMPLE_SOURCE }) + "</p></section>";
      },
    });
    const provider = {
      type: "local-sample",
      async health() { return { ok: true, status: "connected", message: "Local sample is ready" }; },
      async sync() {
        const result = await services.actions.invoke(publishAction, {});
        return { ok: true, mode: "live", cursor: { version: result.version }, items: [{
          externalId: artifactId + "@" + result.version, title: "Local sample result", kind: "update",
          summary: "Saved personal Artifact version " + result.version,
        }] };
      },
    };
    // The declarations every plugin can make, the same as the built-in ones (batch 44 PEQ-05): a blank starting point, 「挂到…」 on its own
    // notes, a resume summary for outside Agents, a write the person confirms in the platform's decision, and a settings section.
    const notes = sampleNotes(storage, services.project_database, manifest.plugin_id);
    const polling = definePollingIntegrationPlugin({ manifest, createProvider: () => provider });
    // The machines this code runs; the platform checks them against the Manifest's state_machines before the plugin starts.
    return { ...await polling.start(context), state_machines: [resultMachine.describe()], actions: [
      defineAction(healthAction, () => provider.health()).handler,
      bindOwnerPluginAction(context, readAction, () => { const count = savedCount(); return { count, latest: count ? resultAt(count) : null }; }),
      bindOwnerPluginAction(context, publishAction, () => publishResult()),
      // The owner's half of the preview the 成果库 and the side panel show: this plugin's own type, as text.
      bindArtifactPreview(previewAction, "com.example.note", artifact => ({
        media_type: "text/markdown", text: "# " + artifact.payload.title + "\n\nResult " + artifact.payload.sequence + "\n",
      })),
      // The Manifest was checked whole when the plugin was parsed: the 「挂到…」 parts name each other, so each is bound as declared.
      ...Object.entries(notes).map(([name, handle]) => bindActionHandler(definition(name), (input, context) => handle(context, input))),
    ] };
  },
});

const NOTE = "sample_note";

/** The sample's notes, kept in its project database (or private KV fallback): `{ id, title, bindings }`, with a revision that moves on every write. */
function sampleNotes(storage, projectDatabase, pluginId) {
  const read = () => {
    if (projectDatabase) {
      const row = projectDatabase.get("SELECT revision, notes_json FROM sample_notes_state WHERE id = 1");
      if (!row) return { revision: 0, notes: [] };
      return { revision: Number(row.revision ?? 0), notes: JSON.parse(String(row.notes_json ?? "[]")) };
    }
    return JSON.parse(storage.get("notes") ?? '{"revision":0,"notes":[]}');
  };
  const write = async (context, mutate) => {
    if (projectDatabase) {
      return await projectDatabase.transaction(() => context?.beforeEffect?.() ?? Promise.resolve(), tx => {
        const row = tx.get("SELECT revision, notes_json FROM sample_notes_state WHERE id = 1");
        const state = row ? { revision: Number(row.revision ?? 0), notes: JSON.parse(String(row.notes_json ?? "[]")) } : { revision: 0, notes: [] };
        const outcome = mutate(state);
        state.revision += 1;
        tx.run(
          "INSERT INTO sample_notes_state (id, revision, notes_json) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, notes_json = excluded.notes_json",
          [state.revision, JSON.stringify(state.notes)],
        );
        return outcome;
      });
    }
    await context?.beforeEffect?.();
    const state = read();
    const outcome = mutate(state);
    state.revision += 1;
    storage.set("notes", JSON.stringify(state));
    return outcome;
  };
  const find = (state, id) => {
    const note = state.notes.find(item => item.id === id);
    if (!note) throw noteErrors.not_found("No such sample note");
    return note;
  };
  const item = note => ({ subject: { kind: NOTE, id: note.id }, title: note.title, next_hint: "", status_label: note.bindings.length ? "attached" : "blank",
    open: { surface: pluginId, id: note.id } });
  const attachedTo = (state, key) => ({ targets: state.notes.filter(note => note.bindings.some(binding => binding.key === key)).map(note => ({ kind: NOTE, id: note.id })) });
  const setting = layer => storage.get("setting:greeting:" + layer);
  const values = () => {
    const project = setting("project"), personal = setting("personal"), revision = JSON.stringify([project, personal]);
    const value = personal ?? project ?? "Hello", source = personal !== null ? "personal" : project !== null ? "project" : "provider_default";
    return { values: [{ key: "greeting", revision, state: "ok", value, source, layers: { provider_default: "Hello", ...(project !== null ? { project } : {}), ...(personal !== null ? { personal } : {}) } }] };
  };
  return {
    "notes.read": (_context, input) => {
      const state = read(), note = find(state, input.subject_id);
      return { subject: { kind: NOTE, id: note.id }, revision: String(state.revision), title: note.title, content: "", truncated: false, open: { surface: pluginId, id: note.id } };
    },
    "notes.create": async context => {
      const note = await write(context, state => {
        const created = { id: "note-" + (state.revision + 1), title: "Sample note " + (state.notes.length + 1), bindings: [] };
        state.notes.push(created);
        return created;
      });
      return { note: { id: note.id, title: note.title } };
    },
    // 「挂到…」: another object hung on one of the sample's notes, in the platform's relation shape (`definePlacementRelationAction`):
    // both ends are subjects, and each part answers what the object is attached to after the call. Nothing of that object is copied.
    "attach.bind": async (context, input) => {
      const key = input.subject.kind + ":" + input.subject.id;
      await write(context, state => {
        const note = find(state, input.target.id);
        if (!note.bindings.some(binding => binding.key === key)) note.bindings.push({ key, title: input.read?.title ?? "" });
      });
      return attachedTo(read(), key);
    },
    "attach.list": (_context, input) => attachedTo(read(), input.subject.kind + ":" + input.subject.id),
    "attach.release": async (context, input) => {
      const key = input.subject.kind + ":" + input.subject.id;
      await write(context, state => {
        const note = find(state, input.target.id);
        note.bindings = note.bindings.filter(binding => binding.key !== key);
      });
      return attachedTo(read(), key);
    },
    "attach.candidates": (_context, input) => {
      const key = input.subject.kind + ":" + input.subject.id, notes = read().notes, on = note => note.bindings.some(binding => binding.key === key);
      return { targets: [...notes.filter(on), ...notes.filter(note => !on(note))].map(note => ({ subject: { kind: NOTE, id: note.id }, current: on(note) })) };
    },
    // A new note named so, with the object on it; the same request makes the same note. The new one is named first.
    "attach.create": async (context, input) => {
      const key = input.subject.kind + ":" + input.subject.id, request = input.request_id ?? key + ":" + input.name;
      const note = await write(context, state => {
        let existing = state.notes.find(entry => entry.source_key === request);
        if (!existing) {
          existing = { id: "note-" + (state.revision + 1), title: input.name, source_key: request, bindings: [{ key, title: input.read?.title ?? "" }] };
          state.notes.push(existing);
        }
        return existing;
      });
      const after = attachedTo(read(), key).targets.filter(target => target.id !== note.id);
      return { targets: [{ kind: NOTE, id: note.id }, ...after] };
    },
    "resume.summary": (_context, input) => {
      const all = read().notes, focused = input.focus?.kind === NOTE ? all.find(note => note.id === input.focus.id) : undefined, first = focused ?? all[0];
      return { title: "Sample notes", focus: first ? item(first) : null, next: all.filter(note => note !== first).slice(0, 5).map(item) };
    },
    "work_prompt": (_context, input) => {
      const note = read().notes.find(item => item.id === input.subject_id);
      if (!note) throw noteErrors.not_found("No such sample note");
      return {
        subject: { kind: NOTE, id: note.id },
        title: note.title,
        read_only: false,
        instruction: "Work on sample note \"" + note.title + "\" (id: " + note.id + ").",
        instruction_with_untrusted_source: "Work on sample note (id: " + note.id + ").",
        ...(note.bindings.length ? { current_facts: "Attached items: " + note.bindings.length } : {}),
      };
    },
    // What the person confirms before a clear: every note it removes, at the revision they saw. The platform holds the decision.
    "notes.clear.review": () => {
      const state = read();
      return { request: { summary: "Clear " + state.notes.length + " sample notes", requirements: [], approver: { kind: "person" }, expires_at: null,
        choices: [{ id: "clear", label: { key: "notes.clear.choice" }, availability: { available: true }, accepts: [], returns: [] }] },
        target: { subject: { kind: NOTE, id: "all" }, version: String(state.revision) }, commands: { clear: {} } };
    },
    "notes.clear": async context => {
      const cleared = await write(context, state => {
        const count = state.notes.length;
        state.notes = [];
        return count;
      });
      return { cleared };
    },
    "settings.read": () => values(),
    "settings.write": async (context, input) => {
      if (input.key !== "greeting") throw noteErrors.setting_invalid("No such setting");
      if (input.expected_revision !== values().values[0].revision) throw noteErrors.setting_conflict("The setting changed meanwhile");
      if ("set" in input.change && (typeof input.change.set !== "string" || input.change.set.length > 80)) {
        throw noteErrors.setting_invalid("A greeting is text of at most 80");
      }
      await context?.beforeEffect?.();
      if (input.expected_revision !== values().values[0].revision) throw noteErrors.setting_conflict("The setting changed meanwhile");
      if ("set" in input.change) storage.set("setting:greeting:" + input.layer, input.change.set);
      else storage.delete("setting:greeting:" + input.layer);
      return values();
    },
  };
}
