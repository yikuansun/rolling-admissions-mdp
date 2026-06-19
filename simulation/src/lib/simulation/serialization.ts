/**
 * Serialization utilities for passing ModelParameters across Web Worker boundaries.
 * Typed arrays need special handling for structured clone.
 */

import type { ModelParameters } from './types';
import { FloatTensor1D, FloatTensor3D, FloatTensor4D } from './tensor';

/** Serialized form of ModelParameters (all tensors as raw Float64Arrays + dimensions). */
export interface SerializedModelParameters {
  T: number;
  r: number;
  A: number;
  C: number;
  W: number;
  tauMax: number;
  phi: number;
  psi: number;
  // Tensor data as transferable arrays
  lambda_data: Float64Array;
  pi_data: Float64Array;
  delta_data: Float64Array;
  theta_data: Float64Array;
  mu_data: Float64Array;
}

/** Serialize ModelParameters for transfer to a worker. */
export function serializeParams(params: ModelParameters): SerializedModelParameters {
  return {
    T: params.T,
    r: params.r,
    A: params.A,
    C: params.C,
    W: params.W,
    tauMax: params.tauMax,
    phi: params.phi,
    psi: params.psi,
    lambda_data: Float64Array.from(params.lambda.data),
    pi_data: Float64Array.from(params.pi.data),
    delta_data: Float64Array.from(params.delta.data),
    theta_data: Float64Array.from(params.theta.data),
    mu_data: Float64Array.from(params.mu.data),
  };
}

/** Deserialize ModelParameters from a worker message. */
export function deserializeParams(s: SerializedModelParameters): ModelParameters {
  return {
    T: s.T,
    r: s.r,
    A: s.A,
    C: s.C,
    W: s.W,
    tauMax: s.tauMax,
    phi: s.phi,
    psi: s.psi,
    lambda: new FloatTensor1D(s.T, s.lambda_data),
    pi: new FloatTensor3D(s.r, s.A, s.T, s.pi_data),
    delta: new FloatTensor4D(s.r, s.A, s.T, s.tauMax, s.delta_data),
    theta: new FloatTensor4D(s.r, s.A, s.T, s.W, s.theta_data),
    mu: new FloatTensor4D(s.r, s.A, s.T, s.W, s.mu_data),
  };
}
