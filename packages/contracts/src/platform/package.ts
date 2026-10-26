/** The maturity of a contract subpath: how complete its public types and implementation are. */
export type ContractMaturity = "contract-only" | "partial" | "implemented";

export interface ContractDescriptor {
  readonly contractId: string;
  readonly kind: "module" | "service" | "platform";
  readonly schemaVersion: number;
  readonly maturity: ContractMaturity;
  readonly ssot: string;
}

export const packageContract = {
  contractId: "io.molis.work.platform.package.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "contract-only",
  ssot: "docs/SSOT-MATRIX.md",
} as const satisfies ContractDescriptor;
