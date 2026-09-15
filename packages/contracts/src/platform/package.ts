/** Generated as the F2 contract-only workspace boundary. */
export type PackageMaturity = "contract-only" | "partial" | "implemented";
export type PackageKind = "app" | "foundation" | "module" | "horizontal" | "native-plugin" | "integration-plugin" | "tooling";

export interface PackageDescriptor {
  readonly packageName: string;
  readonly packagePath: string;
  readonly kind: PackageKind;
  readonly maturity: PackageMaturity;
  readonly contract: string;
  readonly migrationGoals: readonly string[];
  readonly ssot: string;
  readonly capabilities: readonly string[];
}

export interface ContractDescriptor {
  readonly contractId: string;
  readonly kind: "module" | "service" | "platform";
  readonly schemaVersion: number;
  readonly maturity: PackageMaturity;
  readonly ssot: string;
}

export const packageContract = {
  contractId: "io.molis.work.platform.package.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "contract-only",
  ssot: "docs/SSOT-MATRIX.md",
} as const satisfies ContractDescriptor;
