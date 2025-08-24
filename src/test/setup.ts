// Test setup file
import { createLogger } from '../utils';

// Set up global test configuration
beforeAll(() => {
  // Reduce logging noise during tests
  const logger = createLogger('Test');
  logger.setLevel('error');
});

// Global test utilities
declare global {
  const testTimeout: number;
  const mockNetworkDelay: (ms?: number) => Promise<void>;
}

(global as unknown as { testTimeout: number }).testTimeout = 30000;

// Mock network delays for testing
(global as unknown as { mockNetworkDelay: (ms?: number) => Promise<void> }).mockNetworkDelay = (ms: number = 100): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};
