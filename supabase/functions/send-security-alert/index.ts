// Sends security alert emails via Brevo (uses BREVO_API_KEY secret)
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface AlertBody {
  to: string;
  subject: string;
  event: string;
  severity?: 'info' | 'warning' | 'critical';
  details?: Record<string, unknown>;
}

const BREVO_KEY = Deno.env.get('BREVO_API_KEY');
const FROM_EMAIL = 'security@indexpilotai.com';
const FROM_NAME = 'IndexPilot Security';

function renderHtml(b: AlertBody): string {
  const sev = b.severity ?? 'warning';
  const color = sev === 'critical' ? '#dc2626' : sev === 'warning' ? '#d97706' : '#2563eb';
  const rows = Object.entries(b.details ?? {})
    .map(([k, v]) => `<tr><td style="padding:6px 12px;color:#6b7280;font-size:13px">${k}</td><td style="padding:6px 12px;font-size:13px"><code>${String(v)}</code></td></tr>`)
    .join('');
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f9fafb;padding:24px;color:#111827">
  <div style="max-width:560px;margin:auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:${color};color:#fff;padding:16px 20px;font-weight:bold;font-size:16px">⚠️ ${b.subject}</div>
    <div style="padding:20px">
      <p style="margin:0 0 12px">A security event was triggered on IndexPilot AI.</p>
      <p style="margin:0 0 16px"><strong>Event:</strong> ${b.event} &nbsp; <strong>Severity:</strong> ${sev.toUpperCase()}</p>
      <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:6px">${rows}</table>
      <p style="margin:20px 0 0;font-size:12px;color:#6b7280">Review in Admin → Settings → Activity Monitor.</p>
    </div>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    if (!BREVO_KEY) throw new Error('BREVO_API_KEY not configured');
    const body = (await req.json()) as AlertBody;
    if (!body?.to || !body?.subject || !body?.event) {
      return new Response(JSON.stringify({ error: 'to, subject, event required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
      body: JSON.stringify({
        sender: { email: FROM_EMAIL, name: FROM_NAME },
        to: [{ email: body.to }],
        subject: body.subject,
        htmlContent: renderHtml(body),
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('Brevo send failed', resp.status, data);
      return new Response(JSON.stringify({ error: 'send_failed', upstream: data }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true, messageId: data.messageId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('send-security-alert error', e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
