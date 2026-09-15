import type {
  EvidenceQueryApi,
  EvidenceRecord,
  EvidenceProjectReferenceSource,
  EvidenceReviewReference,
  EvidenceCorrectionRecord,
} from "@molis-ai/molis-work-contracts/modules/evidence-verification";

import { EvidenceRepository } from "./repository.js";

export class EvidenceVerificationService implements EvidenceQueryApi {
  constructor(readonly repository: EvidenceRepository) {}
  listLifecycleEvents(boardId: string) { return this.repository.listLifecycleEvents(boardId); }

  getEvidence(boardId: string, evidenceId: string): EvidenceRecord | null {
    return this.repository.getEvidence(boardId, evidenceId);
  }

  listEvidence(boardId: string): EvidenceRecord[] {
    return this.repository.listEvidence(boardId);
  }

  listCorrections(boardId: string): EvidenceCorrectionRecord[] {
    return this.repository.listCorrections(boardId);
  }

  getReviewReference(evidenceId: string): EvidenceReviewReference | null {
    return this.repository.getReviewReference(evidenceId);
  }

  getProjectReferenceSource(
    boardId: string,
    evidenceId: string,
  ): EvidenceProjectReferenceSource | null {
    return this.repository.getProjectReferenceSource(boardId, evidenceId);
  }
}
