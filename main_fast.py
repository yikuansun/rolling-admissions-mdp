import numpy as np
from scipy.stats import binom
from numba import njit, prange
import time

# =====================================================================
# 1. MODEL PARAMETERS & STATE SPACE INITIALIZATION
# =====================================================================
C = 100        # Maximum admission capacity of the school
T = 60         # Total finite time horizon

# Quality rewards per student type
q_H = 2.0
q_L = 1.0

# Stochastic arrival probabilities at step t+1 (must sum to <= 1.0)
p_H = 0.3      # High-type applicant arrives
p_L = 0.4      # Low-type applicant arrives
p_0 = 1.0 - p_H - p_L  # No one arrives

# Dropout/rejection probabilities
lambda_AH = 0.10   # Admitted High-type dropout rate
lambda_AL = 0.15   # Admitted Low-type dropout rate
lambda_WH = 0.05   # Waitlist High-type dropout rate
lambda_WL = 0.08   # Waitlist Low-type dropout rate

# =====================================================================
# 2. PRECOMPUTE TRANSITION PMF MATRICES (BINOMIAL DROPOUTS)
# =====================================================================
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


# =====================================================================
# 3. NUMBA-ACCELERATED OPTIMIZATION KERNEL
# =====================================================================
@njit(parallel=True, fastmath=True, cache=True)
def optimize_step(W, C, t, reward_H_unit, reward_L_unit):
    """
    JIT-compiled + parallelized optimization over actions for a single time step.
    
    W: post-decision value tensor, shape (C+1, C+1, t+1, t+1)
    Returns V_t of the same shape.
    
    Key insight: for fixed (m_H, m_L, n_H, n_L), the value of action (k_H, k_L) is:
        k_H * reward_H_unit + k_L * reward_L_unit + W[m_H+k_H, m_L+k_L, n_H-k_H, n_L-k_L]
    
    We exploit monotonicity: since reward_H_unit > 0 and reward_L_unit > 0, 
    and W values generally increase with more admitted students, we can often
    prune early. But for correctness we still enumerate all actions.
    """
    dim_m = C + 1
    dim_n = t + 1
    V_t = np.zeros((dim_m, dim_m, dim_n, dim_n))

    # Parallelize over the outermost feasible loop
    for m_H in prange(dim_m):
        for m_L in range(dim_m - m_H):
            slots = C - m_H - m_L

            for n_H in range(dim_n):
                for n_L in range(dim_n):

                    max_val = -1e30

                    # Action bounds
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


# =====================================================================
# 4. BACKWARD INDUCTION WITH VECTORIZED EXPECTATIONS + NUMBA OPTIMIZATION
# =====================================================================
def solve():
    # Value Function: V[t] has shape (C+1, C+1, t+1, t+1)
    V = [None] * (T + 1)
    V[T] = np.zeros((C + 1, C + 1, T + 1, T + 1))

    # Warm up Numba JIT on a tiny problem so compilation doesn't count against timing
    print("Compiling Numba kernel (one-time cost)...")
    _dummy_W = np.zeros((C + 1, C + 1, 2, 2))
    _ = optimize_step(_dummy_W, C, 1, 1.0, 1.0)
    print("Compilation done.\n")

    total_start = time.time()

    for t in reversed(range(T)):
        step_start = time.time()

        V_next = V[t + 1]

        # -----------------------------------------------------------------
        # Step A: Compute V_pre (Vectorized arrival expectation)
        #         Shape: (C+1, C+1, t+1, t+1)
        # -----------------------------------------------------------------
        V_pre = p_0 * V_next[:, :, :t + 1, :t + 1]
        V_pre = V_pre + p_H * V_next[:, :, 1:t + 2, :t + 1]
        V_pre = V_pre + p_L * V_next[:, :, :t + 1, 1:t + 2]

        # -----------------------------------------------------------------
        # Step B: Tensor Contractions (Vectorized dropout expectations)
        # -----------------------------------------------------------------
        p_WH_current = pmf_WH[:t + 1, :t + 1]
        p_WL_current = pmf_WL[:t + 1, :t + 1]

        # Contract axis 0: Admitted High-type
        V1 = np.einsum('ia,abcd->ibcd', pmf_AH, V_pre)
        # Contract axis 1: Admitted Low-type
        V2 = np.einsum('jb,ibcd->ijcd', pmf_AL, V1)
        # Contract axis 2: Waitlist High-type
        V3 = np.einsum('kc,ijcd->ijkd', p_WH_current, V2)
        # Contract axis 3: Waitlist Low-type
        W = np.einsum('ld,ijkd->ijkl', p_WL_current, V3)

        # -----------------------------------------------------------------
        # Step C: Optimization (Numba-accelerated action maximization)
        # -----------------------------------------------------------------
        reward_H_unit = q_H * ((1 - lambda_AH) ** (T - t))
        reward_L_unit = q_L * ((1 - lambda_AL) ** (T - t))

        V[t] = optimize_step(W, C, t, reward_H_unit, reward_L_unit)

        elapsed = time.time() - step_start
        print(f"  t={t:3d}  |  states: {(C+1)*(C+2)//2 * (t+1)*(t+2)//2:>10,}  |  {elapsed:.2f}s")

    total_elapsed = time.time() - total_start
    print(f"\nBackward induction finished in {total_elapsed:.1f}s")
    print(f"V[0] shape: {V[0].shape}")
    print(f"V[0][0,0,0,0] = {V[0][0, 0, 0, 0]:.4f}")
    return V


if __name__ == "__main__":
    V = solve()
