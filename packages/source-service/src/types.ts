import type {
  GleifSourceEvidence,
  SecSourceEvidence
} from "@proofrail/evidence-core";

import type { SourceName } from "./errors.js";

export interface CapturedResponseHeaders {
  readonly contentType: string;
  readonly cacheControl: string | null;
  readonly date: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
}

export interface SourceSnapshot {
  readonly source: SourceName;
  readonly sourceUrl: string;
  readonly retrievedAt: number;
  readonly responseHeaders: CapturedResponseHeaders;
  readonly body: Uint8Array;
  readonly snapshotHash: NonNullable<SecSourceEvidence["snapshotHash"]>;
}

export interface RetrievedSecEvidence {
  readonly evidence: SecSourceEvidence;
  readonly snapshot: SourceSnapshot;
}

export interface RetrievedGleifEvidence {
  readonly evidence: GleifSourceEvidence;
  readonly snapshot: SourceSnapshot;
}

export interface SourceRequestDependencies {
  readonly fetchImpl?: typeof fetch;
  readonly nowMs?: () => number;
}
