import { createHash } from "node:crypto";
import { ActionError, requireSynchronous, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { SURFACE_HOME_ORDER_LIMIT, type SurfaceCorrectionInput, type SurfaceDescription, type SurfaceGroup, type SurfaceRequest } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import { assertSurfaceDescription } from "@molis-ai/molis-work-plugin-sdk/presentation";
import type { SurfaceCorrectionsSnapshot } from "./corrections.js";
import { surfaceErrors } from "./errors.js";
import { composeHome } from "./home.js";
import { composeObjects, groupState, readAttention, type ObjectSource } from "./objects.js";
import { checkCurrent, type SurfaceComposePorts, type SurfaceCorrectPorts, type SurfacePlugin } from "./ports.js";
import { deliveredSubjects, positionFor, type Position } from "./position.js";
import { startDeadline } from "./values.js";

export interface ComposeRead {
  request: SurfaceRequest;
  ports: SurfaceComposePorts;
  position: Position;
  plugins: readonly SurfacePlugin[];
  views: readonly ActionView[];
  delivered: ReadonlySet<string>;
  corrections: SurfaceCorrectionsSnapshot;
  deadline: ReturnType<typeof startDeadline>;
  current(): void;
  capture(views: readonly ActionView[]): void;
  retain(views: readonly ActionView[]): void;
}

function homeFor(request: SurfaceRequest, ports: SurfaceComposePorts) {
  const order = request.home_order;
  if (order !== undefined && (request.slot.kind !== "home" || !Array.isArray(order) || order.length > SURFACE_HOME_ORDER_LIMIT
    || new Set(order).size !== order.length || order.some(id => typeof id !== "string" || !id.length || id.length > 200))) {
    throw new ActionError("actions.input_invalid", "首页顺序只接受不重复的插件 id");
  }
  if (request.slot.kind !== "home") return undefined;
  if (ports.caller.audience !== "user") throw new ActionError("actions.forbidden", "首页只向本人开放");
  if (!ports.caller.project_id) throw new ActionError("actions.scope_mismatch", "首页需要当前项目");
  if (!ports.home) throw surfaceErrors.compose_failed("暂时读不到首页");
  return ports.home;
}

const revisionFor = (data: unknown) => createHash("sha256").update(canonicalJsonText(data, "null")).digest("hex");
const CACHE_LIMIT = 64;

export class SurfaceCompositionService {
  readonly #cache = new Map<string, SurfaceDescription>();

  async compose(request: SurfaceRequest, ports: SurfaceComposePorts): Promise<SurfaceDescription> {
    const home = homeFor(request, ports);
    const deadline = startDeadline(ports.signal);
    try {
      checkCurrent(ports);
      const checked = await deadline.wait(ports.beforeEffect().then(() => true));
      checkCurrent(ports);
      if (!checked) throw surfaceErrors.compose_failed("暂时读不到这个位置");
      const catalog = await deadline.wait(Promise.resolve(ports.catalog()));
      checkCurrent(ports);
      if (!catalog) throw surfaceErrors.compose_failed("暂时读不到插件目录");
      const plugins = home ? catalog.filter(plugin => plugin.home && plugin.state !== "uninstalled") : catalog;
      const guards = new Set(home ? [home.retainCatalog(plugins)] : []);
      const captured = new Map<ActionView, () => void>();
      const retained = new Set<ActionView>();
      const current = () => {
        checkCurrent(ports);
        for (const guard of guards) requireSynchronous(guard());
      };
      const capture = (views: readonly ActionView[]) => {
        for (const view of views) {
          if (view.availability.available && !captured.has(view)) captured.set(view, ports.retain([view]));
        }
      };
      const retain = (views: readonly ActionView[]) => {
        const available = [...new Set(views)].filter(view => view.availability.available && !retained.has(view));
        const uncaptured: ActionView[] = [];
        for (const view of available) {
          const original = captured.get(view);
          if (original) guards.add(original);
          else uncaptured.push(view);
          retained.add(view);
        }
        if (uncaptured.length) {
          if (home) throw surfaceErrors.compose_failed("首页动作未从原目录保留");
          guards.add(ports.retain(uncaptured));
        }
        current();
      };
      const position = positionFor(request.slot, plugins);
      const delivered = deliveredSubjects(request);
      current();
      if (!deadline.active) throw surfaceErrors.compose_failed("暂时读不到动作目录");
      const discovered = await deadline.wait(Promise.resolve(ports.discover()));
      current();
      if (!discovered) throw surfaceErrors.compose_failed("暂时读不到动作目录");
      const views = home ? discovered.filter(view => view.provider.project_id === undefined || view.provider.project_id === ports.caller.project_id) : discovered;
      const corrections = ports.corrections.read(request.slot);
      const read = { request, ports, position, plugins, views, delivered, corrections, deadline, current, capture, retain };
      const result = home ? await composeHome(read, home) : await composeGroup(read);
      current();
      const { actor_id, project_id, audience, plugin_install_id, calling_plugin_id } = ports.caller;
      const subjects = !home && request.slot.kind !== "attention" ? request.subjects : undefined;
      const revision = revisionFor([[actor_id, project_id, audience, plugin_install_id, calling_plugin_id], request.slot, request.expanded,
        subjects, [...delivered].sort(), request.home_order, corrections.revision, result]);
      const cached = this.#cache.get(revision);
      if (cached) return structuredClone(cached);
      const candidate: SurfaceDescription = { composed_by: "rules", revision, corrections_revision: corrections.revision, groups: result.groups };
      return this.checked(candidate);
    } finally { deadline.dispose(); }
  }

  async correct(input: SurfaceCorrectionInput, ports: SurfaceCorrectPorts) {
    requireSynchronous(ports.current());
    const plugins = input.slot.kind === "plugin-slot" ? await ports.catalog() : [];
    requireSynchronous(ports.current());
    const position = positionFor(input.slot, plugins);
    if (!position.forms.length) throw surfaceErrors.mount_not_declared("这个位置没有声明可接受的形态");
    if ((input.form && !position.forms.includes(input.form)) || (input.subject && position.refuse.has(input.subject.kind))) {
      throw new ActionError("actions.input_invalid", "这个位置不接受该形态或对象");
    }
    return ports.corrections.correct(input, ports, () => ports.now());
  }

  private checked(candidate: SurfaceDescription): SurfaceDescription {
    try {
      const { description, dropped } = assertSurfaceDescription(candidate, candidate);
      if (dropped.length) throw surfaceErrors.compose_failed("组合的候选没有通过校验");
      this.#cache.set(candidate.revision, structuredClone(description));
      if (this.#cache.size > CACHE_LIMIT) this.#cache.delete(this.#cache.keys().next().value!);
      return description;
    } catch {
      throw surfaceErrors.compose_failed("组合的候选没有通过校验");
    }
  }
}

async function composeGroup(read: ComposeRead) {
  const { request, position, deadline } = read;
  const isAttention = request.slot.kind === "attention";
  const { sources, unreadable } = isAttention ? readAttention(read) : {
    sources: (request.subjects ?? []).map(subject => ({ subject, kind: "request" } satisfies ObjectSource)), unreadable: false,
  };
  const objects = await composeObjects(read, sources);
  const { visible, excluded, facts } = objects;
  const canFold = request.slot.kind === "conversation" || request.slot.kind === "discussion";
  const hidden = visible.slice(position.max);
  const overflow = canFold && !request.expanded ? hidden.filter(row => row.value).length : 0;
  const shown = request.expanded && canFold ? visible.filter((row, index) => index < position.max || row.value) : visible.slice(0, position.max);
  const group: SurfaceGroup = { kind: isAttention ? "attention" : "slot",
    ...groupState(shown, unreadable || objects.unreadable || objects.unproved || !deadline.active), items: shown.map(row => row.item),
    ...(overflow ? { overflow: { count: overflow } } : {}), ...(excluded ? { excluded } : {}) };
  return { groups: [group], facts };
}
