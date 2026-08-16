import {
  GleifLeiClient,
  SecSubmissionsClient,
  SourceServiceError
} from "../dist/index.js";

const cik = process.env.PROOFRAIL_SMOKE_CIK ?? "0000320193";
const lei = process.env.PROOFRAIL_SMOKE_LEI ?? "HWUPKR0MPOU8FGXBT394";
const gleifOnly = process.argv.includes("--gleif-only");

const gleif = await new GleifLeiClient().retrieve(lei);
const output = {
  gleif: evidenceSummary(gleif),
  sec: null
};

if (!gleifOnly) {
  const userAgent = process.env.SEC_USER_AGENT;
  if (userAgent === undefined || userAgent.trim().length === 0) {
    throw new Error(
      "SEC_USER_AGENT is required for the full live smoke test. Use an application name and contact email."
    );
  }
  try {
    const sec = await new SecSubmissionsClient({ userAgent }).retrieve(cik);
    output.sec = evidenceSummary(sec);
  } catch (error) {
    if (error instanceof SourceServiceError) {
      process.stderr.write(
        `${JSON.stringify({ code: error.code, source: error.source, status: error.status })}\n`
      );
    }
    throw error;
  }
}

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);

function evidenceSummary(result) {
  return {
    sourceUrl: result.snapshot.sourceUrl,
    retrievedAt: result.snapshot.retrievedAt,
    snapshotHash: result.snapshot.snapshotHash,
    byteLength: result.snapshot.body.byteLength,
    evidence: result.evidence
  };
}
