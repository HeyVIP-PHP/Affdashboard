# Affiliate Dashboard — 最终版（Cloudflare Pages）

这是接下来要用的**唯一**一版，之前给过的 Vercel 版、Workers 版都不要了，别再混着用。
只有 2 个文件，零依赖：

```
index.html
functions/api/sheet.js
```

## 第一步：仓库清空重传

1. 打开你 GitHub 上的 `Affdashboard` 仓库
2. 把里面**现在有的所有东西全删掉**（`api/`、`functions/api/`、`public/`、`src/`、
   `wrangler.jsonc`、`.gitignore`、`package.json`、所有 README，一个不留）
3. 传这次给的 2 个文件上去，保持路径：
   - `index.html` 放仓库根目录
   - `functions/api/sheet.js` 保持 `functions/api/` 这个路径

## 第二步：Cloudflare 这边要重新建一个 Pages 项目（不是 Workers）

你现在那个 `affiliate-dashboard` 是 Workers 项目，Workers 不能转成 Pages，只能新建：

1. 先去把旧的 `affiliate-dashboard`（Workers 那个）删掉：Workers & Pages 列表页 →
   这个项目右边 `...` → Delete
2. Workers & Pages → **创建** → 这次选 **Pages** 这个 Tab（不是 Workers）
3. 连接到 Git → 选你的仓库 → Begin setup
4. 构建设置：
   - 框架预设：**None**
   - 构建命令：**留空**
   - 构建输出目录：**`/`**（因为 `index.html` 就在根目录）
5. 环境变量（跟之前一样）：

   | 变量名 | 值 |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | Google service account 的 JSON 密钥完整内容 |
   | `ALLOWED_SHEET_IDS` | 4 个 Sheet 的 ID，逗号分隔 |

   Production 和 Preview 两边都要加一份。

6. 保存并部署

部署成功后网址是 `https://项目名.pages.dev` 这种格式，**项目名随时能在 Settings 里改**，
不会再遇到 Workers 那种改不了名的问题。

## 第三步：打开网址，填 Sheet 链接

⚙️ Sheet Links → 4 个货币各填一次 → 品牌 Tab 名对一下。

## 排查

- 报错信息、部署日志有问题，直接截图/复制发我，我帮你看。
- Google service account 部分如果之前已经建好、Sheet 也分享过了，这步不用重做，
  同一个 JSON 密钥继续用。
