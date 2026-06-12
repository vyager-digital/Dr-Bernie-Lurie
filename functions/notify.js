import { createHash } from 'node:crypto'; // nodejs_compat required

const VALIDATE_URL    = 'https://www.payfast.co.za/eng/query/validate';
const EXPECTED_AMOUNT = '490.00';

export async function onRequestPost(context) {
  const { env, request } = context;
  const raw = await request.text();
  // PayFast only needs a 200 — body is ignored, so it can carry diagnostics
  let result;
  try {
    result = await processItn(env, raw);
  } catch (e) {
    result = `error: ${e.message}`;
  }
  return new Response(result || 'OK', { status: 200 });
}

async function processItn(env, raw) {
  if (!env.RESEND_API_KEY) return 'no api key';

  const params = new URLSearchParams(raw);
  const get    = k => (params.get(k) || '').trim();

  const status = get('payment_status') || 'UNKNOWN';
  const name   = `${get('name_first')} ${get('name_last')}`.trim() || '—';
  const amount = get('amount_gross');

  const sigOk       = verifySignature(params, env.PAYFAST_PASSPHRASE);
  const serverCheck = await serverValidate(raw);
  const amountOk    = amount === EXPECTED_AMOUNT;

  const verification = [
    sigOk ? 'Signature valid' : '⚠ Signature check FAILED',
    serverCheck === 'VALID' ? 'PayFast server-confirmed' : `⚠ Server confirmation: ${serverCheck}`,
  ].join(' · ');

  const time = new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' });

  const rows = [
    ['Name', esc(name)],
    ['Email', esc(get('email_address') || '—')],
    ['Amount', `R${esc(amount || '—')}${amountOk ? '' : ' ⚠ expected R' + EXPECTED_AMOUNT}`],
    ['Status', esc(status)],
    ['PayFast ID', esc(get('pf_payment_id') || '—')],
    ['Time', `${time} (SAST)`],
    ['Verification', esc(verification)],
  ];

  const subject = status === 'COMPLETE'
    ? `Payment received — ${name} (R${amount})`
    : `Payment ${status} — ${name}`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    'Herbernie Hormonal Quiz <notifications@send.herbernie.co.za>',
      to:      ['hello@vyager.co', 'info@herbernie.co.za'],
      subject,
      html:    buildHtml(subject, rows),
    }),
  });

  return res.ok ? 'OK' : `resend ${res.status}: ${(await res.text()).slice(0, 200)}`;
}

function verifySignature(params, passphrase) {
  const pairs = [];
  for (const [k, v] of params.entries()) {
    if (k === 'signature') continue;
    pairs.push(`${k}=${pfEncode(v)}`);
  }
  let str = pairs.join('&');
  if (passphrase) str += `&passphrase=${pfEncode(passphrase)}`;
  return createHash('md5').update(str).digest('hex') === (params.get('signature') || '');
}

async function serverValidate(raw) {
  try {
    const res = await fetch(VALIDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: raw,
    });
    return (await res.text()).trim() === 'VALID' ? 'VALID' : 'INVALID';
  } catch {
    return 'UNREACHABLE';
  }
}

function pfEncode(v) {
  return encodeURIComponent(String(v).trim()).replace(/%20/g, '+');
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function buildHtml(title, rows) {
  const rowsHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:6px 12px 6px 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#6e5a54; font-weight:700; vertical-align:top; white-space:nowrap;">${label}</td>
      <td style="padding:6px 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#3a2528;">${value}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
</head>
<body style="margin:0; padding:0; background:#f2ddd5; font-family:Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2ddd5; padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background:#fdf8f5; border-radius:14px; overflow:hidden;">
          <tr>
            <td style="padding:20px 28px; border-bottom:1px solid #ead0c8;">
              <div style="font-family:Georgia, serif; font-size:16px; font-weight:700; color:#a05c4e;">Hormonal Harmony Quiz</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px;">
              <h1 style="font-family:Georgia, serif; font-size:18px; color:#3a2528; margin:0 0 16px;">${esc(title)}</h1>
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
                ${rowsHtml}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
