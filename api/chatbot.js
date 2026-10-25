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

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeAnswers(value) {
  if (!value || typeof value !== 'object') return {};
  const normalized = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof key === 'string' && key.length <= 64) {
      normalized[key] = clean(String(item));
    }
  }
  return normalized;
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

  const { applicationId, source = 'chatbot', name, email, signature, answers, agreementStatus, paymentStatus, approvalStatus, accessStatus } = body;

  const applicantName = clean(name || body.fullName || '');
  const applicantEmail = clean(email || '');
  if (!applicantName) return res.status(400).json({ error: 'Name is required' });
  if (!EMAIL_PATTERN.test(applicantEmail)) return res.status(400).json({ error: 'A valid email is required' });

  const signatureValue =
    typeof signature === 'string' &&
    signature.startsWith('data:image/png;base64,') &&
    signature.length <= MAX_SIGNATURE_LENGTH
      ? signature
      : null;

  const normalizedAnswers = normalizeAnswers(answers || body.data || {});
  const payload = {
    source: clean(source),
    agreementStatus: agreementStatus || 'submitted',
    paymentStatus: paymentStatus || 'pending',
    approvalStatus: approvalStatus || 'pending',
    accessStatus: accessStatus || 'not_authorized',
    ...normalizedAnswers,
  };

  if (!signatureValue && !body.signature) {
    return res.status(400).json({ error: 'A signature is required' });
  }

  try {
    if (applicationId) {
      const [row] = await sql`
        UPDATE applications
        SET name = ${applicantName},
            email = ${applicantEmail},
            data = ${JSON.stringify(payload)}::jsonb,
            signature = COALESCE(${signatureValue}, signature),
            updated_at = NOW()
        WHERE id = ${applicationId}
        RETURNING id
      `;

      if (row) {
        return res.status(200).json({ id: row.id, updated: true });
      }
    }

    const [row] = await sql`
      INSERT INTO applications (name, email, data, signature)
      VALUES (${applicantName}, ${applicantEmail}, ${JSON.stringify(payload)}::jsonb, ${signatureValue || ''})
      RETURNING id
    `;

    return res.status(201).json({ id: row.id, created: true });
  } catch (error) {
    console.error('Failed to save chatbot application:', error);
    return res.status(500).json({ error: 'Could not save application' });
  }
}
