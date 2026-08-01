function binomialUpperTail(successes, trials, probability) {
  if (successes <= 0) {
    return 1;
  }
  if (probability <= 0) {
    return 0;
  }
  if (probability >= 1) {
    return 1;
  }

  let logCoefficient = 0;
  for (let index = 1; index <= successes; index += 1) {
    logCoefficient +=
      Math.log(trials - successes + index) - Math.log(index);
  }
  let term = Math.exp(
    logCoefficient +
      successes * Math.log(probability) +
      (trials - successes) * Math.log1p(-probability)
  );
  let tail = term;
  for (let observed = successes; observed < trials; observed += 1) {
    term *=
      ((trials - observed) / (observed + 1)) *
      (probability / (1 - probability));
    tail += term;
  }
  return Math.min(1, tail);
}

export function exactOneSidedLowerBound(
  successes,
  trials,
  alpha = 0.05
) {
  if (trials === 0 || successes === 0) {
    return 0;
  }
  if (successes === trials) {
    return Math.pow(alpha, 1 / trials);
  }

  let lower = 0;
  let upper = successes / trials;
  for (let iteration = 0; iteration < 80; iteration += 1) {
    const midpoint = (lower + upper) / 2;
    if (binomialUpperTail(successes, trials, midpoint) < alpha) {
      lower = midpoint;
    } else {
      upper = midpoint;
    }
  }
  return (lower + upper) / 2;
}

export function scoreCurrencyBenchmark(state) {
  const positiveTrials =
    state.correctWithinFiveSeconds +
    state.lateOrMissed +
    state.incorrectFocusedPricePositive;
  const incorrectFocusedPrices =
    state.incorrectFocusedPricePositive +
    state.incorrectFocusedPriceNegative;
  const exactRate =
    positiveTrials === 0
      ? 0
      : state.correctWithinFiveSeconds / positiveTrials;
  const exactLowerBound = exactOneSidedLowerBound(
    state.correctWithinFiveSeconds,
    positiveTrials
  );
  const observedSafetyTrials = positiveTrials + state.negativeTrials;

  return {
    positiveTrials,
    incorrectFocusedPrices,
    exactRate,
    exactLowerBound,
    zeroEventUpperBound:
      incorrectFocusedPrices === 0 && observedSafetyTrials > 0
        ? 1 - Math.pow(0.05, 1 / observedSafetyTrials)
        : null,
    passes:
      positiveTrials > 0 &&
      incorrectFocusedPrices === 0 &&
      exactRate >= 0.9
  };
}
