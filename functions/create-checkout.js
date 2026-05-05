const YOCO_CHECKOUT_URL = 'https://payments.yoco.com/api/checkouts';
const THANKYOU_URL = 'https://www.herbernie.co.za/thankyou';
const SITE_URL = 'https://www.herbernie.co.za';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': SITE_URL,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.YOCO_SECRET_KEY) {
    return jsonError('Server configuration error', 500);
  }

  let body = {};
  try { body = await request.json(); } catch {}

  const successParams = new URLSearchParams();
  if (body.name)  successParams.set('name', body.name);
  if (body.email) successParams.set('email', body.email);
  const successUrl = successParams.toString() ? `${THANKYOU_URL}?${successParams}` : THANKYOU_URL;

  const payload = {
    amount: 500, // TEST: R5.00 — change to 49000 (R490.00) before going live
    currency: 'ZAR',
    successUrl,
    cancelUrl: SITE_URL,
    failureUrl: SITE_URL,
  };

  if (body.name || body.email) {
    payload.metadata = {
      patient_name: body.name || '',
      patient_email: body.email || '',
    };
  }

  let yocoRes;
  try {
    yocoRes = await fetch(YOCO_CHECKOUT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.YOCO_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return jsonError('Failed to reach payment provider', 502);
  }

  if (!yocoRes.ok) {
    let details;
    try { details = await yocoRes.json(); } catch {}
    return jsonError('Payment creation failed', 502, { yocoStatus: yocoRes.status, yocoBody: details });
  }

  const data = await yocoRes.json();

  return new Response(JSON.stringify({ redirectUrl: data.redirectUrl }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function jsonError(message, status, details) {
  const body = details ? { error: message, details } : { error: message };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
