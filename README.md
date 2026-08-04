# Affiliate Dashboard

前端仪表板 + 后端代理（service account 认证，Google Sheet 全程保持私有）。

## 架构

```
浏览器（index.html）
   │  fetch /api/sheet?sheetId=xxx&tab=Crickex
   ▼
/api/sheet.js（Vercel serverless function，Node.js）
   │  用 service account 私钥签名请求（私钥只存在这一层，环境变量里）
   ▼
Google Sheets API v4（spreadsheets.values.get）
```

前端**不会**直接连 Google，也**不会**看到任何私钥。Sheet 不需要"知道链接的人可查看"，
只要分享给你的 service account 邮箱（Viewer 权限）即可保持私有。

---

## 第一步：创建 Google service account

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)，新建一个项目（或用已有的）。
2. 左侧菜单 → API 和服务 → 库，搜索 **Google Sheets API**，点启用。
3. 左侧菜单 → API 和服务 → 凭据 → 创建凭据 → **服务账号**。
   - 名字随便取，比如 `affiliate-dashboard-reader`。
   - 不需要给它任何项目级角色（IAM 权限），直接创建即可——它对 Sheet 的权限
     完全靠你手动分享，不靠 IAM。
4. 创建完成后，进入这个 service account 详情页 → 密钥（Keys）→ 添加密钥 →
   创建新密钥 → 选 **JSON** → 下载。会下载一个 `xxxxx.json` 文件，**这个文件不要传到 GitHub**。
5. 打开这个 JSON 文件，记下 `client_email` 字段，形如：
   `affiliate-dashboard-reader@你的项目id.iam.gserviceaccount.com`

## 第二步：把这个邮箱加到每个 Google Sheet

4 个货币的 Sheet（BDT / INR / PKR / PHP）各做一次：

1. 打开 Sheet → 右上角"共享"
2. 粘贴上面那个 `client_email` 邮箱
3. 权限选 **查看者（Viewer）** 就够了，不需要编辑权限
4. 发送/完成

Sheet 本身权限设置维持私有（不用开"知道链接的人可查看"）。

## 第三步：把代码传到 GitHub

1. 新建一个 GitHub 仓库，比如 `affiliate-dashboard`
2. 把这个文件夹里的内容（`index.html`、`api/sheet.js`、`package.json`）传上去，
   保持目录结构不变（`api/sheet.js` 必须在 `api/` 目录下，Vercel 靠这个目录识别 serverless function）

## 第四步：部署到 Vercel

1. 打开 [vercel.com](https://vercel.com)，用 GitHub 账号登录
2. New Project → 选刚才那个仓库 → Import
3. 部署设置基本不用改（Vercel 会自动识别这是个 Node.js + 静态站点的项目）
4. 部署前先加环境变量（Project Settings → Environment Variables）：

   | Key | Value |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | 把第一步下载的 JSON 文件**整个内容**粘贴进来（一整行也行，Vercel 会保留原样） |
   | `ALLOWED_SHEET_IDS` | 4 个 Sheet 的 ID，逗号分隔，比如 `1AbC...,1XyZ...,1DeF...,1GhI...`（强烈建议配，防止这个接口被拿去当公共代理） |

5. 点 Deploy，等 1-2 分钟，Vercel 会给一个网址，形如：
   `https://affiliate-dashboard-xxxx.vercel.app`

## 第五步：填数据源

打开这个网址 → 点 ⚙️ Sheet Links → 4 个货币各填一次 Sheet 链接 → 品牌 Tab 名对一下。

## 之后更新代码

以后改 `index.html` 或 `api/sheet.js`，直接 `git push` 到 GitHub，Vercel 会自动重新部署，
不用手动操作。

## 常见问题

- **提示 "The caller does not have permission"**：Sheet 没有分享给 service account 邮箱，
  回第二步检查。
- **提示 "这个 sheetId 不在 ALLOWED_SHEET_IDS 白名单里"**：`ALLOWED_SHEET_IDS` 环境变量里
  漏填了这个 Sheet 的 ID，或者复制的时候多了空格。
- **提示 "后端代理没有返回 JSON"**：`api/sheet.js` 没有被 Vercel 正确识别成 serverless
  function，检查这个文件是不是真的在仓库的 `api/` 目录下。
- **本地想先测试**：装 [Vercel CLI](https://vercel.com/docs/cli)（`npm i -g vercel`），
  项目根目录跑 `vercel dev`，会在本地起一个同时跑静态页面和 `/api` 的开发服务器。
