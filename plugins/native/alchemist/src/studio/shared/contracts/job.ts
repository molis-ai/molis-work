export interface JobEventDto {
  jobId: string;
  sequence: number;
  type: string;
  payload: unknown;
  createdAt: string;
}
