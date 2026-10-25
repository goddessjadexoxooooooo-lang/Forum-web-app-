import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FIELD_LENGTH = 5000;

function clean(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_FIELD_LENGTH);
}

function normalizeAnswers(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, clean(String(item || ''))])
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const name = clean(body.name || body.fullName || '');
  const email = clean(body.email || '');
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ error: 'A valid email is required' });

  const signatureValue = typeof body.signature === 'string' && body.signature.startsWith('data:image/png;base64,')
    ? body.signature
    : '';

  const answers = normalizeAnswers(body.answers || {});
  const payload = {
    source: 'chatbot',
    agreementStatus: body.agreementStatus || 'submitted',
    paymentStatus: body.paymentStatus || 'pending',
    approvalStatus: body.approvalStatus || 'pending',
    accessStatus: body.accessStatus || 'not_authorized',
    ...answers,
  };

  try {
    const [row] = await sql`
      INSERT INTO applications (name, email, data, signature)
      VALUES (${name}, ${email}, ${JSON.stringify(payload)}::jsonb, ${signatureValue})
      RETURNING id
    `;

    return res.status(201).json({ id: row.id, source: 'chatbot' });
  } catch (error) {
    console.error('Failed to save chatbot submission:', error);
    return res.status(500).json({ error: 'Could not save chatbot application' });
  }
}
