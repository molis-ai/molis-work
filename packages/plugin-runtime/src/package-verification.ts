import { createHash, createPublicKey, type KeyObject, verify } from "node:crypto";
import { parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginPackageBundle, PluginPackagePayload, PluginPackageSigner } from "@molis-ai/molis-work-contracts/platform/plugin";

export class PluginPackageError extends Error {
  constructor(readonly code: "plugin_package_invalid" | "plugin_signature_invalid" | "plugin_signer_mismatch", message: string) {
    super(message); this.name = "PluginPackageError";
  }
}

export function pluginPublisherIdentity(key: KeyObject | string | Buffer): string {
  const publicKey = typeof key === "object" && "type" in key && key.type === "public" ? key as KeyObject : createPublicKey(key);
  if (publicKey.asymmetricKeyType !== "ed25519") throw new PluginPackageError("plugin_signature_invalid", "Plugin 签名只接受 Ed25519 公钥");
  return "ed25519:sha256:" + createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex");
}

export function assertPluginPackagePath(value: string): void {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes("\0")
    || value.startsWith("/") || /^[a-zA-Z]:/u.test(value)
    || value.split("/").some(part => !part || part === "." || part === "..")) {
    throw new PluginPackageError("plugin_package_invalid", "包内文件必须使用不含目录跳转的相对路径");
  }
}

export function parsePluginPackage(input: unknown): PluginPackageBundle {
  const bundle = object(input);
  const payload = object(bundle.payload);
  if (payload.schema_version !== 1 || !Array.isArray(payload.files)) invalid("不支持的 Plugin package schema");
  const manifest = parsePluginManifest(payload.manifest);
  const paths = new Set<string>();
  const files = payload.files.map(value => {
    const file = object(value);
    if (typeof file.path !== "string" || typeof file.content_base64 !== "string") invalid("包内文件描述不合法");
    assertPluginPackagePath(file.path);
    if (paths.has(file.path)) invalid("包内文件路径重复");
    paths.add(file.path);
    if (Buffer.from(file.content_base64, "base64").toString("base64") !== file.content_base64) invalid("包内文件不是有效 base64 字节");
    return { path: file.path, content_base64: file.content_base64 };
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  for (const entry of manifest.entrypoints) {
    const path = entry.entrypoint.replace(/^\.\//u, "");
    assertPluginPackagePath(path);
    if (!paths.has(path)) invalid("包内缺少 Manifest 声明的入口");
  }
  const manifestFile = files.find(file => file.path === "manifest.json");
  if (!manifestFile) invalid("包内缺少 manifest.json");
  let fileManifest: unknown;
  try { fileManifest = JSON.parse(Buffer.from(manifestFile.content_base64, "base64").toString("utf8")); }
  catch { invalid("manifest.json 文件无法解析"); }
  if (canonical(fileManifest) !== canonical(manifest)) invalid("声明与包内 manifest.json 不一致");
  let signature: PluginPackageBundle["signature"] = null;
  if (bundle.signature !== null) {
    const signed = object(bundle.signature);
    if (signed.algorithm !== "ed25519" || typeof signed.value_base64 !== "string"
      || Buffer.from(signed.value_base64, "base64").length !== 64
      || Buffer.from(signed.value_base64, "base64").toString("base64") !== signed.value_base64) invalid("签名编码不合法");
    signature = { algorithm: "ed25519", value_base64: signed.value_base64 };
  }
  return { payload: { schema_version: 1, manifest, files }, signature };
}

export function pluginPackageSigningBytes(payload: PluginPackagePayload): Buffer {
  return Buffer.from(canonical(payload), "utf8");
}

export function signPluginPackage(input: PluginPackageBundle, signer: PluginPackageSigner): PluginPackageBundle {
  const bundle = parsePluginPackage(input);
  if (bundle.payload.manifest.publisher.signature !== signer.publisher_identity) {
    throw new PluginPackageError("plugin_signer_mismatch", "Manifest 发布者身份与签名密钥不匹配");
  }
  const signature = Buffer.from(signer.sign(pluginPackageSigningBytes(bundle.payload)));
  if (signature.length !== 64) throw new PluginPackageError("plugin_signature_invalid", "签名 Adapter 未返回 Ed25519 签名");
  return { payload: bundle.payload, signature: { algorithm: "ed25519", value_base64: signature.toString("base64") } };
}

export function verifyPluginPackage(input: unknown, trustedKey: KeyObject | string | Buffer): PluginPackageBundle {
  const bundle = parsePluginPackage(input);
  if (!bundle.signature) throw new PluginPackageError("plugin_signature_invalid", "未签名开发包不是已验证发行物");
  if (bundle.payload.manifest.publisher.signature !== pluginPublisherIdentity(trustedKey)) {
    throw new PluginPackageError("plugin_signer_mismatch", "发行物不是由指定的可信公钥发布");
  }
  if (!verify(null, pluginPackageSigningBytes(bundle.payload), trustedKey, Buffer.from(bundle.signature.value_base64, "base64"))) {
    throw new PluginPackageError("plugin_signature_invalid", "Plugin 内容或签名已改变");
  }
  return bundle;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Plugin package 必须为对象");
  return value as Record<string, unknown>;
}
function invalid(message: string): never { throw new PluginPackageError("plugin_package_invalid", message); }
