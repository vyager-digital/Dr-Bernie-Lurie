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
      amount:        '5.00',
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
