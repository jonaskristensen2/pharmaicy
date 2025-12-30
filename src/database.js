import pg from 'pg';

const { Pool } = pg;

let pool = null;

export async function initDatabase() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.log('No DATABASE_URL found, using in-memory storage');
    return false;
  }
  
  pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  // Create tables if they don't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      prompt TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      message_count INTEGER DEFAULT 0
    )
  `);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
      speaker TEXT,
      content TEXT,
      color TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  console.log('Database connected and tables ready');
  return true;
}

export async function saveConversation(prompt, messages) {
  if (!pool) return null;
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Insert conversation
    const convResult = await client.query(
      'INSERT INTO conversations (prompt, message_count) VALUES ($1, $2) RETURNING id',
      [prompt, messages.length]
    );
    const conversationId = convResult.rows[0].id;
    
    // Insert messages
    for (const msg of messages) {
      await client.query(
        'INSERT INTO messages (conversation_id, speaker, content, color) VALUES ($1, $2, $3, $4)',
        [conversationId, msg.speaker, msg.content, msg.color]
      );
    }
    
    await client.query('COMMIT');
    return conversationId;
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Error saving conversation:', e);
    return null;
  } finally {
    client.release();
  }
}

export async function getConversationsList() {
  if (!pool) return [];
  
  const result = await pool.query(`
    SELECT id, prompt, created_at as timestamp, message_count as "messageCount"
    FROM conversations
    ORDER BY created_at DESC
  `);
  
  return result.rows;
}

export async function getConversation(id) {
  if (!pool) return null;
  
  const convResult = await pool.query(
    'SELECT id, prompt, created_at as timestamp, message_count as "messageCount" FROM conversations WHERE id = $1',
    [id]
  );
  
  if (convResult.rows.length === 0) return null;
  
  const messagesResult = await pool.query(
    'SELECT speaker, content, color FROM messages WHERE conversation_id = $1 ORDER BY id',
    [id]
  );
  
  return {
    ...convResult.rows[0],
    messages: messagesResult.rows
  };
}

export function isConnected() {
  return pool !== null;
}

