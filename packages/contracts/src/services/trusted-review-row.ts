/** The sandbox writer compares this declared owner row with the frozen review target at BEGIN IMMEDIATE. Kept in a file with no other imports than the ones named here: the declarations a sandboxed plugin is compiled against (`SANDBOX_SDK_CONTRACT_DECLARATIONS`) copy this file, not its owner's whole contract. */
export interface TrustedReviewRow {
  readonly table: string;
  readonly id_column: string;
  readonly version_column: string;
}
