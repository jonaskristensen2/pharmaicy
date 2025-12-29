import OpenAI from 'openai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env') });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function chat(systemPrompt, messages, params = {}) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
    temperature: params.temperature || 1.0,
    max_tokens: params.max_tokens || 150,
    frequency_penalty: params.frequency_penalty || 0,
    presence_penalty: params.presence_penalty || 0
  });

  return response.choices[0].message.content;
}

