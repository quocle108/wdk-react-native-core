/**
 * Wallet Store - Source of Truth for Wallet Data
 * 
 * IMPORTANT: This is the ONLY place where addresses and balances are actually stored.
 * 
 * ## Store Boundaries
 * 
 * **walletStore** (this file):
 * - Wallet addresses: { [network]: { [accountIndex]: address } }
 * - Wallet balances: { [network]: { [accountIndex]: { [tokenAddress]: balance } } }
 * - Address loading states: { [network-accountIndex]: boolean }
 * - Balance loading states: { [network-accountIndex-tokenAddress]: boolean }
 * - Last balance update timestamps: { [network]: { [accountIndex]: timestamp } }
 * - Account list: Array of account info for current wallet
 * - Active account index: Currently active account index
 * - Wallet list: Array of wallet info (multiple wallets)
 * - Active wallet ID: Currently active wallet identifier
 * 
 * Note: Loading states for account/wallet list operations are managed locally in hooks
 * (useAccountList, useWalletManager) since they're ephemeral and only used within those hooks.
 * 
 * **workletStore** (workletStore.ts):
 * - Worklet lifecycle state (isWorkletStarted, isInitialized, etc.)
 * - Worklet runtime instances (worklet, hrpc, ipc)
 * - Worklet configuration
 * 
 * ## Separation of Concerns
 * 
 * - **walletStore**: Manages wallet data (addresses, balances) - derived/computed from worklet
 * - **workletStore**: Manages worklet runtime and lifecycle
 * 
 * These stores are intentionally separate to:
 * 1. Prevent cross-contamination of lifecycle and data concerns
 * 2. Allow independent persistence strategies
 * 3. Enable clear boundaries for testing and debugging
 * 
 * ## Important Notes
 * 
 * - Addresses: Stored in Zustand (derived/computed state, deterministic, no refetching needed)
 * - Balances: Stored in Zustand for backward compatibility, but NEW code should use TanStack Query via useBalance() hook
 * - NEVER store worklet lifecycle state in walletStore
 * - NEVER store worklet runtime instances in walletStore
 * - All operations are handled by focused services (AddressService, BalanceService), not the store itself
 * 
 * ## Balance Fetching Migration
 * 
 * - **Old approach**: Manual balance fetching via BalanceService.updateBalance()
 * - **New approach**: Use TanStack Query via useBalance() hook for automatic caching and refetching
 * - Zustand store is still updated for backward compatibility, but new code should use useBalance()
 */

// External packages
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// Local imports
import type {
  WalletAddresses,
  WalletBalances,
  BalanceLoadingStates,
} from '../types'
import { createMMKVStorageAdapter } from '../storage/mmkvStorage'
import { log } from '../utils/logger'

export interface WalletLoadingStates {
  [key: string]: boolean
}

export interface AccountInfo {
  /** Account index (0-based) */
  accountIndex: number
  /** Account address for each network */
  addresses: Record<string, string>
  /** Whether this account is currently active */
  isActive: boolean
}

export interface WalletInfo {
  /** Wallet identifier (e.g., user email) */
  identifier: string
  /** Whether wallet exists in secure storage */
  exists: boolean
  /** Whether this wallet is currently active/initialized */
  isActive: boolean
}

export interface WalletState {
  // SOURCE OF TRUTH - addresses stored ONLY here
  addresses: WalletAddresses
  walletLoading: WalletLoadingStates
  // SOURCE OF TRUTH - balances stored ONLY here
  balances: WalletBalances
  // Maps "network-accountIndex-tokenAddress" -> boolean
  balanceLoading: BalanceLoadingStates
  lastBalanceUpdate: Record<string, Record<number, number>>
  // Account list management
  accountList: AccountInfo[]
  activeAccountIndex: number
  // Wallet list management
  walletList: WalletInfo[]
  activeWalletId: string | null
}

export type WalletStore = WalletState

type WalletStoreInstance = ReturnType<ReturnType<typeof create<WalletStore>>>

const initialState: WalletState = {
  addresses: {},
  walletLoading: {},
  balances: {},
  balanceLoading: {},
  lastBalanceUpdate: {},
  accountList: [],
  activeAccountIndex: 0,
  walletList: [],
  activeWalletId: null,
}

const defaultStorageAdapter = createMMKVStorageAdapter()

let walletStoreInstance: WalletStoreInstance | null = null

/**
 * Creates singleton wallet store instance.
 * All operations are handled by focused services (AddressService, BalanceService), not the store itself.
 */
export function createWalletStore(): WalletStoreInstance {
  if (walletStoreInstance) {
    return walletStoreInstance
  }

  const store = create<WalletStore>()(
    persist(
      () => ({
        ...initialState,
      }),
      {
        name: 'wallet-storage',
        storage: createJSONStorage(() => defaultStorageAdapter),
        partialize: (state) => ({
          addresses: state.addresses,
          balances: state.balances,
          balanceLoading: {},
          lastBalanceUpdate: state.lastBalanceUpdate,
          accountList: state.accountList,
          activeAccountIndex: state.activeAccountIndex,
          walletList: state.walletList,
          activeWalletId: state.activeWalletId,
        }),
        onRehydrateStorage: () => {
          return (state) => {
            if (state) {
              log('🔄 Rehydrating wallet state - resetting loading states')
              state.walletLoading = {}
              state.balanceLoading = {}
            }
          }
        },
      }
    )
  )

  walletStoreInstance = store
  return store
}

export function getWalletStore() {
  return createWalletStore()
}

