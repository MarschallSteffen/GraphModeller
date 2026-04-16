import { defineConfig } from 'vite'

export default defineConfig({
  base: '/diagrams-tool/',
  test: {
    environment: 'jsdom',
  },
})
