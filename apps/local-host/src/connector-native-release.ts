import { runtimeReleaseBytes } from "./connector-tool-download.js";
import { toolInstallErrors } from "./connector-tool-process.js";
import type { NativeToolSource } from "./connector-tool-source.js";

const hosts = new Set(["github.com", "api.github.com", "raw.githubusercontent.com", "release-assets.githubusercontent.com", "objects.githubusercontent.com", "gitlab.com", "acli.atlassian.com"]);
export const nativeReleaseBytes = (url: string, limit: number, signal?: AbortSignal) => runtimeReleaseBytes(url, limit, signal, hosts);
export interface NativeCliDistribution { kind: "native"; resolve(version: string, signal?: AbortSignal): Promise<NativeToolSource> }
export function nativeTarget() {
  if (!["darwin", "linux"].includes(process.platform) || !["arm64", "x64"].includes(process.arch)) throw toolInstallErrors.invalid("此平台尚无该客户端的受管理安装路径");
  return { platform: process.platform, arch: process.arch };
}
interface ReleaseAsset { name: string; browser_download_url: string; digest?: string }
interface GitHubRelease { tag_name: string; assets: ReleaseAsset[] }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
async function releaseJson(url: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const text = (await nativeReleaseBytes(url, 4 * 1024 * 1024, signal)).toString("utf8");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw toolInstallErrors.failed("官方发布元数据读不出来，请检查网络后重试"); }
  if (!object(value)) throw toolInstallErrors.failed("官方发布元数据格式无效");
  return value;
}
async function githubRelease(url: string, signal?: AbortSignal): Promise<GitHubRelease> {
  const value = await releaseJson(url, signal);
  if (typeof value.tag_name !== "string" || !Array.isArray(value.assets)) throw toolInstallErrors.failed("GitHub 官方发布元数据格式无效");
  const assets: unknown[] = value.assets;
  return { tag_name: value.tag_name, assets: assets.map(item => {
    if (!object(item) || typeof item.name !== "string" || typeof item.browser_download_url !== "string" || item.digest != null && typeof item.digest !== "string") throw toolInstallErrors.failed("GitHub 官方文件元数据格式无效");
    return { name: item.name, browser_download_url: item.browser_download_url, ...(typeof item.digest === "string" ? { digest: item.digest } : {}) };
  }) };
}
export function githubCliDistribution(repository: string, bin: string, filename: (version: string, platform: string, arch: string) => string,
  entry: (version: string, platform: string, arch: string) => string): NativeCliDistribution {
  return { kind: "native", resolve: async (version, signal) => {
    const { platform, arch } = nativeTarget(), name = filename(version, platform, arch);
    const release = await githubRelease(`https://api.github.com/repos/${repository}/releases/tags/v${version}`, signal);
    const asset = release.tag_name === `v${version}` && release.assets.find(item => item.name === name);
    if (!asset || !asset.browser_download_url.startsWith(`https://github.com/${repository}/releases/download/v${version}/`) || !/^sha256:[0-9a-f]{64}$/u.test(asset.digest ?? "")) throw toolInstallErrors.failed("官方发布中没有所选版本、平台或文件校验和");
    return { kind: "native", package: repository, version, bin, url: asset.browser_download_url, sha256: asset.digest!.slice(7), entry: entry(version, platform, arch) };
  } };
}

export const gitlabCliDistribution: NativeCliDistribution = { kind: "native", resolve: async (version, signal) => {
  const { platform, arch } = nativeTarget(), name = `glab_${version}_${platform}_${arch === "x64" ? "amd64" : arch}.tar.gz`;
  const base = "https://gitlab.com/api/v4/projects/gitlab-org%2Fcli";
  const release = await releaseJson(`${base}/releases/v${version}`, signal);
  if (!object(release.assets) || !Array.isArray(release.assets.links)) throw toolInstallErrors.failed("GitLab 官方发布元数据格式无效");
  const links: unknown[] = release.assets.links;
  const entries = links.map(item => {
    if (!object(item) || typeof item.name !== "string" || typeof item.url !== "string") throw toolInstallErrors.failed("GitLab 官方文件元数据格式无效");
    return { name: item.name, url: item.url };
  });
  const asset = entries.find(item => item.name === name), sums = entries.find(item => item.name === "checksums.txt");
  if (release.tag_name !== `v${version}` || !asset?.url.startsWith(`${base}/packages/generic/glab/`) || !sums?.url.startsWith(`${base}/packages/generic/glab/`)) throw toolInstallErrors.failed("GitLab 官方发布中没有所选客户端与校验和");
  const lines = (await nativeReleaseBytes(sums.url, 1024 * 1024, signal)).toString("utf8");
  const sha256 = lines.split("\n").map(line => line.trim().split(/\s+/u)).find(row => row[1] === name)?.[0];
  if (!sha256 || !/^[0-9a-f]{64}$/u.test(sha256)) throw toolInstallErrors.failed("GitLab 官方文件校验和无效");
  return { kind: "native", package: "gitlab-org/cli", version, bin: "glab", url: asset.url, sha256, entry: "bin/glab" };
} };

export const atlassianCliDistribution: NativeCliDistribution = { kind: "native", resolve: async (version, signal) => {
  const { platform, arch } = nativeTarget();
  const formula = (await nativeReleaseBytes("https://raw.githubusercontent.com/atlassian/homebrew-acli/main/Formula/acli.rb", 64 * 1024, signal)).toString("utf8");
  if (!formula.includes(`version "${version}"`)) throw toolInstallErrors.failed("Atlassian 官方安装源已切换版本，请按当前发布重新准备");
  const url = `https://acli.atlassian.com/${platform}/${version}/acli_${version}_${platform}_${arch === "x64" ? "amd64" : arch}.tar.gz`;
  const match = [...formula.matchAll(/url "([^"]+)"[^\n]*\n\s*sha256 "([0-9a-f]{64})"/gu)].find(row => row[1] === url);
  if (!match) throw toolInstallErrors.failed("Atlassian 官方安装源没有此平台的文件或校验和");
  return { kind: "native", package: "atlassian/acli", version, bin: "acli", url, sha256: match[2]!, entry: `acli_${version}_${platform}_${arch === "x64" ? "amd64" : arch}/acli` };
} };
