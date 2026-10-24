/**
 * A plugin's own files in the Home: the root and top-level entries are what its Manifest declares (`owner_files`, PG-102), like any
 * plugin's; the Host gives the service only to a definition on its start list, whose root its store registry holds as this plugin's.
 */
export type PluginOwnerFileInfo = { readonly kind: "file"; readonly byte_length: number } | { readonly kind: "directory" };
export interface PluginOwnerFileEntry { readonly name: string; readonly kind: "file" | "directory" }
export interface PluginOwnerFilesReader {
  stat(relative: string): PluginOwnerFileInfo | null;
  read(relative: string): Uint8Array | null;
  list(relative: string): readonly PluginOwnerFileEntry[];
}
export interface PluginOwnerFilesWriter extends PluginOwnerFilesReader {
  mkdir(relative: string): void;
  writeFile(relative: string, bytes: Uint8Array, mode: "create" | "replace"): void;
  replaceFileAtomic(relative: string, bytes: Uint8Array): void;
  copyFile(source: string, target: string): void;
  removeTree(relative: string): void;
  setAccess(relative: string, access: "readonly" | "readwrite"): void;
}
export interface PluginOwnerFilesClient extends PluginOwnerFilesReader {
  /** Location of this owner's declared root; grants no additional file access. */
  rootPath(): string;
  /** The callback must finish synchronously. Its writer expires on return or throw. */
  write<Result>(run: (writer: PluginOwnerFilesWriter) => Result): Promise<Result>;
}
export interface PluginOwnerFilesDeclaration {
  readonly store_name: string;
  readonly entries: readonly PluginOwnerFileEntry[];
  readonly read_permission: string;
  readonly write_permission: string;
}
