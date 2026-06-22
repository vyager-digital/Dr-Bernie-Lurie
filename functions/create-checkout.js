import { createHash } from 'node:crypto'; // nodejs_compat required

const PAYFAST_URL  = 'https://www.payfast.co.za/onsite/process';
const THANKYOU_URL = 'https://www.herbernie.co.za/hormonal/thankyou.html';
const CANCEL_URL   = 'https://www.herbernie.co.za/hormonal/';
const NOTIFY_URL   = 'https://www.herbernie.co.za/notify';
const SITE_URL     = 'https://www.herbernie.co.za';

const CORS = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  try {
    const { env, request } = context;

    if (!env.PAYFAST_MERCHANT_ID || !env.PAYFAST_MERCHANT_KEY) {
      return respond({ error: 'Server configuration error' }, 500);
    }

    let body = {};
    try { body = await request.json(); } catch {}

    const parts     = (body.name || '').trim().split(' ');
    const nameFirst = parts[0] || 'Patient';
    const nameLast  = parts.slice(1).join(' ') || '';

    const params = new URLSearchParams();
    if (body.name)  params.set('name', body.name);
    if (body.email) params.set('email', body.email);
    const returnUrl = params.toString() ? `${THANKYOU_URL}?${params}` : THANKYOU_URL;

    const data = {
      merchant_id:   env.PAYFAST_MERCHANT_ID,
      merchant_key:  env.PAYFAST_MERCHANT_KEY,
      return_url:    returnUrl,
      cancel_url:    CANCEL_URL,
      notify_url:    NOTIFY_URL,
      name_first:    nameFirst,
      name_last:     nameLast,
      email_address: body.email || 'test@herbernie.co.za',
      m_payment_id:  crypto.randomUUID(),
      amount:        '490.00',
      item_name:     'Hormonal Harmony Consultation',
    };

    if (env.PAYFAST_PASSPHRASE) data.passphrase = env.PAYFAST_PASSPHRASE;
    data.signature = sign(data);
    delete data.passphrase;

    const bodyStr = Object.entries(data)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v).trim())}`)
      .join('&');

    const pfRes = await fetch(PAYFAST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyStr,
    });

    const text = await pfRes.text();

    const safePayload = bodyStr.replace(/merchant_key=[^&]+/, 'merchant_key=REDACTED');
    if (!pfRes.ok) return respond({ error: 'Payfast error', status: pfRes.status, sent: safePayload }, 500);

    let json;
    try { json = JSON.parse(text); } catch { return respond({ error: 'Bad Payfast response', raw: text }, 500); }

    if (!json.uuid) return respond({ error: 'No UUID', result: json }, 500);

    // Fire-and-forget — must never block or fail the checkout response
    context.waitUntil(notifyAttempt(env, body).catch(() => {}));

    return respond({ uuid: json.uuid }, 200);

  } catch (e) {
    return respond({ error: 'Worker error', message: e.message }, 500);
  }
}

function respond(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

const FIELD_ORDER = [
  'merchant_id','merchant_key','return_url','cancel_url','notify_url',
  'name_first','name_last','email_address','cell_number',
  'm_payment_id','amount','item_name','item_description',
  'custom_int1','custom_int2','custom_int3','custom_int4','custom_int5',
  'custom_str1','custom_str2','custom_str3','custom_str4','custom_str5',
  'email_confirmation','confirmation_address','currency','payment_method','passphrase',
];

function pfEncode(v) {
  return encodeURIComponent(String(v).trim()).replace(/%20/g, '+');
}

function sign(data) {
  const str = FIELD_ORDER
    .filter(k => data[k] !== undefined && data[k] !== '')
    .map(k => `${k}=${pfEncode(data[k])}`)
    .join('&');
  return createHash('md5').update(str).digest('hex');
}

async function notifyAttempt(env, body) {
  if (!env.RESEND_API_KEY) return;

  const esc   = s => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const name  = esc((body.name || '').trim() || '—');
  const email = esc((body.email || '').trim() || '—');
  const time  = new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' });

  const rows = [
    ['Name', name],
    ['Email', email],
    ['Amount', 'R490.00'],
    ['Time', `${time} (SAST)`],
    ['Status', 'Clicked Confirm My Booking — PayFast checkout opened. If no payment appears in PayFast, the modal was closed without paying.'],
  ].map(([label, value]) => `
    <tr>
      <td style="padding:6px 12px 6px 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#6e5a54; font-weight:700; vertical-align:top; white-space:nowrap;">${label}</td>
      <td style="padding:6px 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#3a2528;">${value}</td>
    </tr>`).join('');

  const subject = `Payment attempt — ${(body.name || '').trim() || 'Unknown'}`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(subject)}</title>
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
              <h1 style="font-family:Georgia, serif; font-size:18px; color:#3a2528; margin:0 0 16px;">${esc(subject)}</h1>
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
                ${rows}
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:    'Herbernie Hormonal Quiz <notifications@send.herbernie.co.za>',
      to:      ['hello@vyager.co', 'info@herbernie.co.za'],
      subject,
      html,
    }),
  });
}
