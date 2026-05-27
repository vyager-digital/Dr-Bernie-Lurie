const PAYFAST_PROCESS_URL = 'https://www.payfast.co.za/onsite/process';
const THANKYOU_URL = 'https://www.herbernie.co.za/hormonal/thankyou.html';
const CANCEL_URL   = 'https://www.herbernie.co.za/hormonal/';
const NOTIFY_URL   = 'https://www.herbernie.co.za/notify';
const SITE_URL     = 'https://www.herbernie.co.za';

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

  if (!env.PAYFAST_MERCHANT_ID || !env.PAYFAST_MERCHANT_KEY) {
    return jsonError('Server configuration error', 500);
  }

  let body = {};
  try { body = await request.json(); } catch {}

  const nameParts = (body.name || '').trim().split(' ');
  const nameFirst = nameParts[0] || 'Patient';
  const nameLast  = nameParts.slice(1).join(' ') || '';

  const successParams = new URLSearchParams();
  if (body.name)  successParams.set('name', body.name);
  if (body.email) successParams.set('email', body.email);
  const returnUrl = successParams.toString()
    ? `${THANKYOU_URL}?${successParams}`
    : THANKYOU_URL;

  // Build payment data in the exact field order Payfast expects for signature
  const data = {
    merchant_id:   env.PAYFAST_MERCHANT_ID,
    merchant_key:  env.PAYFAST_MERCHANT_KEY,
    return_url:    returnUrl,
    cancel_url:    CANCEL_URL,
    notify_url:    NOTIFY_URL,
    name_first:    nameFirst,
    name_last:     nameLast,
    email_address: body.email || '',
    m_payment_id:  crypto.randomUUID(),
    amount:        '1.00', // R1 TEST — change to '490.00' for live
    item_name:     'Hormonal Harmony Consultation',
  };

  // Add passphrase if configured
  if (env.PAYFAST_PASSPHRASE) {
    data.passphrase = env.PAYFAST_PASSPHRASE;
  }

  data.signature = generateSignature(data);

  // Remove passphrase before posting — it's only used for signature
  delete data.passphrase;

  // Encode as application/x-www-form-urlencoded
  const pfParamString = Object.entries(data)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v.trim())}`)
    .join('&');

  let pfRes;
  try {
    pfRes = await fetch(PAYFAST_PROCESS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: pfParamString,
    });
  } catch {
    return jsonError('Failed to reach payment provider', 502);
  }

  if (!pfRes.ok) {
    let details;
    try { details = await pfRes.text(); } catch {}
    return jsonError('Payment creation failed', 502, { pfStatus: pfRes.status, pfBody: details });
  }

  const result = await pfRes.json();

  if (!result.uuid) {
    return jsonError('No payment identifier received', 502);
  }

  return new Response(JSON.stringify({ uuid: result.uuid }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function generateSignature(data) {
  // Field order as defined by Payfast — only include fields present in data
  const fieldOrder = [
    'merchant_id', 'merchant_key', 'return_url', 'cancel_url', 'notify_url',
    'name_first', 'name_last', 'email_address', 'cell_number',
    'm_payment_id', 'amount', 'item_name', 'item_description',
    'custom_int1', 'custom_int2', 'custom_int3', 'custom_int4', 'custom_int5',
    'custom_str1', 'custom_str2', 'custom_str3', 'custom_str4', 'custom_str5',
    'email_confirmation', 'confirmation_address', 'currency', 'payment_method',
    'passphrase',
  ];

  const pfOutput = fieldOrder
    .filter(key => data[key] !== undefined && data[key] !== '')
    .map(key => `${key}=${encodeURIComponent(data[key].trim())}`)
    .join('&');

  return md5(pfOutput);
}

// MD5 implementation for Cloudflare Workers (no Node crypto available)
function md5(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);

  function safeAdd(x, y) {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }
  function bitRotateLeft(num, cnt) { return (num << cnt) | (num >>> (32 - cnt)); }
  function md5cmn(q, a, b, x, s, t) { return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b); }
  function md5ff(a, b, c, d, x, s, t) { return md5cmn((b & c) | (~b & d), a, b, x, s, t); }
  function md5gg(a, b, c, d, x, s, t) { return md5cmn((b & d) | (c & ~d), a, b, x, s, t); }
  function md5hh(a, b, c, d, x, s, t) { return md5cmn(b ^ c ^ d, a, b, x, s, t); }
  function md5ii(a, b, c, d, x, s, t) { return md5cmn(c ^ (b | ~d), a, b, x, s, t); }

  const len8 = data.length;
  const len32 = len8 >> 2;
  const tail = len8 & 3;
  const extra = new Uint8Array(64);

  for (let i = 0; i < len8; i++) extra[i & 63] = data[i];

  // Build 32-bit words from bytes
  function getWords(bytes) {
    const words = new Int32Array(Math.ceil((bytes.length + 9) / 64) * 16);
    for (let i = 0; i < bytes.length; i++) {
      words[i >> 2] |= bytes[i] << ((i & 3) * 8);
    }
    words[bytes.length >> 2] |= 0x80 << ((bytes.length & 3) * 8);
    words[words.length - 2] = bytes.length * 8;
    return words;
  }

  const m = getWords(data);
  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

  for (let i = 0; i < m.length; i += 16) {
    const [aa, bb, cc, dd] = [a, b, c, d];
    a = md5ff(a,b,c,d,m[i+0],7,-680876936);   b = md5ff(d,a,b,c,m[i+1],12,-389564586);
    c = md5ff(c,d,a,b,m[i+2],17,606105819);   d = md5ff(b,c,d,a,m[i+3],22,-1044525330);
    a = md5ff(a,b,c,d,m[i+4],7,-176418897);   b = md5ff(d,a,b,c,m[i+5],12,1200080426);
    c = md5ff(c,d,a,b,m[i+6],17,-1473231341); d = md5ff(b,c,d,a,m[i+7],22,-45705983);
    a = md5ff(a,b,c,d,m[i+8],7,1770035416);   b = md5ff(d,a,b,c,m[i+9],12,-1958414417);
    c = md5ff(c,d,a,b,m[i+10],17,-42063);     d = md5ff(b,c,d,a,m[i+11],22,-1990404162);
    a = md5ff(a,b,c,d,m[i+12],7,1804603682);  b = md5ff(d,a,b,c,m[i+13],12,-40341101);
    c = md5ff(c,d,a,b,m[i+14],17,-1502002290);d = md5ff(b,c,d,a,m[i+15],22,1236535329);
    a = md5gg(a,b,c,d,m[i+1],5,-165796510);   b = md5gg(d,a,b,c,m[i+6],9,-1069501632);
    c = md5gg(c,d,a,b,m[i+11],14,643717713);  d = md5gg(b,c,d,a,m[i+0],20,-373897302);
    a = md5gg(a,b,c,d,m[i+5],5,-701558691);   b = md5gg(d,a,b,c,m[i+10],9,38016083);
    c = md5gg(c,d,a,b,m[i+15],14,-660478335); d = md5gg(b,c,d,a,m[i+4],20,-405537848);
    a = md5gg(a,b,c,d,m[i+9],5,568446438);    b = md5gg(d,a,b,c,m[i+14],9,-1019803690);
    c = md5gg(c,d,a,b,m[i+3],14,-187363961);  d = md5gg(b,c,d,a,m[i+8],20,1163531501);
    a = md5gg(a,b,c,d,m[i+13],5,-1444681467); b = md5gg(d,a,b,c,m[i+2],9,-51403784);
    c = md5gg(c,d,a,b,m[i+7],14,1735328473);  d = md5gg(b,c,d,a,m[i+12],20,-1926607734);
    a = md5hh(a,b,c,d,m[i+5],4,-378558);      b = md5hh(d,a,b,c,m[i+8],11,-2022574463);
    c = md5hh(c,d,a,b,m[i+11],16,1839030562); d = md5hh(b,c,d,a,m[i+14],23,-35309556);
    a = md5hh(a,b,c,d,m[i+1],4,-1530992060);  b = md5hh(d,a,b,c,m[i+4],11,1272893353);
    c = md5hh(c,d,a,b,m[i+7],16,-155497632);  d = md5hh(b,c,d,a,m[i+10],23,-1094730640);
    a = md5hh(a,b,c,d,m[i+13],4,681279174);   b = md5hh(d,a,b,c,m[i+0],11,-358537222);
    c = md5hh(c,d,a,b,m[i+3],16,-722521979);  d = md5hh(b,c,d,a,m[i+6],23,76029189);
    a = md5hh(a,b,c,d,m[i+9],4,-640364487);   b = md5hh(d,a,b,c,m[i+12],11,-421815835);
    c = md5hh(c,d,a,b,m[i+15],16,530742520);  d = md5hh(b,c,d,a,m[i+2],23,-995338651);
    a = md5ii(a,b,c,d,m[i+0],6,-198630844);   b = md5ii(d,a,b,c,m[i+7],10,1126891415);
    c = md5ii(c,d,a,b,m[i+14],15,-1416354905);d = md5ii(b,c,d,a,m[i+5],21,-57434055);
    a = md5ii(a,b,c,d,m[i+12],6,1700485571);  b = md5ii(d,a,b,c,m[i+3],10,-1894986606);
    c = md5ii(c,d,a,b,m[i+10],15,-1051523);   d = md5ii(b,c,d,a,m[i+1],21,-2054922799);
    a = md5ii(a,b,c,d,m[i+8],6,1873313359);   b = md5ii(d,a,b,c,m[i+15],10,-30611744);
    c = md5ii(c,d,a,b,m[i+6],15,-1560198380); d = md5ii(b,c,d,a,m[i+13],21,1309151649);
    a = md5ii(a,b,c,d,m[i+4],6,-145523070);   b = md5ii(d,a,b,c,m[i+11],10,-1120210379);
    c = md5ii(c,d,a,b,m[i+2],15,718787259);   d = md5ii(b,c,d,a,m[i+9],21,-343485551);
    a = safeAdd(a, aa); b = safeAdd(b, bb); c = safeAdd(c, cc); d = safeAdd(d, dd);
  }

  return [a, b, c, d].map(n => {
    let hex = '';
    for (let j = 0; j < 4; j++) hex += ('0' + ((n >> (j * 8)) & 0xff).toString(16)).slice(-2);
    return hex;
  }).join('');
}

function jsonError(message, status, details) {
  const body = details ? { error: message, details } : { error: message };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
