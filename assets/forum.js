/* Caelus 论坛 公共逻辑：主题、顶栏、登录、API、渲染工具
   约定：所有接口令牌走请求体 / 查询参数（终端网关会剥离 Authorization 头） */
(function () {
  'use strict';

  var API = (function () {
    var h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '') return location.origin.replace(/:\d+$/, ':8099');
    return 'https://caelus-terminal.app.workbuddy.host';
  })();

  var TOKEN_KEY = 'starid_token';
  var THEME_KEY = 'theme';
  var state = { me: null, ready: false };

  /* ---------- 小工具 ---------- */
  function q(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function linkify(escaped) {
    return String(escaped || '').replace(/(https?:\/\/[^\s<]+)/g, function (u) {
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>';
    });
  }
  function timeAgo(ts) {
    var d = Date.now() - (ts || 0);
    if (!ts) return '';
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    if (d < 86400000 * 30) return Math.floor(d / 86400000) + ' 天前';
    var dt = new Date(ts);
    return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  }
  function avatarHtml(u, size) {
    var cls = 'av' + (size ? ' ' + size : '');
    u = u || {};
    if (u.avatar) return '<img class="' + cls + '" src="' + esc(u.avatar) + '" alt="">';
    var ch = String(u.nickname || u.author || '?').trim().charAt(0) || '?';
    return '<span class="' + cls + '">' + esc(ch) + '</span>';
  }
  function tagsHtml(tags, plain) {
    return (tags || []).map(function (t) {
      return '<span class="tag' + (plain ? ' plain' : '') + '" data-tag="' + esc(t) + '">#' + esc(t) + '</span>';
    }).join('');
  }

  /* ---------- Markdown 渲染（自实现，无外部依赖；先转义再渲染，安全优先） ----------
     支持：# 标题、**粗体**、*斜体*、~~删除线~~、`行内代码`、```围栏代码```、
     - / 1. 列表、> 引用、--- 分割线、| 表格 |、[文字](链接)、![alt](图片)、裸链接、
     单换行 → <br>，空行 → 段落。 */
  var STASH_RE = /\u0001(\d+)\u0001/g;
  function mdHref(u) {
    u = String(u || '').trim();
    return /^(https?:\/\/|mailto:)/i.test(u) ? u : '';
  }
  function mdCells(line) {
    return String(line).replace(/^\s*\|/, '').replace(/\|\s*$/, '')
      .split('|').map(function (c) { return c.trim(); });
  }
  function md(src) {
    if (!src) return '';
    var text = esc(String(src));
    var stash = [];
    function put(html) { stash.push(html); return '\u0001' + (stash.length - 1) + '\u0001'; }

    // 围栏代码块（内容不参与后续解析）
    text = text.replace(/```[a-zA-Z0-9+#-]*\n?([\s\S]*?)(?:```|$)/g, function (m, code) {
      return '\n' + put('<pre class="md-pre"><code>' + code.replace(/\n+$/, '') + '</code></pre>') + '\n\n';
    });
    // 行内代码
    text = text.replace(/`([^`\n]+)`/g, function (m, c) {
      return put('<code class="md-icode">' + c + '</code>');
    });
    // 图片（必须先于链接解析）
    text = text.replace(/!\[([^\]]*)\]\(([^\s)]+)\)/g, function (m, alt, u) {
      var h = mdHref(u);
      if (!h) return m;
      return put('<img class="md-img" src="' + h + '" alt="' + alt + '" loading="lazy" referrerpolicy="no-referrer">');
    });
    // 链接
    text = text.replace(/\[([^\]\n]+)\]\(([^\s)]+)\)/g, function (m, label, u) {
      var h = mdHref(u);
      if (!h) return m;
      return put('<a class="md-a" href="' + h + '" target="_blank" rel="noopener noreferrer">' + label + '</a>');
    });
    // 裸链接
    text = text.replace(/(https?:\/\/[^\s<>()\u0001]+)/g, function (u) {
      return put('<a class="md-a" href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>');
    });
    // 行内样式
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    text = text.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

    var lines = text.split('\n');
    var out = [];
    var buf = [];
    function flush() {
      if (!buf.length) return;
      out.push('<p>' + buf.join('<br>') + '</p>');
      buf = [];
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) { flush(); continue; }
      if (/^\u0001\d+\u0001$/.test(line)) { flush(); out.push(line); continue; }
      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) { flush(); out.push('<hr class="md-hr">'); continue; }

      var hm = /^(#{1,6})\s+(.+)$/.exec(line);
      if (hm) {
        flush();
        var lv = hm[1].length;
        out.push('<h' + lv + ' class="md-h md-h' + lv + '">' + hm[2].replace(/\s*#+\s*$/, '') + '</h' + lv + '>');
        continue;
      }

      if (/^&gt;\s?/.test(line)) {
        flush();
        var quote = [];
        while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*&gt;\s?/, '').trim());
          i++;
        }
        i--;
        out.push('<blockquote class="md-quote">' + quote.join('<br>') + '</blockquote>');
        continue;
      }

      // 表格：本行含 |，下一行是 |---| 分隔行
      var sep = (lines[i + 1] || '').trim();
      if (line.indexOf('|') >= 0 && sep.indexOf('-') >= 0 && /^\|?[\s:|-]+\|[\s:|-]*$/.test(sep)) {
        flush();
        var head = mdCells(line);
        i += 2;
        var rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') >= 0) {
          rows.push(mdCells(lines[i]));
          i++;
        }
        i--;
        out.push('<div class="md-table-wrap"><table class="md-table"><thead><tr>' +
          head.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>' +
          rows.map(function (r) {
            return '<tr>' + head.map(function (_, k) { return '<td>' + (r[k] || '') + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>');
        continue;
      }

      if (/^(?:[-*+]|\d+\.)\s+/.test(line)) {
        flush();
        var ordered = /^\d+\.\s+/.test(line);
        var items = [];
        while (i < lines.length && /^(?:[-*+]|\d+\.)\s+/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^(?:[-*+]|\d+\.)\s+/, ''));
          i++;
        }
        i--;
        var tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + ' class="md-list">' +
          items.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</' + tag + '>');
        continue;
      }

      buf.push(line);
    }
    flush();
    return out.join('\n').replace(STASH_RE, function (m, n) { return stash[+n] || ''; });
  }

  /* ---------- 令牌 ---------- */
  function token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
  function clearToken() { setToken(''); state.me = null; }

  /* ---------- 请求 ---------- */
  function api(path, body, method) {
    var opt = { method: method || (body ? 'POST' : 'GET'), headers: {}, cache: 'no-store' };
    if (body) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    return fetch(API + path, opt).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: '服务返回异常（' + r.status + '）' }; });
    });
  }
  function authBody(extra) {
    var b = extra || {};
    b.token = token();
    return b;
  }

  /* ---------- 登录状态 ---------- */
  function refreshMe() {
    if (!token()) { state.me = null; state.ready = true; return Promise.resolve(null); }
    return api('/api/auth/me', authBody()).then(function (d) {
      state.me = (d && d.ok && d.user) ? d.user : null;
      if (!state.me) clearToken();
      state.ready = true;
      return state.me;
    }).catch(function () { state.ready = true; return null; });
  }
  function login(email, password) {
    return api('/api/auth/login', { email: email, password: password }).then(function (d) {
      if (d && d.ok && d.token) { setToken(d.token); state.me = d.user || null; }
      return d || { ok: false, error: '网络异常，请稍后重试' };
    });
  }
  function logout() {
    var t = token();
    var done = function () { clearToken(); location.reload(); };
    if (!t) return done();
    api('/api/auth/logout', { token: t }).then(done).catch(done);
  }
  function okStart() {
    try { sessionStorage.setItem('ok_return', location.pathname + location.search); } catch (e) {}
    location.href = API + '/api/auth/ok/start?next=' + encodeURIComponent(location.origin + '/');
  }
  // 处理 OK 回跳：?ok_code=<一次性码> 换令牌；?ok_error=<原因> 展示提示
  function handleOkReturn() {
    var sp = new URLSearchParams(location.search);
    var code = sp.get('ok_code');
    var err = sp.get('ok_error');
    var back = '';
    try { back = sessionStorage.getItem('ok_return') || ''; sessionStorage.removeItem('ok_return'); } catch (e) {}
    function clean() {
      var u = new URL(location.href);
      ['ok_code', 'ok_error', 'ok_new'].forEach(function (k) { u.searchParams.delete(k); });
      history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash);
    }
    if (err) {
      clean();
      return Promise.resolve({ ok: false, error: decodeURIComponent(err) });
    }
    if (!code) return Promise.resolve(null);
    return api('/api/auth/ok/session', { code: code }).then(function (d) {
      if (d && d.ok && d.token) {
        setToken(d.token);
        state.me = d.user || null;
        if (back && back !== location.pathname + location.search) { location.replace(back); return { ok: true }; }
      }
      clean();
      return d || { ok: false, error: '登录失败，请重试' };
    }).catch(function () { clean(); return { ok: false, error: '网络异常，请稍后重试' }; });
  }

  /* ---------- 点赞 ---------- */
  function like(kind, id) {
    return api('/api/forum/like', authBody({ kind: kind, id: id }));
  }
  function remove(kind, id) {
    return api('/api/forum/delete', authBody({ kind: kind, id: id }));
  }
  /* ---------- 打开量上报（每次页面加载调用一次；postId 可空） ---------- */
  function track(postId) {
    try { api('/api/forum/view', { postId: postId || '' }).catch(function () {}); } catch (e) {}
  }

  /* ---------- 主题 ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  }
  function currentTheme() {
    var t = 'dark';
    try { t = localStorage.getItem(THEME_KEY) || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch (e) {}
    return t;
  }
  function toggleTheme() { applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'); }

  /* ---------- 顶栏 / 页脚 ---------- */
  var NAV = [
    { href: '/', key: 'index', label: '论坛' },
    { href: '/mine.html', key: 'mine', label: '我的帖子' }
  ];

  function shell(active) {
    var nav = NAV.map(function (n) {
      return '<a href="' + n.href + '" class="' + (n.key === active ? 'on' : '') + '">' + n.label + '</a>';
    }).join('');
    var bar = document.createElement('header');
    bar.className = 'topbar';
    bar.innerHTML =
      '<a class="tb-brand" href="/"><img src="/assets/favicon.png" alt=""><b>Caelus 论坛</b></a>' +
      '<nav class="tb-nav">' + nav + '</nav>' +
      '<div class="tb-search">' +
        '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 1 0-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"/></svg>' +
        '<input id="tbSearch" type="search" placeholder="搜索帖子…" autocomplete="off">' +
      '</div>' +
      '<div class="tb-right" id="tbRight"></div>';
    document.body.insertBefore(bar, document.body.firstChild);

    var sp = new URLSearchParams(location.search);
    var se = q('#tbSearch');
    if (se) {
      if (sp.get('q') && location.pathname === '/' ) se.value = sp.get('q');
      se.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var v = se.value.trim();
        location.href = v ? '/?q=' + encodeURIComponent(v) : '/';
      });
    }
    renderRight();
  }

  function renderRight() {
    var box = q('#tbRight');
    if (!box) return;
    var u = state.me;
    box.innerHTML =
      (u
        ? '<a class="btn btn-primary" href="/new.html">发帖</a>' +
          '<div class="me-chip" id="meChip" title="账号菜单">' + avatarHtml(u, 'sm') + '<b>' + esc(u.nickname || 'Star ID 用户') + '</b></div>'
        : '<button class="btn btn-primary" id="loginBtn">登录 / 注册</button>') +
      '<button class="theme-toggle" id="themeBtn" title="切换主题"><svg viewBox="0 0 24 24"><path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-16l2.4 3.2L18 4.1l-.9 3.7 3.8.6-2.6 2.7 2.6 2.7-3.8.6.9 3.7-3.6-1.1L12 20l-2.4-3.2L6 17.9l.9-3.7-3.8-.6L5.7 11 3.1 8.3l3.8-.6L6 4.1l3.6 1.1z"/></svg></button>';

    var lb = q('#loginBtn');
    if (lb) lb.addEventListener('click', function () { openLogin(); });
    var tb = q('#themeBtn');
    if (tb) tb.addEventListener('click', toggleTheme);
    var chip = q('#meChip');
    if (chip) chip.addEventListener('click', function (e) {
      e.stopPropagation();
      var ex = q('#meMenu');
      if (ex) { ex.remove(); return; }
      var m = document.createElement('div');
      m.id = 'meMenu';
      m.style.cssText = 'position:fixed;z-index:150;background:var(--bg-elevated);border:1px solid var(--border-color);' +
        'border-radius:13px;padding:6px;box-shadow:var(--shadow-pop);min-width:168px;font-size:.82rem';
      m.innerHTML =
        '<div style="padding:9px 11px 7px;border-bottom:1px solid var(--border-color);margin-bottom:5px">' +
          '<div style="font-size:.8rem">' + esc(u.nickname || 'Star ID 用户') + '</div>' +
          '<div style="font-size:.68rem;color:var(--text-muted);font-family:ui-monospace,Menlo,monospace">' + esc(u.starId || '') + '</div>' +
        '</div>' +
        '<a href="/mine.html" style="display:block;padding:8px 11px;border-radius:8px">我的帖子</a>' +
        '<a href="https://www.caelus.top/account/" style="display:block;padding:8px 11px;border-radius:8px">账号中心</a>' +
        '<button id="logoutBtn" style="display:block;width:100%;text-align:left;padding:8px 11px;border:0;background:transparent;color:var(--text-primary);border-radius:8px;cursor:pointer;font-size:.82rem">退出登录</button>';
      document.body.appendChild(m);
      var r = chip.getBoundingClientRect();
      m.style.top = (r.bottom + 8) + 'px';
      m.style.left = Math.max(12, r.right - m.offsetWidth) + 'px';
      q('#logoutBtn', m).addEventListener('click', logout);
      setTimeout(function () {
        document.addEventListener('click', function close() {
          var n = q('#meMenu'); if (n) n.remove();
          document.removeEventListener('click', close);
        }, { once: true });
      }, 0);
    });
  }

  /* ---------- 登录弹窗 ---------- */
  function openLogin() {
    var wrap = document.createElement('div');
    wrap.className = 'modal';
    wrap.id = 'loginModal';
    wrap.innerHTML =
      '<div class="modal-box">' +
        '<h3>登录 Caelus 论坛</h3>' +
        '<p class="sub">用 Star ID 登录后即可发帖、评论和点赞。没有 Star ID 也没关系，同样支持用 OK 账号直接登录或注册。</p>' +
        '<div class="field"><label>Star ID 邮箱</label><input id="liEmail" type="email" placeholder="you@example.com" autocomplete="username"></div>' +
        '<div class="field"><label>密码</label><input id="liPass" type="password" placeholder="密码" autocomplete="current-password"></div>' +
        '<button class="btn btn-primary" id="liBtn" style="width:100%;padding:.6rem">登录</button>' +
        '<p class="msg" id="liMsg"></p>' +
        '<div class="divider">或</div>' +
        '<button class="ok-btn" id="okBtn"><img src="/assets/favicon.png" alt="">使用 OK 账号登录 / 注册</button>' +
        '<p class="hint" style="font-size:.74rem;color:var(--text-muted);margin:14px 0 0;line-height:1.7">还没有 Star ID？<a class="link-btn" href="https://www.caelus.top/account/" target="_blank" rel="noopener">前往账号中心注册</a></p>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) wrap.remove(); });
    var box = q('#liMsg');
    function err(t) { if (box) { box.className = 'msg err'; box.textContent = t; } }
    function busy(b) { var btn = q('#liBtn'); if (btn) { btn.disabled = b; btn.textContent = b ? '登录中…' : '登录'; } }
    function submit() {
      var e = q('#liEmail').value.trim(), p = q('#liPass').value;
      if (!e || !p) return err('请填写邮箱和密码');
      busy(true);
      login(e, p).then(function (d) {
        busy(false);
        if (d && d.ok) {
          wrap.remove();
          renderRight();
          document.dispatchEvent(new CustomEvent('forum:login', { detail: state.me }));
        } else {
          err((d && d.error) || '登录失败，请稍后重试');
        }
      });
    }
    q('#liBtn').addEventListener('click', submit);
    q('#liPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    q('#liEmail').addEventListener('keydown', function (e) { if (e.key === 'Enter') q('#liPass').focus(); });
    q('#okBtn').addEventListener('click', okStart);
    var f = q('#liEmail'); if (f) f.focus();
  }

  /* 需要登录的动作统一走这里 */
  function requireLogin(msg) {
    if (state.me) return true;
    openLogin();
    var m = q('#liMsg');
    if (m && msg) { m.className = 'msg err'; m.textContent = msg; }
    return false;
  }

  /* ---------- 初始化 ---------- */
  function init(opts) {
    opts = opts || {};
    applyTheme(currentTheme());
    return handleOkReturn().then(function (r) {
      return refreshMe().then(function () {
        shell(opts.active);
        if (r && r.error) {
          setTimeout(function () {
            if (!state.me) { openLogin(); var m = q('#liMsg'); if (m) { m.className = 'msg err'; m.textContent = r.error; } }
            else { alert(r.error); }
          }, 60);
        }
        document.addEventListener('forum:login', function () {
          if (typeof opts.onLogin === 'function') opts.onLogin();
        });
        if (typeof opts.onReady === 'function') opts.onReady();
        if (!opts.noTrack) track(opts.postId || '');
        return state.me;
      });
    });
  }

  window.Forum = {
    API: API, api: api, authBody: authBody,
    token: token, setToken: setToken, clearToken: clearToken,
    me: function () { return state.me; },
    refreshMe: refreshMe, login: login, logout: logout, okStart: okStart,
    like: like, remove: remove, track: track, requireLogin: requireLogin, openLogin: openLogin,
    esc: esc, linkify: linkify, md: md, timeAgo: timeAgo, avatarHtml: avatarHtml, tagsHtml: tagsHtml,
    q: q, init: init, renderRight: renderRight
  };
})();
