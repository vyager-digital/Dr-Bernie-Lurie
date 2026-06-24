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
    const text = buildEmailText({ name, email, symptoms, duration, priorHelp, goal });

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
        text,
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
  'under-6m': "You're catching this early, and that matters. The pattern you've described has a clear hormonal signature, and addressing it now is far easier than waiting for it to compound.",
  '6m-1yr':   "Six months to a year of this is long enough to know it isn't going to resolve on its own. What you've described is a recognisable hormonal pattern, and one that responds well to the right support.",
  '1-3yr':    "You've been managing this for over a year. That's long enough for the body to develop real compensation patterns, and it's why targeted, personalised support makes more difference than general advice.",
  '3yr-plus': "Years of managing this means your body has been working around the problem rather than through it. That's more common than most women realise, and it doesn't make recovery harder. It just means the starting point needs to be understood properly."
};

const PRIOR_HELP_PARAS = {
  'told-normal':   'Being told your results are "normal" when you feel anything but is one of the most common and most frustrating stories in hormonal health. Standard blood panels don\'t capture hormonal patterns over time, or how those patterns interact with one another. What gets missed is often exactly what explains how you\'ve been feeling.',
  'tried-hrt':     "Having already tried HRT or prescription medication and still looking for answers suggests your body needs a more tailored approach. Natural treatment works with the body's own hormonal feedback mechanisms rather than around them. For many women who've been through the prescription route, this is where things finally shift.",
  'tried-natural': "Supplements without a proper protocol rarely reach the root cause. A formulation prepared specifically for your individual profile is a meaningfully different approach. Many women who've tried natural remedies before find this is the piece they were missing.",
  'no-help':       "Not knowing where to start is a very common place to be. Most women aren't told that what they're experiencing has a name, a recognisable pattern, and a clear path through it. That clarity tends to come quickly once someone who's seen this pattern many times looks at the full picture."
};

const NEXT_STEP_OPEN = {
  affecting:  "When symptoms are disrupting daily life, it's the body signalling it has been compensating for too long. It's also where the right support tends to make the most visible difference.",
  noticeable: "Symptoms at this level don't tend to plateau on their own, and the earlier targeted support begins, the less work the body has to do to recalibrate.",
  mild:       "Even milder symptoms are worth taking seriously, because they're the body's earliest signal, and the easiest stage to work with."
};

const GOAL_TEXT = {
  patient:  'being more patient and present with the people you love',
  work:     'showing up at work the way you want to again',
  movement: 'moving freely without paying for it the next day',
  myself:   'feeling like yourself again',
  other:    'whatever comes next for you'
};

const SEVERITY_WEIGHT = { affecting: 3, noticeable: 2, mild: 1 };

const CONNECT_PHRASE = {
  'hot-flushes':       'the hot flushes',
  'broken-sleep':      'the broken sleep',
  'fatigue':           'the fatigue',
  'brain-fog':         'the brain fog',
  'mood-swings':       'the mood swings',
  'weight':            'the weight changes',
  'anxiety':           'the anxiety',
  'cycles':            'the cycle changes',
  'libido':            'the change in libido',
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
  sleep:    "Sleep, energy and mental clarity all run on the same hormonal rhythm. When progesterone and cortisol fall out of sync, the body struggles to reach deep, restorative sleep. That's why the tiredness and the fog don't lift, no matter how much rest you get.",
  mood:     "Mood and emotional steadiness are closely tied to the same hormones that regulate your cycle. When estrogen and progesterone fluctuate, the nervous system feels it first, often before anything else changes.",
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

function computeAssessment({ name, email, symptoms, duration, priorHelp, goal }) {
  const ctaUrl = `https://herbernie.co.za/hormonal/?step=6&name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}#consult`;

  const symptomEntries = Object.entries(symptoms)
    .filter(([key]) => SYMPTOM_CLUSTERS[key])
    .map(([key, severity], index) => ({ key, severity, weight: SEVERITY_WEIGHT[severity] || 1, index }));

  const clusterWeights = {};
  symptomEntries.forEach(s => {
    const cluster = SYMPTOM_CLUSTERS[s.key];
    clusterWeights[cluster] = (clusterWeights[cluster] || 0) + s.weight;
  });
  const dominantCluster = CLUSTER_ORDER.reduce((best, cluster) =>
    (clusterWeights[cluster] || 0) > (clusterWeights[best] || 0) ? cluster : best, CLUSTER_ORDER[0]);

  // Symptoms outside the dominant cluster — acknowledged, not echoed
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const others = [...symptomEntries]
    .filter(s => SYMPTOM_CLUSTERS[s.key] !== dominantCluster && CONNECT_PHRASE[s.key])
    .sort((a, b) => b.weight - a.weight || a.index - b.index)
    .slice(0, 3)
    .map(s => CONNECT_PHRASE[s.key]);
  const connectPara = others.length === 0 ? '' : (others.length === 1
    ? `And it rarely comes alone. The same hormonal shift is usually behind ${others[0]} you mentioned as well.`
    : `And it rarely comes alone. ${cap(joinNaturally(others))} you mentioned tend to move together, because they share the same hormonal driver.`);

  const severities = symptomEntries.map(s => s.severity);
  const nextOpen = severities.includes('affecting') ? NEXT_STEP_OPEN.affecting
    : severities.includes('noticeable') ? NEXT_STEP_OPEN.noticeable
    : NEXT_STEP_OPEN.mild;

  const para1 = DURATION_PARAS[duration]    || DURATION_PARAS['1-3yr'];
  const para2 = CLUSTER_INSIGHT[dominantCluster];
  const para3 = PRIOR_HELP_PARAS[priorHelp] || PRIOR_HELP_PARAS['no-help'];

  const goalText = GOAL_TEXT[goal] || 'feeling well again';
  const para4 = `${nextOpen} When we meet, Dr. Lurie and I will go through ${CLUSTER_TOPIC[dominantCluster]} and map out what's needed for ${goalText}. Your answers will be in front of us, so the conversation starts from what you've already shared.`;

  return { para1, para2, connectPara, para3, para4, ctaUrl };
}

// Plain-text twin of the HTML email. Recipients see the HTML; this version
// is read by spam filters (and shown only in text-only clients), which
// improves inbox placement on stricter providers like Outlook.
function buildEmailText({ name, email, symptoms, duration, priorHelp, goal }) {
  const { para1, para2, connectPara, para3, para4, ctaUrl } =
    computeAssessment({ name, email, symptoms, duration, priorHelp, goal });

  const lines = [
    `Hi ${name},`,
    ``,
    `Thank you for completing the assessment. Here's a written copy of what it found, so you have it on hand.`,
    ``,
    `WHAT YOUR ANSWERS SHOW`,
    para1,
    ``,
    para2,
  ];
  if (connectPara) lines.push(``, connectPara);
  lines.push(
    ``,
    `WHERE MOST WOMEN GET STUCK`,
    para3,
    ``,
    `YOUR NEXT STEP`,
    para4,
    ``,
    `If you haven't booked your consultation yet, you can choose a time that suits you here:`,
    ctaUrl,
    ``,
    `If you have any questions before then, you can reply to this email directly or message us on WhatsApp at (+27) 76 239 0423.`,
    ``,
    `Looking forward to going through all of this with you soon.`,
    ``,
    `Kind regards,`,
    `Joanne Buckingham`,
    `Registered Natural Health Practitioner`,
    ``,
    `Herbernie International · Port Elizabeth, South Africa`,
    `Phone: (+27) 41 378 1531`,
    `WhatsApp: (+27) 76 239 0423`,
    `info@herbernie.co.za`,
    ``,
    `This assessment reflects the clinical observations of Dr. Bernard Lurie, N.D. and Joanne Buckingham, and is for educational purposes. It does not constitute medical advice.`,
  );
  return lines.join('\n');
}

function buildEmailHtml({ name, email, symptoms, duration, priorHelp, goal }) {
  const safeName = escapeHtml(name);
  const { para1, para2, connectPara, para3, para4, ctaUrl } =
    computeAssessment({ name, email, symptoms, duration, priorHelp, goal });

  const sectionLabel = text => `<div style="font-family:Arial, Helvetica, sans-serif; font-size:11px; letter-spacing:0.15em; text-transform:uppercase; color:#c4796a; font-weight:700; margin:24px 0 10px;">${text}</div>`;

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
              <p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:0;">
                Thank you for completing the assessment. Here's a written copy of what it found, so you have it on hand.
              </p>
              ${sectionLabel('What your answers show')}
              <p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:0 0 16px;">
                ${para1}
              </p>
              <p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:0;">
                ${para2}
              </p>
              ${connectPara ? `<p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:16px 0 0;">${connectPara}</p>` : ''}
              ${sectionLabel('Where most women get stuck')}
              <p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:0;">
                ${para3}
              </p>
              ${sectionLabel('Your next step')}
              <p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:0 0 24px;">
                ${para4}
              </p>

              <p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:0 0 16px;">
                If you haven't booked your consultation yet, you can choose a time that suits you below.
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

              <p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:0 0 16px;">
                And if you have any questions before then, you can reply to this email directly or message us on WhatsApp at <a href="https://wa.me/27762390423" style="color:#a05c4e; text-decoration:none; white-space:nowrap;">(+27)&nbsp;76&nbsp;239&nbsp;0423</a>.
              </p>
              <p style="font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.7; color:#3a2528; margin:0;">
                Looking forward to going through all of this with you soon.
              </p>
              <p style="font-family:Georgia, serif; font-size:15px; line-height:1.6; color:#3a2528; margin:20px 0 0;">
                Kind regards,<br>
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
