import type { TextRef, UiDefinitionRef, UiFileProblem, UiFileResult, UiFontFace, UiFontFamily, UiFontRole, UiFontSchemeFile, UiResourceRegistry, UiRoleSpec, UiShadowLayer, UiSkinFile, UiSpecFile, UiTokenMap, UiTokenValue } from "@molis-ai/molis-work-contracts/platform/ui";
import { tokenValueRefs } from "./token-values.js";

// From parsed files to what is on show (specs/font-and-skin-system/a-section-contract.md §3.2, §4.2). A value of a role: the skin's own, then the
// resolved value of the role it `follows`, then the baseline's; a `locked` role is the spec's whatever a skin says. Written back as the CSS text it replaced.

/** The axes of a skin. `terminal_*` are the two themes of a terminal; `unset` is `:root` with none chosen. */
type Axis = "light" | "dark" | "shared" | "unset" | "terminal_light" | "terminal_dark";
type TerminalAxis = "unset" | "light" | "dark";

const AXES_OF: Readonly<Record<UiRoleSpec["varies_by"], readonly Axis[]>> = { theme: ["light", "dark"], none: ["shared"], terminal: ["unset", "terminal_light", "terminal_dark"] };

export interface UiResolvedRole { readonly name: string; readonly group: string; readonly varies_by: UiRoleSpec["varies_by"] }

/** Every role with a value, on the axes it has. */
export interface UiResolvedSkin {
  readonly ref: UiDefinitionRef;
  readonly spec: UiDefinitionRef;
  readonly name: TextRef;
  readonly recommended_font: UiDefinitionRef;
  /** The spec's output order. */
  readonly roles: readonly UiResolvedRole[];
  readonly light: UiTokenMap;
  readonly dark: UiTokenMap;
  readonly shared: UiTokenMap;
  readonly terminal: Readonly<Record<TerminalAxis, UiTokenMap>>;
}

type AxisValues = Readonly<Record<Axis, UiTokenMap>>;

const ref = ({ id, revision }: UiDefinitionRef): UiDefinitionRef => ({ id, revision });
const sameRef = (one: UiDefinitionRef, other: UiDefinitionRef): boolean => one.id === other.id && one.revision === other.revision;

function mapOf(skin: UiSkinFile, axis: Axis): UiTokenMap | undefined {
  if (axis === "unset") return skin.terminal.unset;
  if (axis === "terminal_light") return skin.terminal.light;
  if (axis === "terminal_dark") return skin.terminal.dark;
  return skin[axis];
}

const own = (map: UiTokenMap | undefined, name: string): UiTokenValue | undefined => (map !== undefined && Object.hasOwn(map, name) ? map[name] : undefined);

function fillAxes(spec: UiSpecFile, skin: UiSkinFile, baseline: AxisValues | null, problems: UiFileProblem[]): AxisValues {
  const roles = new Map(spec.groups.flatMap((group) => group.roles.map((role) => [role.name, role] as const)));
  const valueOf = (role: UiRoleSpec, axis: Axis): UiTokenValue | undefined => {
    if (role.locked !== undefined) return role.locked;
    const written = own(mapOf(skin, axis), role.name);
    if (written !== undefined) return written;
    const followed = role.follows === undefined ? undefined : roles.get(role.follows);
    return followed !== undefined ? valueOf(followed, axis) : own(baseline?.[axis], role.name);
  };
  const values: Record<Axis, Record<string, UiTokenValue>> = { light: {}, dark: {}, shared: {}, unset: {}, terminal_light: {}, terminal_dark: {} };
  for (const role of roles.values()) {
    for (const axis of AXES_OF[role.varies_by]) {
      const value = valueOf(role, axis);
      if (value !== undefined) values[axis][role.name] = value;
      else if (baseline === null) problems.push({ file: `${skin.id}.json`, path: `$.${axis}.${role.name}`, code: "ui.skin_role_missing", reason: `基线皮肤没有给 ${role.name} 值`, fix: "基线皮肤要写全规格里的角色" });
    }
  }
  return values;
}

/** A cycle can span two files: this skin's `a` reads `b`, and the `b` it left out reads `a` in the baseline. So it is looked for here, on the values in force. */
function cycleProblems(skin: UiSkinFile, values: AxisValues, problems: UiFileProblem[]): void {
  const reported = new Set<string>();
  for (const theme of ["light", "dark"] as const) for (const terminal of ["unset", "terminal_light", "terminal_dark"] as const) {
    const inForce: UiTokenMap = { ...values.shared, ...values[theme], ...values[terminal] };
    const done = new Set<string>();
    const visit = (name: string, trail: readonly string[]): void => {
      if (trail.includes(name)) {
        const cycle = [...trail.slice(trail.indexOf(name)), name].join(" → ");
        if (!reported.has(name)) problems.push({ file: `${skin.id}.json`, path: `$.${theme}.${name}`, code: "ui.role_cycle", reason: `引用成环：${cycle}`, fix: "断开其中一环" });
        reported.add(name);
        return;
      }
      if (done.has(name)) return;
      const value = own(inForce, name);
      for (const next of value === undefined ? [] : tokenValueRefs(value)) visit(next, [...trail, name]);
      done.add(name);
    };
    for (const name of Object.keys(inForce)) visit(name, []);
  }
}

/** The whole value of a skin, or of the baseline when `skin` is left out. A cycle, or a baseline that does not write every role, is a problem here. */
export function resolveSkin(spec: UiSpecFile, baseline: UiSkinFile, skin?: UiSkinFile): UiFileResult<UiResolvedSkin> {
  const problems: UiFileProblem[] = [];
  if (!sameRef(baseline, spec.baseline_skin)) problems.push({ file: `${baseline.id}.json`, path: "$.id", code: "ui.skin_not_baseline", reason: `规格的基线皮肤是 ${spec.baseline_skin.id} 第 ${spec.baseline_skin.revision} 版`, fix: "把那一份传进来" });
  const base = fillAxes(spec, baseline, null, problems);
  const chosen = skin ?? baseline;
  const values = skin === undefined ? base : fillAxes(spec, skin, base, problems);
  cycleProblems(chosen, values, problems);
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: {
      ref: ref(chosen),
      spec: ref(chosen.spec),
      name: chosen.name,
      recommended_font: ref(chosen.recommended_font),
      roles: spec.groups.flatMap(({ group, roles }) => roles.map(({ name, varies_by }) => ({ name, group, varies_by }))),
      light: values.light,
      dark: values.dark,
      shared: values.shared,
      terminal: { unset: values.unset, light: values.terminal_light, dark: values.terminal_dark },
    },
  };
}

/** No leading zero, the way these files' values are written today: `.05`, `-.011`. */
const cssNumber = (value: number): string => String(value).replace(/^(-?)0\./u, "$1.");
const cssLength = (value: number): string => (value === 0 ? "0" : `${cssNumber(value)}px`);
const cssVar = (role: string): string => `var(--${role})`;
const cssRgba = ([red, green, blue, alpha]: readonly [number, number, number, number]): string => `rgba(${red}, ${green}, ${blue}, ${cssNumber(alpha)})`;

function cssShadowLayer({ x, y, blur, spread, color }: UiShadowLayer): string {
  const paint = typeof color === "string" ? color : "rgba" in color ? cssRgba(color.rgba) : cssVar(color.role);
  return [cssLength(x), cssLength(y), cssLength(blur), ...(spread === undefined ? [] : [cssLength(spread)]), paint].join(" ");
}

/** The CSS text of a value. A hex colour keeps its letter case, so a file writes back what it replaced. */
function cssValue(value: UiTokenValue): string {
  if (typeof value === "string") return value;
  if ("rgba" in value) return cssRgba(value.rgba);
  if ("role" in value) return value.fallback === undefined ? cssVar(value.role) : `var(--${value.role}, ${value.fallback})`;
  if ("mix" in value) return `color-mix(in srgb, ${cssVar(value.mix.role)} ${cssNumber(value.mix.percent)}%, ${value.mix.with})`;
  if ("shadow" in value) return value.shadow.map(cssShadowLayer).join(", ");
  if ("px" in value) return cssLength(value.px);
  // A time keeps its unit even at 0: a bare 0 is not a valid time in CSS.
  if ("ms" in value) return `${cssNumber(value.ms)}ms`;
  if ("number" in value) return cssNumber(value.number);
  if ("bezier" in value) return `cubic-bezier(${value.bezier.map(cssNumber).join(", ")})`;
  return `${cssLength(value.stroke.width_px)} ${value.stroke.style} ${cssVar(value.stroke.role)}`;
}

export interface SkinTokenSelection {
  /** Which theme's values to write. Left out, roles that vary by theme are not written. */
  readonly theme?: "light" | "dark";
  /** Which terminal values to write. Left out, the terminal's roles are not written. */
  readonly terminal?: TerminalAxis;
  /** Only these groups of the spec. */
  readonly groups?: readonly string[];
  /** Only these roles, in this order. */
  readonly names?: readonly string[];
}

/** `--name: value;` per role, one space between them. */
export function skinTokenDeclarations(skin: UiResolvedSkin, select: SkinTokenSelection = {}): string {
  const byName = new Map(skin.roles.map((role) => [role.name, role]));
  const roles = select.names === undefined ? skin.roles : select.names.flatMap((name) => byName.get(name) ?? []);
  return roles.flatMap((role) => {
    if (select.groups !== undefined && !select.groups.includes(role.group)) return [];
    const map = role.varies_by === "none" ? skin.shared : role.varies_by === "theme" ? (select.theme === undefined ? undefined : skin[select.theme]) : select.terminal === undefined ? undefined : skin.terminal[select.terminal];
    const value = own(map, role.name);
    return value === undefined ? [] : [`--${role.name}: ${cssValue(value)};`];
  }).join(" ");
}

export interface UiResolvedFont {
  readonly ref: UiDefinitionRef;
  readonly name: TextRef;
  /** Token name to its CSS text, in the spec's order. */
  readonly tokens: Readonly<Record<string, string>>;
  /** The faces the families in force name. */
  readonly faces: readonly UiFontFace[];
}

/** A name is quoted when it has a space. A `face` always is: left bare, a face called `serif` would be the generic family and not the file. */
function cssFamily(family: UiFontFamily): string {
  if ("face" in family) return `"${family.face}"`;
  return family.system.includes(" ") ? `"${family.system}"` : family.system;
}

/** The token values of a font scheme. A role's field a scheme leaves out comes from the baseline, the one level the skins have too. */
export function resolveFontScheme(spec: UiSpecFile, baseline: UiFontSchemeFile, scheme?: UiFontSchemeFile): UiFileResult<UiResolvedFont> {
  const chosen = scheme ?? baseline;
  const problems: UiFileProblem[] = [];
  if (baseline.id !== spec.baseline_font.id || baseline.revision !== spec.baseline_font.revision) problems.push({ file: `${baseline.id}.json`, path: "$.id", code: "ui.font_not_baseline", reason: `规格的基线字体是 ${spec.baseline_font.id} 第 ${spec.baseline_font.revision} 版`, fix: "把那一份传进来" });
  const tokens: Record<string, string> = {};
  const used = new Set<string>();
  const bodyFamily = spec.font_roles.find(role => role.name === "body")?.tokens.family;
  const write = (token: string | undefined, value: string | undefined, role: string, field: keyof UiFontRole) => {
    if (token === undefined) return;
    if (value !== undefined) tokens[token] = value;
    else problems.push({ file: `${baseline.id}.json`, path: `$.roles.${role}.${field}`, code: "ui.font_role_missing", reason: `基线字体没有给 ${role} 的 ${field}`, fix: "基线字体要写全规格要的值" });
  };
  for (const { name, tokens: names } of spec.font_roles) {
    const role: UiFontRole = { ...baseline.roles[name], ...chosen.roles[name] };
    for (const family of role.families ?? []) if ("face" in family) used.add(family.face);
    // Proportional roles that do not specify their own family inherit the scheme's body family.
    const sharedFamily = name !== "body" && name !== "code" && bodyFamily ? cssVar(bodyFamily) : undefined;
    write(names.family, role.families?.map(cssFamily).join(", ") ?? sharedFamily, name, "families");
    write(names.weight, role.weight === undefined ? undefined : String(role.weight), name, "weight");
    write(names.tracking, role.tracking_em === undefined ? undefined : role.tracking_em === 0 ? "0" : `${cssNumber(role.tracking_em)}em`, name, "tracking_em");
    write(names.size, role.size_px === undefined ? undefined : cssLength(role.size_px), name, "size_px");
    write(names.line_height, role.line_height === undefined ? undefined : cssNumber(role.line_height), name, "line_height");
  }
  if (problems.length > 0) return { ok: false, problems };
  const faces = [...chosen.faces, ...(scheme === undefined ? [] : baseline.faces)].filter((face, index, all) => used.has(face.family) && all.findIndex((other) => other.family === face.family && other.resource === face.resource) === index);
  return { ok: true, value: { ref: ref(chosen), name: chosen.name, tokens, faces } };
}

/** `--name: value;` per token, one space between them. `names` picks and orders them. */
export function fontTokenDeclarations(font: UiResolvedFont, names: readonly string[] = Object.keys(font.tokens)): string {
  return names.flatMap((name) => (Object.hasOwn(font.tokens, name) ? [`--${name}: ${font.tokens[name]};`] : [])).join(" ");
}

const FONT_FORMATS: Readonly<Record<string, string>> = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };

/** The `@font-face` rules of the faces in force. A face's file is a row of the registry, and its `src` that row's `route`: a scheme never holds a path. */
export function fontFaceRules(font: UiResolvedFont, registry: UiResourceRegistry): UiFileResult<string> {
  const problems: UiFileProblem[] = [];
  const rules = font.faces.flatMap((face) => {
    const row = registry.resources.find((candidate) => candidate.id === face.resource);
    if (row === undefined || row.kind !== "font" || row.route === undefined) {
      problems.push({ file: `${font.ref.id}.json`, path: "$.faces", code: "ui.font_resource_unknown", reason: `字体 ${face.family} 的资源 ${face.resource} 不是登记表里带 route 的字体`, fix: "在登记表加这一行，或改 resource" });
      return [];
    }
    const format = FONT_FORMATS[row.route.slice(row.route.lastIndexOf(".") + 1)];
    const weight = typeof face.weight === "number" ? String(face.weight) : face.weight.join(" ");
    return [[
      "  @font-face {",
      `    font-family: "${face.family}";`,
      "    font-style: normal;",
      "    font-display: swap;",
      `    font-weight: ${weight};`,
      `    src: url("${row.route}")${format === undefined ? "" : ` format("${format}")`};`,
      `    unicode-range: ${face.unicode_range.join(", ")};`,
      "  }",
    ].join("\n")];
  });
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: rules.join("\n") };
}
