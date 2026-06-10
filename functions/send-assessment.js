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
        bcc:      'info@herbernie.co.za',
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
  '3yr-plus': "Years of managing this means your body has been working around the problem rather than through it. That's more common than people realise, and it doesn't make things harder to address. It just means we need to understand the starting point properly."
};

const PRIOR_HELP_PARAS = {
  'told-normal':   'Being told your results are "normal" when you feel anything but is one of the most common things I hear, and one of the most frustrating. Standard blood panels don\'t capture hormonal patterns over time, or how those patterns interact with one another. What gets missed is often exactly what explains how you\'ve been feeling.',
  'tried-hrt':     "Having already tried HRT or prescription medication, and still looking for answers, tells me your body needs a more tailored approach. Herbal treatment works with your body's own hormonal feedback mechanisms, not just around them. For many of the women I see who've been through the prescription route, this is where things start to shift.",
  'tried-natural': "Supplements without a proper protocol rarely get to the root cause. The right herbal formulation, prepared for your individual profile, is a meaningfully different approach. Many patients who've tried natural remedies before find this is the piece they were missing.",
  'no-help':       "Not knowing where to start is a very common place to be. Most women aren't told that what they're experiencing has a name, a recognisable pattern, and a clear path through it. That clarity tends to come quickly once we look at the full picture together."
};

const GOAL_TEXT = {
  patient:  'being more patient and present with the people you love',
  work:     'showing up at work the way you want to again',
  movement: 'moving freely without paying for it the next day',
  myself:   'feeling like yourself again',
  other:    'whatever comes next for you'
};

const SEVERITY_WEIGHT = { affecting: 3, noticeable: 2, mild: 1 };

const SYMPTOM_REFLECTIONS = {
  'hot-flushes':       'the hot flushes and night sweats',
  'broken-sleep':      'the broken sleep',
  'fatigue':           "the fatigue that doesn't lift",
  'brain-fog':         'the brain fog',
  'mood-swings':       "the mood swings that don't feel like you",
  'weight':            "the weight that won't shift",
  'anxiety':           "the anxiety that's crept in",
  'cycles':            'the changes in your cycle',
  'libido':            'feeling disconnected from your own body',
  'joint-pain':        'the joint aches',
  'vaginal-dryness':   'the discomfort during intimacy',
  'breast-tenderness': 'the breast tenderness'
};

const SYMPTOM_CLUSTERS = {
  'broken-sleep': 'sleep', 'fatigue': 'sleep', 'brain-fog': 'sleep',
  'mood-swings': 'mood', 'anxiety': 'mood',
  'hot-flushes': 'heat',
  'cycles': 'cycle', 'libido': 'cycle', 'vaginal-dryness': 'cycle', 'breast-tenderness': 'cycle',
  'weight': 'physical', 'joint-pain': 'physical'
};

const CLUSTER_ORDER = ['sleep', 'mood', 'heat', 'cycle', 'physical'];

const CLUSTER_INSIGHT = {
  sleep:    "Sleep, energy and mental clarity all run on the same hormonal rhythm. When progesterone and cortisol fall out of sync, the body struggles to reach deep, restorative sleep, which is exactly why the tiredness and fog don't lift no matter how much rest you get.",
  mood:     "Mood and emotional steadiness are closely tied to the same hormones that regulate your cycle. When estrogen and progesterone fluctuate, the nervous system feels it first, often well before anything would show up on a standard blood test.",
  heat:     "Hot flushes and night sweats come from the way the brain's temperature control responds to shifting estrogen levels. It's one of the clearest signals that hormonal rebalancing is the right place to start.",
  cycle:    "Changes in your cycle, your libido and how your body feels day to day are all connected to the same estrogen-progesterone balance. When one shifts, the others tend to follow.",
  physical: "Weight and joint discomfort are often the most visible signs of a hormonal shift. When estrogen drops, it changes how the body manages inflammation and where it stores fat, which is why these changes can feel so stubborn."
};

const CLUSTER_TOPIC = {
  sleep:    "what's been happening with your sleep, energy and focus",
  mood:     "what's been driving the shifts in your mood",
  heat:     "what's behind the hot flushes and night sweats",
  cycle:    "the changes in your cycle and how your body's been feeling",
  physical: "what's been going on with your weight and how your body's been feeling"
};

function joinNaturally(items) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function buildEmailHtml({ name, email, symptoms, duration, priorHelp, goal }) {
  const safeName = escapeHtml(name);
  const ctaUrl = `https://herbernie.co.za/hormonal/?step=6&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}#consult`;

  const symptomEntries = Object.entries(symptoms)
    .filter(([key]) => SYMPTOM_REFLECTIONS[key])
    .map(([key, severity], index) => ({ key, weight: SEVERITY_WEIGHT[severity] || 1, index }));

  const topReflections = [...symptomEntries]
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .slice(0, 3)
    .map(s => SYMPTOM_REFLECTIONS[s.key]);

  const clusterWeights = {};
  symptomEntries.forEach(s => {
    const cluster = SYMPTOM_CLUSTERS[s.key];
    clusterWeights[cluster] = (clusterWeights[cluster] || 0) + s.weight;
  });
  const dominantCluster = CLUSTER_ORDER.reduce((best, cluster) =>
    (clusterWeights[cluster] || 0) > (clusterWeights[best] || 0) ? cluster : best, CLUSTER_ORDER[0]);

  const para1 = topReflections.length === 1
    ? `Reading through what you shared, ${topReflections[0]} stood out to me. ${CLUSTER_INSIGHT[dominantCluster]}`
    : `Reading through what you shared, a few things stood out to me: ${joinNaturally(topReflections)}. ${CLUSTER_INSIGHT[dominantCluster]}`;

  const para2 = DURATION_PARAS[duration]    || DURATION_PARAS['1-3yr'];
  const para3 = PRIOR_HELP_PARAS[priorHelp] || PRIOR_HELP_PARAS['no-help'];

  const goalText = GOAL_TEXT[goal] || 'feeling well again';
  const para4 = `In your consultation, we'll go through ${CLUSTER_TOPIC[dominantCluster]} in more detail, and start mapping out what's needed for ${goalText}.`;

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
              <p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:0 0 16px;">
                ${para3}
              </p>
              <p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:0 0 24px;">
                ${para4}
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
