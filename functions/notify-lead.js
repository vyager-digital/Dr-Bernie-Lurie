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

    const type     = body.type === 'completion' ? 'completion' : 'lead';
    const name     = escapeHtml((body.name || '').trim() || '—');
    const email    = escapeHtml((body.email || '').trim() || '—');
    const whatsapp = escapeHtml((body.whatsapp || '').trim() || '—');

    let subject, rows;

    if (type === 'completion') {
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

    const html = buildNotifyHtml(subject, rows);

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

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function buildNotifyHtml(title, rows) {
  const rowsHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:6px 12px 6px 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#6e5a54; font-weight:700; vertical-align:top; white-space:nowrap;">${label}</td>
      <td style="padding:6px 0; font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#3a2528; white-space:pre-line;">${value}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
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
              <h1 style="font-family:Georgia, serif; font-size:18px; color:#3a2528; margin:0 0 16px;">${title}</h1>
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
