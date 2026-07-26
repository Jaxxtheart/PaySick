/**
 * Mock for backend/src/config/database.js
 * Used by integration tests to avoid real DB connections.
 */

const mockQuery = jest.fn();
const mockTransaction = jest.fn();
const mockHealthCheck = jest.fn().mockResolvedValue({ status: 'healthy' });

const mockPool = {
  connect: jest.fn(),
  end: jest.fn(),
  on: jest.fn(),
  query: jest.fn()
};

// Default empty result — individual tests override this as needed.
mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

mockTransaction.mockImplementation(async (callback) => {
  const fakeClient = {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn()
  };
  return callback(fakeClient);
});

module.exports = {
  query: mockQuery,
  transaction: mockTransaction,
  healthCheck: mockHealthCheck,
  pool: mockPool,
  __mockQuery: mockQuery,
  __mockTransaction: mockTransaction,
  __mockHealthCheck: mockHealthCheck
};
