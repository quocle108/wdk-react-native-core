/**
 * Wallet Manager Hook
 * 
 * Consolidated hook for wallet setup, initialization, and lifecycle management.
 * Replaces useWalletSetup and useMnemonic hooks with a unified API.
 * 
 * PURPOSE: Use this hook for wallet setup/auth flows (creating new wallets,
 * loading existing wallets, checking if wallet exists, deleting wallets, getting mnemonic).
 * 
 * For wallet operations AFTER initialization (getting addresses, calling account methods),
 * use the `useWallet()` hook instead.
 * 
 * @example
 * ```tsx
 * const networkConfigs = { ethereum: { chainId: 1, blockchain: 'ethereum' } }
 * 
 * const { 
 *   initializeWallet, 
 *   initializeFromMnemonic,
 *   hasWallet, 
 *   deleteWallet, 
 *   getMnemonic,
 *   isInitializing, 
 *   error 
 * } = useWalletManager(networkConfigs, 'user@example.com')
 * 
 * // Create new wallet
 * await initializeWallet({ createNew: true })
 * 
 * // Load existing wallet (requires biometric authentication)
 * await initializeWallet({ createNew: false })
 * 
 * // Import from mnemonic
 * await initializeFromMnemonic('word1 word2 ... word12')
 * 
 * // Get mnemonic (requires biometric authentication if not cached)
 * const mnemonic = await getMnemonic()
 * 
 * // Delete wallet
 * await deleteWallet()
 * ```
 */

import { useCallback, useMemo, useState, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { WalletSetupService } from '../services/walletSetupService'
import { getWalletStore } from '../store/walletStore'
import { log, logError } from '../utils/logger'
import type { NetworkConfigs } from '../types'
import type { WalletInfo } from '../store/walletStore'

// Re-export WalletInfo for backward compatibility
export type { WalletInfo }

export interface UseWalletManagerResult {
  /** Initialize wallet - either create new or load existing */
  initializeWallet: (options?: { createNew?: boolean; identifier?: string }) => Promise<void>
  /** Initialize wallet from mnemonic seedphrase */
  initializeFromMnemonic: (mnemonic: string, walletIdentifier?: string) => Promise<void>
  /** Check if wallet exists */
  hasWallet: (walletIdentifier?: string) => Promise<boolean>
  /** Delete wallet */
  deleteWallet: (walletIdentifier?: string) => Promise<void>
  /** Get mnemonic phrase (requires biometric authentication if not cached) */
  getMnemonic: (walletIdentifier?: string) => Promise<string | null>
  /** Whether initialization is in progress */
  isInitializing: boolean
  /** Error message if any */
  error: string | null
  /** Clear error state */
  clearError: () => void
  // Wallet list operations (merged from useWalletList)
  /** List of all known wallets */
  wallets: WalletInfo[]
  /** Currently active wallet identifier */
  activeWalletId: string | null
  /** Switch to a different wallet */
  switchWallet: (identifier: string) => Promise<void>
  /** Create a new wallet with the given identifier (adds to list) */
  createWallet: (identifier: string, networkConfigs: NetworkConfigs) => Promise<void>
  /** Refresh the wallet list */
  refreshWalletList: (knownIdentifiers?: string[]) => Promise<void>
  /** Whether wallet list operation is in progress */
  isWalletListLoading: boolean
  /** Wallet list error message if any */
  walletListError: string | null
}

export function useWalletManager(
  networkConfigs: NetworkConfigs,
  identifier?: string
): UseWalletManagerResult {
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Local loading and error state for wallet list operations (ephemeral, only used in this hook)
  const [isWalletListLoading, setIsWalletListLoading] = useState(false)
  const [walletListError, setWalletListError] = useState<string | null>(null)
  
  const walletStore = getWalletStore()

  // Subscribe to wallet list state from Zustand (only persistent data)
  const walletListState = walletStore(
    useShallow((state) => ({
      wallets: state.walletList,
      activeWalletId: state.activeWalletId,
    }))
  )

  /**
   * Initialize wallet - either create new or load existing
   * 
   * @param options - Wallet initialization options
   * @param options.createNew - If true, creates a new wallet; if false, loads existing wallet
   * @param options.identifier - Optional identifier override (defaults to hook's identifier)
   */
  const initializeWallet = useCallback(
    async (options: { createNew?: boolean; identifier?: string } = {}) => {
      setIsInitializing(true)
      setError(null)

      try {
        await WalletSetupService.initializeWallet(
          networkConfigs,
          {
            ...options,
            identifier: options.identifier ?? identifier,
          }
        )
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err)
        logError('Failed to initialize wallet:', err)
        setError(errorMessage)
        throw err
      } finally {
        setIsInitializing(false)
      }
    },
    [networkConfigs, identifier]
  )

  /**
   * Check if wallet exists
   * 
   * @param walletIdentifier - Optional identifier override (defaults to hook's identifier)
   * @returns Promise resolving to true if wallet exists, false otherwise
   */
  const hasWallet = useCallback(
    async (walletIdentifier?: string): Promise<boolean> => {
      return WalletSetupService.hasWallet(walletIdentifier ?? identifier)
    },
    [identifier]
  )

  /**
   * Initialize wallet from mnemonic seedphrase
   * 
   * @param mnemonic - Mnemonic phrase to import
   * @param walletIdentifier - Optional identifier override (defaults to hook's identifier)
   */
  const initializeFromMnemonic = useCallback(
    async (mnemonic: string, walletIdentifier?: string) => {
      setIsInitializing(true)
      setError(null)

      try {
        await WalletSetupService.initializeFromMnemonic(
          networkConfigs,
          mnemonic,
          walletIdentifier ?? identifier
        )
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err)
        logError('Failed to initialize wallet from mnemonic:', err)
        setError(errorMessage)
        throw err
      } finally {
        setIsInitializing(false)
      }
    },
    [networkConfigs, identifier]
  )

  /**
   * Delete wallet
   * 
   * @param walletIdentifier - Optional identifier override (defaults to hook's identifier)
   *                          If not provided, deletes the default wallet
   */
  const deleteWallet = useCallback(
    async (walletIdentifier?: string) => {
      setIsInitializing(true)
      setError(null)

      try {
        const targetIdentifier = walletIdentifier ?? identifier
        await WalletSetupService.deleteWallet(targetIdentifier)

        // Remove from wallet list and clear active wallet if needed
        walletStore.setState((state) => {
          const wasActive = state.activeWalletId === targetIdentifier
          return {
            walletList: state.walletList.filter((w) => w.identifier !== targetIdentifier),
            activeWalletId: wasActive ? null : state.activeWalletId,
          }
        })
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err)
        logError('Failed to delete wallet:', err)
        setError(errorMessage)
        throw err
      } finally {
        setIsInitializing(false)
      }
    },
    [identifier]
  )

  /**
   * Get mnemonic phrase from wallet
   * Requires biometric authentication if credentials are not cached
   * 
   * @param walletIdentifier - Optional identifier override (defaults to hook's identifier)
   * @returns Promise resolving to mnemonic phrase or null if not found
   */
  const getMnemonic = useCallback(
    async (walletIdentifier?: string): Promise<string | null> => {
      try {
        return await WalletSetupService.getMnemonic(walletIdentifier ?? identifier)
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err)
        logError('Failed to get mnemonic:', err)
        throw err
      }
    },
    [identifier]
  )

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null)
  }, [])

  /**
   * Check if a wallet exists (for wallet list operations)
   */
  const checkWallet = useCallback(async (walletIdentifier: string): Promise<boolean> => {
    try {
      return await WalletSetupService.hasWallet(walletIdentifier)
    } catch (err) {
      logError('Failed to check wallet:', err)
      return false
    }
  }, [])

  /**
   * Refresh the wallet list
   */
  const refreshWalletList = useCallback(async (knownIdentifiers?: string[]) => {
    setIsWalletListLoading(true)
    setWalletListError(null)

    try {
      const identifiersToCheck = knownIdentifiers || []
      const currentActiveId = walletStore.getState().activeWalletId
      
      // If no known identifiers provided, check default wallet
      if (identifiersToCheck.length === 0) {
        const defaultExists = await checkWallet('default')
        walletStore.setState({
          walletList: [{ identifier: 'default', exists: defaultExists, isActive: currentActiveId === 'default' }],
        })
      } else {
        // Check all known identifiers
        const walletChecks = await Promise.all(
          identifiersToCheck.map(async (id) => ({
            identifier: id,
            exists: await checkWallet(id),
            isActive: currentActiveId === id,
          }))
        )
        walletStore.setState({ walletList: walletChecks })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logError('Failed to refresh wallet list:', err)
      setWalletListError(errorMessage)
    } finally {
      setIsWalletListLoading(false)
    }
  }, [checkWallet])

  /**
   * Switch to a different wallet
   */
  const switchWallet = useCallback(async (walletIdentifier: string) => {
    setIsWalletListLoading(true)
    setWalletListError(null)

    try {
      // Check if wallet exists
      const exists = await checkWallet(walletIdentifier)
      if (!exists) {
        throw new Error(`Wallet with identifier "${walletIdentifier}" does not exist`)
      }

      // Clear credentials cache for current wallet
      const currentActiveId = walletStore.getState().activeWalletId
      if (currentActiveId) {
        WalletSetupService.clearCredentialsCache(currentActiveId)
      }

      // Set new active wallet and update list
      walletStore.setState((state) => ({
        activeWalletId: walletIdentifier,
        walletList: state.walletList.map((w) => ({
          ...w,
          isActive: w.identifier === walletIdentifier,
        })),
      }))

      log(`Switched to wallet: ${walletIdentifier}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logError('Failed to switch wallet:', err)
      setWalletListError(errorMessage)
      throw err
    } finally {
      setIsWalletListLoading(false)
    }
  }, [checkWallet])

  /**
   * Create a new wallet and add it to the wallet list
   */
  const createWallet = useCallback(async (walletIdentifier: string, walletNetworkConfigs: NetworkConfigs) => {
    setIsWalletListLoading(true)
    setWalletListError(null)

    try {
      // Check if wallet already exists
      const exists = await checkWallet(walletIdentifier)
      if (exists) {
        throw new Error(`Wallet with identifier "${walletIdentifier}" already exists`)
      }

      // Create wallet using WalletSetupService
      await WalletSetupService.createNewWallet(walletNetworkConfigs, walletIdentifier)

      // Add to wallet list
      walletStore.setState((state) => ({
        walletList: [...state.walletList, { identifier: walletIdentifier, exists: true, isActive: false }],
      }))

      log(`Created new wallet: ${walletIdentifier}`)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logError('Failed to create wallet:', err)
      setWalletListError(errorMessage)
      throw err
    } finally {
      setIsWalletListLoading(false)
    }
  }, [checkWallet])

  // Memoize return object to prevent unnecessary re-renders
  return useMemo(
    () => ({
      initializeWallet,
      initializeFromMnemonic,
      hasWallet,
      deleteWallet,
      getMnemonic,
      isInitializing,
      error,
      clearError,
      // Wallet list operations
      wallets: walletListState.wallets,
      activeWalletId: walletListState.activeWalletId,
      switchWallet,
      createWallet,
      refreshWalletList,
      isWalletListLoading,
      walletListError,
    }),
    [
      initializeWallet,
      initializeFromMnemonic,
      hasWallet,
      deleteWallet,
      getMnemonic,
      isInitializing,
      error,
      clearError,
      walletListState.wallets,
      walletListState.activeWalletId,
      switchWallet,
      createWallet,
      refreshWalletList,
      isWalletListLoading,
      walletListError,
    ]
  )
}

