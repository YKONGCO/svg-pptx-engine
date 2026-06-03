module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  moduleNameMapper: {
    // mock pptxgenjs so tests don't need the real binary
    '^pptxgenjs$': '<rootDir>/tests/__mocks__/pptxgenjs.ts',
    // mathml2omml@0.5.0 ships ESM only at its default `main` entry, which
    // Jest's CJS runtime cannot load. The package also bundles a CJS build
    // at `dist/index.cjs.js`; map every import to that file.
    '^mathml2omml$': '<rootDir>/node_modules/mathml2omml/dist/index.cjs.js'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  }
}
