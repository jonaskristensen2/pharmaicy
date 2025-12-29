import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { Backrooms } from './src/backrooms.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files
app.use(express.static(join(__dirname, 'public')));

// Store active backrooms sessions
const sessions = new Map();

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  const backrooms = new Backrooms();
  const sessionId = Date.now().toString();
  sessions.set(sessionId, backrooms);

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'start':
          // Start a new conversation
          backrooms.clear();
          const startMsg = await backrooms.start(message.prompt);
          ws.send(JSON.stringify({ type: 'message', data: startMsg }));
          
          // Begin the conversation loop
          runConversation(ws, backrooms);
          break;
          
        case 'stop':
          backrooms.stop();
          ws.send(JSON.stringify({ type: 'stopped' }));
          break;
          
        case 'continue':
          if (!backrooms.isRunning) {
            backrooms.isRunning = true;
            runConversation(ws, backrooms);
          }
          break;
      }
    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    backrooms.stop();
    sessions.delete(sessionId);
  });
});

async function runConversation(ws, backrooms) {
  while (backrooms.isRunning) {
    try {
      // Random delay between messages (1-4 seconds)
      const delay = 1000 + Math.random() * 3000;
      await sleep(delay);
      
      if (!backrooms.isRunning) break;
      
      const message = await backrooms.generateNext();
      ws.send(JSON.stringify({ type: 'message', data: message }));
      
    } catch (error) {
      console.error('Conversation error:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
      backrooms.stop();
      break;
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`The Pharmaicy is open on http://localhost:${PORT}`);
});

