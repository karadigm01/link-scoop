import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/extension/**/*.js', 'scripts/build.mjs'],
      exclude: [
        'build/**',
        'config/blueprints/**',
        'coverage/**',
        'node_modules/**',
        'tests/**'
      ]
    }
  }
});
