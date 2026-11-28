import { defineConfig } from 'vitest/config';

// Pruebas de componentes (React Testing Library en jsdom); las del servidor siguen en `node --test`
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
});
