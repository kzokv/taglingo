#!/usr/bin/env -S node --experimental-strip-types

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

interface ValidationInput {
  config: unknown;
  evidence: unknown;
  expectedRevision: string;
  trustedEvidencePrefix: string;
  evidenceSha256: string;
  expectedEvidenceSha256: string;
  now: Date;
}

interface CliOutput {
  log(message: string): void;
  error(message: string): void;
}

interface CliOptions {
  evidencePath: string;
  configPath: string;
  revision: string;
  trustedEvidencePrefix: string;
  expectedEvidenceSha256: string;
}

const SCRIPT_PATH = "check-recognition-health-deployment.ts";

function helpText(): string {
  return `Description:
  Fail closed unless recognition-health deployment config and external privacy evidence are complete.

Usage: ${SCRIPT_PATH} --evidence PATH --config PATH --revision SHA --evidence-prefix HTTPS_PREFIX --evidence-sha256 SHA256 [OPTIONS]

Options:
  -h, --help              Show this help message and exit (optional)
  -e, --evidence PATH     External deployment-evidence JSON file (required)
  -c, --config PATH       Production Wrangler strict-JSON file (required)
  -r, --revision SHA      Exact 40-character deployment revision (required)
      --evidence-prefix   Trusted HTTPS proof prefix from protected CI (required)
      --evidence-sha256   Evidence bundle digest pinned by protected CI (required)`;
}

function argumentValue(
  arguments_: readonly string[],
  index: number,
  flag: string
): { value?: string; error?: string } {
  const value = arguments_[index + 1];
  return value && !value.startsWith("-")
    ? { value }
    : { error: `Missing value for ${flag}` };
}

function parseArguments(
  arguments_: readonly string[]
): { help?: true; options?: CliOptions; error?: string } {
  let evidencePath = "";
  let configPath = "";
  let revision = "";
  let trustedEvidencePrefix = "";
  let expectedEvidenceSha256 = "";
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "-h" || argument === "--help") return { help: true };
    if (
      argument === "-e" ||
      argument === "--evidence" ||
      argument === "-c" ||
      argument === "--config" ||
      argument === "-r" ||
      argument === "--revision" ||
      argument === "--evidence-prefix" ||
      argument === "--evidence-sha256"
    ) {
      const parsed = argumentValue(arguments_, index, argument);
      if (!parsed.value) return { error: parsed.error };
      if (argument === "-e" || argument === "--evidence") {
        evidencePath = parsed.value;
      } else if (argument === "-c" || argument === "--config") {
        configPath = parsed.value;
      } else if (argument === "-r" || argument === "--revision") {
        revision = parsed.value;
      } else if (argument === "--evidence-prefix") {
        trustedEvidencePrefix = parsed.value;
      } else if (argument === "--evidence-sha256") {
        expectedEvidenceSha256 = parsed.value;
      }
      index += 1;
      continue;
    }
    return {
      error: argument.startsWith("-")
        ? `Unknown flag ${argument}`
        : `Unexpected positional argument: ${argument}`
    };
  }
  if (
    !evidencePath ||
    !configPath ||
    !revision ||
    !trustedEvidencePrefix ||
    !expectedEvidenceSha256
  ) {
    return {
      error:
        "--evidence, --config, --revision, --evidence-prefix, and --evidence-sha256 are required for deployment preflight"
    };
  }
  return {
    options: {
      evidencePath,
      configPath,
      revision,
      trustedEvidencePrefix,
      expectedEvidenceSha256
    }
  };
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function databaseBinding(config: unknown): Record<string, unknown> | null {
  if (!isRecord(config) || !Array.isArray(config.d1_databases)) return null;
  const binding = config.d1_databases.find(
    (candidate) => isRecord(candidate) && candidate.binding === "DB"
  );
  return isRecord(binding) ? binding : null;
}

function recordAt(
  value: Record<string, unknown> | null,
  key: string
): Record<string, unknown> | null {
  const child = value?.[key];
  return isRecord(child) ? child : null;
}

function trustedPrefix(value: string): URL | null {
  try {
    const parsed = new URL(value);
    const placeholderAuthority =
      /placeholder|replace|todo/iu.test(parsed.hostname) ||
      parsed.hostname === "localhost" ||
      parsed.hostname === "example.com" ||
      /\.(?:example|invalid|test)$/iu.test(parsed.hostname) ||
      /placeholder|replace|todo|example/iu.test(parsed.pathname);
    return parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.search &&
      !parsed.hash &&
      !placeholderAuthority &&
      parsed.pathname.endsWith("/")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function validatedEvidenceReference(
  value: unknown,
  prefix: URL | null
): string | null {
  if (typeof value !== "string" || !prefix) return null;
  try {
    const parsed = new URL(value);
    const relativePath = parsed.pathname.slice(prefix.pathname.length);
    const decodedRelativePath = decodeURIComponent(relativePath);
    if (
      parsed.protocol !== "https:" ||
      parsed.origin !== prefix.origin ||
      !parsed.pathname.startsWith(prefix.pathname) ||
      !relativePath ||
      relativePath.endsWith("/") ||
      !decodedRelativePath.includes("/") ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      /placeholder|replace|todo|example/iu.test(decodedRelativePath)
    ) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

function withinMaximum(value: unknown, maximum: number): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= maximum
  );
}

export function validateRecognitionHealthDeployment({
  config,
  evidence,
  expectedRevision,
  trustedEvidencePrefix,
  evidenceSha256,
  expectedEvidenceSha256,
  now
}: ValidationInput): string[] {
  const errors: string[] = [];
  const evidencePrefix = trustedPrefix(trustedEvidencePrefix);
  if (!evidencePrefix) {
    errors.push("trusted HTTPS evidence prefix is required from protected CI");
  }
  if (
    !/^[0-9a-f]{64}$/u.test(evidenceSha256) ||
    !/^[0-9a-f]{64}$/u.test(expectedEvidenceSha256) ||
    evidenceSha256 !== expectedEvidenceSha256
  ) {
    errors.push("evidence bundle digest must match protected CI configuration");
  }
  const database = databaseBinding(config);
  const configRecord = isRecord(config) ? config : null;
  if (
    configRecord?.main !==
    "./src/recognitionHealth/recognitionHealthRetentionWorker.ts"
  ) {
    errors.push("config must deploy the recognition-health retention worker");
  }
  if (configRecord?.workers_dev !== false) {
    errors.push("retention worker must not expose a workers.dev URL");
  }
  if (recordAt(configRecord, "observability")?.enabled !== false) {
    errors.push("retention worker observability must remain disabled");
  }
  const crons = recordAt(configRecord, "triggers")?.crons;
  if (
    !Array.isArray(crons) ||
    crons.length !== 1 ||
    typeof crons[0] !== "string" ||
    !/^(?:[0-5]?\d) (?:[01]?\d|2[0-3]) \* \* \*$/u.test(crons[0])
  ) {
    errors.push("retention worker must have a daily cron trigger");
  }
  if (
    !database ||
    typeof database.database_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      database.database_id
    ) ||
    /^0{8}-0{4}-0{4}-0{4}-0{12}$/u.test(database.database_id)
  ) {
    errors.push("config DB database_id must be a non-placeholder UUID");
  }
  if (
    typeof database?.database_name !== "string" ||
    !database.database_name.trim() ||
    /local|placeholder|replace|example/iu.test(database.database_name)
  ) {
    errors.push("config DB database_name must identify production");
  }

  const evidenceRecord = isRecord(evidence) ? evidence : null;
  if (
    evidenceRecord?.version !==
      "recognition-health-deployment-evidence.v1" ||
    evidenceRecord.environment !== "production"
  ) {
    errors.push("production deployment evidence contract is required");
  }
  if (
    !/^[0-9a-f]{40}$/u.test(expectedRevision) ||
    evidenceRecord?.revision !== expectedRevision
  ) {
    errors.push("evidence revision must match the deployment revision");
  }
  const reviewedAt =
    typeof evidenceRecord?.reviewedAt === "string"
      ? new Date(evidenceRecord.reviewedAt)
      : new Date(Number.NaN);
  const evidenceAge = now.getTime() - reviewedAt.getTime();
  if (
    Number.isNaN(reviewedAt.getTime()) ||
    evidenceAge < 0 ||
    evidenceAge > 30 * 24 * 60 * 60 * 1_000
  ) {
    errors.push("deployment evidence must be reviewed within the last 30 days");
  }

  const controls = recordAt(evidenceRecord, "controls");
  const transport = recordAt(controls, "transportBuffer");
  if (
    transport?.encryptedInTransit !== true ||
    transport.encryptedAtRest !== true
  ) {
    errors.push("transport buffer must be encrypted in transit and at rest");
  }
  if (
    transport?.accessRestricted !== true ||
    transport.analyticsQueryable !== false
  ) {
    errors.push("transport buffer must be restricted and non-queryable");
  }
  if (!withinMaximum(transport?.maxRetentionHours, 24)) {
    errors.push("transport buffer retention must be at most 24 hours");
  }
  const storage = recordAt(controls, "aggregateStorage");
  if (
    !withinMaximum(storage?.primaryRetentionDays, 90) ||
    !withinMaximum(storage?.replicaRetentionDays, 90) ||
    !withinMaximum(storage?.backupRetentionDays, 90)
  ) {
    errors.push(
      "primary, replica, and backup retention must each be at most 90 days"
    );
  }
  if (storage?.restoreTestPassed !== true) {
    errors.push("restore expiry proof must be current and passed");
  }

  const scheduler = recordAt(controls, "scheduler");
  if (
    scheduler?.enabled !== true ||
    scheduler.failureAlertEnabled !== true
  ) {
    errors.push("retention scheduler and its failure alert must be enabled");
  }

  const operatorAccess = recordAt(controls, "operatorAccess");
  if (
    operatorAccess?.namedOperatorsOnly !== true ||
    operatorAccess.auditEnabled !== true ||
    operatorAccess.thresholdedOnly !== true
  ) {
    errors.push("operator access must be named, audited, and thresholded-only");
  }

  const application = recordAt(controls, "application");
  if (
    application?.killSwitchTestPassed !== true ||
    application.loggingTestPassed !== true ||
    application.contractTestsPassed !== true
  ) {
    errors.push("kill-switch, logging, and contract checks must have passed");
  }

  const proofReferences = [
    transport?.destructionTestReference,
    transport?.accessControlReference,
    storage?.primaryRetentionReference,
    storage?.replicaRetentionReference,
    storage?.backupRetentionReference,
    storage?.restoreTestReference,
    scheduler?.failureAlertReference,
    operatorAccess?.accessReviewReference,
    operatorAccess?.auditThresholdReference,
    application?.killSwitchTestReference,
    application?.loggingTestReference,
    application?.contractTestReference
  ].map((reference) =>
    validatedEvidenceReference(reference, evidencePrefix)
  );
  if (
    proofReferences.some((reference) => reference === null) ||
    new Set(proofReferences).size !== proofReferences.length
  ) {
    errors.push(
      "every control requires a distinct concrete proof under the trusted HTTPS prefix"
    );
  }

  const databaseId = database?.database_id;
  const databaseHash =
    typeof databaseId === "string"
      ? createHash("sha256").update(databaseId).digest("hex")
      : null;
  if (evidenceRecord?.databaseIdSha256 !== databaseHash) {
    errors.push("evidence database hash must match the configured D1 database");
  }
  return errors;
}

export function runCli(
  arguments_: readonly string[],
  output: CliOutput = console
): number {
  const parsed = parseArguments(arguments_);
  if (parsed.help) {
    output.log(helpText());
    return 0;
  }
  if (!parsed.options) {
    output.error(`ERROR: ${parsed.error ?? "Invalid arguments"}`);
    output.log(helpText());
    return 1;
  }

  let evidence: unknown;
  let evidenceSha256 = "";
  let config: unknown;
  try {
    const evidenceBytes = readFileSync(parsed.options.evidencePath, "utf8");
    evidence = JSON.parse(evidenceBytes) as unknown;
    evidenceSha256 = createHash("sha256").update(evidenceBytes).digest("hex");
    config = readJson(parsed.options.configPath);
  } catch {
    output.error("ERROR: Evidence and config must be readable strict JSON");
    return 1;
  }
  const errors = validateRecognitionHealthDeployment({
    evidence,
    config,
    expectedRevision: parsed.options.revision,
    trustedEvidencePrefix: parsed.options.trustedEvidencePrefix,
    evidenceSha256,
    expectedEvidenceSha256: parsed.options.expectedEvidenceSha256,
    now: new Date()
  });
  if (errors.length > 0) {
    for (const error of errors) output.error(`ERROR: ${error}`);
    return 1;
  }
  output.log("recognition-health deployment evidence: valid");
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = runCli(process.argv.slice(2));
}
