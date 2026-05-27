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

  if (env.PAYFAST_PASSPHRASE) {
    data.passphrase = env.PAYFAST_PASSPHRASE;
  }

  data.signature = generateSignature(data);
  delete data.passphrase;

  const pfParamString = Object.entries(data)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v).trim())}`)
    .join('&');

  let pfRes;
  try {
    pfRes = await fetch(PAYFAST_PROCESS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: pfParamString,
    });
  } catch (e) {
    return jsonError('Failed to reach payment provider', 502);
  }

  if (!pfRes.ok) {
    const details = await pfRes.text().catch(() => '');
    return jsonError('Payment creation failed', 502, { pfStatus: pfRes.status, pfBody: details });
  }

  let result;
  try {
    result = await pfRes.json();
  } catch {
    const raw = await pfRes.text().catch(() => '');
    return jsonError('Invalid response from payment provider', 502, { raw });
  }

  if (!result.uuid) {
    return jsonError('No payment identifier received', 502, { result });
  }

  return new Response(JSON.stringify({ uuid: result.uuid }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function generateSignature(data) {
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
    .map(key => `${key}=${encodeURIComponent(String(data[key]).trim())}`)
    .join('&');

  return md5(pfOutput);
}

// Proven MD5 implementation (works with ASCII/URL-encoded strings)
function md5(string) {
  function RotateLeft(lValue, iShiftBits) {
    return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits));
  }
  function AddUnsigned(lX, lY) {
    const lX8 = lX & 0x80000000, lY8 = lY & 0x80000000;
    const lX4 = lX & 0x40000000, lY4 = lY & 0x40000000;
    const lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF);
    if (lX4 & lY4)  return lResult ^ 0x80000000 ^ lX8 ^ lY8;
    if (lX4 | lY4)  return lResult & 0x40000000 ? lResult ^ 0xC0000000 ^ lX8 ^ lY8 : lResult ^ 0x40000000 ^ lX8 ^ lY8;
    return lResult ^ lX8 ^ lY8;
  }
  const F = (x,y,z) => (x&y)|((~x)&z);
  const G = (x,y,z) => (x&z)|(y&(~z));
  const H = (x,y,z) => x^y^z;
  const I = (x,y,z) => y^(x|(~z));
  function XX(fn, a,b,c,d,x,s,ac) {
    return AddUnsigned(RotateLeft(AddUnsigned(AddUnsigned(AddUnsigned(a, fn(b,c,d)), x), ac), s), b);
  }
  function ConvertToWordArray(str) {
    const len = str.length;
    const nw = (((len + 8) - ((len + 8) % 64)) / 64 + 1) * 16;
    const wa = new Array(nw).fill(0);
    for (let i = 0; i < len; i++) {
      wa[i >> 2] |= str.charCodeAt(i) << ((i % 4) * 8);
    }
    wa[len >> 2] |= 0x80 << ((len % 4) * 8);
    wa[nw - 2] = len << 3;
    wa[nw - 1] = len >>> 29;
    return wa;
  }
  function WordToHex(v) {
    let s = '';
    for (let i = 0; i < 4; i++) s += ('0' + ((v >>> (i * 8)) & 0xFF).toString(16)).slice(-2);
    return s;
  }

  const x = ConvertToWordArray(string);
  let a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;

  for (let k = 0; k < x.length; k += 16) {
    const [A,B,C,D] = [a,b,c,d];
    a=XX(F,a,b,c,d,x[k+0],7,0xD76AA478);  d=XX(F,d,a,b,c,x[k+1],12,0xE8C7B756);  c=XX(F,c,d,a,b,x[k+2],17,0x242070DB);  b=XX(F,b,c,d,a,x[k+3],22,0xC1BDCEEE);
    a=XX(F,a,b,c,d,x[k+4],7,0xF57C0FAF);  d=XX(F,d,a,b,c,x[k+5],12,0x4787C62A);  c=XX(F,c,d,a,b,x[k+6],17,0xA8304613);  b=XX(F,b,c,d,a,x[k+7],22,0xFD469501);
    a=XX(F,a,b,c,d,x[k+8],7,0x698098D8);  d=XX(F,d,a,b,c,x[k+9],12,0x8B44F7AF);  c=XX(F,c,d,a,b,x[k+10],17,0xFFFF5BB1); b=XX(F,b,c,d,a,x[k+11],22,0x895CD7BE);
    a=XX(F,a,b,c,d,x[k+12],7,0x6B901122); d=XX(F,d,a,b,c,x[k+13],12,0xFD987193); c=XX(F,c,d,a,b,x[k+14],17,0xA679438E); b=XX(F,b,c,d,a,x[k+15],22,0x49B40821);
    a=XX(G,a,b,c,d,x[k+1],5,0xF61E2562);  d=XX(G,d,a,b,c,x[k+6],9,0xC040B340);   c=XX(G,c,d,a,b,x[k+11],14,0x265E5A51); b=XX(G,b,c,d,a,x[k+0],20,0xE9B6C7AA);
    a=XX(G,a,b,c,d,x[k+5],5,0xD62F105D);  d=XX(G,d,a,b,c,x[k+10],9,0x02441453);  c=XX(G,c,d,a,b,x[k+15],14,0xD8A1E681); b=XX(G,b,c,d,a,x[k+4],20,0xE7D3FBC8);
    a=XX(G,a,b,c,d,x[k+9],5,0x21E1CDE6);  d=XX(G,d,a,b,c,x[k+14],9,0xC33707D6);  c=XX(G,c,d,a,b,x[k+3],14,0xF4D50D87);  b=XX(G,b,c,d,a,x[k+8],20,0x455A14ED);
    a=XX(G,a,b,c,d,x[k+13],5,0xA9E3E905); d=XX(G,d,a,b,c,x[k+2],9,0xFCEFA3F8);   c=XX(G,c,d,a,b,x[k+7],14,0x676F02D9);  b=XX(G,b,c,d,a,x[k+12],20,0x8D2A4C8A);
    a=XX(H,a,b,c,d,x[k+5],4,0xFFFA3942);  d=XX(H,d,a,b,c,x[k+8],11,0x8771F681);  c=XX(H,c,d,a,b,x[k+11],14,0x6D9D6122); b=XX(H,b,c,d,a,x[k+14],23,0xFDE5380C);
    a=XX(H,a,b,c,d,x[k+1],4,0xA4BEEA44);  d=XX(H,d,a,b,c,x[k+4],11,0x4BDECFA9);  c=XX(H,c,d,a,b,x[k+7],14,0xF6BB4B60);  b=XX(H,b,c,d,a,x[k+10],23,0xBEBFBC70);
    a=XX(H,a,b,c,d,x[k+13],4,0x289B7EC6); d=XX(H,d,a,b,c,x[k+0],11,0xEAA127FA);  c=XX(H,c,d,a,b,x[k+3],14,0xD4EF3085);  b=XX(H,b,c,d,a,x[k+6],23,0x04881D05);
    a=XX(H,a,b,c,d,x[k+9],4,0xD9D4D039);  d=XX(H,d,a,b,c,x[k+12],11,0xE6DB99E5); c=XX(H,c,d,a,b,x[k+15],14,0x1FA27CF8); b=XX(H,b,c,d,a,x[k+2],23,0xC4AC5665);
    a=XX(I,a,b,c,d,x[k+0],6,0xF4292244);  d=XX(I,d,a,b,c,x[k+7],10,0x432AFF97);  c=XX(I,c,d,a,b,x[k+14],15,0xAB9423A7); b=XX(I,b,c,d,a,x[k+5],21,0xFC93A039);
    a=XX(I,a,b,c,d,x[k+12],6,0x655B59C3); d=XX(I,d,a,b,c,x[k+3],10,0x8F0CCC92);  c=XX(I,c,d,a,b,x[k+10],15,0xFFEFF47D); b=XX(I,b,c,d,a,x[k+1],21,0x85845DD1);
    a=XX(I,a,b,c,d,x[k+8],6,0x6FA87E4F);  d=XX(I,d,a,b,c,x[k+15],10,0xFE2CE6E0); c=XX(I,c,d,a,b,x[k+6],15,0xA3014314);  b=XX(I,b,c,d,a,x[k+13],21,0x4E0811A1);
    a=XX(I,a,b,c,d,x[k+4],6,0xF7537E82);  d=XX(I,d,a,b,c,x[k+11],10,0xBD3AF235); c=XX(I,c,d,a,b,x[k+2],15,0x2AD7D2BB);  b=XX(I,b,c,d,a,x[k+9],21,0xEB86D391);
    a=AddUnsigned(a,A); b=AddUnsigned(b,B); c=AddUnsigned(c,C); d=AddUnsigned(d,D);
  }

  return (WordToHex(a)+WordToHex(b)+WordToHex(c)+WordToHex(d)).toLowerCase();
}

function jsonError(message, status, details) {
  const body = details ? { error: message, details } : { error: message };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
