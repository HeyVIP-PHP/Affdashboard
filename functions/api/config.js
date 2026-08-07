// functions/api/config.js — Cloudflare Pages Function
//
// Server-side storage for the "Sheet Links" config (Google Sheet URL + brand
// tab names per currency), backed by Cloudflare KV, so everyone who opens the
// dashboard sees the SAME config — fixes the earlier localStorage-only
// behavior where each person's setup only lived in their own browser.
//
// Needs a KV namespace bound to this Pages project as CONFIG_KV:
//   Cloudflare dashboard → Workers & Pages → your Pages project → Settings →
//   Functions → KV namespace bindings → add binding, Variable name: CONFIG_KV,
//   pointing at a KV namespace you create under Workers & Pages → KV.
//
// Optional write protection: set an environment variable CONFIG_WRITE_TOKEN.
// If set, POST requests must include header "X-Config-Token" matching it, or
// they're rejected — stops a random visitor with the URL from overwriting
// everyone's Sheet Links. If CONFIG_WRITE_TOKEN isn't set, writes are open
// (matches the rest of this app's current no-login setup).

var KV_KEY = 'sheet-links';

function json(obj, status, extraHeaders) {
  var headers = Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {});
  return new Response(JSON.stringify(obj), { status: status || 200, headers: headers });
}

export async function onRequestGet(context) {
  try {
    if (!context.env.CONFIG_KV) {
      return json({ error: 'CONFIG_KV KV namespace 没有绑定到这个 Pages 项目，去 Settings → Functions → KV namespace bindings 加一个' }, 500);
    }
    var raw = await context.env.CONFIG_KV.get(KV_KEY);
    return json({ value: raw ? JSON.parse(raw) : {} }, 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    return json({ error: String(err && err.message || err) }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    if (!context.env.CONFIG_KV) {
      return json({ error: 'CONFIG_KV KV namespace 没有绑定到这个 Pages 项目，去 Settings → Functions → KV namespace bindings 加一个' }, 500);
    }
    var writeToken = context.env.CONFIG_WRITE_TOKEN;
    if (writeToken) {
      var supplied = context.request.headers.get('X-Config-Token') || '';
      if (supplied !== writeToken) return json({ error: '缺少或不对的 X-Config-Token，写入被拒绝' }, 403);
    }
    var body = await context.request.json();
    await context.env.CONFIG_KV.put(KV_KEY, JSON.stringify(body));
    return json({ ok: true });
  } catch (err) {
    return json({ error: String(err && err.message || err) }, 500);
  }
}
