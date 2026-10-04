# Caelus 论坛

用 Star ID 登录后即可发帖、评论、点赞的轻量论坛。纯静态前端 + Caelus 终端后端。

## 结构

- `index.html` 广场（列表：最新 / 热门排序、话题筛选、搜索、分页）
- `post.html?id=` 帖子详情（正文、评论、回复、点赞、删除自己的内容）
- `new.html` 写帖子
- `mine.html` 我的帖子
- `assets/forum.js` 公共逻辑（登录、API、主题、渲染工具）
- `assets/forum.css` 样式（变量与主站 theme.css 保持一致，OPPO Sans 4.0）

## 后端

API 挂在终端控制台服务（`terminal-app/server.js`）的 `/api/forum/*`：

| 端点 | 说明 |
| --- | --- |
| `GET /api/forum/list` | 列表，支持 `sort=new\|hot`、`tag`、`q`、`page`、`size`、`token` |
| `GET /api/forum/post?id=` | 详情（含评论），带 `token` 可得 liked / mine |
| `GET /api/forum/mine` | 我发的帖子（含已删除） |
| `POST /api/forum/create` | 发帖 `{token,title,body,tags}` |
| `POST /api/forum/comment` | 评论 `{token,postId,body,replyTo?}` |
| `POST /api/forum/like` | 点赞/取消 `{token,kind:post\|comment,id}` |
| `POST /api/forum/delete` | 删除 `{token,kind,id}`（仅作者；管理密钥可删任意） |

数据落盘 `data/forum-posts.jsonl`、`data/forum-comments.jsonl`，已纳入 backup 接口与 `sync-data.py`。

注意：**令牌一律走请求体 / 查询参数**，终端网关会剥离 `Authorization` 头。

## 上线（GitHub Pages）

1. GitHub 组织 `caelustudio` 新建仓库 `forum`，推送本目录（`CNAME` 文件已就绪，内容 `forum.caelus.top`）。
2. 仓库 Settings → Pages → Deploy from a branch → `main` / `(root)`。
3. DNS 增加 CNAME 记录：`forum` → `caelustudio.github.io.`（与 news / shop 相同）。
