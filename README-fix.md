# 部署到 Cloudflare Workers（修复"Asset too large"报错）

## 这次的目录结构变了，很重要

跟之前不一样，这次静态页面和 Worker 代码要**分开放**：

```
你的仓库/
├── public/
│   └── index.html          ← 仪表板本体，挪到 public/ 目录下了
├── src/
│   └── worker.js            ← 后端代理 + 静态资源路由，合并成一个 Worker 脚本
├── wrangler.jsonc            ← 关键：告诉 Cloudflare 静态资源只从 public/ 读，
│                               不要扫整个仓库根目录（这就是上次报错的根源）
└── .gitignore                 ← 防止 node_modules 再次被误传
```

`wrangler.jsonc` 里这行是关键：

```jsonc
"assets": { "directory": "./public", "binding": "ASSETS" }
```

这样不管仓库根目录有没有 `node_modules`，Cloudflare 部署时只会去扫 `public/` 这一个文件夹当
静态资源，跟根目录彻底隔开，不会再把那个 122MB 的 `workerd` 二进制文件当成"要部署的资源"。

## 第一步：清空重传（别在旧仓库基础上改，容易漏东西）

1. 打开你 GitHub 上的这个仓库
2. 把仓库里现有的东西**全删掉**（包括 `node_modules`、旧的 `package.json`、旧的 `api/` 或
   `functions/` 文件夹——这次结构变了，混着旧文件容易出问题）
3. 按上面的目录结构，把这次给你的 4 个文件（`public/index.html`、`src/worker.js`、
   `wrangler.jsonc`、`.gitignore`）传上去，保持路径不变

## 第二步：Google service account（如果之前已经做过，跳过）

1. Google Cloud Console 建项目 → 启用 Google Sheets API
2. 创建服务账号 → 生成 JSON 密钥并下载（不要传到 GitHub）
3. 记下 `client_email`，分享进 4 个 Sheet，权限选 **查看者**

## 第三步：Cloudflare 项目设置

回到你正在配置的这个 Cloudflare 项目：

1. **Settings** 里确认 **Deploy command** 是 `npx wrangler deploy`（应该已经是，不用改）
2. **Build command** 留空（不需要构建步骤）
3. 环境变量（Settings → Environment Variables，或者部署流程里那一步）：

   | 变量名 | 值 |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | Google 那个 JSON 文件的完整内容 |
   | `ALLOWED_SHEET_IDS` | 4 个 Sheet 的 ID，逗号分隔 |

4. 重新触发部署（Deployments 页面 → Retry deployment，或者 push 一次代码自动触发）

## 第四步：确认部署日志

这次日志里应该会看到：
```
✨ Read 5 files from the assets directory /opt/buildhome/repo/public
```
（不再是 4435 个文件，因为只扫 `public/` 这一个小文件夹了）

如果还是报 "Asset too large"，大概率是仓库里 `node_modules` 没删干净，或者
`wrangler.jsonc` 里 `directory` 那行没生效——把最新的部署日志发我，我帮你看。

## 第五步：打开网址，填 Sheet 链接

部署成功后会给一个 `xxx.workers.dev`（或者你在项目设置里绑定的自定义域名）的网址，
打开 → ⚙️ Sheet Links → 4 个货币各填一次。
