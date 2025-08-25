module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src/test/'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: '<rootDir>/src/test/tsconfig.json'
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/test/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  maxWorkers: 4,
  verbose: true,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
};
