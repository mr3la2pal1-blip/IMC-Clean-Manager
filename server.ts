import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {registerRoutes} from './server/routes.ts';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 10000;

  app.set('trust proxy', true);
  app.use(express.json({limit: '256kb'}));

  registerRoutes(app);

  const distPath = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' || fs.existsSync(distPath);

  if (!isProd || !fs.existsSync(distPath)) {
    const {createServer: createViteServer} = await import('vite');
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: isHmrDisabled ? false : {server: httpServer},
      },
      plugins: [
        {
          name: 'disable-hmr-client-ws',
          enforce: 'post',
          transform(code, id) {
            if (isHmrDisabled && id.includes('vite/dist/client/client.mjs')) {
              return code.replace(
                'transport.connect(createHMRHandler(handleMessage));',
                '/* HMR WebSocket disabled */',
              );
            }
          },
        },
      ],
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`IMC Clean Manager server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
