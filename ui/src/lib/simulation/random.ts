/**
 * Random sampling utilities for the simulation.
 */

/** Sample from a Binomial(n, p) distribution. */
export function sampleBinomial(n: number, p: number): number {
  if (n <= 0) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return n;
  let successes = 0;
  for (let i = 0; i < n; i++) {
    if (Math.random() < p) successes++;
  }
  return successes;
}

/**
 * Sample from a Multinomial(n, [p1, p2, p3]) distribution.
 * Returns an array of counts [c1, c2, c3] where c1+c2+c3 = n.
 */
export function sampleMultinomial(n: number, probs: [number, number, number]): [number, number, number] {
  if (n <= 0) return [0, 0, 0];

  const [p1, p2, _p3] = probs;

  // Sample first category from Binomial(n, p1)
  const c1 = sampleBinomial(n, p1);
  const remaining = n - c1;

  // Sample second category from Binomial(remaining, p2 / (1 - p1)) if p1 < 1
  let c2 = 0;
  if (remaining > 0) {
    const conditionalP2 = p1 < 1 ? p2 / (1 - p1) : 0;
    c2 = sampleBinomial(remaining, Math.min(conditionalP2, 1));
  }

  const c3 = n - c1 - c2;
  return [c1, c2, c3];
}
