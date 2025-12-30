import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import dotenv from 'dotenv';
import { Backrooms } from './src/backrooms.js';
import { getRandomPrompt } from './src/prompts.js';
import * as db from './src/database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files
app.use(express.static(join(__dirname, 'public')));

// Config
const MAX_MESSAGES = 100;
const CONVERSATIONS_DIR = join(__dirname, 'conversations');
const ADMIN_KEY = process.env.ADMIN_KEY || 'stop123';

// Ensure conversations directory exists (fallback)
if (!existsSync(CONVERSATIONS_DIR)) {
  mkdirSync(CONVERSATIONS_DIR);
}

// Global state
let backrooms = new Backrooms();
let currentConversation = null;
let conversationRunning = false;
let clients = new Set();
let useDatabase = false;

// File-based storage (fallback)
function getConversationsListFile() {
  const indexPath = join(CONVERSATIONS_DIR, 'index.json');
  if (existsSync(indexPath)) {
    return JSON.parse(readFileSync(indexPath, 'utf8'));
  }
  return [];
}

function saveConversationsListFile(list) {
  const indexPath = join(CONVERSATIONS_DIR, 'index.json');
  writeFileSync(indexPath, JSON.stringify(list, null, 2));
}

function saveConversationFile(conversation) {
  const id = Date.now().toString();
  const filename = `${id}.json`;
  
  const data = {
    id,
    prompt: conversation.prompt,
    messages: conversation.messages,
    timestamp: new Date().toISOString(),
    messageCount: conversation.messages.length
  };
  
  writeFileSync(join(CONVERSATIONS_DIR, filename), JSON.stringify(data, null, 2));
  
  const list = getConversationsListFile();
  list.unshift({
    id,
    prompt: conversation.prompt,
    timestamp: data.timestamp,
    messageCount: data.messageCount
  });
  
  if (list.length > 50) list.pop();
  saveConversationsListFile(list);
  
  return id;
}

function getConversationFile(id) {
  const filepath = join(CONVERSATIONS_DIR, `${id}.json`);
  if (existsSync(filepath)) {
    return JSON.parse(readFileSync(filepath, 'utf8'));
  }
  return null;
}

// Unified storage functions
async function getConversationsList() {
  if (useDatabase) {
    return await db.getConversationsList();
  }
  return getConversationsListFile();
}

async function saveConversation(conversation) {
  if (useDatabase) {
    return await db.saveConversation(conversation.prompt, conversation.messages);
  }
  return saveConversationFile(conversation);
}

async function getConversation(id) {
  if (useDatabase) {
    return await db.getConversation(id);
  }
  return getConversationFile(id);
}

// API endpoints
const agentColors = {
  COCAINE: '#ff6b6b',
  WEED: '#7bed9f',
  AYAHUASCA: '#a55eea',
  KETAMINE: '#74b9ff',
  ALCOHOL: '#ffeaa7'
};

app.get('/api/conversations', async (req, res) => {
  try {
    const list = await getConversationsList();
    
    // Add dominant speaker and color to each conversation
    const enriched = await Promise.all(list.map(async (conv) => {
      const full = await getConversation(conv.id);
      if (full && full.messages) {
        const counts = {};
        for (const msg of full.messages) {
          if (msg.speaker !== 'PROMPT') {
            counts[msg.speaker] = (counts[msg.speaker] || 0) + 1;
          }
        }
        const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
        if (dominant) {
          conv.dominantSpeaker = dominant[0];
          conv.dominantColor = agentColors[dominant[0]] || '#888';
        }
      }
      return conv;
    }));
    
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: 'Failed to get conversations' });
  }
});

app.get('/api/conversations/:id', async (req, res) => {
  try {
    const conversation = await getConversation(req.params.id);
    if (conversation) {
      res.json(conversation);
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  } catch (e) {
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

app.get('/api/current', (req, res) => {
  if (currentConversation) {
    res.json({
      prompt: currentConversation.prompt,
      messages: backrooms.messages,
      running: conversationRunning
    });
  } else {
    res.json({ prompt: null, messages: [], running: false });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const conversations = await getConversationsList();
    let totalMessages = 0;
    const byAgent = {
      COCAINE: 0,
      WEED: 0,
      AYAHUASCA: 0,
      KETAMINE: 0,
      ALCOHOL: 0
    };
    
    // Count from all saved conversations
    for (const conv of conversations) {
      const full = await getConversation(conv.id);
      if (full && full.messages) {
        for (const msg of full.messages) {
          if (msg.speaker !== 'PROMPT') {
            totalMessages++;
            if (byAgent.hasOwnProperty(msg.speaker)) {
              byAgent[msg.speaker]++;
            }
          }
        }
      }
    }
    
    // Add current conversation
    if (backrooms.messages) {
      for (const msg of backrooms.messages) {
        if (msg.speaker !== 'PROMPT') {
          totalMessages++;
          if (byAgent.hasOwnProperty(msg.speaker)) {
            byAgent[msg.speaker]++;
          }
        }
      }
    }
    
    res.json({ totalMessages, byAgent });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// Admin endpoints
app.get('/api/admin/stop', (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Invalid key' });
  }
  conversationRunning = false;
  console.log('Conversation stopped by admin');
  res.json({ status: 'stopped', message: 'Conversation paused' });
});

app.get('/api/admin/start', (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Invalid key' });
  }
  
  if (!conversationRunning) {
    if (currentConversation && backrooms.messages.length > 0) {
      conversationRunning = true;
      runConversation();
      console.log('Conversation resumed by admin');
      res.json({ status: 'resumed', message: 'Conversation resumed' });
    } else {
      startNewConversation();
      console.log('New conversation started by admin');
      res.json({ status: 'started', message: 'New conversation started' });
    }
  } else {
    res.json({ status: 'already_running', message: 'Conversation already running' });
  }
});

app.get('/api/admin/status', (req, res) => {
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Invalid key' });
  }
  
  res.json({
    running: conversationRunning,
    messageCount: backrooms.messages.length,
    maxMessages: MAX_MESSAGES,
    clients: clients.size,
    storage: useDatabase ? 'postgresql' : 'file'
  });
});

// Broadcast to all clients
function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(data);
    }
  });
}

// Start a new conversation
async function startNewConversation() {
  const prompt = getRandomPrompt();
  
  currentConversation = {
    prompt,
    messages: [],
    startedAt: Date.now()
  };
  
  backrooms = new Backrooms();
  await backrooms.start(prompt);
  conversationRunning = true;
  
  broadcast({ type: 'new_conversation', prompt });
  broadcast({ type: 'message', data: backrooms.messages[0] });
  
  console.log(`New conversation started: "${prompt}"`);
  
  runConversation();
}

// Run conversation loop
async function runConversation() {
  while (conversationRunning && backrooms.messages.length < MAX_MESSAGES) {
    try {
      const thinkDelay = 500 + Math.random() * 1500;
      await sleep(thinkDelay);
      
      if (!conversationRunning) break;
      
      const message = await backrooms.generateNext();
      broadcast({ type: 'message', data: message });
      
      const wordCount = message.content.split(' ').length;
      const typingTime = wordCount * 50;
      const pauseAfter = 1000 + Math.random() * 2000;
      await sleep(typingTime + pauseAfter);
      
    } catch (error) {
      console.error('Conversation error:', error);
      await sleep(5000);
    }
  }
  
  if (backrooms.messages.length >= MAX_MESSAGES) {
    console.log('Conversation reached max messages, saving...');
    
    const savedId = await saveConversation({
      prompt: currentConversation.prompt,
      messages: backrooms.messages
    });
    
    broadcast({ type: 'conversation_ended', id: savedId });
    
    await sleep(5000);
    startNewConversation();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// WebSocket connections
wss.on('connection', (ws) => {
  console.log('Client connected');
  clients.add(ws);
  
  if (currentConversation) {
    ws.send(JSON.stringify({ 
      type: 'current_state',
      prompt: currentConversation.prompt,
      messages: backrooms.messages
    }));
  }
  
  ws.on('close', () => {
    console.log('Client disconnected');
    clients.delete(ws);
  });
});

// Start server
const PORT = process.env.PORT || 3000;

async function start() {
  // Try to connect to database
  useDatabase = await db.initDatabase();
  
  server.listen(PORT, () => {
    console.log(`The Pharmaicy is open on http://localhost:${PORT}`);
    console.log(`Storage: ${useDatabase ? 'PostgreSQL' : 'File-based'}`);
    
    startNewConversation();
  });
}

start();
