import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Unit and integration tests run the ordinary production configuration:
  // fixture parameters do not exist for them either.
  define: {
    __TEST_FIXTURES__: 'false',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: ['default'],
  },
});
