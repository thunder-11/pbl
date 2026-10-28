import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'local-demo-accounts',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use('/__demo-accounts', async (req, res) => {
          res.setHeader('Cache-Control', 'no-store');
          res.setHeader('Content-Type', 'application/json');
          if (req.method !== 'GET') {
            res.statusCode = 405;
            return res.end('{}');
          }
          try {
            const credentials = JSON.parse(
              await readFile(new URL('../.data/dev-credentials.json', import.meta.url), 'utf8'),
            );
            res.end(
              JSON.stringify({
                accounts: [
                  {
                    role: 'Student',
                    email: 'student-a@example.invalid',
                    password: credentials.studentPassword,
                    description: 'Learn, simulate and practise',
                  },
                  {
                    role: 'Faculty',
                    email: 'faculty-a@example.invalid',
                    password: credentials.facultyPassword,
                    description: 'Review progress and author content',
                  },
                  {
                    role: 'Administrator',
                    email: 'admin@example.invalid',
                    password: credentials.adminPassword,
                    description: 'Manage accounts and learning rules',
                  },
                ],
              }),
            );
          } catch {
            res.statusCode = 404;
            res.end('{}');
          }
        });
      },
    },
  ],
  server: {
    port: 5173,
    fs: {
      strict: true,
      allow: [
        fileURLToPath(new URL('.', import.meta.url)),
        fileURLToPath(new URL('../node_modules', import.meta.url)),
      ],
      deny: ['**/.env*', '**/.data/**', '**/backend/**'],
    },
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
});
