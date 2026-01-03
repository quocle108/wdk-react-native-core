/**
 * WdkAppProvider
 *
 * App-level orchestration provider that composes existing WDK hooks.
 * Manages the complete initialization flow:
 * 1. Start worklet immediately on app open (global, happens once)
 * 2. Load wallets (per-identifier, can have multiple)
 *
 * Architecture:
 * - Worklet state: Managed by workletStore (global, initialized once)
 * - Wallet state: Managed by separate state machine (per-identifier, can load multiple)
 * - Combined status: Derived from both worklet and wallet states
 *
 * This provider is generic and reusable - it doesn't know about app-specific
 * concerns like auth state or UI branding.
 */

import React, { createContext, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { createSecureStorage } from '@tetherto/wdk-react-native-secure-storage'
import type { SecureStorage } from '@tetherto/wdk-react-native-secure-storage'

import { useWallet } from '../hooks/useWallet'
import { useWalletManager } from '../hooks/useWalletManager'
import { useWorklet } from '../hooks/useWorklet'
import { getWalletStore } from '../store/walletStore'
import { WalletSetupService } from '../services/walletSetupService'
import { isAuthenticationError, normalizeError } from '../utils/errorUtils'
import { log, logError, logWarn } from '../utils/logger'
import { validateNetworkConfigs, validateTokenConfigs } from '../utils/validation'
import { InitializationStatus, isReadyStatus, isInProgressStatus } from '../utils/initializationState'
import type { NetworkConfigs, TokenConfigs } from '../types'

// Wallet state machine - separate from worklet state
// Tracks wallet loading operations (per-identifier)
type WalletState =
  | { type: 'not_loaded' }
  | { type: 'checking'; identifier: string }
  | { type: 'loading'; identifier: string; walletExists: boolean }
  | { type: 'ready'; identifier: string }
  | { type: 'error'; identifier: string | null; error: Error }

type WalletAction =
  | { type: 'CHECK_WALLET'; identifier: string }
  | { type: 'WALLET_CHECKED'; identifier: string; exists: boolean }
  | { type: 'START_LOADING'; identifier: string; walletExists: boolean }
  | { type: 'WALLET_LOADED'; identifier: string }
  | { type: 'WALLET_ERROR'; identifier: string | null; error: Error }
  | { type: 'RESET' }

function walletReducer(state: WalletState, action: WalletAction): WalletState {
  switch (action.type) {
    case 'CHECK_WALLET':
      return { type: 'checking', identifier: action.identifier }
    case 'WALLET_CHECKED':
      return { type: 'loading', identifier: action.identifier, walletExists: action.exists }
    case 'START_LOADING':
      return { type: 'loading', identifier: action.identifier, walletExists: action.walletExists }
    case 'WALLET_LOADED':
      return { type: 'ready', identifier: action.identifier }
    case 'WALLET_ERROR':
      return { type: 'error', identifier: action.identifier, error: action.error }
    case 'RESET':
      return { type: 'not_loaded' }
    default:
      return state
  }
}

/**
 * Derives combined initialization status from worklet and wallet states
 */
function getCombinedStatus(
  workletState: { isWorkletStarted: boolean; isLoading: boolean; error: string | null },
  walletState: WalletState
): InitializationStatus {
  // Worklet errors take precedence
  if (workletState.error) {
    return InitializationStatus.ERROR
  }

  // Worklet not ready
  if (!workletState.isWorkletStarted) {
    return workletState.isLoading
      ? InitializationStatus.STARTING_WORKLET
      : InitializationStatus.IDLE
  }

  // Worklet ready, check wallet state
  switch (walletState.type) {
    case 'not_loaded':
      return InitializationStatus.WORKLET_READY
    case 'checking':
    case 'loading':
      return InitializationStatus.LOADING_WALLET
    case 'ready':
      return InitializationStatus.READY
    case 'error':
      return InitializationStatus.ERROR
    default:
      return InitializationStatus.IDLE
  }
}



/**
 * Context state exposed to consumers
 * 
 * Use the `status` enum as the primary way to check initialization state.
 * Helper functions like `isReadyStatus()`, `isInProgressStatus()`, etc. are available
 * from the InitializationStatus utilities.
 */
export interface WdkAppContextValue {
  /** Unified initialization status - use this as the single source of truth */
  status: InitializationStatus
  /** Initialization in progress (convenience getter, equivalent to isInProgressStatus(status)) */
  isInitializing: boolean
  /** Currently active wallet identifier from walletStore (null if no wallet is loaded) */
  activeWalletId: string | null
  /** Wallet identifier being loaded (transient, only during loading operations) */
  loadingWalletId: string | null
  /** Whether the wallet being loaded exists in secure storage (null = not checked yet, true = exists, false = doesn't exist) */
  walletExists: boolean | null
  /** Initialization error if any (worklet or wallet error) */
  error: Error | null
  /** Retry initialization after an error */
  retry: () => void
  /** Load existing wallet from storage (only if wallet exists, throws error if it doesn't) */
  loadExisting: (identifier: string) => Promise<void>
  /** Create and initialize a new wallet */
  createNew: (identifier?: string) => Promise<void>
  /** Balance fetching is in progress (deprecated - use useBalance hook's isLoading instead) */
  isFetchingBalances: boolean
  /** Refresh all balances manually (deprecated - use useRefreshBalance() hook instead) */
  refreshBalances: () => Promise<void>
}

const WdkAppContext = createContext<WdkAppContextValue | null>(null)

/**
 * Provider props
 */
export interface WdkAppProviderProps {
  /** Network configurations */
  networkConfigs: NetworkConfigs
  /** Token configurations for balance fetching */
  tokenConfigs: TokenConfigs
  /** Child components (app content) */
  children: React.ReactNode
}

/**
 * WdkAppProvider - Orchestrates WDK initialization flow
 *
 * Composes useWorklet and useWalletManager hooks into a unified initialization flow.
 * Automatically fetches balances when wallet is ready.
 */
/**
 * Create QueryClient singleton for TanStack Query
 * This is created once and reused across the app lifecycle
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
    },
  },
})

export function WdkAppProvider({
  networkConfigs,
  tokenConfigs,
  children,
}: WdkAppProviderProps) {
  // Create secureStorage singleton
  const secureStorage = useMemo(() => createSecureStorage(), [])

  // Set secureStorage in WalletSetupService
  useEffect(() => {
    WalletSetupService.setSecureStorage(secureStorage)
  }, [secureStorage])

  // Validate props on mount and when props change
  useEffect(() => {
    try {
      validateNetworkConfigs(networkConfigs)
      validateTokenConfigs(tokenConfigs)
    } catch (error) {
      const err = normalizeError(error, true, { component: 'WdkAppProvider', operation: 'propsValidation' })
      logError('[WdkAppProvider] Invalid props:', err)
      // Always throw validation errors - they indicate programming errors
      throw err
    }
  }, [networkConfigs, tokenConfigs])

  // Worklet state - read from workletStore via hook
  const workletState = useWorklet()
  const {
    isWorkletStarted,
    isInitialized: isWorkletInitialized,
    isLoading: isWorkletLoading,
    error: workletError,
    startWorklet,
  } = workletState

  // Wallet state - separate state machine
  const [walletState, dispatchWallet] = useReducer(walletReducer, { type: 'not_loaded' })

  // Active wallet ID - read from walletStore (single source of truth)
  const walletStore = getWalletStore()
  const activeWalletId = walletStore((state) => state.activeWalletId)

  // Hooks for wallet operations
  const {
    initializeWallet,
    hasWallet,
    isInitializing: isWalletInitializing,
  } = useWalletManager(networkConfigs)

  // Get wallet state to check if worklet is initialized (needed for wallet operations)
  const { isInitialized: isWorkletInitializedForWallet } = useWallet()

  const cancelledRef = useRef(false)
  const lastAuthErrorRef = useRef<number | null>(null)
  const AUTH_ERROR_COOLDOWN_MS = 3000 // 3 seconds

  // Combined status - derived from both worklet and wallet states
  const status = useMemo(() => {
    return getCombinedStatus(
      {
        isWorkletStarted,
        isLoading: isWorkletLoading,
        error: workletError,
      },
      walletState
    )
  }, [isWorkletStarted, isWorkletLoading, workletError, walletState])

  // Initialize worklet when component mounts
  useEffect(() => {
    log('[WdkAppProvider] Checking initialization conditions', {
      isWorkletInitialized,
      isWorkletLoading,
      isWorkletStarted,
    })
    
    // Skip if worklet is loading
    if (isWorkletLoading) {
      log('[WdkAppProvider] Initialization skipped', { reason: 'already loading' })
      return
    }

    // If worklet is already started/initialized, nothing to do
    if (isWorkletStarted || isWorkletInitialized) {
      log('[WdkAppProvider] Worklet already started, ready to load wallets')
      return
    }

    cancelledRef.current = false

    const initializeWorklet = async () => {
      try {
        log('[WdkAppProvider] Starting worklet initialization...')
        await startWorklet(networkConfigs)

        if (cancelledRef.current) return
        log('[WdkAppProvider] Worklet started successfully')
      } catch (error) {
        if (cancelledRef.current) return

        const err = normalizeError(error, true, {
          component: 'WdkAppProvider',
          operation: 'workletInitialization',
        })
        logError('[WdkAppProvider] Failed to initialize worklet:', error)
      }
    }

    initializeWorklet()

    return () => {
      cancelledRef.current = true
    }
  }, [isWorkletInitialized, isWorkletLoading, isWorkletStarted, networkConfigs, startWorklet])

  // Update wallet state when wallet becomes initialized externally
  useEffect(() => {
    if (isWorkletInitializedForWallet && walletState.type === 'loading') {
      // Wallet initialization completed - update state
      dispatchWallet({ type: 'WALLET_LOADED', identifier: walletState.identifier })
    }
  }, [isWorkletInitializedForWallet, walletState])

  // Helper to check prerequisites and handle cooldown
  const checkPrerequisites = useCallback(async (identifier: string): Promise<void> => {
    if (!isWorkletStarted) {
      throw new Error('Worklet must be started before initializing wallet')
    }

    // Check if switching wallets (different identifier than currently loaded)
    const isSwitchingWallet = activeWalletId !== null && activeWalletId !== identifier
    if (isSwitchingWallet) {
      log('[WdkAppProvider] Switching wallets', { from: activeWalletId, to: identifier })
      // Clear previous wallet's credentials cache
      WalletSetupService.clearCredentialsCache(activeWalletId)
    }

    // If wallet is already loaded and it's the same identifier, skip
    if (isWorkletInitializedForWallet && activeWalletId === identifier) {
      log('[WdkAppProvider] Wallet already initialized', { identifier })
      return
    }

    // Check cooldown period for authentication errors
    if (lastAuthErrorRef.current !== null) {
      const timeSinceError = Date.now() - lastAuthErrorRef.current
      if (timeSinceError < AUTH_ERROR_COOLDOWN_MS) {
        throw new Error(`Skipping initialization - cooldown period active (${AUTH_ERROR_COOLDOWN_MS - timeSinceError}ms remaining)`)
      }
    }

    // Check wallet existence for the given identifier
    log('[WdkAppProvider] Checking if wallet exists...', { identifier })
    dispatchWallet({ type: 'CHECK_WALLET', identifier })
    try {
      const walletExistsResult = await hasWallet(identifier)
      dispatchWallet({ type: 'WALLET_CHECKED', identifier, exists: walletExistsResult })
    } catch (error) {
      logError('[WdkAppProvider] Failed to check wallet:', error)
      dispatchWallet({ type: 'WALLET_ERROR', identifier, error: normalizeError(error, true, { component: 'WdkAppProvider', operation: 'checkWallet' }) })
      throw error
    }
  }, [isWorkletStarted, isWorkletInitializedForWallet, hasWallet, activeWalletId])

  // Load existing wallet from storage
  const loadExisting = useCallback(async (identifier: string): Promise<void> => {
    await checkPrerequisites(identifier)

    // Get walletExists from wallet state
    const walletExists = walletState.type === 'loading' ? walletState.walletExists : null
    
    if (walletExists === false) {
      throw new Error(`Cannot load existing wallet - wallet with identifier "${identifier}" does not exist`)
    }

    // Start loading if not already in loading state
    if (walletState.type !== 'loading') {
      dispatchWallet({ type: 'START_LOADING', identifier, walletExists: walletExists ?? true })
    }

    try {
      log('[WdkAppProvider] Loading existing wallet from secure storage...', { identifier })
      await initializeWallet({ createNew: false, identifier })
      
      // Update walletStore (single source of truth)
      walletStore.setState({ activeWalletId: identifier })
      
      log('[WdkAppProvider] Wallet loaded successfully', { identifier })
      dispatchWallet({ type: 'WALLET_LOADED', identifier })
    } catch (error) {
      const err = normalizeError(error, true, {
        component: 'WdkAppProvider',
        operation: 'loadExisting',
      })
      
      const errorMessage = err.message.toLowerCase()
      const isDecryptionError = 
        errorMessage.includes('decryption failed') ||
        errorMessage.includes('failed to decrypt') ||
        errorMessage.includes('decrypt seed')
      
      // Handle decryption errors by cleaning up corrupted wallet data
      if (isDecryptionError) {
        logError('[WdkAppProvider] Decryption failed - wallet data may be corrupted. Cleaning up...', error)
        
        try {
          WalletSetupService.clearCredentialsCache(identifier)
          log('[WdkAppProvider] Cleared credentials cache for corrupted wallet')
          
          try {
            await secureStorage.deleteWallet(identifier)
            log('[WdkAppProvider] Deleted corrupted wallet data from keychain')
          } catch (deleteError) {
            logWarn('[WdkAppProvider] Failed to delete corrupted wallet data from keychain', deleteError)
          }
          
          const cleanupError = new Error(
            `Failed to decrypt wallet: The stored wallet data appears to be corrupted or encrypted with a different key. ` +
            `Corrupted data has been cleaned up. Error: ${err.message}`
          )
          cleanupError.name = err.name || 'DecryptionError'
          
          dispatchWallet({ type: 'WALLET_ERROR', identifier, error: cleanupError })
          throw cleanupError
        } catch (cleanupError) {
          logError('[WdkAppProvider] Error during cleanup of corrupted wallet data', cleanupError)
          dispatchWallet({ type: 'WALLET_ERROR', identifier, error: err })
          throw err
        }
      }
      
      if (isAuthenticationError(err)) {
        lastAuthErrorRef.current = Date.now()
      }
      
      logError('[WdkAppProvider] Failed to load existing wallet:', error)
      dispatchWallet({ type: 'WALLET_ERROR', identifier, error: err })
      throw err
    }
  }, [checkPrerequisites, walletState, initializeWallet, secureStorage, walletStore])

  // Create and initialize a new wallet
  const createNew = useCallback(async (identifier?: string): Promise<void> => {
    const targetIdentifier = identifier || 'default'
    
    // Handle ERROR state - reset wallet state if worklet is started
    if (walletState.type === 'error' && isWorkletStarted) {
      log('[WdkAppProvider] Recovering from error state, resetting wallet state')
      dispatchWallet({ type: 'RESET' })
    }

    await checkPrerequisites(targetIdentifier)

    // Start loading
    dispatchWallet({ type: 'START_LOADING', identifier: targetIdentifier, walletExists: false })

    try {
      log('[WdkAppProvider] Creating new wallet...', { identifier: targetIdentifier })
      await initializeWallet({ createNew: true, identifier: targetIdentifier })
      
      // Update walletStore (single source of truth)
      walletStore.setState({ activeWalletId: targetIdentifier })
      
      log('[WdkAppProvider] New wallet created and initialized successfully', { identifier: targetIdentifier })
      dispatchWallet({ type: 'WALLET_LOADED', identifier: targetIdentifier })
    } catch (error) {
      const err = normalizeError(error, true, {
        component: 'WdkAppProvider',
        operation: 'createNew',
      })
      logError('[WdkAppProvider] Failed to create new wallet:', error)
      
      if (isAuthenticationError(err)) {
        lastAuthErrorRef.current = Date.now()
      }
      
      dispatchWallet({ type: 'WALLET_ERROR', identifier: targetIdentifier, error: err })
      throw err
    }
  }, [checkPrerequisites, initializeWallet, walletState, isWorkletStarted, walletStore])

  // Retry initialization
  const retry = useCallback(() => {
    log('[WdkAppProvider] Retrying initialization...')
    lastAuthErrorRef.current = null
    // Reset wallet state if in error
    if (walletState.type === 'error') {
      dispatchWallet({ type: 'RESET' })
    }
    cancelledRef.current = false
  }, [walletState.type])

  // Convenience getter for initialization state
  const isInitializing = useMemo(() => isInProgressStatus(status), [status])

  // Get wallet error from wallet state
  const walletError = walletState.type === 'error' ? walletState.error : null
  const initializationError = workletError ? new Error(workletError) : walletError

  // Get walletExists from wallet state
  const walletExists = useMemo(() => {
    if (walletState.type === 'loading') {
      return walletState.walletExists
    }
    if (walletState.type === 'ready') {
      return true // Wallet is loaded, so it exists
    }
    return null
  }, [walletState])

  // Loading wallet ID (transient, during loading operations)
  const loadingWalletId = useMemo(() => {
    if (walletState.type === 'checking' || walletState.type === 'loading') {
      return walletState.identifier
    }
    return null
  }, [walletState])

  // Balance fetching is now handled by TanStack Query via useBalance hooks
  // No need for manual balance sync - balances are automatically fetched and cached
  // Users can use useBalance() hook to fetch balances with automatic refetching
  const isFetchingBalances = false // Deprecated - use useBalance hook's isLoading instead
  const refreshBalances = async () => {
    // Deprecated - use useRefreshBalance() hook instead
    logError('[WdkAppProvider] refreshBalances is deprecated. Use useRefreshBalance() hook instead.')
  }

  const contextValue: WdkAppContextValue = useMemo(
    () => ({
      status,
      isInitializing,
      activeWalletId,
      loadingWalletId,
      walletExists,
      error: initializationError,
      retry,
      loadExisting,
      createNew,
      isFetchingBalances,
      refreshBalances,
    }),
    [status, isInitializing, activeWalletId, loadingWalletId, walletExists, initializationError, retry, loadExisting, createNew, isFetchingBalances, refreshBalances]
  )

  return (
    <QueryClientProvider client={queryClient}>
      <WdkAppContext.Provider value={contextValue}>{children}</WdkAppContext.Provider>
    </QueryClientProvider>
  )
}

// Export context for use by the useWdkApp hook
export { WdkAppContext }

