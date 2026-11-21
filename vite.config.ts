import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Served from https://theodorkirkeby.github.io/Majador/ (GitHub Pages project
// site), so every URL lives under /Majador/. Dev stays at /.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Majador/' : '/',
  plugins: [
    react(),
    VitePWA({
      // Own service worker (src/sw.ts) because it also handles push events.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false, // registered from src/main.tsx
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'MajaDor',
        short_name: 'MajaDor',
        description: 'Maja & Theodors husholdning',
        lang: 'da',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fbf7f1',
        theme_color: '#fbf7f1',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
}))
