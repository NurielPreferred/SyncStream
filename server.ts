import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  // Shared state
  let state = {
    videoId: 'dQw4w9WgXcQ', // Default video
    playing: false,
    currentTime: 0,
    lastUpdated: Date.now(),
  };

  function broadcast(data: any, sender?: WebSocket) {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client !== sender) {
        client.send(message);
      }
    });
  }

  wss.on('connection', (ws) => {
    console.log('New client connected');
    
    // Send current state to new client
    ws.send(JSON.stringify({ type: 'INIT', state }));

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('Received:', message.type);

        switch (message.type) {
          case 'CHANGE_VIDEO':
            state.videoId = message.videoId;
            state.playing = true;
            state.currentTime = 0;
            state.lastUpdated = Date.now();
            broadcast({ type: 'VIDEO_CHANGED', state }, ws);
            break;
          case 'PLAY':
            state.playing = true;
            state.currentTime = message.currentTime;
            state.lastUpdated = Date.now();
            broadcast({ type: 'PLAYED', state }, ws);
            break;
          case 'PAUSE':
            state.playing = false;
            state.currentTime = message.currentTime;
            state.lastUpdated = Date.now();
            broadcast({ type: 'PAUSED', state }, ws);
            break;
          case 'SEEK':
            state.currentTime = message.currentTime;
            state.lastUpdated = Date.now();
            broadcast({ type: 'SEEKED', state }, ws);
            break;
          case 'SYNC_REQUEST':
            ws.send(JSON.stringify({ type: 'SYNC_RESPONSE', state }));
            break;
        }
      } catch (e) {
        console.error('Error parsing message:', e);
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
