import { defineConfig } from 'vite'

export default defineConfig({
  base: '/Archetype/',
  test: {
    environment: 'jsdom',
  },
})
