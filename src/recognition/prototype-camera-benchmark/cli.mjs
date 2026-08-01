import readline from "node:readline";

import { scoreCurrencyBenchmark } from "./score.mjs";

const bold = "\u001b[1m";
const dim = "\u001b[2m";
const reset = "\u001b[0m";

const plans = {
  spread: {
    name: "120 positives divided across 12 currencies",
    correctWithinFiveSeconds: 9,
    lateOrMissed: 1,
    incorrectFocusedPricePositive: 0,
    negativeTrials: 10,
    incorrectFocusedPriceNegative: 0
  },
  perCurrency: {
    name: "Empirical gate: 108/120 positives plus 179 negatives",
    correctWithinFiveSeconds: 108,
    lateOrMissed: 12,
    incorrectFocusedPricePositive: 0,
    negativeTrials: 179,
    incorrectFocusedPriceNegative: 0
  },
  inferential: {
    name: "Inferential comparison: 114/120 positives plus 179 negatives",
    correctWithinFiveSeconds: 114,
    lateOrMissed: 6,
    incorrectFocusedPricePositive: 0,
    negativeTrials: 179,
    incorrectFocusedPriceNegative: 0
  }
};

let state = { ...plans.perCurrency };

function percentage(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function render() {
  const score = scoreCurrencyBenchmark(state);
  console.clear();
  console.log(`${bold}PROTOTYPE — Per-currency camera reliability gate${reset}`);
  console.log(`${dim}${state.name}${reset}\n`);
  console.log(`${bold}Positive fixtures${reset}: ${score.positiveTrials}`);
  console.log(
    `${bold}Correct Focused Price within 5s + aligned outline${reset}: ` +
      state.correctWithinFiveSeconds
  );
  console.log(`${bold}Late or missed${reset}: ${state.lateOrMissed}`);
  console.log(
    `${bold}Incorrect Focused Price on positive fixtures${reset}: ` +
      state.incorrectFocusedPricePositive
  );
  console.log(`${bold}Negative fixtures${reset}: ${state.negativeTrials}`);
  console.log(
    `${bold}Incorrect Focused Price on negative fixtures${reset}: ` +
      state.incorrectFocusedPriceNegative
  );
  console.log(`\n${bold}Observed exact rate${reset}: ${percentage(score.exactRate)}`);
  console.log(
    `${bold}Exact one-sided 95% lower bound${reset}: ` +
      percentage(score.exactLowerBound)
  );
  console.log(
    `${bold}Incorrect Focused Prices${reset}: ${score.incorrectFocusedPrices}`
  );
  console.log(
    `${bold}95% upper bound after zero observed unsafe events${reset}: ` +
      (score.zeroEventUpperBound === null
        ? "not applicable"
        : percentage(score.zeroEventUpperBound))
  );
  console.log(
    `\n${bold}Gate${reset}: ${score.passes ? "PASS" : "FAIL"}`
  );
  console.log(
    `\n${bold}Commands${reset}\n` +
      `${bold}1${reset} ${dim}120 total spread across currencies${reset}\n` +
      `${bold}2${reset} ${dim}empirical 108/120 per-currency gate${reset}\n` +
      `${bold}3${reset} ${dim}inferential 114/120 comparison${reset}\n` +
      `${bold}m${reset} ${dim}turn one success into a late/miss${reset}\n` +
      `${bold}r${reset} ${dim}recover one late/miss${reset}\n` +
      `${bold}f${reset} ${dim}turn one success into an incorrect Focused Price${reset}\n` +
      `${bold}n${reset} ${dim}add an incorrect Focused Price on a negative${reset}\n` +
      `${bold}q${reset} ${dim}quit${reset}`
  );
}

function dispatch(command) {
  switch (command.trim().toLowerCase()) {
    case "1":
      state = { ...plans.spread };
      break;
    case "2":
      state = { ...plans.perCurrency };
      break;
    case "3":
      state = { ...plans.inferential };
      break;
    case "m":
      if (state.correctWithinFiveSeconds > 0) {
        state.correctWithinFiveSeconds -= 1;
        state.lateOrMissed += 1;
      }
      break;
    case "r":
      if (state.lateOrMissed > 0) {
        state.lateOrMissed -= 1;
        state.correctWithinFiveSeconds += 1;
      }
      break;
    case "f":
      if (state.correctWithinFiveSeconds > 0) {
        state.correctWithinFiveSeconds -= 1;
        state.incorrectFocusedPricePositive += 1;
      }
      break;
    case "n":
      state.incorrectFocusedPriceNegative += 1;
      break;
  }
}

const terminal = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
render();
terminal.on("line", (command) => {
  if (command.trim().toLowerCase() === "q") {
    terminal.close();
    return;
  }
  dispatch(command);
  render();
});
