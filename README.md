# Caelus 论坛

用 Star ID 登录后即可发帖、评论、点赞的轻量论坛。纯静态前端 + Caelus 终端后端。

## 结构

- `index.html` 论坛首页（列表：最新 / 热门排序、分类 / 话题筛选、搜索、分页）
- `post.html?id=` 帖子详情（正文、评论、回复、点赞、删除自己的内容）
- `new.html` 写帖子（Markdown 编辑器：编辑 / 预览 + 工具栏；分类选择）
- `mine.html` 我的帖子
- `assets/forum.js` 公共逻辑（登录、API、主题、Markdown 渲染、圆形光标、打开量上报）
- `assets/forum.css` 样式（变量与主站 theme.css 保持一致，OPPO Sans 4.0）

## 分类

固定五个分类：`讨论 / 作品 / 求助 / 公告 / 其他`（`server.js` 的 `FORUM_CATS`，终端管理页 `FORUM_CATS` 需保持一致）。
发帖必选（非法 / 缺省落「讨论」），历史无分类的帖子读取时补「讨论」。列表返回 `cats` 计数，支持 `?cat=` 筛选，
卡片、详情、我的帖子均显示分类徽标，搜索也能命中分类名（`matchIn` 含 `cat`）。

## Markdown

正文与评论均按 Markdown 渲染（`Forum.md`，自实现、无外部依赖、先转义再渲染防 XSS）。
支持：`#` 标题、`**粗体**`、`*斜体*`、`~~删除线~~`、`` `行内代码` ``、```` ```围栏代码``` ````、
`- / 1.` 列表、`>` 引用、`---` 分割线、表格、`[文字](链接)`、`![alt](图片)`、裸链接；单换行 → `<br>`。

## 后端

API 挂在终端控制台服务（`terminal-app/server.js`）的 `/api/forum/*`：

| 端点 | 说明 |
| --- | --- |
| `GET /api/forum/list` | 列表，支持 `sort=new\|hot`、`cat`、`tag`、`q`、`page`、`size`、`token`；返回 `cats` 分类计数，每帖含 `views`、`category` |
| `GET /api/forum/post?id=` | 详情（含评论），带 `token` 可得 liked / mine |
| `GET /api/forum/mine` | 我发的帖子（含已删除） |
| `POST /api/forum/create` | 发帖 `{token,title,body,tags,category}` |
| `POST /api/forum/comment` | 评论 `{token,postId,body,replyTo?}` |
| `POST /api/forum/like` | 点赞/取消 `{token,kind:post\|comment,id}` |
| `POST /api/forum/view` | 打开量上报 `{postId?}`（前端每次加载页面自动调用） |
| `GET /api/forum/stats?key=` | 论坛统计（管理密钥）：总/今日打开量、今日访客、帖子/评论数、近 30 天趋势、阅读排行 |
| `POST /api/forum/admin/list` | 管理端全量帖子（含已删除与正文）`{key}` |
| `POST /api/forum/admin/update` | 管理员编辑任意帖子 / 恢复显示 `{key,id,title?,body?,tags?,category?,hidden?}` |
| `POST /api/forum/delete` | 删除 `{token,kind,id}`（仅作者；管理密钥可删任意） |

数据落盘 `data/forum-posts.jsonl`、`data/forum-comments.jsonl`、`data/forum-stats.json`（打开量聚合，单 JSON），均已纳入 backup 接口与 `sync-data.py`。

注意：**令牌一律走请求体 / 查询参数**，终端网关会剥离 `Authorization` 头。

## 上线（GitHub Pages）

1. GitHub 组织 `caelustudio` 新建仓库 `forum`，推送本目录（`CNAME` 文件已就绪，内容 `forum.caelus.top`）。
2. 仓库 Settings → Pages → Deploy from a branch → `main` / `(root)`。
3. DNS 增加 CNAME 记录：`forum` → `caelustudio.github.io.`（与 news / shop 相同）。
