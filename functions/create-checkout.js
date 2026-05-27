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
      email_address: body.email || '',
      m_payment_id:  crypto.randomUUID(),
      amount:        '1.00',
      item_name:     'Hormonal Harmony Consultation',
    };

    if (env.PAYFAST_PASSPHRASE) data.passphrase = env.PAYFAST_PASSPHRASE;
    data.signature = sign(data);
    delete data.passphrase;

    const body_str = Object.entries(data)
      .filter(([, v]) => v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v).trim())}`)
      .join('&');

    const pfRes  = await fetch(PAYFAST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body_str,
    });

    const text = await pfRes.text();

    if (!pfRes.ok) return respond({ error: 'Payfast error', status: pfRes.status, body: text }, 502);

    let json;
    try { json = JSON.parse(text); } catch { return respond({ error: 'Bad Payfast response', raw: text }, 502); }

    if (!json.uuid) return respond({ error: 'No UUID', result: json }, 502);

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

function sign(data) {
  const str = FIELD_ORDER
    .filter(k => data[k] !== undefined && data[k] !== '')
    .map(k => `${k}=${encodeURIComponent(String(data[k]).trim())}`)
    .join('&');
  return md5(str);
}

function md5(s) {
  function sa(x,y){var l=(x&65535)+(y&65535),m=(x>>16)+(y>>16)+(l>>16);return(m<<16)|(l&65535);}
  function rl(n,c){return(n<<c)|(n>>>(32-c));}
  function cm(q,a,b,x,s,t){return sa(rl(sa(sa(a,q),sa(x,t)),s),b);}
  function ff(a,b,c,d,x,s,t){return cm((b&c)|(~b&d),a,b,x,s,t);}
  function gg(a,b,c,d,x,s,t){return cm((b&d)|(c&~d),a,b,x,s,t);}
  function hh(a,b,c,d,x,s,t){return cm(b^c^d,a,b,x,s,t);}
  function ii(a,b,c,d,x,s,t){return cm(c^(b|~d),a,b,x,s,t);}
  function tb(s){var o=[];o[(s.length>>2)-1+(s.length%4?1:0)]=0;for(var i=0;i<s.length*8;i+=8)o[i>>5]|=(s.charCodeAt(i/8)&255)<<(i%32);return o;}
  function br(b){var o='';for(var i=0;i<b.length*32;i+=8)o+=String.fromCharCode((b[i>>5]>>>(i%32))&255);return o;}
  function rh(s){var h='0123456789abcdef',o='';for(var i=0;i<s.length;i++){var x=s.charCodeAt(i);o+=h[(x>>>4)&15]+h[x&15];}return o;}
  function core(x,l){
    x[l>>5]|=128<<(l%32);x[(((l+64)>>>9)<<4)+14]=l;
    var a=1732584193,b=-271733879,c=-1732584194,d=271733878;
    for(var i=0;i<x.length;i+=16){
      var A=a,B=b,C=c,D=d;
      a=ff(a,b,c,d,x[i],7,-680876936);d=ff(d,a,b,c,x[i+1],12,-389564586);c=ff(c,d,a,b,x[i+2],17,606105819);b=ff(b,c,d,a,x[i+3],22,-1044525330);
      a=ff(a,b,c,d,x[i+4],7,-176418897);d=ff(d,a,b,c,x[i+5],12,1200080426);c=ff(c,d,a,b,x[i+6],17,-1473231341);b=ff(b,c,d,a,x[i+7],22,-45705983);
      a=ff(a,b,c,d,x[i+8],7,1770035416);d=ff(d,a,b,c,x[i+9],12,-1958414417);c=ff(c,d,a,b,x[i+10],17,-42063);b=ff(b,c,d,a,x[i+11],22,-1990404162);
      a=ff(a,b,c,d,x[i+12],7,1804603682);d=ff(d,a,b,c,x[i+13],12,-40341101);c=ff(c,d,a,b,x[i+14],17,-1502002290);b=ff(b,c,d,a,x[i+15],22,1236535329);
      a=gg(a,b,c,d,x[i+1],5,-165796510);d=gg(d,a,b,c,x[i+6],9,-1069501632);c=gg(c,d,a,b,x[i+11],14,643717713);b=gg(b,c,d,a,x[i],20,-373897302);
      a=gg(a,b,c,d,x[i+5],5,-701558691);d=gg(d,a,b,c,x[i+10],9,38016083);c=gg(c,d,a,b,x[i+15],14,-660478335);b=gg(b,c,d,a,x[i+4],20,-405537848);
      a=gg(a,b,c,d,x[i+9],5,568446438);d=gg(d,a,b,c,x[i+14],9,-1019803690);c=gg(c,d,a,b,x[i+3],14,-187363961);b=gg(b,c,d,a,x[i+8],20,1163531501);
      a=gg(a,b,c,d,x[i+13],5,-1444681467);d=gg(d,a,b,c,x[i+2],9,-51403784);c=gg(c,d,a,b,x[i+7],14,1735328473);b=gg(b,c,d,a,x[i+12],20,-1926607734);
      a=hh(a,b,c,d,x[i+5],4,-378558);d=hh(d,a,b,c,x[i+8],11,-2022574463);c=hh(c,d,a,b,x[i+11],16,1839030562);b=hh(b,c,d,a,x[i+14],23,-35309556);
      a=hh(a,b,c,d,x[i+1],4,-1530992060);d=hh(d,a,b,c,x[i+4],11,1272893353);c=hh(c,d,a,b,x[i+7],16,-155497632);b=hh(b,c,d,a,x[i+10],23,-1094730640);
      a=hh(a,b,c,d,x[i+13],4,681279174);d=hh(d,a,b,c,x[i],11,-358537222);c=hh(c,d,a,b,x[i+3],16,-722521979);b=hh(b,c,d,a,x[i+6],23,76029189);
      a=hh(a,b,c,d,x[i+9],4,-640364487);d=hh(d,a,b,c,x[i+12],11,-421815835);c=hh(c,d,a,b,x[i+15],16,530742520);b=hh(b,c,d,a,x[i+2],23,-995338651);
      a=ii(a,b,c,d,x[i],6,-198630844);d=ii(d,a,b,c,x[i+7],10,1126891415);c=ii(c,d,a,b,x[i+14],15,-1416354905);b=ii(b,c,d,a,x[i+5],21,-57434055);
      a=ii(a,b,c,d,x[i+12],6,1700485571);d=ii(d,a,b,c,x[i+3],10,-1894986606);c=ii(c,d,a,b,x[i+10],15,-1051523);b=ii(b,c,d,a,x[i+1],21,-2054922799);
      a=ii(a,b,c,d,x[i+8],6,1873313359);d=ii(d,a,b,c,x[i+15],10,-30611744);c=ii(c,d,a,b,x[i+6],15,-1560198380);b=ii(b,c,d,a,x[i+13],21,1309151649);
      a=ii(a,b,c,d,x[i+4],6,-145523070);d=ii(d,a,b,c,x[i+11],10,-1120210379);c=ii(c,d,a,b,x[i+2],15,718787259);b=ii(b,c,d,a,x[i+9],21,-343485551);
      a=sa(a,A);b=sa(b,B);c=sa(c,C);d=sa(d,D);
    }
    return[a,b,c,d];
  }
  return rh(br(core(tb(s),s.length*8)));
}
