import numpy as np
from scipy.stats import binom

# =====================================================================
# 1. MODEL PARAMETERS & STATE SPACE INITIALIZATION
# =====================================================================
C = 20         # Maximum admission capacity of the school
T = 15         # Total finite time horizon

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
# Dimensions: [Post-Decision State, Next-Period Surviving State]
pmf_AH = np.zeros((C + 1, C + 1))
pmf_AL = np.zeros((C + 1, C + 1))
for i in range(C + 1):
    pmf_AH[i, :i + 1] = binom.pmf(np.arange(i + 1), i, 1 - lambda_AH)
    pmf_AL[i, :i + 1] = binom.pmf(np.arange(i + 1), i, 1 - lambda_AL)

# Precompute waitlist dropouts up to absolute maximum horizon size
pmf_WH = np.zeros((T + 1, T + 1))
pmf_WL = np.zeros((T + 1, T + 1))
for i in range(T + 1):
    pmf_WH[i, :i + 1] = binom.pmf(np.arange(i + 1), i, 1 - lambda_WH)
    pmf_WL[i, :i + 1] = binom.pmf(np.arange(i + 1), i, 1 - lambda_WL)

# Value Function Tensor list: V[t] holds shape (C+1, C+1, t+1, t+1)
V = [None] * (T + 1)

# Terminal Boundary Condition: V_T = 0
V[T] = np.zeros((C + 1, C + 1, T + 1, T + 1))


# =====================================================================
# 3. BACKWARD INDUCTION LOOP
# =====================================================================
for t in reversed(range(T)):
    # V_next has dynamic waitlist axes lengths of exactly (t + 2)
    V_next = V[t + 1]
    
    # -----------------------------------------------------------------
    # Step A: Compute V_pre (Slicing future states down to shape: C+1, C+1, t+1, t+1)
    # -----------------------------------------------------------------
    # Branch 1: No arrival (Indices map 1:1)
    V_pre = p_0 * V_next[:, :, :t + 1, :t + 1]
    
    # Branch 2: High-type arrival (Shifts axis 2 forward by 1 index)
    V_pre += p_H * V_next[:, :, 1:t + 2, :t + 1]
    
    # Branch 3: Low-type arrival (Shifts axis 3 forward by 1 index)
    V_pre += p_L * V_next[:, :, :t + 1, 1:t + 2]
    
    # -----------------------------------------------------------------
    # Step B: Tensor Contractions via einsum (Simulating Dropouts)
    # -----------------------------------------------------------------
    # Dynamically crop waitlist PMFs to current horizon threshold (t + 1)
    p_WH_current = pmf_WH[:t + 1, :t + 1]
    p_WL_current = pmf_WL[:t + 1, :t + 1]
    
    # Contract Axis 0: Admitted High-type (a -> i)
    V1 = np.einsum('ia,abcd->ibcd', pmf_AH, V_pre)
    
    # Contract Axis 1: Admitted Low-type (b -> j)
    V2 = np.einsum('jb,ibcd->ijcd', pmf_AL, V1)
    
    # Contract Axis 2: Waitlist High-type (c -> k)
    V3 = np.einsum('kc,ijcd->ijkd', p_WH_current, V2)
    
    # Contract Axis 3: Waitlist Low-type (d -> l)
    # W is our post-decision tensor of shape: (C+1, C+1, t+1, t+1)
    W = np.einsum('ld,ijkd->ijkl', p_WL_current, V3)
    
    # -----------------------------------------------------------------
    # Step C: Optimization Phase (Action Maximization for V[t])
    # -----------------------------------------------------------------
    V[t] = np.zeros((C + 1, C + 1, t + 1, t + 1))
    
    # This block loops through feasible valid state/action combinations
    for m_H in range(C + 1):
        for m_L in range(C + 1 - m_H):
            slots_remaining = C - (m_H + m_L)
            
            for n_H in range(t + 1):
                for n_L in range(t + 1 - n_H):
                    
                    max_val = -1e9
                    
                    # Action bounds: Can't admit more than are on waitlist or slots open
                    max_k_H = min(n_H, slots_remaining)
                    for k_H in range(max_k_H + 1):
                        
                        max_k_L = min(n_L, slots_remaining - k_H)
                        for k_L in range(max_k_L + 1):
                            
                            # Expected discounted rewards for admitting students right now
                            reward_H = k_H * q_H * ((1 - lambda_AH) ** (T - t))
                            reward_L = k_L * q_L * ((1 - lambda_AL) ** (T - t))
                            immediate_reward = reward_H + reward_L
                            
                            # Shift coordinates to evaluate the post-decision index in W
                            post_mH = m_H + k_H
                            post_mL = m_L + k_L
                            post_nH = n_H - k_H
                            post_nL = n_L - k_L
                            
                            value = immediate_reward + W[post_mH, post_mL, post_nH, post_nL]
                            if value > max_val:
                                max_val = value
                                
                    V[t][m_H, m_L, n_H, n_L] = max_val

print("Backward induction finished successfully!")
print("Converged V[0] initial state value tensor shape:", V[0].shape)