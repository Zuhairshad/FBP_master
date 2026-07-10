/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    // Vite doesn't load .env.local under test mode (by design, for
    // determinism) — supply harmless placeholders so lib/supabase.ts's
    // guard clause doesn't throw. Tests that need controlled behavior mock
    // '../lib/supabase' directly rather than relying on these reaching a
    // real backend.
    env: {
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'test-placeholder-key',
    },
  },
})
