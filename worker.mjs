const fields = { progetto: 120, cosa_ha_funzionato: 2000, cosa_migliorare: 2000 };

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (new URL(request.url).pathname !== '/feedback' || origin !== env.ALLOWED_ORIGIN) {
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
    const { success } = await env.SUBMISSIONS.limit({ key: ip });
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

    if (!Number.isInteger(data?.voto) || data.voto < 1 || data.voto > 5) return reply(400);
    const params = { voto: data.voto };
    for (const [field, maxLength] of Object.entries(fields)) {
      const value = data[field];
      if (typeof value !== 'string' || value.length > maxLength) return reply(400);
      params[field] = value.trim() || (field === 'progetto' ? 'Generico' : 'Nessuna risposta');
    }

    const { EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY } = env;
    if (![EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY, EMAILJS_PRIVATE_KEY].every(Boolean)) {
      return reply(503);
    }

    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          service_id: EMAILJS_SERVICE_ID,
          template_id: EMAILJS_TEMPLATE_ID,
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
