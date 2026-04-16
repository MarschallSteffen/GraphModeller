import { defineConfig } from 'vite'

export default defineConfig({
  base: '/GraphModeller/',
  test: {
    environment: 'jsdom',
  },
})
