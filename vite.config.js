// vite.config.js（修改后）
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],

  root: 'src/renderer',

  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/renderer/index.html'),
        preload: path.resolve(__dirname, 'src/preload.js')
      },
      output: {
        entryFileNames: '[name].js' // → dist/preload.js
      }
      // ✂️ 删除 external 行！
    }
  },

  server: {
    port: 5173,
    strictPort: true
  },

  define: {
    'global': 'globalThis',
    'process.platform': '"browser"'
  },

  resolve: {
    alias: {
      'vs': path.resolve(__dirname, 'node_modules/monaco-editor/min/vs')
    }
  }
});