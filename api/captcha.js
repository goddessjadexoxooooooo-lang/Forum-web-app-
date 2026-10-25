// Cloudflare's official always-pass test keys, used only outside production
// until real keys are added.
export const TEST_SITE_KEY = '1x00000000000000000000AA';
export const TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';

const isProduction = process.env.VERCEL_ENV === 'production';

export function getSiteKey() {
  return process.env.TURNSTILE_SITE_KEY || (isProduction ? null : TEST_SITE_KEY);
}

export function getSecretKey() {
  return process.env.TURNSTILE_SECRET_KEY || (isProduction ? null : TEST_SECRET_KEY);
}

export async function verifyCaptcha(token, remoteIp) {
  const secret = getSecretKey();
  if (!secret || typeof token !== 'string' || !token || token.length > 2048) return false;

  const params = new URLSearchParams({ secret, response: token });
  if (remoteIp) params.set('remoteip', remoteIp);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: params,
    });
    const result = await res.json();
    return result.success === true;
  } catch (error) {
    console.error('Captcha verification failed:', error);
    return false;
  }
}

export default function handler(req, res) {
  const siteKey = getSiteKey();
  if (!siteKey) return res.status(503).json({ error: 'Captcha is not configured' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ siteKey });
}
