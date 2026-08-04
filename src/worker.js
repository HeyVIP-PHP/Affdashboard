// src/worker.js — Cloudflare Workers（新版"Workers + Assets"部署方式）统一入口
//
// 一个 Worker 脚本处理两件事：
//   1. 请求路径是 /api/sheet → 走后端代理逻辑（用 service account 私钥换 token，
//      再去调 Google Sheets API，返回 JSON）
//   2. 其它所有请求 → 交给 env.ASSETS（wrangler.jsonc 里配置的静态资源绑定），
//      也就是 public/ 目录下的 index.html 等静态文件
//
// 不依赖任何 npm 包，全部用 Workers 原生支持的 Web Crypto API 手写 JWT 签名，
// 所以就算 Cloudflare 的构建流程装了 node_modules，也不会被打进部署产物——
// 因为 wrangler.jsonc 里 assets.directory 指向的是 "./public"，
// 跟仓库根目录、node_modules 完全隔开，不会被一起扫描进去。

export default {
  async fetch(request, env, ctx) {
    var url = new URL(request.url);
    if (url.pathname === '/api/sheet') {
      return handleSheetRequest(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};

function base64url(input) {
  var base64;
  if (typeof input === 'string') {
    base64 = btoa(input);
  } else {
    var bytes = new Uint8Array(input);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    base64 = btoa(binary);
  }
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem) {
  var b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  var binary = atob(b64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// 用 service account 私钥签一个 JWT，再拿它跟 Google 换一个短期 access token
async function getAccessToken(env) {
  var raw = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('服务器缺少环境变量 GOOGLE_SERVICE_ACCOUNT_JSON');

  var creds;
  try { creds = JSON.parse(raw); }
  catch (e) { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON 不是合法 JSON，检查有没有粘贴完整'); }

  var now = Math.floor(Date.now() / 1000);
  var header = { alg: 'RS256', typ: 'JWT' };
  var claims = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  var signingInput = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claims));

  var cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(creds.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  var sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  var jwt = signingInput + '.' + base64url(sigBuf);

  var tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:
      'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') +
      '&assertion=' + encodeURIComponent(jwt)
  });
  var tokenData = await tokenResp.json();
  if (!tokenResp.ok) {
    throw new Error(tokenData.error_description || tokenData.error || 'OAuth token 交换失败');
  }
  return tokenData.access_token;
}

function json(obj, status, extraHeaders) {
  var headers = Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {});
  return new Response(JSON.stringify(obj), { status: status || 200, headers: headers });
}

async function handleSheetRequest(request, env) {
  try {
    var url = new URL(request.url);
    var sheetId = (url.searchParams.get('sheetId') || '').trim();
    var tab = (url.searchParams.get('tab') || '').trim();
    if (!sheetId || !tab) return json({ error: '缺少 sheetId 或 tab 参数' }, 400);

    var allowListRaw = env.ALLOWED_SHEET_IDS || '';
    var allowList = allowListRaw.split(',').map(function(s){return s.trim();}).filter(Boolean);
    if (allowList.length && allowList.indexOf(sheetId) === -1) {
      return json({ error: '这个 sheetId 不在 ALLOWED_SHEET_IDS 白名单里' }, 403);
    }

    var accessToken = await getAccessToken(env);

    var range = tab + '!A1:Y600';
    var sheetsUrl =
      'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheetId) +
      '/values/' + encodeURIComponent(range) + '?valueRenderOption=FORMATTED_VALUE';
    var resp = await fetch(sheetsUrl, { headers: { Authorization: 'Bearer ' + accessToken } });
    var data = await resp.json();
    if (!resp.ok) {
      return json({ error: (data.error && data.error.message) || 'Sheets API 请求失败' }, 500);
    }

    return json({ values: data.values || [] }, 200, {
      'Cache-Control': 's-maxage=30, stale-while-revalidate=120'
    });
  } catch (err) {
    return json({ error: (err && err.message) || String(err) }, 500);
  }
}
