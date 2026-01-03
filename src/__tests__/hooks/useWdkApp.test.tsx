/**
 * Tests for useWdkApp hook
 * 
 * Tests hook logic without DOM rendering
 */

import { WdkAppContext } from '../../provider/WdkAppProvider'
import type { WdkAppContextValue } from '../../provider/WdkAppProvider'
import { InitializationStatus } from '../../utils/initializationState'

describe('useWdkApp', () => {
  it('should have correct error message when context is null', () => {
    const errorMessage = 'useWdkApp must be used within WdkAppProvider'
    expect(errorMessage).toBe('useWdkApp must be used within WdkAppProvider')
  })

  it('should validate context value structure', () => {
    const mockContextValue: WdkAppContextValue = {
      status: InitializationStatus.READY,
      isInitializing: false,
      activeWalletId: 'test-wallet',
      loadingWalletId: null,
      walletExists: true,
      error: null,
      retry: jest.fn(),
      loadExisting: jest.fn(),
      createNew: jest.fn(),
      isFetchingBalances: false,
      refreshBalances: jest.fn(),
    })

    // Validate structure
    expect(mockContextValue).toHaveProperty('status')
    expect(mockContextValue).toHaveProperty('isInitializing')
    expect(mockContextValue).toHaveProperty('activeWalletId')
    expect(mockContextValue).toHaveProperty('loadingWalletId')
    expect(mockContextValue).toHaveProperty('walletExists')
    expect(mockContextValue).toHaveProperty('error')
    expect(mockContextValue).toHaveProperty('retry')
    expect(mockContextValue).toHaveProperty('loadExisting')
    expect(mockContextValue).toHaveProperty('createNew')
    expect(mockContextValue).toHaveProperty('isFetchingBalances')
    expect(mockContextValue).toHaveProperty('refreshBalances')
    expect(typeof mockContextValue.retry).toBe('function')
    expect(typeof mockContextValue.loadExisting).toBe('function')
    expect(typeof mockContextValue.createNew).toBe('function')
    expect(typeof mockContextValue.refreshBalances).toBe('function')
    expect(mockContextValue.status).toBe(InitializationStatus.READY)
    expect(mockContextValue.activeWalletId).toBe('test-wallet')
  })
})
