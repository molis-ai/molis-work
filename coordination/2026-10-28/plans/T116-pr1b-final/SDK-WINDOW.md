# PR1b SDK window freeze

Status: FROZEN. Release the following four-file write window for root to assign to T144 in its independent tree. Developer 3 ownership remains. This does not start T144 or authorize consuming unadopted PR1b APIs.

Final H: `3421e0e69645a7ac247672c590951bce3a9c5765`; tree: `2bb1668425959a01907048e78837ba414af7845a`. All four working-tree and final-H blobs equal the original d5 freeze below. Mandatory verification has finished.

| File | Git blob |
| --- | --- |
| `packages/plugin-sdk/src/manifest.ts` | `0373dc1de41d7b7d675edb180e5d9552e2a7df42` |
| `packages/plugin-sdk/src/index.ts` | `da9ce027f88978ba61f6dc6649487563c4389ac9` |
| `tooling/gates/api/contracts/platform/plugin.txt` | `67491f79ec26322989af828ee9e405ad82c84596` |
| `tooling/gates/api/plugin-sdk/index.txt` | `24884fed5227b075a38600000052ebd82b9f6066` |

No further edits are planned for these four files. API generation and non-update checking passed after the matching build. This line will not rewrite these snapshots for unrelated leaf fixes.

Root accepted the non-array ui.views one-line fix in the same contract. It is applied only in packages/plugin-sdk/src/page-routes.ts, preserving the existing parser error; final complete declaration and projection tests passed 317/317. These four shared files and public APIs are unchanged. Any later failure requiring these files will first return to root for serial handoff.

T144 must use the adopted main assigned by root, not this unadopted candidate. PR1b candidate provenance remains in final-binding.json (initial provenance remains in candidate-binding.json).
