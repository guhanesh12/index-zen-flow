import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!;
const ADMIN_EMAIL = 'guhanesh.v@smilykart.com';
const FROM = { name: 'IndexPilotAI', email: 'noreply@indexpilotai.com' };

async function sendBrevo(payload: any) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': BREVO_API_KEY },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { fullName = '', email = '', mobile = '', clientId = '' } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'email required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const signupTime = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    // 1. Admin alert
    const adminRes = await sendBrevo({
      sender: FROM,
      to: [{ email: ADMIN_EMAIL, name: 'Admin' }],
      subject: `🆕 New IndexPilotAI Signup: ${fullName || email}`,
      htmlContent: `
        <h2>New User Registered</h2>
        <table style="border-collapse:collapse;font-family:Arial,sans-serif;">
          <tr><td style="padding:6px 12px;"><b>Name</b></td><td style="padding:6px 12px;">${fullName || '-'}</td></tr>
          <tr><td style="padding:6px 12px;"><b>Email</b></td><td style="padding:6px 12px;">${email}</td></tr>
          <tr><td style="padding:6px 12px;"><b>Mobile</b></td><td style="padding:6px 12px;">${mobile || '-'}</td></tr>
          <tr><td style="padding:6px 12px;"><b>Client ID</b></td><td style="padding:6px 12px;">${clientId || '-'}</td></tr>
          <tr><td style="padding:6px 12px;"><b>Signup Time (IST)</b></td><td style="padding:6px 12px;">${signupTime}</td></tr>
        </table>`,
    });

    // 2. Welcome email to user
    const welcomeRes = await sendBrevo({
      sender: FROM,
      to: [{ email, name: fullName || 'Trader' }],
      subject: '🚀 Welcome to IndexPilotAI - Your AI Trading Co-Pilot',
      htmlContent: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;">
          <h2 style="color:#3b82f6;">Welcome aboard${fullName ? `, ${fullName}` : ''}! 🎉</h2>
          <p>Thank you for joining <b>IndexPilotAI</b> — your AI-powered Index Options trading co-pilot.</p>
          <p><b>Your Client ID:</b> ${clientId || '-'}</p>
          <h3>What's next?</h3>
          <ol>
            <li>Complete your KYC and broker connection</li>
            <li>Configure your trading preferences (NIFTY / BANKNIFTY / SENSEX)</li>
            <li>Add your option symbols for automated CE/PE signal execution</li>
            <li>Start receiving high-conviction AI signals during market hours</li>
          </ol>
          <p style="margin-top:24px;">
            <a href="https://indexpilotai.com/dashboard" style="background:#3b82f6;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">Open Dashboard</a>
          </p>
          <p style="color:#64748b;font-size:12px;margin-top:32px;">
            Need help? Reply to this email or contact support.<br>
            © IndexPilotAI
          </p>
        </div>`,
    });

    return new Response(JSON.stringify({ ok: true, admin: adminRes, welcome: welcomeRes }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
