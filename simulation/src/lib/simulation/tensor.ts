/**
 * Flat typed-array tensor classes for high-performance multi-dimensional data.
 * All tensors use row-major (C-style) layout with contiguous memory.
 */

/** 2D tensor backed by Int32Array. Shape: [d0, d1] */
export class IntTensor2D {
  readonly data: Int32Array;
  constructor(
    readonly d0: number,
    readonly d1: number,
    source?: Int32Array,
  ) {
    this.data = source ?? new Int32Array(d0 * d1);
  }

  idx(i: number, j: number): number {
    return i * this.d1 + j;
  }

  get(i: number, j: number): number {
    return this.data[i * this.d1 + j];
  }

  set(i: number, j: number, val: number): void {
    this.data[i * this.d1 + j] = val;
  }

  add(i: number, j: number, val: number): void {
    this.data[i * this.d1 + j] += val;
  }

  clone(): IntTensor2D {
    return new IntTensor2D(this.d0, this.d1, this.data.slice());
  }

  fill(val: number): void {
    this.data.fill(val);
  }

  /** Sum all elements. */
  sum(): number {
    let s = 0;
    for (let k = 0; k < this.data.length; k++) s += this.data[k];
    return s;
  }

  /** Sum along d1 for a given i (sum of row i). */
  sumRow(i: number): number {
    let s = 0;
    const base = i * this.d1;
    for (let j = 0; j < this.d1; j++) s += this.data[base + j];
    return s;
  }
}

/** 3D tensor backed by Int32Array. Shape: [d0, d1, d2] */
export class IntTensor3D {
  readonly data: Int32Array;
  private readonly stride0: number;
  private readonly stride1: number;

  constructor(
    readonly d0: number,
    readonly d1: number,
    readonly d2: number,
    source?: Int32Array,
  ) {
    this.stride1 = d2;
    this.stride0 = d1 * d2;
    this.data = source ?? new Int32Array(d0 * d1 * d2);
  }

  idx(i: number, a: number, k: number): number {
    return i * this.stride0 + a * this.stride1 + k;
  }

  get(i: number, a: number, k: number): number {
    return this.data[i * this.stride0 + a * this.stride1 + k];
  }

  set(i: number, a: number, k: number, val: number): void {
    this.data[i * this.stride0 + a * this.stride1 + k] = val;
  }

  add(i: number, a: number, k: number, val: number): void {
    this.data[i * this.stride0 + a * this.stride1 + k] += val;
  }

  clone(): IntTensor3D {
    return new IntTensor3D(this.d0, this.d1, this.d2, this.data.slice());
  }

  fill(val: number): void {
    this.data.fill(val);
  }

  /** Sum all elements. */
  sum(): number {
    let s = 0;
    for (let k = 0; k < this.data.length; k++) s += this.data[k];
    return s;
  }

  /** Sum over d2 for given (i, a). */
  sumSlice(i: number, a: number): number {
    let s = 0;
    const base = i * this.stride0 + a * this.stride1;
    for (let k = 0; k < this.d2; k++) s += this.data[base + k];
    return s;
  }
}

/** 1D float tensor (period-indexed). */
export class FloatTensor1D {
  readonly data: Float64Array;
  constructor(
    readonly d0: number,
    source?: Float64Array,
  ) {
    this.data = source ?? new Float64Array(d0);
  }

  get(i: number): number {
    return this.data[i];
  }

  set(i: number, val: number): void {
    this.data[i] = val;
  }

  clone(): FloatTensor1D {
    return new FloatTensor1D(this.d0, this.data.slice());
  }
}

/** 3D float tensor. Shape: [d0, d1, d2] — used for π(i, a, t) */
export class FloatTensor3D {
  readonly data: Float64Array;
  private readonly stride0: number;
  private readonly stride1: number;

  constructor(
    readonly d0: number,
    readonly d1: number,
    readonly d2: number,
    source?: Float64Array,
  ) {
    this.stride1 = d2;
    this.stride0 = d1 * d2;
    this.data = source ?? new Float64Array(d0 * d1 * d2);
  }

  idx(i: number, a: number, k: number): number {
    return i * this.stride0 + a * this.stride1 + k;
  }

  get(i: number, a: number, k: number): number {
    return this.data[i * this.stride0 + a * this.stride1 + k];
  }

  set(i: number, a: number, k: number, val: number): void {
    this.data[i * this.stride0 + a * this.stride1 + k] = val;
  }

  clone(): FloatTensor3D {
    return new FloatTensor3D(this.d0, this.d1, this.d2, this.data.slice());
  }
}

/** 4D float tensor. Shape: [d0, d1, d2, d3] — used for δ(i, a, t, τ) and θ/μ(i, a, t, w) */
export class FloatTensor4D {
  readonly data: Float64Array;
  private readonly stride0: number;
  private readonly stride1: number;
  private readonly stride2: number;

  constructor(
    readonly d0: number,
    readonly d1: number,
    readonly d2: number,
    readonly d3: number,
    source?: Float64Array,
  ) {
    this.stride2 = d3;
    this.stride1 = d2 * d3;
    this.stride0 = d1 * d2 * d3;
    this.data = source ?? new Float64Array(d0 * d1 * d2 * d3);
  }

  idx(i: number, a: number, t: number, k: number): number {
    return i * this.stride0 + a * this.stride1 + t * this.stride2 + k;
  }

  get(i: number, a: number, t: number, k: number): number {
    return this.data[i * this.stride0 + a * this.stride1 + t * this.stride2 + k];
  }

  set(i: number, a: number, t: number, k: number, val: number): void {
    this.data[i * this.stride0 + a * this.stride1 + t * this.stride2 + k] = val;
  }

  clone(): FloatTensor4D {
    return new FloatTensor4D(this.d0, this.d1, this.d2, this.d3, this.data.slice());
  }
}
