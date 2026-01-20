/**
 * @tetherto/wdk-react-native-core
 *
 * Core functionality for React Native wallets
 * Provides wallet management, balance fetching, and worklet operations
 */

// Core Types (Network, Token, and Wallet types)
export type {
  NetworkConfig,
  NetworkConfigs,
  AssetConfig,
  AssetConfigs,
  NetworkAssets,
  Wallet,
  WalletAddresses,
  WalletBalances,
  BalanceLoadingStates,
  BalanceFetchResult,
  WalletStore,
  IAsset,
  // Bundle and HRPC types
  BundleConfig,
  HRPC,
  HRPCConstructor,
  LogRequest,
  WorkletStartRequest,
  WorkletStartResponse,
  DisposeRequest,
  CallMethodRequest,
  CallMethodResponse,
} from './types'

// Entities
export { BaseAsset } from './entities/Asset'

// RPC enums
export { LogType } from './types'

// HRPC Type Extensions (for extending HRPC functionality)
export type { ExtendedHRPC } from './types/hrpc'
export { isExtendedHRPC, asExtendedHRPC } from './types/hrpc'

// Provider (main entry point)
export { WdkAppProvider } from './provider/WdkAppProvider'
export type { WdkAppProviderProps, WdkAppContextValue } from './provider/WdkAppProvider'

// Hooks (public API)
export { useWorklet } from './hooks/useWorklet'
export { useWallet } from './hooks/useWallet'
export { useWdkApp } from './hooks/useWdkApp'

export { useWalletManager } from './hooks/useWalletManager'
export type { UseWalletManagerResult, WalletInfo } from './hooks/useWalletManager'
export {
  useBalance,
  useBalancesForWallet,
  useBalancesForWallets,
  useRefreshBalance,
  balanceQueryKeys,
} from './hooks/useBalance'
export type { AccountInfo } from './store/walletStore'
export { getWalletStore } from './store/walletStore'
export type { WalletStore as WalletStoreState } from './store/walletStore'

// Validation Utilities (for validating configs before use)
export {
  validateNetworkConfigs,
  validateAssetConfigs,
  validateBalanceRefreshInterval,
  validateAccountIndex,
} from './utils/validation'

// Zod Schemas (for runtime validation)
export {
  networkConfigSchema,
  networkConfigsSchema,
  assetConfigSchema,
  assetConfigsSchema,
  walletAddressesSchema,
  walletBalancesSchema,
  accountIndexSchema,
  networkNameSchema,
  balanceStringSchema,
  ethereumAddressSchema,
  sparkAddressSchema,
  addressSchema,
} from './utils/schemas'

// Type Guards (for runtime type checking)
export {
  isNetworkConfigs,
  isAssetConfigs,
  isAssetConfig,
  isEthereumAddress,
  isValidAccountIndex,
  isValidNetworkName,
} from './utils/typeGuards'

// Services
export { WorkletLifecycleService } from './services/workletLifecycleService'
export { AddressService } from './services/addressService'
export { AccountService } from './services/accountService'
export { BalanceService } from './services/balanceService'
export { WalletSetupService } from './services/walletSetupService'
export { WalletSwitchingService } from './services/walletSwitchingService'

// Utility Functions
export { validateMnemonic } from './utils/mnemonicUtils'
export { convertBalanceToString, formatBalance, convertBigIntToString } from './utils/balanceUtils'
export { normalizeError, getErrorMessage, isErrorType, createContextualError } from './utils/errorUtils'

// Result Type (for error handling patterns)
export type { Result } from './utils/result'
export { ok, err, toResult, toResultSync } from './utils/result'

// Initialization State Machine
export {
  InitializationStatus,
  AppStatus,
  isErrorStatus,
  isReadyStatus,
  isInProgressStatus,
  isAppReadyStatus,
  isAppInProgressStatus,
  hasWorkletStarted,
  canLoadWallet,
  hasWorkletStartedApp,
  canLoadWalletApp,
  getStatusMessage,
  getAppStatusMessage,
  getWorkletStatus,
  getCombinedStatus,
} from './utils/initializationState'