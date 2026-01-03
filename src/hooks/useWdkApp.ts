/**
 * useWdkApp Hook
 *
 * Hook to access WdkAppProvider context.
 * Must be used within WdkAppProvider.
 *
 * @example
 * ```tsx
 * import { InitializationStatus, isReadyStatus } from '@tetherto/wdk-react-native-core'
 * 
 * function MyComponent() {
 *   const { status, isInitializing, activeWalletId, error } = useWdkApp()
 *
 *   if (isReadyStatus(status)) {
 *     return <AppContent walletId={activeWalletId} />
 *   }
 *
 *   if (status === InitializationStatus.ERROR) {
 *     return <ErrorScreen error={error} />
 *   }
 *
 *   return <LoadingScreen />
 * }
 * ```
 */

import { useContext } from 'react'

import { WdkAppContext } from '../provider/WdkAppProvider'
import type { WdkAppContextValue } from '../provider/WdkAppProvider'

/**
 * Hook to access WdkAppProvider context
 *
 * @returns WdkApp context value with initialization state
 * @throws Error if used outside WdkAppProvider
 */
export function useWdkApp(): WdkAppContextValue {
  const context = useContext(WdkAppContext)
  if (!context) {
    throw new Error('useWdkApp must be used within WdkAppProvider')
  }
  return context
}

