/**
 * Tests for TransactionService
 *
 * Tests transaction operations: getting, setting, updating, and managing transaction state
 */

import { TransactionService } from '../../services/transactionService'
import { getWalletStore } from '../../store/walletStore'
import type { Transaction } from '../../types'

// Mock stores
jest.mock('../../store/walletStore', () => ({
  getWalletStore: jest.fn(),
}))

// Sample transaction data for tests
const createMockTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  blockchain: 'ethereum',
  blockNumber: 12345678,
  transactionHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
  transferIndex: 0,
  token: 'USDT',
  amount: '1000000000000000000',
  timestamp: Date.now(),
  transactionIndex: 0,
  logIndex: 0,
  from: '0x1234567890123456789012345678901234567890',
  to: '0x0987654321098765432109876543210987654321',
  ...overrides,
})

describe('TransactionService', () => {
  let mockWalletStore: any

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup mock wallet store
    mockWalletStore = {
      getState: jest.fn(() => ({
        transactions: {},
        transactionLoading: {},
        lastTransactionUpdate: {},
        activeWalletId: 'test-wallet-1',
      })),
      setState: jest.fn(),
    }

    // Setup store mocks
    ;(getWalletStore as jest.Mock).mockReturnValue(mockWalletStore)
  })

  describe('updateTransactions', () => {
    it('should update transactions for a network', () => {
      const transactions = [
        createMockTransaction({ transactionHash: '0xabc', timestamp: 1000 }),
        createMockTransaction({ transactionHash: '0xdef', timestamp: 2000 }),
      ]

      TransactionService.updateTransactions('ethereum', transactions)

      expect(mockWalletStore.setState).toHaveBeenCalled()
      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const prevState = { transactions: {}, lastTransactionUpdate: {}, activeWalletId: 'test-wallet-1' }
      const newState = setStateCall(prevState)

      expect(newState.transactions['test-wallet-1']?.ethereum).toEqual(transactions)
      expect(newState.lastTransactionUpdate['test-wallet-1']?.ethereum).toBeDefined()
    })

    it('should preserve existing transactions for other networks', () => {
      const existingTransactions = [createMockTransaction({ blockchain: 'polygon' })]
      const newTransactions = [createMockTransaction({ blockchain: 'ethereum' })]

      const prevState = {
        transactions: {
          'test-wallet-1': {
            polygon: existingTransactions,
          },
        },
        lastTransactionUpdate: {
          'test-wallet-1': {
            polygon: 1234567890,
          },
        },
        activeWalletId: 'test-wallet-1',
      }

      TransactionService.updateTransactions('ethereum', newTransactions)

      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const newState = setStateCall(prevState)

      expect(newState.transactions['test-wallet-1']?.polygon).toEqual(existingTransactions)
      expect(newState.transactions['test-wallet-1']?.ethereum).toEqual(newTransactions)
    })

    it('should validate network name', () => {
      expect(() => {
        TransactionService.updateTransactions('', [])
      }).toThrow(/Invalid network/)
    })
  })

  describe('updateTransactionsFromMap', () => {
    it('should update transactions from a map', () => {
      const transactionMap = {
        ethereum: [createMockTransaction({ blockchain: 'ethereum' })],
        polygon: [createMockTransaction({ blockchain: 'polygon' })],
      }

      TransactionService.updateTransactionsFromMap(transactionMap)

      expect(mockWalletStore.setState).toHaveBeenCalled()
      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const prevState = { transactions: {}, lastTransactionUpdate: {}, activeWalletId: 'test-wallet-1' }
      const newState = setStateCall(prevState)

      expect(newState.transactions['test-wallet-1']?.ethereum).toEqual(transactionMap.ethereum)
      expect(newState.transactions['test-wallet-1']?.polygon).toEqual(transactionMap.polygon)
      expect(newState.lastTransactionUpdate['test-wallet-1']?.ethereum).toBeDefined()
      expect(newState.lastTransactionUpdate['test-wallet-1']?.polygon).toBeDefined()
    })
  })

  describe('getTransactions', () => {
    it('should get transactions for a network', () => {
      const transactions = [createMockTransaction()]

      mockWalletStore.getState = jest.fn(() => ({
        transactions: {
          'test-wallet-1': {
            ethereum: transactions,
          },
        },
        activeWalletId: 'test-wallet-1',
      }))

      const result = TransactionService.getTransactions('ethereum')
      expect(result).toEqual(transactions)
    })

    it('should return empty array if no transactions found', () => {
      mockWalletStore.getState = jest.fn(() => ({
        transactions: {},
        activeWalletId: 'test-wallet-1',
      }))

      const result = TransactionService.getTransactions('ethereum')
      expect(result).toEqual([])
    })

    it('should validate network name', () => {
      expect(() => {
        TransactionService.getTransactions('')
      }).toThrow(/Invalid network/)
    })
  })

  describe('getAllTransactions', () => {
    it('should get all transactions across networks sorted by timestamp', () => {
      const ethereumTx = createMockTransaction({ blockchain: 'ethereum', timestamp: 3000 })
      const polygonTx1 = createMockTransaction({ blockchain: 'polygon', timestamp: 1000 })
      const polygonTx2 = createMockTransaction({ blockchain: 'polygon', timestamp: 5000 })

      mockWalletStore.getState = jest.fn(() => ({
        transactions: {
          'test-wallet-1': {
            ethereum: [ethereumTx],
            polygon: [polygonTx1, polygonTx2],
          },
        },
        activeWalletId: 'test-wallet-1',
      }))

      const result = TransactionService.getAllTransactions()

      expect(result).toHaveLength(3)
      // Should be sorted by timestamp descending (most recent first)
      expect(result[0].timestamp).toBe(5000)
      expect(result[1].timestamp).toBe(3000)
      expect(result[2].timestamp).toBe(1000)
    })

    it('should return empty array if no transactions', () => {
      mockWalletStore.getState = jest.fn(() => ({
        transactions: {},
        activeWalletId: 'test-wallet-1',
      }))

      const result = TransactionService.getAllTransactions()
      expect(result).toEqual([])
    })
  })

  describe('getTransactionMap', () => {
    it('should get transaction map for wallet', () => {
      const transactionMap = {
        ethereum: [createMockTransaction()],
        polygon: [createMockTransaction()],
      }

      mockWalletStore.getState = jest.fn(() => ({
        transactions: {
          'test-wallet-1': transactionMap,
        },
        activeWalletId: 'test-wallet-1',
      }))

      const result = TransactionService.getTransactionMap()
      expect(result).toEqual(transactionMap)
    })

    it('should return empty object if no transactions', () => {
      mockWalletStore.getState = jest.fn(() => ({
        transactions: {},
        activeWalletId: 'test-wallet-1',
      }))

      const result = TransactionService.getTransactionMap()
      expect(result).toEqual({})
    })
  })

  describe('setTransactionLoading', () => {
    it('should set loading to true', () => {
      TransactionService.setTransactionLoading('ethereum', true)

      expect(mockWalletStore.setState).toHaveBeenCalled()
      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const prevState = { transactionLoading: {}, activeWalletId: 'test-wallet-1' }
      const newState = setStateCall(prevState)

      expect(newState.transactionLoading['test-wallet-1']?.ethereum).toBe(true)
    })

    it('should set loading to false', () => {
      const prevState = {
        transactionLoading: {
          'test-wallet-1': {
            ethereum: true,
          },
        },
        activeWalletId: 'test-wallet-1',
      }

      TransactionService.setTransactionLoading('ethereum', false)

      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const newState = setStateCall(prevState)

      expect(newState.transactionLoading['test-wallet-1']?.ethereum).toBeUndefined()
    })

    it('should validate network name', () => {
      expect(() => {
        TransactionService.setTransactionLoading('', true)
      }).toThrow(/Invalid network/)
    })
  })

  describe('setAllTransactionsLoading', () => {
    it('should set all loading to true', () => {
      TransactionService.setAllTransactionsLoading(true)

      expect(mockWalletStore.setState).toHaveBeenCalled()
      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const prevState = { transactionLoading: {}, activeWalletId: 'test-wallet-1' }
      const newState = setStateCall(prevState)

      expect(newState.transactionLoading['test-wallet-1']?.__all__).toBe(true)
    })

    it('should clear all loading states when set to false', () => {
      const prevState = {
        transactionLoading: {
          'test-wallet-1': {
            ethereum: true,
            polygon: true,
          },
        },
        activeWalletId: 'test-wallet-1',
      }

      TransactionService.setAllTransactionsLoading(false)

      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const newState = setStateCall(prevState)

      expect(newState.transactionLoading['test-wallet-1']).toEqual({})
    })
  })

  describe('isTransactionLoading', () => {
    it('should return true if transaction is loading', () => {
      mockWalletStore.getState = jest.fn(() => ({
        transactionLoading: {
          'test-wallet-1': {
            ethereum: true,
          },
        },
        activeWalletId: 'test-wallet-1',
      }))

      const isLoading = TransactionService.isTransactionLoading('ethereum')
      expect(isLoading).toBe(true)
    })

    it('should return false if transaction is not loading', () => {
      mockWalletStore.getState = jest.fn(() => ({
        transactionLoading: {},
        activeWalletId: 'test-wallet-1',
      }))

      const isLoading = TransactionService.isTransactionLoading('ethereum')
      expect(isLoading).toBe(false)
    })

    it('should validate network name', () => {
      expect(() => {
        TransactionService.isTransactionLoading('')
      }).toThrow(/Invalid network/)
    })
  })

  describe('isAnyTransactionLoading', () => {
    it('should return true if any transaction is loading', () => {
      mockWalletStore.getState = jest.fn(() => ({
        transactionLoading: {
          'test-wallet-1': {
            ethereum: false,
            polygon: true,
          },
        },
        activeWalletId: 'test-wallet-1',
      }))

      const isLoading = TransactionService.isAnyTransactionLoading()
      expect(isLoading).toBe(true)
    })

    it('should return false if no transactions are loading', () => {
      mockWalletStore.getState = jest.fn(() => ({
        transactionLoading: {
          'test-wallet-1': {
            ethereum: false,
            polygon: false,
          },
        },
        activeWalletId: 'test-wallet-1',
      }))

      const isLoading = TransactionService.isAnyTransactionLoading()
      expect(isLoading).toBe(false)
    })

    it('should return false if no loading states exist', () => {
      mockWalletStore.getState = jest.fn(() => ({
        transactionLoading: {},
        activeWalletId: 'test-wallet-1',
      }))

      const isLoading = TransactionService.isAnyTransactionLoading()
      expect(isLoading).toBe(false)
    })
  })

  describe('getLastTransactionUpdate', () => {
    it('should get last transaction update timestamp', () => {
      const timestamp = 1234567890

      mockWalletStore.getState = jest.fn(() => ({
        lastTransactionUpdate: {
          'test-wallet-1': {
            ethereum: timestamp,
          },
        },
        activeWalletId: 'test-wallet-1',
      }))

      const result = TransactionService.getLastTransactionUpdate('ethereum')
      expect(result).toBe(timestamp)
    })

    it('should return null if timestamp not found', () => {
      mockWalletStore.getState = jest.fn(() => ({
        lastTransactionUpdate: {},
        activeWalletId: 'test-wallet-1',
      }))

      const result = TransactionService.getLastTransactionUpdate('ethereum')
      expect(result).toBe(null)
    })

    it('should validate network name', () => {
      expect(() => {
        TransactionService.getLastTransactionUpdate('')
      }).toThrow(/Invalid network/)
    })
  })

  describe('clearTransactions', () => {
    it('should clear transactions for a wallet', () => {
      const prevState = {
        transactions: {
          'test-wallet-1': {
            ethereum: [createMockTransaction()],
          },
          'test-wallet-2': {
            polygon: [createMockTransaction()],
          },
        },
        transactionLoading: {
          'test-wallet-1': { ethereum: true },
          'test-wallet-2': { polygon: true },
        },
        lastTransactionUpdate: {
          'test-wallet-1': { ethereum: 123 },
          'test-wallet-2': { polygon: 456 },
        },
        activeWalletId: 'test-wallet-1',
      }

      TransactionService.clearTransactions()

      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const newState = setStateCall(prevState)

      // Should clear test-wallet-1 data
      expect(newState.transactions['test-wallet-1']).toBeUndefined()
      expect(newState.transactionLoading['test-wallet-1']).toBeUndefined()
      expect(newState.lastTransactionUpdate['test-wallet-1']).toBeUndefined()

      // Should preserve test-wallet-2 data
      expect(newState.transactions['test-wallet-2']).toBeDefined()
      expect(newState.transactionLoading['test-wallet-2']).toBeDefined()
      expect(newState.lastTransactionUpdate['test-wallet-2']).toBeDefined()
    })
  })

  describe('clearAllTransactions', () => {
    it('should clear all transactions', () => {
      TransactionService.clearAllTransactions()

      expect(mockWalletStore.setState).toHaveBeenCalledWith({
        transactions: {},
        transactionLoading: {},
        lastTransactionUpdate: {},
      })
    })
  })

  describe('walletId parameter', () => {
    it('should use provided walletId instead of activeWalletId', () => {
      const transactions = [createMockTransaction()]

      TransactionService.updateTransactions('ethereum', transactions, 'custom-wallet')

      const setStateCall = mockWalletStore.setState.mock.calls[0][0]
      const prevState = { transactions: {}, lastTransactionUpdate: {}, activeWalletId: 'test-wallet-1' }
      const newState = setStateCall(prevState)

      expect(newState.transactions['custom-wallet']?.ethereum).toEqual(transactions)
    })

    it('should get transactions for specific walletId', () => {
      const transactions = [createMockTransaction()]

      mockWalletStore.getState = jest.fn(() => ({
        transactions: {
          'custom-wallet': {
            ethereum: transactions,
          },
        },
        activeWalletId: 'test-wallet-1',
      }))

      const result = TransactionService.getTransactions('ethereum', 'custom-wallet')
      expect(result).toEqual(transactions)
    })
  })
})
