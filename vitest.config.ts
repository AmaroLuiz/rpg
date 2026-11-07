import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'motor',
          include: ['packages/*/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'banco',
          include: ['supabase/test/**/*.test.ts'],
          globalSetup: ['supabase/test/global-setup.ts'],
          fileParallelism: false,
          testTimeout: 20000,
          hookTimeout: 60000,
        },
      },
    ],
  },
});
