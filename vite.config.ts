import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Served from https://theodorkirkeby.github.io/Majador/ (GitHub Pages project
// site), so every URL lives under /Majador/ (also in `vite preview`). Dev stays at /.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/Majador/' : '/',
  plugins: [
    react(),
    VitePWA({
      // Own service worker (src/sw.ts) because it also handles push events.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false, // registered from src/main.tsx
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'badge-96.png'],
      manifest: {
        name: 'MajaDor',
        short_name: 'MajaDor',
        description: 'Maja & Theodors husholdning',
        lang: 'da',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4faf5',
        theme_color: '#f4faf5',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
}))
