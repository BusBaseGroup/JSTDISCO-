const events = ['Weddings', 'Birthdays', 'Private parties', 'Other'];
const escape = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const html = (body, status = 200) => new Response(body, {
  status,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
});
const page = (title, body, status) => html(`<!doctype html><html lang="en-GB"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | JST Mobile Disco</title><link rel="stylesheet" href="/style.css"></head>
<body><header><div class="bar"><a class="logo" href="/"><b>JST<span>.</span></b> MOBILE DISCO</a>
<nav><a href="/">Home</a><a href="/contact.html">Bookings</a><a href="/login">Owner login</a></nav>
</div></header><main><section class="below"><h1 style="font-size:clamp(2.5rem,6vw,4.5rem)">${title}</h1>
${body}</section></main></body></html>`, status);

function isOwner(request, env) {
  const email = request.headers.get('oai-authenticated-user-email')?.toLowerCase();
  const owners = (env.OWNER_EMAILS ?? '').toLowerCase().split(',').map(value => value.trim());
  return Boolean(email && owners.includes(email));
}

function login(request, env) {
  const action = isOwner(request, env)
    ? '<a class="button" href="/owner">Open bookings dashboard ↗</a>'
    : '<a class="button" target="_top" href="/signin-with-chatgpt?return_to=%2Fowner">Sign in with ChatGPT ↗</a>';
  return html(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Owner login | JST Mobile Disco</title>
<link rel="stylesheet" href="/style.css"></head><body><header><div class="bar">
<a class="logo" href="/"><b>JST<span>.</span></b> MOBILE DISCO</a><a href="/">← Back to website</a>
</div></header><main><section class="login-panel"><p class="tag">JST MOBILE DISCO</p><h1 style="font-size:clamp(2.6rem,6vw,4.6rem)">Owner login</h1>
<p>Use your approved ChatGPT account to view booking enquiries.</p>${action}</section></main></body></html>`);
}

async function dashboard(request, env, url) {
  const email = request.headers.get('oai-authenticated-user-email')?.toLowerCase();
  if (!email) return Response.redirect(new URL('/login', url), 303);
  if (!isOwner(request, env)) return page('Owner access required',
    '<p>Use an approved JST owner account to view enquiries.</p><a target="_top" href="/signout-with-chatgpt?return_to=%2Flogin">Switch account →</a>', 403);
  const cursor = url.searchParams.get('next');
  const results = await env.BUCKET.list({ prefix: 'enquiries/', limit: 30, ...(cursor && { cursor }) });
  const bookings = await Promise.all(results.objects.map(async entry => {
    const object = await env.BUCKET.get(entry.key);
    return object?.json();
  }));
  const cards = bookings.filter(Boolean).map(booking => `<article>
<h3>${escape(booking.Event)} · ${escape(booking.Venue)}</h3>
<p>${escape(booking.Name)} · <a href="mailto:${escape(booking.Email)}">${escape(booking.Email)}</a></p>
${booking.Phone ? `<p>Phone: ${escape(booking.Phone)}</p>` : ''}
<p>Event date: ${escape(booking.Date || 'To be confirmed')}<br>Received: ${escape(booking.Received.slice(0, 10))}</p>
<p style="white-space:pre-wrap">${escape(booking.Details)}</p></article>`).join('');
  const next = results.truncated ? `<p><a href="/owner?next=${encodeURIComponent(results.cursor)}">Older enquiries →</a></p>` : '';
  return page('Booking enquiries', '<div class="dashboard-head"><p>Newest enquiries first · <a href="/owner/telegram">Telegram alerts</a></p><a target="_top" href="/signout-with-chatgpt?return_to=%2Flogin">Sign out →</a></div>' +
    (cards ? `<div class="cards dashboard-list">${cards}</div>` : '<article><h3>No enquiries yet</h3><p>New enquiries will appear here when someone submits the booking form.</p></article>') + next);
}

const telegramSettings = 'settings/telegram.json';

async function settingsKey(env) {
  return crypto.subtle.importKey('raw', Uint8Array.from(atob(env.TELEGRAM_SETTINGS_KEY), c => c.charCodeAt(0)),
    'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function telegram(token, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error('Telegram request failed');
  return data.result;
}

function telegramSetup(code, message = '', status = 200) {
  return page('Telegram alerts', `${message ? `<p role="alert"><strong>${message}</strong></p>` : ''}
<ol>
<li><a class="button" href="https://t.me/JSTDiscoAlertsBot?start=${code}" target="_blank" rel="noopener noreferrer">Open JST bot in Telegram ↗</a></li>
<li>Click <strong>Start</strong> in the bot chat. If Telegram opens the chat without sending a command, send <code>/start ${code}</code> there yourself.</li>
<li>Come back here and paste your replacement token from BotFather.</li>
</ol>
<form action="/owner/telegram" method="post">
<input type="hidden" name="code" value="${code}">
<label>Bot token from BotFather<input name="token" type="password" required maxlength="120" autocomplete="off"></label>
<button class="button">Connect and send a test alert</button>
</form><p><a href="/owner">Back to enquiries</a></p>`, status);
}

async function configureTelegram(request, env, url) {
  if (!isOwner(request, env)) return new Response('Owner access required', { status: 403 });
  if (request.method === 'GET') return telegramSetup('JST-' + crypto.randomUUID().slice(0, 12));
  if (request.headers.get('origin') !== url.origin) return new Response('Invalid origin', { status: 403 });
  const form = await request.formData();
  const token = String(form.get('token') ?? '').trim();
  const code = String(form.get('code') ?? '');
  if (!/^JST-[a-f0-9]{8}-[a-f0-9]{3}$/.test(code)) {
    return telegramSetup('JST-' + crypto.randomUUID().slice(0, 12), 'Please use the pairing link on this page.', 400);
  }
  if (!/^\d{5,20}:[A-Za-z0-9_-]{20,100}$/.test(token)) {
    return telegramSetup(code, 'Paste the full replacement token from BotFather.', 400);
  }
  try {
    const bot = await telegram(token, 'getMe', {});
    if (bot.username?.toLowerCase() !== 'jstdiscoalertsbot') {
      return telegramSetup(code, 'That token belongs to a different bot. Copy the token for @JSTDiscoAlertsBot.', 400);
    }
    const updates = await telegram(token, 'getUpdates', { limit: 100, allowed_updates: ['message'] });
    const chat = updates.find(update => update.message?.chat?.type === 'private' &&
      [code, '/start ' + code, '/start@JSTDiscoAlertsBot ' + code].includes(update.message.text?.trim()))?.message.chat;
    if (!chat) return telegramSetup(code, 'Telegram hasn’t returned the pairing message yet. Open the bot above, send the command shown, then try again on this page.', 400);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await settingsKey(env),
      new TextEncoder().encode(JSON.stringify({ token, chatId: chat.id })));
    await telegram(token, 'sendMessage', { chat_id: chat.id, text: 'JST Disco test alert. New website enquiries will appear here.' });
    await env.BUCKET.put(telegramSettings, JSON.stringify({ iv: Array.from(iv), encrypted: Array.from(new Uint8Array(encrypted)) }));
    return page('Telegram connected', '<p>Check your bot’s chat for the test alert.</p><a href="/owner">Back to enquiries</a>');
  } catch {
    return telegramSetup(code, 'Telegram could not connect. Check that the token is current and try again.', 502);
  }
}

async function sendBookingAlert(booking, env, url) {
  const object = await env.BUCKET.get(telegramSettings);
  if (!object) return;
  const { iv, encrypted } = await object.json();
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(iv) }, await settingsKey(env), Uint8Array.from(encrypted));
  const { token, chatId } = JSON.parse(new TextDecoder().decode(decrypted));
  const body = [
    'JST Mobile Disco - new enquiry',
    `Name: ${booking.Name}`,
    `Email: ${booking.Email}`,
    `Phone: ${booking.Phone || 'Not provided'}`,
    `Event: ${booking.Event}`,
    `Date: ${booking.Date || 'To be confirmed'}`,
    `Venue: ${booking.Venue}`,
    `Notes: ${booking.Details || 'None'}`,
    new URL('/owner', url).href,
  ].join('\n');
  await telegram(token, 'sendMessage', { chat_id: chatId, text: body, link_preview_options: { is_disabled: true } });
}

async function submit(request, env, url, context) {
  if (request.headers.get('origin') !== url.origin) return page('Enquiry could not be sent', '<p>Please submit the form from the Bookings page.</p>', 403);
  const reader = request.body?.getReader();
  if (!reader) return page('Missing enquiry details', '<a href="/contact.html">Back to bookings</a>', 400);
  const decoder = new TextDecoder();
  let encoded = '';
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 32000) {
      await reader.cancel();
      return page('Enquiry is too long', '<a href="/contact.html">Back to bookings</a>', 413);
    }
    encoded += decoder.decode(value, { stream: true });
  }
  const form = new URLSearchParams(encoded + decoder.decode());
  const limits = { Name: 100, Email: 254, Phone: 32, Event: 30, Date: 10, Venue: 160, Details: 700 };
  const booking = Object.fromEntries(Object.keys(limits).map(key => [key, (form.get(key) ?? '').trim()]));
  if (!booking.Name || !booking.Venue || !events.includes(booking.Event) ||
      !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(booking.Email) ||
      (booking.Date && !/^\d{4}-\d{2}-\d{2}$/.test(booking.Date)) ||
      Object.entries(limits).some(([key, limit]) => booking[key].length > limit)) {
    return page('Check your enquiry', '<p>Enter a name, valid email address, event type and venue.</p><a href="/contact.html">Back to bookings</a>', 400);
  }
  booking.Received = new Date().toISOString();
  const newestFirst = String(9999999999999 - Date.now()).padStart(13, '0');
  await env.BUCKET.put(`enquiries/${newestFirst}-${crypto.randomUUID()}.json`, JSON.stringify(booking));
  context.waitUntil(sendBookingAlert(booking, env, url)
    .catch(() => console.error('JST Telegram alert failed')));
  return Response.redirect(new URL('/bookings/received', url), 303);
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/bookings' && request.method === 'POST') return await submit(request, env, url, context);
      if (url.pathname === '/owner/telegram' && ['GET', 'POST'].includes(request.method)) return await configureTelegram(request, env, url);
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
      if (url.pathname === '/login') return login(request, env);
      if (url.pathname === '/owner') return await dashboard(request, env, url);
      if (url.pathname === '/bookings/received') return page('Enquiry received', '<p>Thanks for getting in touch. Your enquiry has been sent to JST. Your date is confirmed once JST replies and agrees the booking.</p><a href="/">Back to home</a>');
      const path = url.pathname === '/' ? '/index.html' : url.pathname;
      if (path === '/style.css') return new Response(assets[path], { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
      if (path.endsWith('.html') && Object.hasOwn(assets, path)) {
        const event = url.searchParams.get('event');
        const body = path === '/contact.html' && events.includes(event)
          ? assets[path].replace(`<option>${event}</option>`, `<option selected>${event}</option>`)
          : assets[path];
        return html(body);
      }
      return page('Page not found', '<a href="/">Back to home</a>', 404);
    } catch (error) {
      console.error('JST request failed', error.name);
      return page('Temporarily unavailable', '<p>Please try again in a moment.</p>', 503);
    }
  },
};
