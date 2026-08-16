import { normalizeLei } from "@proofrail/evidence-core";
import type { GleifSourceEvidence } from "@proofrail/evidence-core";

import { SourceServiceError } from "./errors.js";
import { fetchExactJson } from "./request.js";
import {
  requireObject,
  requireString
} from "./schema.js";
import type {
  RetrievedGleifEvidence,
  SourceRequestDependencies
} from "./types.js";

const GLEIF_BASE_URL = "https://api.gleif.org/api/v1/lei-records";
const GLEIF_TIMEOUT_MS = 12_000;
const GLEIF_MAX_BODY_BYTES = 2 * 1024 * 1024;

export class GleifLeiClient {
  readonly #dependencies: SourceRequestDependencies;

  constructor(dependencies: SourceRequestDependencies = {}) {
    this.#dependencies = dependencies;
  }

  async retrieve(leiInput: string): Promise<RetrievedGleifEvidence> {
    const lei = normalizeLei(leiInput);
    const sourceUrl = `${GLEIF_BASE_URL}/${lei}`;
    const response = await fetchExactJson(
      {
        source: "GLEIF",
        sourceUrl,
        headers: { Accept: "application/vnd.api+json" },
        timeoutMs: GLEIF_TIMEOUT_MS,
        maxBodyBytes: GLEIF_MAX_BODY_BYTES
      },
      this.#dependencies
    );
    const parsed = parseGleifLeiRecord(response.json, lei);
    const evidence: GleifSourceEvidence = {
      source: "GLEIF",
      resolved: true,
      lei,
      legalName: parsed.legalName,
      entityStatus: parsed.entityStatus,
      retrievedAt: response.snapshot.retrievedAt,
      snapshotHash: response.snapshot.snapshotHash,
      sourceUrl
    };
    return { evidence, snapshot: response.snapshot };
  }
}

export function parseGleifLeiRecord(
  value: unknown,
  expectedLei: string
): { readonly legalName: string; readonly entityStatus: string } {
  const root = requireObject(value, "GLEIF", "response");
  const data = requireObject(root.data, "GLEIF", "response.data");
  const type = requireString(data.type, "GLEIF", "response.data.type");
  if (type !== "lei-records") {
    throw new SourceServiceError(
      "SOURCE_SCHEMA_ERROR",
      "GLEIF",
      `GLEIF resource type ${type} is unsupported.`
    );
  }
  const id = normalizeReturnedLei(data.id, "response.data.id");
  const attributes = requireObject(
    data.attributes,
    "GLEIF",
    "response.data.attributes"
  );
  const attributeLei = normalizeReturnedLei(
    attributes.lei,
    "response.data.attributes.lei"
  );
  if (id !== expectedLei || attributeLei !== expectedLei) {
    throw new SourceServiceError(
      "SOURCE_IDENTIFIER_MISMATCH",
      "GLEIF",
      `GLEIF returned ${id}/${attributeLei} for requested LEI ${expectedLei}.`
    );
  }
  const entity = requireObject(
    attributes.entity,
    "GLEIF",
    "response.data.attributes.entity"
  );
  const legalName = requireObject(
    entity.legalName,
    "GLEIF",
    "response.data.attributes.entity.legalName"
  );
  return {
    legalName: requireString(
      legalName.name,
      "GLEIF",
      "response.data.attributes.entity.legalName.name"
    ),
    entityStatus: requireString(
      entity.status,
      "GLEIF",
      "response.data.attributes.entity.status"
    )
  };
}

function normalizeReturnedLei(value: unknown, path: string): string {
  try {
    return normalizeLei(requireString(value, "GLEIF", path));
  } catch (error) {
    if (error instanceof SourceServiceError) {
      throw error;
    }
    throw new SourceServiceError(
      "SOURCE_SCHEMA_ERROR",
      "GLEIF",
      `${path} must contain a valid LEI.`,
      { cause: error }
    );
  }
}
