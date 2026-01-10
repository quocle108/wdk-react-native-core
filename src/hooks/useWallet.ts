import { useCallback, useEffect, useState, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { AccountService } from '../services/accountService'
import { AddressService } from '../services/addressService'
import { TransactionService } from '../services/transactionService'
import { WalletSwitchingService } from '../services/walletSwitchingService'
import { getWalletStore } from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import { isOperationInProgress } from '../utils/operationMutex'
import { log, logError } from '../utils/logger'
import type { WalletStore } from '../store/walletStore'
import type { WorkletStore } from '../store/workletStore'
import type { Transaction, TransactionMap, TransactionState } from '../types'

// Stable empty objects to prevent creating new objects on every render
const EMPTY_ADDRESSES = {} as Record<string, Record<number, string>>
const EMPTY_WALLET_LOADING = {} as Record<string, boolean>
const EMPTY_TRANSACTION_MAP = {} as TransactionMap
const EMPTY_TRANSACTIONS: TransactionState = {
  list: [],
  map: {},
  isLoading: false,
}

/**
 * Check if wallet switching should be skipped
 */
function shouldSkipWalletSwitch(
  requestedWalletId: string | undefined,
  activeWalletId: string | null,
  isSwitchingWallet: boolean,
  switchingToWalletId: string | null
): boolean {
  // Skip if no walletId provided or walletId matches activeWalletId
  if (!requestedWalletId || requestedWalletId === activeWalletId) {
    return true
  }

  // Skip if already switching to this wallet
  if (isSwitchingWallet && switchingToWalletId === requestedWalletId) {
    return true
  }

  // Skip if switching to a different wallet (wait for current switch to complete)
  if (isSwitchingWallet && switchingToWalletId !== requestedWalletId) {
    return true
  }

  return false
}

/**
 * Check if the requested wallet is a temporary wallet
 */
function isTemporaryWalletId(walletId: string | undefined): boolean {
  return walletId === '__temporary__'
}

/**
 * Normalize error to Error instance
 */
function normalizeErrorToError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * Hook to interact with wallet data (addresses and account methods)
 * 
 * PURPOSE: Use this hook for wallet operations AFTER the wallet has been initialized.
 * This hook provides access to wallet addresses and account methods.
 * 
 * When to use which hook:
 * - **App initialization state**: Use `useWdkApp()` to check if app is ready
 * - **Wallet lifecycle** (create, load, import, delete): Use `useWalletManager()`
 * - **Wallet operations** (addresses, account methods): Use this hook (`useWallet()`)
 * - **Balance fetching**: Use `useBalance()` hook with TanStack Query
 * 
 * @example
 * ```tsx
 * // First, check if app is ready
 * const { isReady } = useWdkApp()
 * if (!isReady) return <LoadingScreen />
 * 
 * // Then use wallet operations
 * const { addresses, getAddress, callAccountMethod } = useWallet()
 * 
 * // Use specific wallet (automatically switches if needed)
 * const { addresses, getAddress } = useWallet({ walletId: 'user@example.com' })
 * 
 * // Note: For creating temporary wallets, use useWalletManager().createTemporaryWallet()
 * ```
 */
export interface UseWalletResult {
  // State (reactive)
  addresses: Record<string, Record<number, string>>  // network -> accountIndex -> address (for current wallet)
  walletLoading: Record<string, boolean>  // loading states for current wallet
  isInitialized: boolean
  // Transaction state (reactive)
  transactions: TransactionState  // { list, map, isLoading }
  // Switching state
  isSwitchingWallet: boolean
  switchingToWalletId: string | null
  switchWalletError: Error | null
  isTemporaryWallet: boolean
  // Computed helpers
  getNetworkAddresses: (network: string) => Record<number, string>
  isLoadingAddress: (network: string, accountIndex?: number) => boolean
  // Transaction helpers
  getTransactionsForNetwork: (network: string) => Transaction[]
  isLoadingTransactions: (network?: string) => boolean
  // Actions
  getAddress: (network: string, accountIndex?: number) => Promise<string>
  callAccountMethod: <T = unknown>(
    network: string,
    accountIndex: number,
    methodName: string,
    args?: unknown
  ) => Promise<T>
  // Transaction actions
  refreshTransactions: (networks?: string[]) => Promise<void>
}

export function useWallet(options?: {
  walletId?: string
}): UseWalletResult {
  const workletStore = getWorkletStore()
  const walletStore = getWalletStore()

  // Switching state
  const [isSwitchingWallet, setIsSwitchingWallet] = useState(false)
  const [switchingToWalletId, setSwitchingToWalletId] = useState<string | null>(null)
  const [switchWalletError, setSwitchWalletError] = useState<Error | null>(null)
  const [isTemporaryWallet, setIsTemporaryWallet] = useState(false)

  // Get activeWalletId from stores
  const activeWalletId = walletStore((state: WalletStore) => state.activeWalletId)

  // Determine target walletId
  const targetWalletId = options?.walletId || activeWalletId

  // Subscribe to wallet state for target wallet
  // useShallow ensures stable references when content doesn't change
  // We select the specific wallet's data directly from the store
  // Use stable empty objects to prevent new object creation on every render
  const walletState = walletStore(
    useShallow((state: WalletStore) => {
      const walletId = options?.walletId || state.activeWalletId
      if (!walletId) {
        return {
          addresses: EMPTY_ADDRESSES,
          walletLoading: EMPTY_WALLET_LOADING,
          transactionMap: EMPTY_TRANSACTION_MAP,
          transactionLoading: {} as Record<string, boolean>,
        }
      }
      const addresses = state.addresses[walletId]
      const walletLoading = state.walletLoading[walletId]
      const transactionMap = state.transactions[walletId]
      const transactionLoading = state.transactionLoading[walletId]
      return {
        addresses: addresses || EMPTY_ADDRESSES,
        walletLoading: walletLoading || EMPTY_WALLET_LOADING,
        transactionMap: transactionMap || EMPTY_TRANSACTION_MAP,
        transactionLoading: transactionLoading || {},
      }
    })
  )
  const isInitialized = workletStore((state: WorkletStore) => state.isInitialized)

  // Automatic wallet switching logic
  useEffect(() => {
    const requestedWalletId = options?.walletId

    // Skip if switching should be skipped
    if (shouldSkipWalletSwitch(requestedWalletId, activeWalletId, isSwitchingWallet, switchingToWalletId)) {
      setIsTemporaryWallet(false)
      return
    }

    // Check if another operation is in progress (via mutex)
    if (isOperationInProgress()) {
      log('[useWallet] Operation in progress, skipping wallet switch')
      return
    }

    // Handle temporary wallet identifier
    if (isTemporaryWalletId(requestedWalletId)) {
      setIsTemporaryWallet(true)
      return
    }

    let cancelled = false

    const switchWallet = async () => {
      setIsSwitchingWallet(true)
      setSwitchingToWalletId(requestedWalletId!)
      setSwitchWalletError(null)

      try {
        // Use WalletSwitchingService for wallet switching logic (has mutex protection)
        await WalletSwitchingService.switchToWallet(requestedWalletId!, {
          autoStartWorklet: false,
        })

        if (!cancelled) {
          setIsTemporaryWallet(false)
        }
      } catch (error) {
        if (!cancelled) {
          const err = normalizeErrorToError(error)
          logError('[useWallet] Failed to switch wallet:', error)
          setSwitchWalletError(err)
          // Don't update activeWalletId if switch failed
        }
      } finally {
        if (!cancelled) {
          setIsSwitchingWallet(false)
          setSwitchingToWalletId(null)
        }
      }
    }

    switchWallet()

    // Cleanup function to cancel in-flight operations
    return () => {
      cancelled = true
    }
  }, [options?.walletId, activeWalletId, isSwitchingWallet, switchingToWalletId])

  // useShallow already provides stable references when content doesn't change
  // We can use walletState.addresses and walletState.walletLoading directly
  // No need to create new objects - useShallow handles reference stability
  const addresses = walletState.addresses
  const walletLoading = walletState.walletLoading
  const transactionMap = walletState.transactionMap
  const transactionLoading = walletState.transactionLoading

  // Derive transactions state object (list, map, isLoading)
  // Memoized to prevent unnecessary recalculations
  const transactions: TransactionState = useMemo(() => {
    // Flatten all transactions from all networks into a single list
    const allTransactions: Transaction[] = []
    for (const network of Object.keys(transactionMap)) {
      const networkTransactions = transactionMap[network] || []
      allTransactions.push(...networkTransactions)
    }
    // Sort by timestamp descending (most recent first)
    const sortedList = allTransactions.sort((a, b) => b.timestamp - a.timestamp)

    // Check if any network is loading
    const isLoading = Object.values(transactionLoading).some((loading) => loading)

    return {
      list: sortedList,
      map: transactionMap,
      isLoading,
    }
  }, [transactionMap, transactionLoading])

  // Get all addresses for a specific network
  // Use addresses directly from walletState (stable reference from useShallow)
  const getNetworkAddresses = useCallback((network: string) => {
    return addresses[network] || {}
  }, [addresses])

  // Check if an address is loading
  // Use walletLoading directly from walletState (stable reference from useShallow)
  const isLoadingAddress = useCallback((network: string, accountIndex: number = 0) => {
    return walletLoading[`${network}-${accountIndex}`] || false
  }, [walletLoading])

  // Get transactions for a specific network
  const getTransactionsForNetwork = useCallback((network: string): Transaction[] => {
    return transactionMap[network] || []
  }, [transactionMap])

  // Check if transactions are loading (optionally for a specific network)
  const isLoadingTransactions = useCallback((network?: string): boolean => {
    if (network) {
      return transactionLoading[network] || false
    }
    // Check if any network is loading
    return Object.values(transactionLoading).some((loading) => loading)
  }, [transactionLoading])

  // Get a specific address (from cache or fetch)
  const getAddress = useCallback(async (network: string, accountIndex: number = 0) => {
    const walletId = targetWalletId || '__temporary__'
    return AddressService.getAddress(network, accountIndex, walletId)
  }, [targetWalletId])

  // Call a method on a wallet account
  const callAccountMethod = useCallback(async <T = unknown>(
    network: string,
    accountIndex: number,
    methodName: string,
    args?: unknown
  ): Promise<T> => {
    const walletId = targetWalletId || '__temporary__'
    return AccountService.callAccountMethod<T>(network, accountIndex, methodName, args, walletId)
  }, [targetWalletId])

  // Refresh transactions for specified networks (or all if not specified)
  // This fetches fresh transaction data from the worklet/indexer
  const refreshTransactions = useCallback(async (networks?: string[]): Promise<void> => {
    const walletId = targetWalletId || '__temporary__'

    log(`[useWallet] Refreshing transactions for wallet: ${walletId}`)

    // Set loading state
    if (networks && networks.length > 0) {
      for (const network of networks) {
        TransactionService.setTransactionLoading(network, true, walletId)
      }
    } else {
      TransactionService.setAllTransactionsLoading(true, walletId)
    }

    try {
      // Get addresses for the wallet to fetch transactions
      const walletAddresses = addresses

      // For each network, fetch transactions
      const networksToFetch = networks || Object.keys(walletAddresses)

      for (const network of networksToFetch) {
        try {
          const networkAddresses = walletAddresses[network]
          if (!networkAddresses) {
            log(`[useWallet] No addresses found for network: ${network}`)
            continue
          }

          // Get the first account address (account index 0) for fetching transactions
          const address = networkAddresses[0]
          if (!address) {
            log(`[useWallet] No address found for network ${network} at account index 0`)
            continue
          }

          // Call the worklet to get transactions
          // Using account method 'getTransactions' which should be implemented in the worklet
          const txns = await AccountService.callAccountMethod<Transaction[]>(
            network,
            0,
            'getTransactions',
            { address, limit: 100 },
            walletId
          )

          // Update the store with fetched transactions
          TransactionService.updateTransactions(network, txns || [], walletId)
        } catch (error) {
          logError(`[useWallet] Failed to fetch transactions for network ${network}:`, error)
          // Continue with other networks even if one fails
        } finally {
          TransactionService.setTransactionLoading(network, false, walletId)
        }
      }
    } catch (error) {
      logError('[useWallet] Failed to refresh transactions:', error)
    } finally {
      // Clear all loading states
      TransactionService.setAllTransactionsLoading(false, walletId)
    }
  }, [targetWalletId, addresses])

  // Memoize the entire result object to ensure stable reference
  // useShallow already provides stable references for addresses and walletLoading
  // We memoize the result object to prevent creating new objects on every render
  const result = useMemo(() => ({
    // State (reactive) - useShallow ensures stable references
    addresses,
    walletLoading,
    isInitialized,
    // Transaction state (reactive)
    transactions,
    // Switching state
    isSwitchingWallet,
    switchingToWalletId,
    switchWalletError,
    isTemporaryWallet,
    // Computed helpers
    getNetworkAddresses,
    isLoadingAddress,
    // Transaction helpers
    getTransactionsForNetwork,
    isLoadingTransactions,
    // Actions
    getAddress,
    callAccountMethod,
    // Transaction actions
    refreshTransactions,
  }), [
    addresses,
    walletLoading,
    isInitialized,
    transactions,
    isSwitchingWallet,
    switchingToWalletId,
    switchWalletError,
    isTemporaryWallet,
    getNetworkAddresses,
    isLoadingAddress,
    getTransactionsForNetwork,
    isLoadingTransactions,
    getAddress,
    callAccountMethod,
    refreshTransactions,
  ]);

  return result;
}

