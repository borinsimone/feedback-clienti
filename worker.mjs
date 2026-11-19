const fields = { progetto: 120, cosa_ha_funzionato: 2000, cosa_migliorare: 2000 };

function feedbackParams(data) {
  if (!Number.isInteger(data?.voto) || data.voto < 1 || data.voto > 5) return null;
  const params = { voto: data.voto };
  for (const [field, maxLength] of Object.entries(fields)) {
    const value = data[field];
    if (typeof value !== 'string' || value.length > maxLength) return null;
    params[field] = value.trim() || (field === 'progetto' ? 'Generico' : 'Nessuna risposta');
  }
  return params;
}

function contactParams(data) {
  if ([data?.name, data?.email, data?.message].some(value => typeof value !== 'string')) return null;
  const name = data.name.trim();
  const email = data.email.trim();
  const message = data.message.trim();
  if (!name || name.length > 100 || /[\r\n]/.test(name) ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !message || message.length > 3000) return null;

  return { from_name: name, from_email: email, subject: 'Nuovo progetto da ' + name, message };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const path = new URL(request.url).pathname;
    if ((path !== '/feedback' && path !== '/contact') || origin !== env.ALLOWED_ORIGIN) {
      return new Response(null, { status: 403 });
    }

    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
      'Cache-Control': 'no-store'
    };
    const reply = status => new Response(null, { status, headers });
    if (request.method === 'OPTIONS') return reply(204);
    if (request.method !== 'POST') return reply(405);
    if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') return reply(415);

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.SUBMISSIONS.limit({ key: path + ':' + ip });
    if (!success) return reply(429);

    let data;
    try {
      const reader = request.body?.getReader();
      if (!reader) return reply(400);
      const decoder = new TextDecoder();
      let body = '';
      let bytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 32768) {
          await reader.cancel();
          return reply(413);
        }
        body += decoder.decode(value, { stream: true });
      }
      data = JSON.parse(body + decoder.decode());
    } catch {
      return reply(400);
    }

    const isContact = path === '/contact';
    const params = isContact ? contactParams(data) : feedbackParams(data);
    if (!params) return reply(400);

    const { EMAILJS_SERVICE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY } = env;
    const templateId = isContact ? env.EMAILJS_CONTACT_TEMPLATE_ID : env.EMAILJS_TEMPLATE_ID;
    if (![EMAILJS_SERVICE_ID, templateId, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY].every(Boolean)) {
      return reply(503);
    }

    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          service_id: EMAILJS_SERVICE_ID,
          template_id: templateId,
          user_id: EMAILJS_PUBLIC_KEY,
          accessToken: EMAILJS_PRIVATE_KEY,
          template_params: params
        })
      });
      if (!response.ok) {
        const reason = (await response.text()).toLowerCase();
        const category = reason.includes('non-browser') || reason.includes('non browser')
          ? 'non-browser requests disabled'
          : reason.includes('origin') || reason.includes('referer')
            ? 'origin rejected'
            : reason.includes('private key') || reason.includes('access token') || reason.includes('accesstoken')
              ? 'private key rejected'
              : 'provider rejected request';
        console.warn('EmailJS', response.status, category);
      }
      return reply(response.ok ? 204 : 502);
    } catch {
      return reply(502);
    }
  }
};
