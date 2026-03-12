/**
 * Mock for backend/src/services/email.service.js
 * Prevents real emails being sent during tests.
 */

const sendVerificationEmail = jest.fn().mockResolvedValue({ messageId: 'mock-id' });
const sendPasswordResetEmail = jest.fn().mockResolvedValue({ messageId: 'mock-id' });

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
};
