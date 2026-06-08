"""
Quick correctness test: run both the original pure-Python loop and the
Numba-accelerated version on a small problem (C=5, T=5) and compare results.
"""
import numpy as np
from scipy.stats import binom
from numba import njit, prange
import time

# Small parameters for testing
C = 5
T = 5
q_H = 2.0
q_L = 1.0
p_H = 0.3
p_L = 0.4
p_0 = 1.0 - p_H - p_L
lambda_AH = 0.10
lambda_AL = 0.15
lambda_WH = 0.05
lambda_WL = 0.08

# Precompute PMFs
pmf_AH = np.zeros((C + 1, C + 1))
pmf_AL = np.zeros((C + 1, C + 1))
for i in range(C + 1):
    pmf_AH[i, :i + 1] = binom.pmf(np.arange(i + 1), i, 1 - lambda_AH)
    pmf_AL[i, :i + 1] = binom.pmf(np.arange(i + 1), i, 1 - lambda_AL)

pmf_WH = np.zeros((T + 1, T + 1))
pmf_WL = np.zeros((T + 1, T + 1))
for i in range(T + 1):
    pmf_WH[i, :i + 1] = binom.pmf(np.arange(i + 1), i, 1 - lambda_WH)
    pmf_WL[i, :i + 1] = binom.pmf(np.arange(i + 1), i, 1 - lambda_WL)


# --- Original pure-Python optimizer ---
def optimize_step_python(W, C, t, reward_H_unit, reward_L_unit):
    dim_m = C + 1
    dim_n = t + 1
    V_t = np.zeros((dim_m, dim_m, dim_n, dim_n))
    for m_H in range(dim_m):
        for m_L in range(dim_m - m_H):
            slots = C - m_H - m_L
            for n_H in range(dim_n):
                for n_L in range(dim_n):
                    max_val = -1e30
                    max_k_H = min(n_H, slots)
                    for k_H in range(max_k_H + 1):
                        max_k_L = min(n_L, slots - k_H)
                        for k_L in range(max_k_L + 1):
                            immediate = k_H * reward_H_unit + k_L * reward_L_unit
                            value = immediate + W[m_H + k_H, m_L + k_L, n_H - k_H, n_L - k_L]
                            if value > max_val:
                                max_val = value
                    V_t[m_H, m_L, n_H, n_L] = max_val
    return V_t


# --- Numba-accelerated optimizer ---
@njit(parallel=True, fastmath=True, cache=True)
def optimize_step_numba(W, C, t, reward_H_unit, reward_L_unit):
    dim_m = C + 1
    dim_n = t + 1
    V_t = np.zeros((dim_m, dim_m, dim_n, dim_n))
    for m_H in prange(dim_m):
        for m_L in range(dim_m - m_H):
            slots = C - m_H - m_L
            for n_H in range(dim_n):
                for n_L in range(dim_n):
                    max_val = -1e30
                    max_k_H = min(n_H, slots)
                    for k_H in range(max_k_H + 1):
                        max_k_L = min(n_L, slots - k_H)
                        base_reward = k_H * reward_H_unit
                        post_mH = m_H + k_H
                        post_nH = n_H - k_H
                        for k_L in range(max_k_L + 1):
                            value = (base_reward + k_L * reward_L_unit
                                     + W[post_mH, m_L + k_L, post_nH, n_L - k_L])
                            if value > max_val:
                                max_val = value
                    V_t[m_H, m_L, n_H, n_L] = max_val
    return V_t


def solve(use_numba):
    optimizer = optimize_step_numba if use_numba else optimize_step_python
    V = [None] * (T + 1)
    V[T] = np.zeros((C + 1, C + 1, T + 1, T + 1))

    for t in reversed(range(T)):
        V_next = V[t + 1]

        # Step A: Arrival expectation
        V_pre = p_0 * V_next[:, :, :t + 1, :t + 1]
        V_pre = V_pre + p_H * V_next[:, :, 1:t + 2, :t + 1]
        V_pre = V_pre + p_L * V_next[:, :, :t + 1, 1:t + 2]

        # Step B: Dropout contractions
        p_WH_cur = pmf_WH[:t + 1, :t + 1]
        p_WL_cur = pmf_WL[:t + 1, :t + 1]
        V1 = np.einsum('ia,abcd->ibcd', pmf_AH, V_pre)
        V2 = np.einsum('jb,ibcd->ijcd', pmf_AL, V1)
        V3 = np.einsum('kc,ijcd->ijkd', p_WH_cur, V2)
        W = np.einsum('ld,ijkd->ijkl', p_WL_cur, V3)

        # Step C: Optimization
        reward_H_unit = q_H * ((1 - lambda_AH) ** (T - t))
        reward_L_unit = q_L * ((1 - lambda_AL) ** (T - t))
        V[t] = optimizer(W, C, t, reward_H_unit, reward_L_unit)

    return V


if __name__ == "__main__":
    # Warmup Numba
    print("Compiling Numba kernel...")
    _W = np.zeros((C + 1, C + 1, 2, 2))
    _ = optimize_step_numba(_W, C, 1, 1.0, 1.0)
    print("Done.\n")

    print("Running pure-Python solve (C=5, T=5)...")
    t0 = time.time()
    V_py = solve(use_numba=False)
    t_py = time.time() - t0
    print(f"  Python time: {t_py:.3f}s")

    print("Running Numba solve (C=5, T=5)...")
    t0 = time.time()
    V_nb = solve(use_numba=True)
    t_nb = time.time() - t0
    print(f"  Numba time:  {t_nb:.3f}s")

    # Compare
    max_diff = 0.0
    for t in range(T + 1):
        diff = np.max(np.abs(V_py[t] - V_nb[t]))
        if diff > max_diff:
            max_diff = diff

    print(f"\nMax absolute difference: {max_diff:.2e}")
    if max_diff < 1e-10:
        print("PASS: Results match perfectly.")
    else:
        print("FAIL: Results diverge!")

    print(f"\nV[0][0,0,0,0] = {V_py[0][0,0,0,0]:.6f}")
