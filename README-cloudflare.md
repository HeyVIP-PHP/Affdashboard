# 部署到 Cloudflare Pages

跟 Vercel 版本的区别：Cloudflare Pages 的后端代码放在 **`functions/api/sheet.js`**（不是
`api/sheet.js`），而且这版没用 `google-auth-library`，是用 Web Crypto API 手写的 JWT 签名
+ OAuth2 换 token —— 因为 Cloudflare Pages Functions 跑在 Workers 运行时，不是 Node.js，
不能直接用依赖 Node 内置模块的 npm 包。这版本**不需要装任何依赖，没有 `node_modules`**。

我已经用一对自己生成的测试密钥跑过完整流程（签名 → 用公钥验证签名 → 走完整个 mock 请求链路），
确认签名逻辑本身是对的，不是"跑起来不报错但签名其实是错的"那种坑。

## 如果你是从 Vercel 版本切过来的

先把仓库里这两个东西删掉（Cloudflare 用不到，留着也没关系但容易搞混）：
- `api/sheet.js`（Vercel 那版，Node.js 语法）
- `package.json`

然后把这两个文件加进仓库：
- `functions/api/sheet.js`（这个新版本）
- `index.html` 不用动，还是原来那份，前端代码没变

目录结构应该长这样：

```
你的仓库/
├── index.html
└── functions/
    └── api/
        └── sheet.js
```

`functions/` 目录下的文件路径就是路由——`functions/api/sheet.js` 部署后自动对应
`https://你的域名/api/sheet`，正好跟前端 `fetch('/api/sheet?...')` 对上，不用额外配路由。

---

## 第一步：Google service account（如果之前 Vercel 步骤已经做过，跳过这步）

1. [Google Cloud Console](https://console.cloud.google.com/) 建项目 → 启用 **Google Sheets API**
2. API 和服务 → 凭据 → 创建凭据 → 服务账号，随便取名
3. 进这个 service account → 密钥 → 添加密钥 → 创建新密钥 → JSON → 下载
   （这个 JSON 文件本身**不要**传到 GitHub）
4. 记下里面的 `client_email`
5. 把这个邮箱加到 4 个 Google Sheet 的"共享"里，权限选 **查看者**

## 第二步：把新文件推到 GitHub

把 `functions/api/sheet.js` 加进你已经建好的仓库，`git push`。

## 第三步：在 Cloudflare 建 Pages 项目

1. 登录 [dash.cloudflare.com](https://dash.cloudflare.com) → 左侧 **Workers 和 Pages** → **创建**
2. 选 **Pages** → **连接到 Git** → 选你的 GitHub 账号 → 选这个仓库 → **开始设置**
3. 构建设置：
   - 框架预设：**无 (None)**
   - 构建命令：**留空**
   - 构建输出目录：**`/`**（因为 `index.html` 就在仓库根目录）
4. 先别急着点部署，往下滚，找 **环境变量** → 添加：

   | 变量名 | 值 |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | 把 Google 那个 JSON 文件的**完整内容**粘贴进来 |
   | `ALLOWED_SHEET_IDS` | 4 个 Sheet 的 ID，逗号分隔（强烈建议配，防止代理被盗用） |

   注意 Cloudflare Pages 环境变量要分 **Production** 和 **Preview** 两套，建议两边都加一份，
   不然分支预览部署会读不到。

5. 点 **保存并部署**，等 1 分钟左右，会给一个 `https://你的项目名.pages.dev` 的网址

## 第四步：打开网址，填 Sheet 链接

⚙️ Sheet Links → 4 个货币各填一次 → 品牌 Tab 名对一下。

## 之后改代码

`git push` 到 GitHub，Cloudflare Pages 会自动重新构建部署，不用手动操作。

## 常见问题

- **`functions/api/sheet.js` 没生效，请求 `/api/sheet` 直接 404**：检查文件路径是不是真的是
  `functions/api/sheet.js`（注意是 `functions` 不是 `function`，很容易手滑打错）。
- **`GOOGLE_SERVICE_ACCOUNT_JSON` 相关报错**：粘贴的时候如果这个值本身包含换行符（PEM 私钥
  本来就有换行），Cloudflare 的环境变量输入框能正常处理多行文本，不需要自己转义，直接把 JSON
  文件内容原样粘贴进去就行。
- **改了环境变量没生效**：Cloudflare Pages 改环境变量后需要重新触发一次部署才会生效
  （Deployments 页面里 Retry deployment，或者随便 push 一次代码）。
- **想本地测试**：装 [Wrangler](https://developers.cloudflare.com/workers/wrangler/)
  (`npm i -g wrangler`)，项目根目录跑 `wrangler pages dev .`，会在本地起一个同时跑
  静态页面和 `/functions` 的开发服务器（需要用 `.dev.vars` 文件本地提供环境变量）。
