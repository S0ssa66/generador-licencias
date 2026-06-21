import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    watch: {
      ignored: [
        '**/*_backup_sincronizado.json',
        '**/session_memory.json',
        '**/subagent_memories.json',
        '**/temp_audio_cache/**',
        '**/*.pdf'
      ]
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        clearance: resolve(__dirname, 'clearance.html')
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) {
              return 'firebase-vendor';
            }
            return 'vendor';
          }
        }
      }
    }
  }
});
