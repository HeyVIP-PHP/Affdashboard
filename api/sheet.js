// /api/sheet — 后端代理，专门给前端仪表板用
//
// 前端不直接连 Google，而是打这个接口。这里拿着 service account 私钥
// （放在环境变量 GOOGLE_SERVICE_ACCOUNT_JSON 里，绝不会进 Git 仓库、绝不会发到浏览器）
// 去调 Google Sheets API v4，把读到的原始行数据用 JSON 返回给前端。
//
// 用法：GET /api/sheet?sheetId=xxxxxxx&tab=Crickex
//
// 需要的环境变量（在 Vercel 项目的 Settings → Environment Variables 里配置）：
//   GOOGLE_SERVICE_ACCOUNT_JSON  service account 的 JSON key 文件内容，整个粘贴成一行
//   ALLOWED_SHEET_IDS            （可选，强烈建议配）逗号分隔的 Sheet ID 白名单，
//                                 比如 "sheetId1,sheetId2,sheetId3,sheetId4"，
//                                 防止这个接口被人拿去当公共代理探测别的 Sheet

const { JWT } = require('google-auth-library');

let cachedClient = null;
function getClient() {
  if (cachedClient) return cachedClient;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('服务器缺少环境变量 GOOGLE_SERVICE_ACCOUNT_JSON');
  }

  let creds;
  try {
    creds = JSON.parse(raw);
  } catch (e) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON 不是合法 JSON，检查有没有粘贴完整/多余换行');
  }

  cachedClient = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return cachedClient;
}

module.exports = async (req, res) => {
  // 只允许 GET，且给基本的浏览器缓存（30秒），减轻重复刷新时对 Sheets API 的压力
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const sheetId = (req.query.sheetId || '').toString().trim();
  const tab = (req.query.tab || '').toString().trim();

  if (!sheetId || !tab) {
    res.status(400).json({ error: '缺少 sheetId 或 tab 参数' });
    return;
  }

  const allowListRaw = process.env.ALLOWED_SHEET_IDS || '';
  const allowList = allowListRaw.split(',').map((s) => s.trim()).filter(Boolean);
  if (allowList.length && allowList.indexOf(sheetId) === -1) {
    res.status(403).json({ error: '这个 sheetId 不在 ALLOWED_SHEET_IDS 白名单里' });
    return;
  }

  try {
    const client = getClient();
    // A1:Y 覆盖到 Revenue USD 列；600 行留够一整年 12 个月的余量
    const range = tab + '!A1:Y600';
    const url =
      'https://sheets.googleapis.com/v4/spreadsheets/' +
      encodeURIComponent(sheetId) +
      '/values/' +
      encodeURIComponent(range) +
      '?valueRenderOption=FORMATTED_VALUE';

    const apiResp = await client.request({ url });

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    res.status(200).json({ values: (apiResp.data && apiResp.data.values) || [] });
  } catch (err) {
    var msg = (err && err.message) || String(err);
    // Google 认证/权限报错通常很直白，直接透传方便排查
    if (err && err.response && err.response.data && err.response.data.error) {
      msg = err.response.data.error.message || msg;
    }
    res.status(500).json({ error: msg });
  }
};
