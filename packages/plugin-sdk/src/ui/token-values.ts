import { UI_FILE_PATTERNS, type UiRoleSpec, type UiTokenValue } from "@molis-ai/molis-work-contracts/platform/ui";
import { isObject } from "./file-reader.js";

// What one token value may be (specs/font-and-skin-system/a-section-contract.md §3.2). Not published. A value is structure, never CSS text: anything
// that is not one of these shapes is refused here, so a selector, a function or a URL has no position to sit in.

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const inRange = (value: unknown, low: number, high: number): boolean => isNumber(value) && value >= low && value <= high;
const isRole = (value: unknown): boolean => typeof value === "string" && UI_FILE_PATTERNS.role_name.test(value);
const isColor = (value: unknown): boolean => typeof value === "string" && UI_FILE_PATTERNS.color.test(value);

const hasOnly = (value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean =>
  required.every((name) => value[name] !== undefined) && Object.keys(value).every((name) => required.includes(name) || optional.includes(name));

function isRgba(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 4) return false;
  const [red, green, blue, alpha] = value as unknown[];
  return [red, green, blue].every((channel) => Number.isInteger(channel) && inRange(channel, 0, 255)) && inRange(alpha, 0, 1);
}

const isRoleValue = (value: Record<string, unknown>): boolean => hasOnly(value, ["role"], ["fallback"]) && isRole(value.role) && (value.fallback === undefined || isColor(value.fallback));

function isShadowLayer(layer: unknown): boolean {
  if (!isObject(layer) || !hasOnly(layer, ["x", "y", "blur", "color"], ["spread"])) return false;
  if (!isNumber(layer.x) || !isNumber(layer.y) || !inRange(layer.blur, 0, Number.MAX_VALUE)) return false;
  if (layer.spread !== undefined && !isNumber(layer.spread)) return false;
  if (isColor(layer.color)) return true;
  return isObject(layer.color) && ((hasOnly(layer.color, ["rgba"]) && isRgba(layer.color.rgba)) || (hasOnly(layer.color, ["role"]) && isRole(layer.color.role)));
}

/** Each object shape by the field that names it. A plain string is a colour. */
const SHAPES: Readonly<Record<string, (value: Record<string, unknown>) => boolean>> = {
  rgba: (value) => hasOnly(value, ["rgba"]) && isRgba(value.rgba),
  role: isRoleValue,
  mix(value) {
    if (!hasOnly(value, ["mix"]) || !isObject(value.mix) || !hasOnly(value.mix, ["role", "percent", "with"])) return false;
    return isRole(value.mix.role) && inRange(value.mix.percent, 0, 100) && value.mix.with === "transparent";
  },
  shadow: (value) => hasOnly(value, ["shadow"]) && Array.isArray(value.shadow) && value.shadow.length > 0 && value.shadow.every(isShadowLayer),
  px: (value) => hasOnly(value, ["px"]) && isNumber(value.px),
  ms: (value) => hasOnly(value, ["ms"]) && inRange(value.ms, 0, Number.MAX_VALUE),
  number: (value) => hasOnly(value, ["number"]) && isNumber(value.number),
  bezier: (value) => hasOnly(value, ["bezier"]) && Array.isArray(value.bezier) && value.bezier.length === 4 && value.bezier.every(isNumber),
  stroke(value) {
    if (!hasOnly(value, ["stroke"]) || !isObject(value.stroke) || !hasOnly(value.stroke, ["width_px", "style", "role"])) return false;
    return inRange(value.stroke.width_px, 0, Number.MAX_VALUE) && value.stroke.style === "solid" && isRole(value.stroke.role);
  },
};

/** The shapes each type of role takes. Any role may name another with `role`. */
const SHAPES_OF_TYPE: Readonly<Record<UiRoleSpec["type"], readonly string[]>> = {
  color: ["color", "rgba", "mix", "role"],
  shadow: ["shadow", "role"],
  length: ["px", "role"],
  duration: ["ms", "role"],
  easing: ["bezier", "role"],
  stroke: ["stroke", "role"],
  number: ["number", "role"],
};

function shapeOf(value: unknown): string | null {
  if (typeof value === "string") return isColor(value) ? "color" : null;
  if (!isObject(value)) return null;
  const shape = Object.keys(SHAPES).find((name) => value[name] !== undefined);
  return shape !== undefined && SHAPES[shape]!(value) ? shape : null;
}

/** Why this is not a value of the type, or `null` when it is one. */
export function tokenValueProblem(value: unknown, type: UiRoleSpec["type"]): string | null {
  const shape = shapeOf(value);
  if (shape === null) return `不是合法的令牌值，这些文件不收 CSS 文本、函数和 URL：${JSON.stringify(value)?.slice(0, 80) ?? "空"}`;
  return SHAPES_OF_TYPE[type].includes(shape) ? null : `${type} 类型的角色不收这种值`;
}

/** The roles a value reads. */
export function tokenValueRefs(value: UiTokenValue): readonly string[] {
  if (typeof value === "string") return [];
  if ("role" in value) return [value.role];
  if ("mix" in value) return [value.mix.role];
  if ("stroke" in value) return [value.stroke.role];
  if ("shadow" in value) return value.shadow.flatMap(({ color }) => (typeof color === "object" && "role" in color ? [color.role] : []));
  return [];
}
