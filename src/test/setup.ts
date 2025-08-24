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
  var testTimeout: number;
  var mockNetworkDelay: (ms?: number) => Promise<void>;
}

(global as any).testTimeout = 30000;

// Mock network delays for testing
(global as any).mockNetworkDelay = (ms: number = 100) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};
