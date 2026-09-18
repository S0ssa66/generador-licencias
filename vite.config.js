import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      }
    },
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
    modulePreload: {
      // El modal de acceso importa sólo Firebase Auth. Rolldown/Vite veía el
      // grafo futuro del Studio y adelantaba también Firestore y Storage, lo
      // que anulaba la separación del primer toque de "Entrar".
      resolveDependencies(filename, deps) {
        if (filename.includes('auth-')) {
          return deps.filter((dependency) => !/firebase-(?:firestore|storage)-/.test(dependency));
        }
        // El conjunto completo de Lucide se importa de forma dinámica al abrir
        // reproductor o checkout. Rolldown lo incluía como modulepreload de
        // catálogo/tienda por detectar ese import futuro, anulando el ahorro.
        if (filename.includes('public-router-') || filename.includes('public-store-router-')) {
          return deps.filter((dependency) => !/vendor-/.test(dependency));
        }
        return deps;
      }
    },
    rolldownOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        clearance: resolve(import.meta.dirname, 'clearance.html')
      },
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'config',
              test: /[\\/]config\.js$/
            },
            {
              name: 'i18n',
              test: /[\\/]i18n\.js$/
            },
            {
              name: 'firebase-auth',
              test: /node_modules[\\/](?:@firebase|firebase)[\\/](?:auth|auth-compat)[\\/]/
            },
            {
              name: 'firebase-firestore',
              test: /node_modules[\\/](?:@firebase|firebase)[\\/](?:firestore|firestore-compat)[\\/]/
            },
            {
              name: 'firebase-storage',
              test: /node_modules[\\/](?:@firebase|firebase)[\\/](?:storage|storage-compat)[\\/]/
            },
            {
              name: 'firebase-core',
              test: /node_modules[\\/](?:@firebase[\\/]app|firebase[\\/]app)[\\/]/
            },
            {
              name: 'vendor',
              test: /node_modules[\\/](?!(?:@firebase|firebase)[\\/])/
            }
          ]
        }
      }
    }
  }
});
