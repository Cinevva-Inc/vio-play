import legacy from '@vitejs/plugin-legacy'
import { fileURLToPath, URL } from "url";
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { defineConfig } from 'vite'
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import mkcert from 'vite-plugin-mkcert'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    legacy(),
    wasm(),
    topLevelAwait(),
    mkcert()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@public': path.resolve(__dirname, '/public'),
    // }, {
    //   find: '@public', replacement: fileURLToPath(new URL('public/', import.meta.url))
    },
  },
  test: {
    globals: true,
    environment: 'jsdom'
  },
  server: {
    port: 8080,
    hmr: {
      overlay: true
    },
  },
  base: './'
})
