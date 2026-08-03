function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7
  ];
  if (value < 0.5) {
    return (
      Math.log(Math.PI) -
      Math.log(Math.sin(Math.PI * value)) -
      logGamma(1 - value)
    );
  }
  const z = value - 1;
  let sum = 0.9999999999998099;
  for (let index = 0; index < coefficients.length; index += 1) {
    sum += coefficients[index] / (z + index + 1);
  }
  const t = z + coefficients.length - 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) +
    (z + 0.5) * Math.log(t) -
    t +
    Math.log(sum)
  );
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maximumIterations = 200;
  const epsilon = 3e-14;
  const floor = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < floor) d = floor;
  d = 1 / d;
  let result = d;
  for (let iteration = 1; iteration <= maximumIterations; iteration += 1) {
    const even = 2 * iteration;
    let numerator =
      (iteration * (b - iteration) * x) / ((qam + even) * (a + even));
    d = 1 + numerator * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + numerator / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    result *= d * c;

    numerator =
      (-(a + iteration) * (qab + iteration) * x) /
      ((a + even) * (qap + even));
    d = 1 + numerator * d;
    if (Math.abs(d) < floor) d = floor;
    c = 1 + numerator / c;
    if (Math.abs(c) < floor) c = floor;
    d = 1 / d;
    const delta = d * c;
    result *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return result;
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const factor = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log1p(-x)
  );
  return x < (a + 1) / (a + b + 2)
    ? (factor * betaContinuedFraction(a, b, x)) / a
    : 1 - (factor * betaContinuedFraction(b, a, 1 - x)) / b;
}

function betaQuantile(probability: number, a: number, b: number): number {
  let lower = 0;
  let upper = 1;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (regularizedIncompleteBeta(middle, a, b) < probability) {
      lower = middle;
    } else {
      upper = middle;
    }
  }
  return (lower + upper) / 2;
}

export function exactOneSidedLowerBound(
  successes: number,
  trials: number,
  confidence: number
): number | null {
  if (trials === 0) return null;
  if (successes === 0) return 0;
  return betaQuantile(1 - confidence, successes, trials - successes + 1);
}

export function exactOneSidedUpperBound(
  observed: number,
  trials: number,
  confidence: number
): number | null {
  if (trials === 0) return null;
  if (observed === trials) return 1;
  return betaQuantile(confidence, observed + 1, trials - observed);
}
