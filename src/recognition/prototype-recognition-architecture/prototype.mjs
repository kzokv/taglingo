#!/usr/bin/env node
// PROTOTYPE question: which observation/fusion/stabilization state model should
// TagLingo carry into its on-device recognition architecture?
import {
  ARCHITECTURES,
  architectureVerdict,
  createPrototypeState,
  observeScenario,
  selectNextDetectedPrice,
  switchArchitecture
} from "./architectureModel.mjs";

const bold = "\x1b[1m";
const dim = "\x1b[2m";
const green = "\x1b[32m";
const amber = "\x1b[33m";
const reset = "\x1b[0m";
const architectureKeys = Object.keys(ARCHITECTURES);
let state = createPrototypeState("A");

function money(minorUnits) {
  return `JPY ${minorUnits.toLocaleString("en-US")}`;
}

function render({ clear = true } = {}) {
  if (clear) console.clear();
  const architecture = ARCHITECTURES[state.architecture];
  const focused = state.detectedPrices.find(({ id }) => id === state.focusedPriceId);
  console.log(`${bold}PROTOTYPE — on-device recognition architecture${reset}`);
  console.log(`${dim}Synthetic observations expose structure; they do not claim OCR accuracy.${reset}\n`);
  console.log(`${amber}${bold}${architecture.key} — ${architecture.name}${reset}`);
  console.log(`${bold}verdict:${reset}          ${architectureVerdict(state.architecture)}`);
  console.log(`${bold}engine policy:${reset}    ${architecture.enginePolicy}`);
  console.log(`${bold}JPY engine:${reset}       ${architecture.jpyEngine}`);
  console.log(`${bold}raw payload:${reset}      ${architecture.rawPayload}`);
  console.log(`${bold}frequent pass:${reset}    ${architecture.frequentPass}`);
  console.log(`${bold}discovery:${reset}        ${architecture.discoveryPass}`);
  console.log(`${bold}preprocessing:${reset}    ${architecture.preprocessing}`);
  console.log(`${bold}fusion:${reset}           ${architecture.fusion}`);
  console.log(`${bold}confidence:${reset}       ${architecture.confidence}`);
  console.log(`${bold}scheduling:${reset}       ${architecture.scheduling}`);
  console.log(`${bold}tradeoff:${reset}         ${architecture.tradeoff}\n`);
  console.log(`${bold}profile:${reset}          ${state.profile}`);
  console.log(`${bold}generation:${reset}       ${state.generation}`);
  console.log(`${green}${bold}CURRENT STATE${reset}`);
  console.log(`${bold}pass:${reset}             ${state.pass}`);
  console.log(`${bold}phase:${reset}            ${state.phase}`);
  console.log(`${bold}last frame:${reset}       ${state.lastScenario}`);
  console.log(`${bold}frame detail:${reset}      ${state.lastDescription}`);
  console.log(`${bold}raw observations:${reset} ${state.rawObservationCount}`);
  console.log(`${bold}admissible:${reset}       ${state.admissibleCandidates.length}`);
  console.log(`${bold}pending tracks:${reset}   ${state.tracks.filter(({ hits }) => hits < 2).length}`);
  console.log(`${bold}Detected Prices:${reset}  ${state.detectedPrices.length || "none"}`);
  for (const price of state.detectedPrices) {
    const flags = [price.id === state.focusedPriceId ? "Focused" : "Detected", price.id === state.explicitFocusId ? "explicit" : null].filter(Boolean).join(" · ");
    console.log(`  ${money(price.minorUnits)} · hits ${price.hits} · misses ${price.misses} · ${flags}`);
    console.log(`  ${dim}${price.evidence} · frozen box ${JSON.stringify(price.box)}${reset}`);
  }
  console.log(`${bold}Focused Price:${reset}    ${focused ? money(focused.minorUnits) : "none"}`);
  console.log(`${bold}decision:${reset}         ${state.decision}\n`);
  console.log(`${bold}[a]${reset}${dim} architecture${reset}  ${bold}[r]${reset}${dim} reset${reset}  ${bold}[f]${reset}${dim} select next Detected Price${reset}  ${bold}[q]${reset}${dim} quit${reset}`);
  console.log(`${bold}[1]${reset}${dim} complete JPY${reset}  ${bold}[2]${reset}${dim} split marker${reset}  ${bold}[3]${reset}${dim} markerless${reset}  ${bold}[4]${reset}${dim} hallucination${reset}`);
  console.log(`${bold}[5]${reset}${dim} two prices${reset}   ${bold}[6]${reset}${dim} negative evidence${reset}  ${bold}[x]${reset}${dim} Guide miss${reset}  ${bold}[z]${reset}${dim} discovery miss${reset}`);
}

function dispatch(key) {
  const scenarioKeys = { "1": "correct", "2": "split", "3": "markerless", "4": "hallucination", "5": "multiple", "6": "negative", x: "guideMiss", z: "discoveryMiss" };
  if (scenarioKeys[key]) state = observeScenario(state, scenarioKeys[key]);
  if (key === "r") state = createPrototypeState(state.architecture);
  if (key === "f") state = selectNextDetectedPrice(state);
  if (key === "a") {
    const index = architectureKeys.indexOf(state.architecture);
    state = switchArchitecture(state, architectureKeys[(index + 1) % architectureKeys.length]);
  }
}

if (process.argv.includes("--demo")) {
  for (const architecture of architectureKeys) {
    state = createPrototypeState(architecture);
    state = observeScenario(state, "split");
    state = observeScenario(state, "split");
    render({ clear: false });
    console.log("\n" + "─".repeat(76) + "\n");
  }
  process.exit(0);
}

if (!process.stdin.isTTY) {
  console.error("Run this prototype in an interactive terminal, or append -- --demo.");
  process.exit(1);
}

process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
process.stdin.resume();
render();
process.stdin.on("data", (input) => {
  for (const key of input) {
    if (key === "q" || key === "\u0003") {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      console.clear();
      process.exit(0);
    }
    dispatch(key);
    render();
  }
});
