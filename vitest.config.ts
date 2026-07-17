import { defineConfig } from 'vitest/config';
import * as path from 'path';

export default defineConfig({
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    env: {
      DATABASE_URL: 'file:./test.db',
      SESSION_SECRET: 'test-secret',
    },
    // DB tests share one SQLite file — keep them in one worker.
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
