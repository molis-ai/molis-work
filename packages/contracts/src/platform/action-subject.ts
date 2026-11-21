/** What an object is called everywhere: the kind its owner declares and the owner's own id for it. Kept in a file with no other imports than the ones named here: the declarations a sandboxed plugin is compiled against (`SANDBOX_SDK_CONTRACT_DECLARATIONS`) copy this file, not its owner's whole contract. */
export interface ActionSubject { kind: string; id: string }
