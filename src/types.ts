/**
 * Core Type Definitions
 * 
 * All network, token, and wallet type definitions for the WDK React Native Core library.
 */

import type { AssetConfig, IAsset } from './entities/Asset'

export type { AssetConfig, IAsset }

/**
 * Network Configuration (Generic)
 * 
 * Defines the configuration for a blockchain network.
 * Now extensible via Generics to support any blockchain (EVM, BTC, Solana, etc.)
 */
export type NetworkConfig<T = Record<string, unknown>> = T

/**
 * Network Configurations (Generic)
 * 
 * Maps network names to their configurations.
 */
export type NetworkConfigs<T = Record<string, unknown>> = Record<string, NetworkConfig<T>>

/**
 * Asset Configuration (Generic)
 * 
 * Defines the configuration for an asset.
 * Replaces TokenConfig.
 */
// Export is handled by `export type { AssetConfig }` above

/**
 * Network Assets (Generic)
 * 
 * Defines the assets available for a network.
 * Replaces NetworkTokens.
 */
export interface NetworkAssets<T = Record<string, unknown>> {
  /** Array of asset configurations */
  assets: AssetConfig<T>[]
}

/**
 * Asset Configurations (Generic)
 * 
 * Maps network names to their asset configurations.
 * Replaces TokenConfigs.
 */
export type AssetConfigs<T = Record<string, unknown>> = Record<string, NetworkAssets<T>>

/**
 * Wallet
 * 
 * Represents a wallet instance with metadata.
 */
export interface Wallet {
  /** Account index (0-based) */
  accountIndex: number
  /** Unique wallet identifier */
  identifier: string
  /** Wallet display name */
  name: string
  /** Timestamp when wallet was created */
  createdAt: number
  /** Timestamp when wallet was last updated */
  updatedAt: number
}

/**
 * Wallet Addresses
 * 
 * Maps network -> accountIndex -> address
 * Structure: { [network]: { [accountIndex]: address } }
 */
export type WalletAddresses = Record<string, Record<number, string>>

/**
 * Wallet Addresses by Wallet Identifier
 * 
 * Maps walletId -> network -> accountIndex -> address
 * Structure: { [walletId]: { [network]: { [accountIndex]: address } } }
 */
export type WalletAddressesByWallet = Record<string, WalletAddresses>

/**
 * Wallet Balances
 * 
 * Maps network -> accountIndex -> assetId -> balance
 * Structure: { [network]: { [accountIndex]: { [assetId]: balance } } }
 * Note: balance is stored as a string to handle BigInt values
 */
export type WalletBalances = Record<string, Record<number, Record<string, string>>>

/**
 * Wallet Balances by Wallet Identifier
 * 
 * Maps walletId -> network -> accountIndex -> assetId -> balance
 * Structure: { [walletId]: { [network]: { [accountIndex]: { [assetId]: balance } } } }
 */
export type WalletBalancesByWallet = Record<string, WalletBalances>

/**
 * Balance Loading States
 * 
 * Maps "network-accountIndex-assetId" -> boolean
 * Used to track which balances are currently being fetched.
 */
export type BalanceLoadingStates = Record<string, boolean>

/**
 * Balance Fetch Result
 * 
 * Result of a balance fetch operation.
 */
export interface BalanceFetchResult {
  /** Whether the fetch was successful */
  success: boolean
  /** Network name */
  network: string
  /** Account index */
  accountIndex: number
  /** Asset identifier */
  assetId: string
  /** Balance as a string (null if fetch failed) */
  balance: string | null
  /** Error message (only present if success is false) */
  error?: string
}

/**
 * Wallet Store Interface
 *
 * Interface for wallet store implementations that provide account methods
 * and wallet initialization status.
 */
export interface WalletStore {
  /** Call a method on a wallet account */
  callAccountMethod: <T = unknown>(
    network: string,
    accountIndex: number,
    methodName: string,
    args?: unknown
  ) => Promise<T>
  /** Check if the wallet is initialized */
  isWalletInitialized: () => boolean
}

// ============================================================================
// HRPC Types (re-exported from ./types/hrpc)
// ============================================================================

export {
  LogType,
  type LogRequest,
  type WorkletStartRequest,
  type WorkletStartResponse,
  type DisposeRequest,
  type CallMethodRequest,
  type CallMethodResponse,
  type HRPC,
  type HRPCConstructor,
  type BundleConfig,
  type ExtendedHRPC,
  isExtendedHRPC,
  asExtendedHRPC,
} from './types/hrpc'