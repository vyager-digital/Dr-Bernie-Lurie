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

    const name  = (body.name || '').trim();
    const email = (body.email || '').trim();
    const emailOk = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email);

    if (!name || !emailOk) {
      return new Response(JSON.stringify({ error: 'Invalid name or email' }), { status: 400, headers });
    }

    const symptoms  = (body.symptoms && typeof body.symptoms === 'object') ? body.symptoms : {};
    const duration  = body.duration  || '';
    const priorHelp = body.priorHelp || '';
    const goal      = body.goal      || '';

    const html = buildEmailHtml({ name, email, symptoms, duration, priorHelp, goal });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:     'Joanne Buckingham · Herbernie International <assessments@send.herbernie.co.za>',
        to:       email,
        reply_to: 'info@herbernie.co.za',
        subject:  `Your personalised assessment, ${name}`,
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      return new Response(JSON.stringify({ error: 'Failed to send email', detail }), { status: 500, headers });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });

  } catch (e) {
    return new Response(JSON.stringify({ error: 'Worker error', message: e.message }), { status: 500, headers });
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

const DURATION_PARAS = {
  'under-6m': "You're catching this early, and that matters. What you've described has a clear hormonal signature, and addressing it now is far easier than waiting for it to compound.",
  '6m-1yr':   "Six months to a year of feeling this way is long enough to know it isn't going to resolve on its own. What you've described is a pattern Dr. Lurie and I see regularly, and one that responds well to the right support.",
  '1-3yr':    "You've been managing this for over a year now. That's long enough for your body to develop real compensation patterns, which is exactly why a personalised approach makes such a difference over general advice.",
  '3yr-plus': "Years of managing this means your body has been working around the problem rather than through it. That's more common than people realise, and it doesn't make things harder to address. It just means we need to understand the starting point properly, which is exactly what your consultation is for."
};

const PRIOR_HELP_PARAS = {
  'told-normal':   'Being told your results are "normal" when you feel anything but is one of the most common things I hear, and one of the most frustrating. Standard blood panels don\'t capture hormonal patterns over time, or how those patterns interact with one another. What gets missed is often exactly what explains how you\'ve been feeling.',
  'tried-hrt':     "Having already tried HRT or prescription medication, and still looking for answers, tells me your body needs a more tailored approach. Herbal treatment works with your body's own hormonal feedback mechanisms, not just around them. For many of the women I see who've been through the prescription route, this is where things start to shift.",
  'tried-natural': "Supplements without a proper protocol rarely get to the root cause. The right herbal formulation, timed to your cycle and prepared for your individual profile, is a meaningfully different approach. Many patients who've tried natural remedies before find this is the piece they were missing.",
  'no-help':       "Not knowing where to start is a very common place to be. Most women aren't told that what they're experiencing has a name, a recognisable pattern, and a clear path through it. That clarity tends to come quickly once we look at the full picture together."
};

const GOAL_TEXT = {
  patient:  'being more patient and present with the people you love',
  work:     'showing up at work the way you want to again',
  movement: 'moving freely without paying for it the next day',
  myself:   'feeling like yourself again',
  other:    'whatever comes next for you'
};

function buildEmailHtml({ name, email, symptoms, duration, priorHelp, goal }) {
  const safeName = escapeHtml(name);
  const ctaUrl = `https://herbernie.co.za/hormonal/?step=6&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}#consult`;

  const para1 = DURATION_PARAS[duration]   || DURATION_PARAS['1-3yr'];
  const para2 = PRIOR_HELP_PARAS[priorHelp] || PRIOR_HELP_PARAS['no-help'];

  const severities    = Object.values(symptoms);
  const hasAffecting  = severities.includes('affecting');
  const hasNoticeable = severities.includes('noticeable');
  const goalText = GOAL_TEXT[goal] || 'feeling well again';
  const capGoal  = goalText.charAt(0).toUpperCase() + goalText.slice(1);

  let para3;
  if (hasAffecting) {
    para3 = `When symptoms are actively getting in the way of daily life, that's your body telling us it's been compensating for too long. My patients regularly tell me they notice meaningful improvement within 2&ndash;4 weeks of starting treatment. ${capGoal} isn't a distant outcome &mdash; it's a reasonable expectation, and your consultation is where we begin.`;
  } else if (hasNoticeable) {
    para3 = `Symptoms at this level don't tend to settle on their own. The earlier we start with targeted support, the less work your body has to do to recalibrate. ${capGoal} is closer than it feels right now, and your consultation is the clearest next step toward it.`;
  } else {
    para3 = `${capGoal} is a reasonable goal, and one that hormonal rebalancing directly supports. My patients regularly describe this kind of shift within the first few months of treatment. Your consultation is where we build the plan, specifically for you.`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Personalised Assessment</title>
</head>
<body style="margin:0; padding:0; background:#f2ddd5; font-family:Georgia, 'Times New Roman', serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2ddd5; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#fdf8f5; border-radius:18px; overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px; border-bottom:1px solid #ead0c8; text-align:center;">
              <div style="font-family:Georgia, serif; font-size:22px; font-weight:700; color:#a05c4e; letter-spacing:0.02em;">
                herbernie
              </div>
              <div style="font-family:Arial, Helvetica, sans-serif; font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#6e5a54; margin-top:4px;">
                Natural Healing for Life
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <div style="font-family:Arial, Helvetica, sans-serif; font-size:11px; letter-spacing:0.18em; text-transform:uppercase; color:#c4796a; font-weight:700; margin-bottom:14px;">
                Your Personalised Assessment
              </div>
              <h1 style="font-family:Georgia, serif; font-size:24px; line-height:1.3; color:#3a2528; margin:0 0 18px; font-weight:700;">
                Hi ${safeName},
              </h1>
              <p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:0 0 16px;">
                Thank you for taking the time to go through the assessment &mdash; I know it isn't always easy putting these things into words. Before we meet for your consultation, I wanted to share a few thoughts on what you described.
              </p>
              <p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:0 0 16px;">
                ${para1}
              </p>
              <p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:0 0 16px;">
                ${para2}
              </p>
              <p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:0 0 24px;">
                ${para3}
              </p>

              <p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:0 0 16px;">
                If you haven't booked your consultation yet, you can go ahead and do that now &mdash; just click below.
              </p>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td style="border-radius:10px; background:#c4796a;">
                    <a href="${ctaUrl}" style="display:inline-block; padding:13px 28px; font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:10px;">
                      Book My Consultation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:0;">
                Looking forward to going through all of this with you soon.
              </p>
              <p style="font-family:Georgia, serif; font-size:15px; line-height:1.6; color:#3a2528; margin:20px 0 0;">
                Warmly,<br>
                <strong>Joanne Buckingham</strong><br>
                <span style="font-family:Arial, Helvetica, sans-serif; font-size:12px; letter-spacing:0.04em; text-transform:uppercase; color:#6e5a54;">Registered Natural Health Practitioner</span>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px 32px; border-top:1px solid #ead0c8;">
              <p style="font-family:Arial, Helvetica, sans-serif; font-size:13px; line-height:1.7; color:#6e5a54; margin:0 0 12px; text-align:center;">
                Herbernie International &middot; Port Elizabeth, South Africa
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#a05c4e; padding:4px 0; text-align:center; white-space:nowrap;">
                    Phone: <a href="tel:+27413781531" style="color:#a05c4e; text-decoration:none;">(+27) 41 378 1531</a>
                  </td>
                </tr>
                <tr>
                  <td style="font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#a05c4e; padding:4px 0; text-align:center; white-space:nowrap;">
                    WhatsApp: <a href="https://wa.me/27762390423" style="color:#a05c4e; text-decoration:none;">(+27) 76 239 0423</a>
                  </td>
                </tr>
                <tr>
                  <td style="font-family:Arial, Helvetica, sans-serif; font-size:13px; color:#a05c4e; padding:4px 0; text-align:center; white-space:nowrap;">
                    <a href="mailto:info@herbernie.co.za" style="color:#a05c4e; text-decoration:none;">info@herbernie.co.za</a>
                  </td>
                </tr>
              </table>
              <p style="font-family:Arial, Helvetica, sans-serif; font-size:11px; line-height:1.6; color:#b09990; margin:18px 0 0; text-align:center;">
                This assessment reflects the clinical observations of Dr. Bernard Lurie, N.D. and Joanne Buckingham, and is for educational purposes. It does not constitute medical advice.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
