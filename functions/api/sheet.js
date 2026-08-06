// functions/api/sheet.js — Cloudflare Pages Function 版本
//
// Cloudflare Pages 的 Functions 跑在 Workers 运行时（不是 Node.js），
// 不能直接用 google-auth-library 这类依赖 Node 内置模块的包，
// 所以这版用浏览器/Workers 都有的 Web Crypto API 手写了 JWT 签名 + OAuth2
// token 交换的过程，不需要装任何 npm 依赖，也没有 node_modules。
//
// 文件路径就是路由：这个文件在 functions/api/sheet.js，
// 部署后自动对应 https://你的域名/api/sheet ，跟前端 fetch('/api/sheet?...') 正好对上。
//
// 需要在 Cloudflare Pages 项目的 Settings → Environment variables 里配置：
//   GOOGLE_SERVICE_ACCOUNT_JSON  service account 的 JSON key 文件内容，整个粘贴进去
//   ALLOWED_SHEET_IDS            （建议配）逗号分隔的 Sheet ID 白名单

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
// （标准的 OAuth2 JWT-bearer 流程，Google 官方 SDK 内部做的也是这件事）
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

export async function onRequestGet(context) {
  try {
    var url = new URL(context.request.url);
    var sheetId = (url.searchParams.get('sheetId') || '').trim();
    var tab = (url.searchParams.get('tab') || '').trim();
    if (!sheetId || !tab) return json({ error: '缺少 sheetId 或 tab 参数' }, 400);

    var allowListRaw = context.env.ALLOWED_SHEET_IDS || '';
    var allowList = allowListRaw.split(',').map(function(s){return s.trim();}).filter(Boolean);
    if (allowList.length && allowList.indexOf(sheetId) === -1) {
      return json({ error: '这个 sheetId 不在 ALLOWED_SHEET_IDS 白名单里' }, 403);
    }

    var accessToken = await getAccessToken(context.env);

    // Wide on purpose: real Sheets have shown the financial columns don't
    // always sit within A–Y (e.g. a block starting further right, past
    // column Y) — AZ leaves generous headroom so a wider layout still gets
    // fetched instead of silently truncating.
    var range = tab + '!A1:AZ600';
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
