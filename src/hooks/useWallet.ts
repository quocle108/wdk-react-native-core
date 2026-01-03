import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { AccountService } from '../services/accountService'
import { AddressService } from '../services/addressService'
import { getWalletStore } from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import type { WalletStore } from '../store/walletStore'
import type { WorkletStore } from '../store/workletStore'

/**
 * Hook to interact with wallet data (addresses and account methods)
 * 
 * PURPOSE: Use this hook for wallet operations AFTER the wallet has been initialized.
 * This hook provides access to wallet addresses and account methods.
 * 
 * **Balance Fetching**: Use `useBalance()` hook for fetching balances with TanStack Query.
 * 
 * For wallet initialization/setup (creating, loading, deleting wallets), use
 * the `useWalletManager()` hook instead.
 * 
 * @example
 * ```tsx
 * // Addresses (from Zustand - derived state)
 * const { addresses, getAddress, isLoadingAddress, isInitialized } = useWallet()
 * 
 * // Balances - Use useBalance hook for fetching
 * import { useBalance } from '@tetherto/wdk-react-native-core'
 * const { data: balance } = useBalance('ethereum', 0, null)
 * 
 * // Account methods
 * const { callAccountMethod } = useWallet()
 * await callAccountMethod('ethereum', 0, 'signMessage', { message: 'Hello' })
 * ```
 */
export interface UseWalletResult {
  // State (reactive)
  addresses: WalletStore['addresses']
  walletLoading: WalletStore['walletLoading']
  isInitialized: boolean
  // Computed helpers
  getNetworkAddresses: (network: string) => Record<number, string>
  isLoadingAddress: (network: string, accountIndex?: number) => boolean
  // Actions
  getAddress: (network: string, accountIndex?: number) => Promise<string>
  callAccountMethod: <T = unknown>(
    network: string,
    accountIndex: number,
    methodName: string,
    args?: unknown
  ) => Promise<T>
}

export function useWallet(): UseWalletResult {
  const workletStore = getWorkletStore()
  const walletStore = getWalletStore()

  // Subscribe to state changes using consolidated selectors to minimize re-renders
  // Use useShallow to prevent infinite loops when selector returns new object
  // useShallow is a hook and must be called at the top level (not inside useMemo)
  const walletSelector = useShallow((state: WalletStore) => ({
    addresses: state.addresses,
    walletLoading: state.walletLoading,
  }))
  const walletState = walletStore(walletSelector)
  const isInitialized = workletStore((state: WorkletStore) => state.isInitialized)

  // Get all addresses for a specific network
  const getNetworkAddresses = (network: string) => {
    return walletState.addresses[network] || {}
  }

  // Check if an address is loading
  const isLoadingAddress = (network: string, accountIndex: number = 0) => {
    return walletState.walletLoading[`${network}-${accountIndex}`] || false
  }

  // Get a specific address (from cache or fetch)
  // Wrapped in useCallback to ensure stable function reference across renders
  const getAddress = useCallback(async (network: string, accountIndex: number = 0) => {
    return AddressService.getAddress(network, accountIndex)
  }, [])

  // Call a method on a wallet account
  // Wrapped in useCallback to ensure stable function reference across renders
  const callAccountMethod = useCallback(async <T = unknown>(
    network: string,
    accountIndex: number,
    methodName: string,
    args?: unknown
  ): Promise<T> => {
    return AccountService.callAccountMethod<T>(network, accountIndex, methodName, args)
  }, [])

  return {
    // State (reactive)
    addresses: walletState.addresses,
    walletLoading: walletState.walletLoading,
    isInitialized,
    // Computed helpers
    getNetworkAddresses,
    isLoadingAddress,
    // Actions
    getAddress,
    callAccountMethod,
  }
}

