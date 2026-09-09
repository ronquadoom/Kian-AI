import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { handleChat } from './api/chat';

// Load a local `.env` (if present) so the proxy can read provider keys during
// local development. Node 22+ provides loadEnvFile; older Node no-ops here.
try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile('.env');
  }
} catch {
  /* .env is optional */
}

/**
 * Dev-only middleware that emulates the `api/chat.ts` serverless function
 * locally, so the app works end-to-end with `npm run dev` (no Vercel needed).
 * In production this route is served by Vercel directly from `api/chat.ts`.
 */
function apiChatDevMiddleware(): Plugin {
  return {
    name: 'kian-api-chat-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST' || !req.url?.startsWith('/api/chat')) {
          next();
          return;
        }
        try {
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value === undefined) continue;
            if (Array.isArray(value)) headers.set(key, value.join(', '));
            else headers.set(key, value);
          }

          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          const body = Buffer.concat(chunks).toString('utf8');

          const request = new Request('http://kian.local/api/chat', {
            method: 'POST',
            headers,
            body,
          });

          const response = await handleChat(request);

          res.statusCode = response.status;
          for (const [key, value] of response.headers.entries()) res.setHeader(key, value);

          if (response.body) {
            const reader = response.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              res.write(Buffer.from(value));
            }
          }
          res.end();
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: { code: 'internal', message: String(err) } }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiChatDevMiddleware()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // The app is served behind a proxied preview host, so allow any host.
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
});
