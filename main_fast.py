import numpy as np
from scipy.stats import binom
from numba import njit, prange
import time
import pandas as pd

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
    Returns:
        V_t: optimal value tensor, same shape as W
        policy_H: optimal k_H action at each state, same shape as W (int array)
        policy_L: optimal k_L action at each state, same shape as W (int array)
    """
    dim_m = C + 1
    dim_n = t + 1
    V_t = np.zeros((dim_m, dim_m, dim_n, dim_n))
    policy_H = np.zeros((dim_m, dim_m, dim_n, dim_n), dtype=np.int32)
    policy_L = np.zeros((dim_m, dim_m, dim_n, dim_n), dtype=np.int32)

    # Parallelize over the outermost feasible loop
    for m_H in prange(dim_m):
        for m_L in range(dim_m - m_H):
            slots = C - m_H - m_L

            for n_H in range(dim_n):
                for n_L in range(dim_n):

                    max_val = -1e30
                    best_kH = 0
                    best_kL = 0

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
                                best_kH = k_H
                                best_kL = k_L

                    V_t[m_H, m_L, n_H, n_L] = max_val
                    policy_H[m_H, m_L, n_H, n_L] = best_kH
                    policy_L[m_H, m_L, n_H, n_L] = best_kL

    return V_t, policy_H, policy_L


# =====================================================================
# 4. BACKWARD INDUCTION WITH VECTORIZED EXPECTATIONS + NUMBA OPTIMIZATION
# =====================================================================
def solve():
    # Value Function: V[t] has shape (C+1, C+1, t+1, t+1)
    V = [None] * (T + 1)
    V[T] = np.zeros((C + 1, C + 1, T + 1, T + 1))

    # Policy storage: for each t, store optimal (k_H, k_L) at each state
    pol_H = [None] * T  # pol_H[t] has shape (C+1, C+1, t+1, t+1)
    pol_L = [None] * T

    # Warm up Numba JIT on a tiny problem so compilation doesn't count against timing
    print("Compiling Numba kernel (one-time cost)...")
    _dummy_W = np.zeros((C + 1, C + 1, 2, 2))
    _, _, _ = optimize_step(_dummy_W, C, 1, 1.0, 1.0)
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

        V[t], pol_H[t], pol_L[t] = optimize_step(W, C, t, reward_H_unit, reward_L_unit)

        elapsed = time.time() - step_start
        print(f"  t={t:3d}  |  states: {(C+1)*(C+2)//2 * (t+1)*(t+2)//2:>10,}  |  {elapsed:.2f}s")

    total_elapsed = time.time() - total_start
    print(f"\nBackward induction finished in {total_elapsed:.1f}s")
    print(f"V[0] shape: {V[0].shape}")
    print(f"V[0][0,0,0,0] = {V[0][0, 0, 0, 0]:.4f}")
    return V, pol_H, pol_L


# =====================================================================
# 5. EXPORT OPTIMAL POLICY TO EXCEL
# =====================================================================
def export_policy(V, pol_H, pol_L, filename="optimal_policy.xlsx"):
    """
    Export the optimal policy and value function to an Excel spreadsheet.
    
    Sheet 1 ("Summary Stats"): Per-period summary statistics
    Sheet 2 ("Policy - From Empty"): Policy at m_H=0, m_L=0 for all waitlist states
    Sheet 3 ("Policy - Sampled States"): Policy at a selection of representative
             (m_H, m_L) combinations to show how the policy varies with capacity used
    """
    print(f"\nExporting policy to {filename}...")

    # --- Sheet 1: Summary statistics per period ---
    rows_summary = []
    for t in range(T):
        v = V[t]
        p_h = pol_H[t]
        p_l = pol_L[t]
        max_n = t
        rows_summary.append({
            "t": t,
            "reward_H_unit": round(q_H * ((1 - lambda_AH) ** (T - t)), 4),
            "reward_L_unit": round(q_L * ((1 - lambda_AL) ** (T - t)), 4),
            "V(0,0,0,0)": round(float(v[0, 0, 0, 0]), 4),
            "policy_at_max_waitlist_k_H": int(p_h[0, 0, max_n, max_n]),
            "policy_at_max_waitlist_k_L": int(p_l[0, 0, max_n, max_n]),
        })
    df_summary = pd.DataFrame(rows_summary)

    # --- Sheet 2: Policy from empty state (m_H=0, m_L=0) ---
    # This is the most relevant sheet: ~Σ(t+1)² ≈ 74K rows total, very manageable
    rows_empty = []
    for t in range(T):
        p_h = pol_H[t]
        p_l = pol_L[t]
        v = V[t]
        for n_H in range(t + 1):
            for n_L in range(t + 1):
                rows_empty.append((
                    t, n_H, n_L,
                    int(p_h[0, 0, n_H, n_L]),
                    int(p_l[0, 0, n_H, n_L]),
                    int(p_h[0, 0, n_H, n_L]) + int(p_l[0, 0, n_H, n_L]),
                    round(float(v[0, 0, n_H, n_L]), 4),
                ))
    df_empty = pd.DataFrame(rows_empty, columns=[
        "t", "n_H (waitlist high)", "n_L (waitlist low)",
        "optimal_k_H (admit high)", "optimal_k_L (admit low)",
        "total_admitted", "value"
    ])

    # --- Sheet 3: Policy at sampled (m_H, m_L) states ---
    # Sample a grid of representative admitted-student levels
    m_samples = [(0, 0), (10, 0), (0, 10), (10, 10), (20, 10), (10, 20),
                 (25, 25), (30, 20), (20, 30), (40, 30), (30, 40),
                 (50, 0), (0, 50), (50, 50), (50, 40), (40, 50),
                 (60, 30), (30, 60), (70, 20), (20, 70), (80, 10), (90, 5)]
    rows_sampled = []
    for t in range(T):
        p_h = pol_H[t]
        p_l = pol_L[t]
        v = V[t]
        for m_H, m_L in m_samples:
            if m_H + m_L > C:
                continue
            for n_H in range(t + 1):
                for n_L in range(t + 1):
                    if n_H == 0 and n_L == 0:
                        continue
                    rows_sampled.append((
                        t, m_H, m_L, C - m_H - m_L, n_H, n_L,
                        int(p_h[m_H, m_L, n_H, n_L]),
                        int(p_l[m_H, m_L, n_H, n_L]),
                        int(p_h[m_H, m_L, n_H, n_L]) + int(p_l[m_H, m_L, n_H, n_L]),
                        round(float(v[m_H, m_L, n_H, n_L]), 4),
                    ))
    df_sampled = pd.DataFrame(rows_sampled, columns=[
        "t", "m_H (admitted high)", "m_L (admitted low)", "slots_remaining",
        "n_H (waitlist high)", "n_L (waitlist low)",
        "optimal_k_H (admit high)", "optimal_k_L (admit low)",
        "total_admitted", "value"
    ])

    # Write to Excel
    print(f"  Writing {len(df_summary)} summary rows, {len(df_empty):,} empty-state rows, "
          f"{len(df_sampled):,} sampled-state rows...")
    with pd.ExcelWriter(filename, engine="openpyxl") as writer:
        df_summary.to_excel(writer, sheet_name="Summary Stats", index=False)
        df_empty.to_excel(writer, sheet_name="Policy - From Empty", index=False)
        df_sampled.to_excel(writer, sheet_name="Policy - Sampled States", index=False)

    print(f"  Done! Saved {filename}")
    print(f"  Sheets: 'Summary Stats', 'Policy - From Empty', 'Policy - Sampled States'")


if __name__ == "__main__":
    V, pol_H, pol_L = solve()
    export_policy(V, pol_H, pol_L)
