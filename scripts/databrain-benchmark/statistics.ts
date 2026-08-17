/**
 * Deterministic, seeded nonparametric bootstrap (percentile method).
 *
 * The benchmark report publishes confidence intervals alongside every mean, so
 * the interval must be recomputable byte-for-byte by the F5 audit from the raw
 * trials. A seeded PRNG makes the resampling reproducible; no wall-clock or
 * platform entropy enters the computation.
 */

export const BOOTSTRAP_RESAMPLES = 2_000;
export const BOOTSTRAP_CONFIDENCE_LEVEL = 0.95;
export const BOOTSTRAP_METHOD_DESCRIPTION =
  `Seeded nonparametric bootstrap, percentile method: ${BOOTSTRAP_RESAMPLES} resamples with replacement over the per-trial units, ` +
  `${(BOOTSTRAP_CONFIDENCE_LEVEL * 100).toFixed(0)}% interval, mulberry32 PRNG seeded by FNV-1a of the aggregate key. ` +
  "Failed trials stay in the resampling pool with score 0.";

export interface ConfidenceInterval {
  lower: number;
  upper: number;
}

function fnv1a(text: string): number {
  let hash = 0x81_1c_9d_c5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01_00_01_93) >>> 0;
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

/**
 * Percentile bootstrap interval for an arbitrary estimator over `units`.
 * Returns `null` when there is nothing to resample.
 */
export function bootstrapConfidenceInterval<T>(
  units: readonly T[],
  estimator: (sample: readonly T[]) => number | null,
  seedKey: string,
): ConfidenceInterval | null {
  if (units.length === 0) return null;
  const random = mulberry32(fnv1a(seedKey));
  const estimates: number[] = [];
  const sample = new Array<T>(units.length);
  for (let resample = 0; resample < BOOTSTRAP_RESAMPLES; resample += 1) {
    for (let index = 0; index < units.length; index += 1) {
      sample[index] = units[Math.floor(random() * units.length)]!;
    }
    const estimate = estimator(sample);
    if (estimate !== null && Number.isFinite(estimate))
      estimates.push(estimate);
  }
  if (estimates.length === 0) return null;
  estimates.sort((left, right) => left - right);
  const tail = (1 - BOOTSTRAP_CONFIDENCE_LEVEL) / 2;
  const lowerIndex = Math.max(0, Math.floor(tail * estimates.length));
  const upperIndex = Math.min(
    estimates.length - 1,
    Math.ceil((1 - tail) * estimates.length) - 1,
  );
  return {
    lower: round(estimates[lowerIndex]!),
    upper: round(estimates[upperIndex]!),
  };
}

export function mean(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}
