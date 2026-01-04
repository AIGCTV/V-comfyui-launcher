import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Crucial for Electron: ensures assets are loaded relatively
  server: {
    port: 5173,
    host: true, // Bind to all interfaces (0.0.0.0) to ensure accessibility
    strictPort: true, // Fail if port is already in use
    open: false // Electron opens the window, not Vite
  },
  build: {
    // Production optimizations
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true
      },
      mangle: true
    },
    sourcemap: false, // Disable sourcemaps for security
    rollupOptions: {
      output: {
        // Consistent chunk naming for better caching
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  }
})