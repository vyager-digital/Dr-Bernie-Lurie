const SITE_ORIGINS = ['https://herbernie.co.za', 'https://www.herbernie.co.za'];

function corsHeaders(origin) {
  const allowOrigin = SITE_ORIGINS.includes(origin) ? origin : SITE_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export async function onRequestOptions(context) {
  const origin = context.request.headers.get('Origin') || '';
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const origin = request.headers.get('Origin') || '';
  const headers = { 'Content-Type': 'application/json', ...corsHeaders(origin) };

  try {
    if (!env.RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), { status: 500, headers });
    }

    let body = {};
    try { body = await request.json(); } catch {}

    const type     = ['completion', 'contact'].includes(body.type) ? body.type : 'lead';
    const name     = escapeHtml((body.name || '').trim() || '—');
    const email    = escapeHtml((body.email || '').trim() || '—');
    const whatsapp = escapeHtml((body.whatsapp || '').trim() || '—');

    let subject, rows;

    if (type === 'contact') {
      subject = `New enquiry — ${body.name || 'Website visitor'}`;
      rows = [
        ['Name', name],
        ['Email', email],
        ['Phone / WhatsApp', whatsapp],
        ['Message', escapeHtml((body.message || '').trim() || '—')],
        ['Source', escapeHtml((body.source || 'Herbernie website').trim())],
      ];
    } else if (type === 'completion') {
      subject = `Quiz completed — ${body.name || 'New lead'}`;
      rows = [
        ['Name', name],
        ['Email', email],
        ['WhatsApp', whatsapp],
        ['Symptoms', escapeHtml(body.symptoms || '—')],
        ['How long', escapeHtml(body.duration || '—')],
        ['Prior treatment', escapeHtml(body.priorHelp || '—')],
        ['Goal', escapeHtml(body.goal || '—')],
      ];
    } else {
      subject = `New lead (quiz started) — ${body.name || 'Unknown'}`;
      rows = [
        ['Name', name],
        ['Email', email],
        ['WhatsApp', whatsapp],
        ['Status', 'Quiz started — questionnaire not yet completed'],
      ];
    }

    const brand = type === 'contact' ? BRANDS.practice : BRANDS.quiz;
    const html  = buildNotifyHtml(subject, rows, brand);

    const replyTo = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((body.email || '').trim())
      ? (body.email || '').trim()
      : null;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    `${brand.from} <notifications@send.herbernie.co.za>`,
        to:      ['hello@vyager.co', 'info@herbernie.co.za'],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return new Response(JSON.stringify({ error: 'Failed to send notification', detail }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: 'Worker error', message: e.message }), { status: 500, headers });
  }
}

const BRANDS = {
  quiz: {
    from:   'Herbernie Hormonal Quiz',
    label:  'Hormonal Harmony Quiz',
    bg:     '#f2ddd5',
    card:   '#fdf8f5',
    rule:   '#ead0c8',
    accent: '#a05c4e',
    text:   '#3a2528',
    muted:  '#6e5a54',
  },
  practice: {
    from:   "Herbernie Int'l",
    label:  "Herbernie Int'l — Website Enquiry",
    bg:     '#dbe4e2',
    card:   '#f4efeb',
    rule:   '#a3b8b4',
    accent: '#22495a',
    text:   '#22495a',
    muted:  '#486573',
  },
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function buildNotifyHtml(title, rows, brand = BRANDS.quiz) {
  const rowsHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:6px 12px 6px 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; color:${brand.muted}; font-weight:700; vertical-align:top; white-space:nowrap;">${label}</td>
      <td style="padding:6px 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; color:${brand.text}; white-space:pre-line;">${value}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
</head>
<body style="margin:0; padding:0; background:${brand.bg}; font-family:Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.bg}; padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background:${brand.card}; border-radius:14px; overflow:hidden;">
          <tr>
            <td style="padding:20px 28px; border-bottom:1px solid ${brand.rule};">
              <div style="font-family:Georgia, serif; font-size:16px; font-weight:700; color:${brand.accent};">${brand.label}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px;">
              <h1 style="font-family:Georgia, serif; font-size:18px; color:${brand.text}; margin:0 0 16px;">${title}</h1>
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
