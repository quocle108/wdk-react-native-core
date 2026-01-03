/**
 * Wallet State Machine
 * 
 * Separate state machine for wallet loading operations (per-identifier).
 * This is separate from worklet state (which is global).
 * 
 * The wallet state machine tracks the lifecycle of loading a specific wallet:
 * - not_loaded: No wallet is currently loaded
 * - checking: Checking if wallet exists in storage
 * - loading: Loading/initializing wallet
 * - ready: Wallet is loaded and ready
 * - error: Error occurred during wallet operations
 */

/**
 * Wallet state type - tracks wallet loading operations
 */
export type WalletState =
  | { type: 'not_loaded' }
  | { type: 'checking'; identifier: string }
  | { type: 'loading'; identifier: string; walletExists: boolean }
  | { type: 'ready'; identifier: string }
  | { type: 'error'; identifier: string | null; error: Error }

/**
 * Wallet state actions
 */
export type WalletAction =
  | { type: 'CHECK_WALLET'; identifier: string }
  | { type: 'WALLET_CHECKED'; identifier: string; exists: boolean }
  | { type: 'START_LOADING'; identifier: string; walletExists: boolean }
  | { type: 'WALLET_LOADED'; identifier: string }
  | { type: 'WALLET_ERROR'; identifier: string | null; error: Error }
  | { type: 'RESET' }

/**
 * Wallet state reducer
 * 
 * Handles state transitions for wallet loading operations.
 */
export function walletReducer(state: WalletState, action: WalletAction): WalletState {
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
 * Get the wallet identifier from wallet state (if available)
 */
export function getWalletIdentifier(state: WalletState): string | null {
  switch (state.type) {
    case 'checking':
    case 'loading':
    case 'ready':
      return state.identifier
    case 'error':
      return state.identifier
    case 'not_loaded':
      return null
  }
}

/**
 * Check if wallet state represents an error state
 */
export function isWalletErrorState(state: WalletState): boolean {
  return state.type === 'error'
}

/**
 * Check if wallet state represents a loading state (checking or loading)
 */
export function isWalletLoadingState(state: WalletState): boolean {
  return state.type === 'checking' || state.type === 'loading'
}

/**
 * Check if wallet state represents a ready state
 */
export function isWalletReadyState(state: WalletState): boolean {
  return state.type === 'ready'
}

