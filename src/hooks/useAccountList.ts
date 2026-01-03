/**
 * Account List Hook
 * 
 * Manages multiple accounts for a single wallet (same seed, different accountIndex).
 * 
 * Architecture:
 * - Each wallet (identifier) has one seed phrase
 * - Multiple accounts can be derived from the same seed using different accountIndex values
 * - accountIndex 0 is typically the main account
 * - Use this hook to list, create, and manage accounts for the current wallet
 * 
 * @example
 * ```tsx
 * const { accounts, activeAccountIndex, switchAccount, createAccount } = useAccountList()
 * 
 * // List all accounts
 * accounts.forEach(account => console.log(`Account ${account.accountIndex}: ${account.address}`))
 * 
 * // Switch to account 1
 * await switchAccount(1)
 * 
 * // Create a new account
 * const newAccount = await createAccount('ethereum')
 * ```
 */

import { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { AddressService } from '../services/addressService'
import { getWalletStore } from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import { log, logError } from '../utils/logger'
import type { NetworkConfigs } from '../types'
import type { AccountInfo } from '../store/walletStore'

// Re-export AccountInfo for backward compatibility
export type { AccountInfo }

export interface UseAccountListResult {
  /** List of all accounts for the current wallet */
  accounts: AccountInfo[]
  /** Currently active account index */
  activeAccountIndex: number
  /** Switch to a different account */
  switchAccount: (accountIndex: number) => void
  /** Create/get address for an account on a network (creates account if it doesn't exist) */
  ensureAccount: (accountIndex: number, network: string) => Promise<string>
  /** Get address for an account on a network */
  getAccountAddress: (accountIndex: number, network: string) => Promise<string | null>
  /** Refresh the account list */
  refresh: (networks: string[]) => Promise<void>
  /** Whether operation is in progress */
  isLoading: boolean
  /** Error message if any */
  error: string | null
}

/**
 * Hook for managing multiple accounts for a single wallet (same seed, different accountIndex)
 * 
 * @param networks - List of networks to check for accounts
 * @param initialAccountIndex - Initial active account index (default: 0)
 * @returns Account list management functions
 */
export function useAccountList(
  networks: string[],
  initialAccountIndex: number = 0
): UseAccountListResult {
  const walletStore = getWalletStore()
  
  // Local loading and error state (ephemeral, only used in this hook)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Subscribe to Zustand state (only persistent data)
  const accountListState = walletStore(
    useShallow((state) => ({
      accounts: state.accountList,
      activeAccountIndex: state.activeAccountIndex,
    }))
  )

  // Initialize activeAccountIndex if not set
  useEffect(() => {
    const currentIndex = walletStore.getState().activeAccountIndex
    if (currentIndex === 0 && initialAccountIndex !== 0) {
      walletStore.setState({ activeAccountIndex: initialAccountIndex })
    }
  }, [initialAccountIndex])

  /**
   * Get all account indices from wallet store addresses
   */
  const getAllAccountIndices = useCallback((): number[] => {
    const walletStore = getWalletStore()
    const walletState = walletStore.getState()
    const accountIndices = new Set<number>()

    // Collect all account indices from addresses
    Object.values(walletState.addresses).forEach((networkAddresses) => {
      if (networkAddresses && typeof networkAddresses === 'object') {
        Object.keys(networkAddresses).forEach((key) => {
          const accountIndex = parseInt(key, 10)
          if (!isNaN(accountIndex)) {
            accountIndices.add(accountIndex)
          }
        })
      }
    })

    return Array.from(accountIndices).sort((a, b) => a - b)
  }, [])

  /**
   * Refresh the account list
   */
  const refresh = useCallback(async (networksToCheck: string[]) => {
    setIsLoading(true)
    setError(null)

    try {
      const workletStore = getWorkletStore()
      if (!workletStore.getState().isInitialized) {
        walletStore.setState({ accountList: [] })
        return
      }

      const accountIndices = getAllAccountIndices()
      const walletState = walletStore.getState()
      const currentActiveIndex = walletState.activeAccountIndex

      const accountList: AccountInfo[] = accountIndices.map((accountIndex) => {
        const addresses: Record<string, string> = {}
        
        networksToCheck.forEach((network) => {
          const address = walletState.addresses[network]?.[accountIndex]
          if (address) {
            addresses[network] = address
          }
        })

        return {
          accountIndex,
          addresses,
          isActive: accountIndex === currentActiveIndex,
        }
      })

      walletStore.setState({ accountList })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logError('Failed to refresh account list:', err)
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [getAllAccountIndices])

  /**
   * Switch to a different account
   */
  const switchAccount = useCallback((accountIndex: number) => {
    walletStore.setState((state) => ({
      activeAccountIndex: accountIndex,
      accountList: state.accountList.map((account) => ({
        ...account,
        isActive: account.accountIndex === accountIndex,
      })),
    }))
    log(`Switched to account: ${accountIndex}`)
  }, [])

  /**
   * Ensure account exists and get its address for a network
   * Creates the account (fetches address) if it doesn't exist
   */
  const ensureAccount = useCallback(async (accountIndex: number, network: string): Promise<string> => {
    setIsLoading(true)
    setError(null)

    try {
      const workletStore = getWorkletStore()
      if (!workletStore.getState().isInitialized) {
        throw new Error('Wallet not initialized')
      }

      // Get or fetch address
      const address = await AddressService.getAddress(network, accountIndex)

      // Update account list in Zustand
      walletStore.setState((state) => {
        const existing = state.accountList.find((a) => a.accountIndex === accountIndex)
        if (existing) {
          return {
            accountList: state.accountList.map((a) =>
              a.accountIndex === accountIndex
                ? { ...a, addresses: { ...a.addresses, [network]: address } }
                : a
            ),
          }
        } else {
          return {
            accountList: [
              ...state.accountList,
              {
                accountIndex,
                addresses: { [network]: address },
                isActive: accountIndex === state.activeAccountIndex,
              },
            ].sort((a, b) => a.accountIndex - b.accountIndex),
          }
        }
      })

      return address
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logError('Failed to ensure account:', err)
      setError(errorMessage)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [])

  /**
   * Get address for an account on a network
   */
  const getAccountAddress = useCallback(async (accountIndex: number, network: string): Promise<string | null> => {
    try {
      const walletStore = getWalletStore()
      const walletState = walletStore.getState()
      
      // Check cache first
      const cachedAddress = walletState.addresses[network]?.[accountIndex]
      if (cachedAddress) {
        return cachedAddress
      }

      // Fetch if not cached
      const workletStore = getWorkletStore()
      if (!workletStore.getState().isInitialized) {
        return null
      }

      return await AddressService.getAddress(network, accountIndex)
    } catch (err) {
      logError('Failed to get account address:', err)
      return null
    }
  }, [])

  // Initial refresh on mount
  useEffect(() => {
    if (networks.length > 0) {
      refresh(networks)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    accounts: accountListState.accounts,
    activeAccountIndex: accountListState.activeAccountIndex,
    switchAccount,
    ensureAccount,
    getAccountAddress,
    refresh,
    isLoading,
    error,
  }
}

