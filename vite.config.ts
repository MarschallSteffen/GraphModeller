import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/Archetype/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // we supply our own public/manifest.webmanifest
      workbox: {
        // Precache all build assets so the app works fully offline
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,json}'],
        // Don't cache example files that may be large / updated
        globIgnores: ['**/examples/**'],
        runtimeCaching: [
          {
            // Cache the example diagram on first use
            urlPattern: /\/Archetype\/examples\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'archetype-examples',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: {
        // Enable SW in dev so you can test the install prompt locally
        enabled: false,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
  },
})
