import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const MAX_FIELD_LENGTH = 5000;
const MAX_SIGNATURE_LENGTH = 1_500_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).slice(0, 50);
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_FIELD_LENGTH);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { signature, ...fields } = body;
  const data = {};
  for (const [key, value] of Object.entries(fields)) {
    if (/^[a-zA-Z0-9_]{1,64}$/.test(key)) data[key] = clean(value);
  }

  const name = data.name || '';
  const email = data.email || '';
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ error: 'A valid email is required' });

  const signatureValue =
    typeof signature === 'string' &&
    signature.startsWith('data:image/png;base64,') &&
    signature.length <= MAX_SIGNATURE_LENGTH
      ? signature
      : null;
  if (!signatureValue) return res.status(400).json({ error: 'A signature is required' });

  try {
    const [row] = await sql`
      INSERT INTO applications (name, email, data, signature)
      VALUES (${name}, ${email}, ${JSON.stringify(data)}::jsonb, ${signatureValue})
      RETURNING id
    `;
    return res.status(201).json({ id: row.id });
  } catch (error) {
    console.error('Failed to save application:', error);
    return res.status(500).json({ error: 'Could not save application' });
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
