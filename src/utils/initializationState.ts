/**
 * Unified Initialization State Machine
 * 
 * Replaces multiple confusing state flags (isReady, walletInitialized, addressesReady, etc.)
 * with a single clear state machine enum.
 */

/**
 * Initialization status enum
 * 
 * Represents the current state of the WDK app initialization.
 * 
 * IMPORTANT: This status represents the app-level readiness, not per-wallet state.
 * The worklet is initialized once (global), but wallets are per-identifier.
 * 
 * Flow:
 * 1. IDLE -> STARTING_WORKLET (worklet initialization begins)
 * 2. STARTING_WORKLET -> WORKLET_READY (worklet runtime ready, can now load wallets)
 * 3. WORKLET_READY -> LOADING_WALLET (user calls loadExisting/createNew)
 * 4. LOADING_WALLET -> READY (wallet loaded, addresses available)
 * 
 * Note: After WORKLET_READY, you can load different wallets (per identifier),
 * but the status only reflects the currently active wallet state.
 */
export enum InitializationStatus {
  /** Initial state - worklet not started */
  IDLE = 'idle',
  /** Worklet runtime is starting (happens once, global) */
  STARTING_WORKLET = 'starting_worklet',
  /** Worklet is ready - can now load wallets (per identifier) */
  WORKLET_READY = 'worklet_ready',
  /** Loading a wallet (checking existence, decrypting, initializing) */
  LOADING_WALLET = 'loading_wallet',
  /** Fully ready - worklet started, wallet loaded, addresses available */
  READY = 'ready',
  /** Error state - initialization failed */
  ERROR = 'error',
}

/**
 * Helper to check if status represents an error state
 */
export function isErrorStatus(status: InitializationStatus): boolean {
  return status === InitializationStatus.ERROR
}

/**
 * Helper to check if status represents a ready state
 */
export function isReadyStatus(status: InitializationStatus): boolean {
  return status === InitializationStatus.READY
}

/**
 * Helper to check if status represents an in-progress state
 */
export function isInProgressStatus(status: InitializationStatus): boolean {
  return [
    InitializationStatus.STARTING_WORKLET,
    InitializationStatus.LOADING_WALLET,
  ].includes(status)
}

/**
 * Helper to check if wallet is initialized and ready to use
 * Only READY state means wallet is fully initialized with addresses available
 */
export function isWalletInitializedStatus(status: InitializationStatus): boolean {
  return status === InitializationStatus.READY
}

/**
 * Helper to check if worklet has started (worklet runtime is ready)
 * Once worklet is ready, you can load wallets (per identifier)
 */
export function hasWorkletStarted(status: InitializationStatus): boolean {
  return [
    InitializationStatus.WORKLET_READY,
    InitializationStatus.LOADING_WALLET,
    InitializationStatus.READY,
    InitializationStatus.ERROR,
  ].includes(status)
}

/**
 * Helper to check if wallet operations can be performed
 * Returns true when worklet is ready (wallets can be loaded per identifier)
 */
export function canLoadWallet(status: InitializationStatus): boolean {
  return [
    InitializationStatus.WORKLET_READY,
    InitializationStatus.LOADING_WALLET,
    InitializationStatus.READY,
  ].includes(status)
}

/**
 * Get human-readable status message
 */
export function getStatusMessage(status: InitializationStatus): string {
  switch (status) {
    case InitializationStatus.IDLE:
      return 'Not started'
    case InitializationStatus.STARTING_WORKLET:
      return 'Starting worklet...'
    case InitializationStatus.WORKLET_READY:
      return 'Worklet ready - can load wallets'
    case InitializationStatus.LOADING_WALLET:
      return 'Loading wallet...'
    case InitializationStatus.READY:
      return 'Ready'
    case InitializationStatus.ERROR:
      return 'Error'
    default:
      return 'Unknown'
  }
}

/**
 * Derives combined initialization status from worklet and wallet states
 * 
 * This function combines the global worklet state with the per-identifier wallet state
 * to produce a unified initialization status.
 * 
 * @param workletState - Worklet state (global, from workletStore)
 * @param walletState - Wallet state (per-identifier, from wallet state machine)
 * @returns Combined initialization status
 */
export function getCombinedStatus(
  workletState: { isWorkletStarted: boolean; isLoading: boolean; error: string | null },
  walletState: { type: 'not_loaded' | 'checking' | 'loading' | 'ready' | 'error' }
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

