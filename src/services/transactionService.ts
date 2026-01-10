/**
 * Transaction Service
 *
 * Handles transaction operations: getting, setting, updating, and managing transaction state.
 * This service is focused solely on transaction history management.
 *
 * ## Storage Strategy - Single Source of Truth
 *
 * This service manages transactions in the Zustand store (walletStore.transactions), which is
 * the **single source of truth** for all transaction data.
 *
 * **Architecture**:
 * - **Zustand Store (Single Source of Truth)**: Stores and persists transactions across app restarts (via MMKV)
 * - **useWallet Hook (Access Layer)**: Provides access to transactions and refresh methods
 *
 * **Data Flow**:
 * 1. useWallet hook reads transaction data from Zustand
 * 2. refreshTransactions() fetches fresh transactions from worklet/indexer
 * 3. After successful fetch, TransactionService updates Zustand (single source of truth update)
 * 4. Components read from Zustand via useWallet hook
 *
 * **Usage**:
 * - Direct access: Use `TransactionService.getTransactions()` to read from Zustand directly
 * - Updates: Use `TransactionService.updateTransactions()` after fetching new data
 * - Preferred: Use `useWallet()` hook which handles Zustand integration automatically
 */

import { getWalletStore } from '../store/walletStore'
import { resolveWalletId, getNestedState } from '../utils/storeHelpers'
import { log, logError } from '../utils/logger'
import type { Transaction, TransactionMap } from '../types'

/**
 * Transaction Service
 *
 * Provides methods for managing wallet transaction history.
 */
export class TransactionService {
  /**
   * Validate network parameter
   */
  private static validateNetwork(network: string): void {
    if (!network || typeof network !== 'string') {
      throw new Error('Invalid network: must be a non-empty string')
    }
  }

  /**
   * Update transactions for a specific wallet and network
   *
   * @param network - Network name
   * @param transactions - Array of transactions
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static updateTransactions(
    network: string,
    transactions: Transaction[],
    walletId?: string
  ): void {
    this.validateNetwork(network)

    const walletStore = getWalletStore()
    const targetWalletId = resolveWalletId(walletId)

    log(`[TransactionService] Updating ${transactions.length} transactions for ${network}`)

    walletStore.setState((prev) => ({
      transactions: {
        ...prev.transactions,
        [targetWalletId]: {
          ...(prev.transactions[targetWalletId] || {}),
          [network]: transactions,
        },
      },
      lastTransactionUpdate: {
        ...prev.lastTransactionUpdate,
        [targetWalletId]: {
          ...(prev.lastTransactionUpdate[targetWalletId] || {}),
          [network]: Date.now(),
        },
      },
    }))
  }

  /**
   * Update transactions from a transaction map (multiple networks at once)
   *
   * @param transactionMap - Map of network -> transactions
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static updateTransactionsFromMap(
    transactionMap: TransactionMap,
    walletId?: string
  ): void {
    const walletStore = getWalletStore()
    const targetWalletId = resolveWalletId(walletId)
    const now = Date.now()

    const networkTimestamps: Record<string, number> = {}
    for (const network of Object.keys(transactionMap)) {
      networkTimestamps[network] = now
    }

    log(`[TransactionService] Updating transactions for ${Object.keys(transactionMap).length} networks`)

    walletStore.setState((prev) => ({
      transactions: {
        ...prev.transactions,
        [targetWalletId]: {
          ...(prev.transactions[targetWalletId] || {}),
          ...transactionMap,
        },
      },
      lastTransactionUpdate: {
        ...prev.lastTransactionUpdate,
        [targetWalletId]: {
          ...(prev.lastTransactionUpdate[targetWalletId] || {}),
          ...networkTimestamps,
        },
      },
    }))
  }

  /**
   * Get transactions for a specific wallet and network
   *
   * @param network - Network name
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static getTransactions(
    network: string,
    walletId?: string
  ): Transaction[] {
    this.validateNetwork(network)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = resolveWalletId(walletId)

    return getNestedState(
      walletState.transactions,
      [targetWalletId, network],
      []
    )
  }

  /**
   * Get all transactions for a wallet (all networks combined)
   *
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static getAllTransactions(walletId?: string): Transaction[] {
    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = resolveWalletId(walletId)

    const transactionMap = walletState.transactions[targetWalletId] || {}
    const allTransactions: Transaction[] = []

    for (const network of Object.keys(transactionMap)) {
      const networkTransactions = transactionMap[network] || []
      allTransactions.push(...networkTransactions)
    }

    // Sort by timestamp descending (most recent first)
    return allTransactions.sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Get transaction map for a wallet
   *
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static getTransactionMap(walletId?: string): TransactionMap {
    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = resolveWalletId(walletId)

    return walletState.transactions[targetWalletId] || {}
  }

  /**
   * Set transaction loading state
   *
   * @param network - Network name
   * @param loading - Loading state
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static setTransactionLoading(
    network: string,
    loading: boolean,
    walletId?: string
  ): void {
    this.validateNetwork(network)

    const walletStore = getWalletStore()
    const targetWalletId = resolveWalletId(walletId)

    walletStore.setState((prev) => ({
      transactionLoading: {
        ...prev.transactionLoading,
        [targetWalletId]: loading
          ? { ...(prev.transactionLoading[targetWalletId] || {}), [network]: true }
          : Object.fromEntries(
              Object.entries(prev.transactionLoading[targetWalletId] || {}).filter(
                ([key]) => key !== network
              )
            ),
      },
    }))
  }

  /**
   * Set loading state for all networks at once
   *
   * @param loading - Loading state
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static setAllTransactionsLoading(
    loading: boolean,
    walletId?: string
  ): void {
    const walletStore = getWalletStore()
    const targetWalletId = resolveWalletId(walletId)

    if (loading) {
      // Set a generic loading flag
      walletStore.setState((prev) => ({
        transactionLoading: {
          ...prev.transactionLoading,
          [targetWalletId]: { ...(prev.transactionLoading[targetWalletId] || {}), __all__: true },
        },
      }))
    } else {
      // Clear all loading states
      walletStore.setState((prev) => ({
        transactionLoading: {
          ...prev.transactionLoading,
          [targetWalletId]: {},
        },
      }))
    }
  }

  /**
   * Check if transactions are loading for a specific network
   *
   * @param network - Network name
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static isTransactionLoading(
    network: string,
    walletId?: string
  ): boolean {
    this.validateNetwork(network)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = walletId || walletState.activeWalletId
    if (!targetWalletId) {
      return false
    }

    return getNestedState(
      walletState.transactionLoading,
      [targetWalletId, network],
      false
    )
  }

  /**
   * Check if any transactions are loading
   *
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static isAnyTransactionLoading(walletId?: string): boolean {
    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = walletId || walletState.activeWalletId
    if (!targetWalletId) {
      return false
    }

    const loadingStates = walletState.transactionLoading[targetWalletId] || {}
    return Object.values(loadingStates).some((isLoading) => isLoading)
  }

  /**
   * Get last transaction update timestamp
   *
   * @param network - Network name
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static getLastTransactionUpdate(
    network: string,
    walletId?: string
  ): number | null {
    this.validateNetwork(network)

    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const targetWalletId = resolveWalletId(walletId)

    return getNestedState(
      walletState.lastTransactionUpdate,
      [targetWalletId, network],
      null
    )
  }

  /**
   * Clear all transactions for a wallet
   *
   * @param walletId - Optional wallet identifier (defaults to activeWalletId from store)
   */
  static clearTransactions(walletId?: string): void {
    const walletStore = getWalletStore()
    const targetWalletId = resolveWalletId(walletId)

    log(`[TransactionService] Clearing transactions for wallet: ${targetWalletId}`)

    walletStore.setState((prev) => {
      const { [targetWalletId]: _, ...restTransactions } = prev.transactions
      const { [targetWalletId]: __, ...restLoading } = prev.transactionLoading
      const { [targetWalletId]: ___, ...restUpdate } = prev.lastTransactionUpdate

      return {
        transactions: restTransactions,
        transactionLoading: restLoading,
        lastTransactionUpdate: restUpdate,
      }
    })
  }

  /**
   * Clear all transactions (useful for app reset)
   */
  static clearAllTransactions(): void {
    const walletStore = getWalletStore()

    log('[TransactionService] Clearing all transactions')

    walletStore.setState({
      transactions: {},
      transactionLoading: {},
      lastTransactionUpdate: {},
    })
  }
}
