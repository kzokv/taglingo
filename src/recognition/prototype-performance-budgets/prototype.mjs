#!/usr/bin/env node

import readline from "node:readline";
import {
  PERFORMANCE_BUDGET,
  SAMPLE_TRACES,
  evaluateTrace
} from "./budgetModel.mjs";

const bold = (value) => `\x1b[1m${value}\x1b[0m`;
const dim = (value) => `\x1b[2m${value}\x1b[0m`;
const green = (value) => `\x1b[32m${value}\x1b[0m`;
const red = (value) => `\x1b[31m${value}\x1b[0m`;

const entries = Object.values(SAMPLE_TRACES);
let selected = 0;

function formatCheck(check) {
  const marker = check.pass ? green("PASS") : red("FAIL");
  const comparison = typeof check.actual === "number"
    ? `${check.actual} ${check.unit} · budget ${check.limit} ${check.unit}`
    : `${check.actual} · required ${check.limit}`;
  return `${marker}  ${check.name}: ${comparison}`;
}

function render(candidate, clear = true) {
  if (clear) console.clear();
  const result = evaluateTrace(candidate);
  console.log(bold("PROTOTYPE — mobile recognition performance budgets"));
  console.log(dim("Synthetic traces test the contract; they are not engine measurements."));
  console.log();
  console.log(`${bold("Trace")}       ${candidate.name}`);
  console.log(`${bold("Engine")}      ${candidate.engine}`);
  console.log(`${bold("Platform")}    ${candidate.platform}`);
  console.log(`${bold("Network")}     ${PERFORMANCE_BUDGET.measurementNetwork.downMbps} Mbps down / ${PERFORMANCE_BUDGET.measurementNetwork.roundTripMs} ms RTT`);
  console.log(`${bold("Disposition")} ${result.performanceEligible ? green(result.disposition) : red(result.disposition)}`);
  console.log();

  const readiness = result.checks.slice(0, 7);
  const resources = result.checks.slice(7, 11);
  const cadence = result.checks.slice(11, 18);
  const sustained = result.checks.slice(18);
  for (const [name, checks] of [
    ["Readiness and latency", readiness],
    ["Assets and memory", resources],
    ["Cadence and concurrency", cadence],
    ["Ten-minute sustained run", sustained]
  ]) {
    console.log(bold(name));
    for (const check of checks) console.log(`  ${formatCheck(check)}`);
    console.log();
  }

  if (clear) {
    console.log(dim("Performance eligibility never substitutes for the accuracy/safety benchmark."));
    console.log(`${bold("[1–4]")} select trace  ${bold("[n]")} next trace  ${bold("[q]")} quit`);
  }
}

if (process.argv.includes("--demo") || !process.stdin.isTTY) {
  for (const candidate of entries) {
    render(candidate, false);
    console.log("—".repeat(72));
  }
  process.exit(0);
}

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.resume();
render(entries[selected]);

process.stdin.on("keypress", (_character, key) => {
  if (key.name === "q" || (key.ctrl && key.name === "c")) {
    process.stdout.write("\n");
    process.exit(0);
  }
  if (/^[1-4]$/.test(key.name)) selected = Number(key.name) - 1;
  if (key.name === "n") selected = (selected + 1) % entries.length;
  render(entries[selected]);
});
