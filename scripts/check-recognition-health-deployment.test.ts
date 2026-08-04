import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  validateRecognitionHealthDeployment as validateDeployment
} from "./check-recognition-health-deployment";

const REVISION = "1234567890abcdef1234567890abcdef12345678";
const DATABASE_ID = "11111111-1111-4111-8111-111111111111";
const TRUSTED_EVIDENCE_PREFIX =
  "https://evidence.taglingo.com/protected/taglingo/recognition-health/";
const TRUSTED_EVIDENCE_SHA256 = "b".repeat(64);

function validateRecognitionHealthDeployment(
  input: Omit<Parameters<typeof validateDeployment>[0],
    "trustedEvidencePrefix" | "evidenceSha256" | "expectedEvidenceSha256">
) {
  return validateDeployment({
    ...input,
    trustedEvidencePrefix: TRUSTED_EVIDENCE_PREFIX,
    evidenceSha256: TRUSTED_EVIDENCE_SHA256,
    expectedEvidenceSha256: TRUSTED_EVIDENCE_SHA256
  });
}

function deploymentConfig(databaseId = DATABASE_ID): unknown {
  return {
    name: "taglingo-recognition-health-retention",
    main: "./src/recognitionHealth/recognitionHealthRetentionWorker.ts",
    workers_dev: false,
    observability: { enabled: false },
    triggers: { crons: ["17 3 * * *"] },
    d1_databases: [
      {
        binding: "DB",
        database_name: "taglingo-production",
        database_id: databaseId,
        migrations_dir: "migrations"
      }
    ]
  };
}

function deploymentEvidence(): unknown {
  return {
    version: "recognition-health-deployment-evidence.v1",
    environment: "production",
    revision: REVISION,
    reviewedAt: "2026-08-04T00:00:00.000Z",
    databaseIdSha256:
      "bd7662a5eeb41614e720d477abfcb2272e19a8a70a93b7e3bc8560d44ad326e9",
    controls: {
      transportBuffer: {
        encryptedInTransit: true,
        encryptedAtRest: true,
        accessRestricted: true,
        analyticsQueryable: false,
        maxRetentionHours: 24,
        destructionTestReference:
          `${TRUSTED_EVIDENCE_PREFIX}transport/destruction-2026-08-04.json`,
        accessControlReference:
          `${TRUSTED_EVIDENCE_PREFIX}transport/access-control-2026-08-04.json`
      },
      aggregateStorage: {
        primaryRetentionDays: 90,
        replicaRetentionDays: 90,
        backupRetentionDays: 90,
        restoreTestPassed: true,
        primaryRetentionReference:
          `${TRUSTED_EVIDENCE_PREFIX}storage/primary-retention-2026-08-04.json`,
        replicaRetentionReference:
          `${TRUSTED_EVIDENCE_PREFIX}storage/replica-retention-2026-08-04.json`,
        backupRetentionReference:
          `${TRUSTED_EVIDENCE_PREFIX}storage/backup-retention-2026-08-04.json`,
        restoreTestReference:
          `${TRUSTED_EVIDENCE_PREFIX}storage/restore-test-2026-08-04.json`
      },
      scheduler: {
        enabled: true,
        failureAlertEnabled: true,
        failureAlertReference:
          `${TRUSTED_EVIDENCE_PREFIX}scheduler/failure-alert-2026-08-04.json`
      },
      operatorAccess: {
        namedOperatorsOnly: true,
        auditEnabled: true,
        thresholdedOnly: true,
        accessReviewReference:
          `${TRUSTED_EVIDENCE_PREFIX}access/operator-review-2026-08-04.json`,
        auditThresholdReference:
          `${TRUSTED_EVIDENCE_PREFIX}access/audit-threshold-2026-08-04.json`
      },
      application: {
        killSwitchTestPassed: true,
        loggingTestPassed: true,
        contractTestsPassed: true,
        killSwitchTestReference:
          `${TRUSTED_EVIDENCE_PREFIX}application/kill-switch-2026-08-04.json`,
        loggingTestReference:
          `${TRUSTED_EVIDENCE_PREFIX}application/logging-2026-08-04.json`,
        contractTestReference:
          `${TRUSTED_EVIDENCE_PREFIX}application/contract-tests-2026-08-04.json`
      }
    }
  };
}

function changedEvidence(change: (evidence: any) => void): unknown {
  const evidence = structuredClone(deploymentEvidence());
  change(evidence);
  return evidence;
}

function changedConfig(change: (config: any) => void): unknown {
  const config = structuredClone(deploymentConfig());
  change(config);
  return config;
}

function runCli(...arguments_: string[]) {
  return spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      join(process.cwd(), "scripts/check-recognition-health-deployment.ts"),
      ...arguments_
    ],
    { encoding: "utf8" }
  );
}

describe("recognition-health deployment preflight", () => {
  it("rejects the checked-in placeholder D1 database ID", () => {
    const errors = validateRecognitionHealthDeployment({
      config: deploymentConfig("00000000-0000-0000-0000-000000000000"),
      evidence: deploymentEvidence(),
      expectedRevision: REVISION,
      now: new Date("2026-08-04T09:00:00.000Z")
    });

    expect(errors).toContain(
      "config DB database_id must be a non-placeholder UUID"
    );
  });

  it("accepts complete, current evidence bound to the deploy revision and database", () => {
    expect(
      validateRecognitionHealthDeployment({
        config: deploymentConfig(),
        evidence: deploymentEvidence(),
        expectedRevision: REVISION,
        now: new Date("2026-08-04T09:00:00.000Z")
      })
    ).toEqual([]);
  });

  it.each([
    [
      "transport encryption",
      (evidence: any) => {
        evidence.controls.transportBuffer.encryptedAtRest = false;
      },
      "transport buffer must be encrypted in transit and at rest"
    ],
    [
      "transport access",
      (evidence: any) => {
        evidence.controls.transportBuffer.analyticsQueryable = true;
      },
      "transport buffer must be restricted and non-queryable"
    ],
    [
      "transport retention",
      (evidence: any) => {
        evidence.controls.transportBuffer.maxRetentionHours = 25;
      },
      "transport buffer retention must be at most 24 hours"
    ],
    [
      "replica retention",
      (evidence: any) => {
        evidence.controls.aggregateStorage.replicaRetentionDays = 91;
      },
      "primary, replica, and backup retention must each be at most 90 days"
    ],
    [
      "restore proof",
      (evidence: any) => {
        evidence.controls.aggregateStorage.restoreTestPassed = false;
      },
      "restore expiry proof must be current and passed"
    ],
    [
      "scheduler alert",
      (evidence: any) => {
        evidence.controls.scheduler.failureAlertEnabled = false;
      },
      "retention scheduler and its failure alert must be enabled"
    ],
    [
      "operator audit",
      (evidence: any) => {
        evidence.controls.operatorAccess.auditEnabled = false;
      },
      "operator access must be named, audited, and thresholded-only"
    ],
    [
      "kill switch",
      (evidence: any) => {
        evidence.controls.application.killSwitchTestPassed = false;
      },
      "kill-switch, logging, and contract checks must have passed"
    ],
    [
      "revision binding",
      (evidence: any) => {
        evidence.revision = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      },
      "evidence revision must match the deployment revision"
    ],
    [
      "database binding",
      (evidence: any) => {
        evidence.databaseIdSha256 = "a".repeat(64);
      },
      "evidence database hash must match the configured D1 database"
    ],
    [
      "fresh review",
      (evidence: any) => {
        evidence.reviewedAt = "2026-06-01T00:00:00.000Z";
      },
      "deployment evidence must be reviewed within the last 30 days"
    ]
  ])("rejects incomplete %s evidence", (_name, change, expectedError) => {
    const errors = validateRecognitionHealthDeployment({
      config: deploymentConfig(),
      evidence: changedEvidence(change),
      expectedRevision: REVISION,
      now: new Date("2026-08-04T09:00:00.000Z")
    });

    expect(errors).toContain(expectedError);
  });

  it("rejects absent CI trust configuration and a mismatched evidence bundle digest", () => {
    const input = {
      config: deploymentConfig(),
      evidence: deploymentEvidence(),
      expectedRevision: REVISION,
      now: new Date("2026-08-04T09:00:00.000Z"),
      evidenceSha256: TRUSTED_EVIDENCE_SHA256,
      expectedEvidenceSha256: "c".repeat(64)
    };
    expect(
      validateDeployment({ ...input, trustedEvidencePrefix: "" })
    ).toContain("trusted HTTPS evidence prefix is required from protected CI");
    expect(
      validateDeployment({
        ...input,
        trustedEvidencePrefix:
          "https://REPLACE_WITH_TRUSTED_AUTHORITY/protected/taglingo/"
      })
    ).toContain("trusted HTTPS evidence prefix is required from protected CI");
    expect(
      validateDeployment({
        ...input,
        trustedEvidencePrefix: TRUSTED_EVIDENCE_PREFIX
      })
    ).toContain("evidence bundle digest must match protected CI configuration");
  });

  it.each([
    [
      "arbitrary token",
      (evidence: any) => {
        evidence.controls.transportBuffer.destructionTestReference =
          "abcdefghijkl";
      }
    ],
    [
      "placeholder proof",
      (evidence: any) => {
        evidence.controls.transportBuffer.destructionTestReference =
          `${TRUSTED_EVIDENCE_PREFIX}transport/REPLACE_WITH_PROOF.json`;
      }
    ],
    [
      "invented origin",
      (evidence: any) => {
        evidence.controls.transportBuffer.destructionTestReference =
          "https://invented.example/protected/taglingo/proof.json";
      }
    ],
    [
      "outside allowlisted path",
      (evidence: any) => {
        evidence.controls.transportBuffer.destructionTestReference =
          "https://evidence.taglingo.com/public/proof.json";
      }
    ],
    [
      "duplicate proof",
      (evidence: any) => {
        evidence.controls.aggregateStorage.backupRetentionReference =
          evidence.controls.aggregateStorage.replicaRetentionReference;
      }
    ],
    [
      "missing concrete result",
      (evidence: any) => {
        delete evidence.controls.application.loggingTestReference;
      }
    ]
  ])("rejects %s evidence references", (_name, change) => {
    expect(
      validateRecognitionHealthDeployment({
        config: deploymentConfig(),
        evidence: changedEvidence(change),
        expectedRevision: REVISION,
        now: new Date("2026-08-04T09:00:00.000Z")
      })
    ).toContain(
      "every control requires a distinct concrete proof under the trusted HTTPS prefix"
    );
  });

  it.each([
    [
      "scheduled entry point",
      (config: any) => {
        config.main = "./src/otherWorker.ts";
      },
      "config must deploy the recognition-health retention worker"
    ],
    [
      "public worker URL",
      (config: any) => {
        config.workers_dev = true;
      },
      "retention worker must not expose a workers.dev URL"
    ],
    [
      "payload observability",
      (config: any) => {
        config.observability.enabled = true;
      },
      "retention worker observability must remain disabled"
    ],
    [
      "daily trigger",
      (config: any) => {
        config.triggers.crons = [];
      },
      "retention worker must have a daily cron trigger"
    ],
    [
      "local database name",
      (config: any) => {
        config.d1_databases[0].database_name = "taglingo-local";
      },
      "config DB database_name must identify production"
    ]
  ])("rejects unsafe %s config", (_name, change, expectedError) => {
    expect(
      validateRecognitionHealthDeployment({
        config: changedConfig(change),
        evidence: deploymentEvidence(),
        expectedRevision: REVISION,
        now: new Date("2026-08-04T09:00:00.000Z")
      })
    ).toContain(expectedError);
  });

  it("provides a non-interactive help and argument-error contract", () => {
    const help = runCli("--help");
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("Description:");
    expect(help.stdout).toContain("Usage:");
    expect(help.stdout).toContain("Options:");

    const unknown = runCli("--unknown");
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain("ERROR: Unknown flag --unknown");
    expect(unknown.stdout).toContain("Usage:");
  });

  it("fails or succeeds from deployment files with machine-readable output", () => {
    const directory = mkdtempSync(join(tmpdir(), "taglingo-health-preflight-"));
    const evidencePath = join(directory, "evidence.json");
    const configPath = join(directory, "wrangler.json");
    const evidenceBytes = JSON.stringify(deploymentEvidence());
    const evidenceSha256 = createHash("sha256")
      .update(evidenceBytes)
      .digest("hex");
    writeFileSync(evidencePath, evidenceBytes);
    writeFileSync(configPath, JSON.stringify(deploymentConfig()));

    const valid = runCli(
      "--evidence",
      evidencePath,
      "--config",
      configPath,
      "--revision",
      REVISION,
      "--evidence-prefix",
      TRUSTED_EVIDENCE_PREFIX,
      "--evidence-sha256",
      evidenceSha256
    );
    expect(valid.status).toBe(0);
    expect(valid.stdout).toContain("recognition-health deployment evidence: valid");

    writeFileSync(
      configPath,
      JSON.stringify(
        deploymentConfig("00000000-0000-0000-0000-000000000000")
      )
    );
    const invalid = runCli(
      "--evidence",
      evidencePath,
      "--config",
      configPath,
      "--revision",
      REVISION,
      "--evidence-prefix",
      TRUSTED_EVIDENCE_PREFIX,
      "--evidence-sha256",
      evidenceSha256
    );
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain("ERROR: config DB database_id");
  });
});
