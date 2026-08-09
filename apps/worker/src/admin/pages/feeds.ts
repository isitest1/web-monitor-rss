import type { Feed } from '@web-monitor/shared';
import { layout } from './layout.js';
import { escapeHtml, escapeJs } from './escape.js';

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

export function feedsPage(feeds: Feed[], csrfToken: string): string {
  const body = `
<p><a href="/monitors">&larr; Watchlistへ戻る</a></p>
<div class="card">
  <h1>Feed管理</h1>
  <table>
    <thead>
      <tr><th>名前</th><th>種別</th><th>有効</th><th>トークン</th><th>発行日時</th><th>最終利用</th><th>操作</th></tr>
    </thead>
    <tbody id="feeds-table-body">
      ${feeds
        .map(
          (feed) => `<tr data-feed-id="${escapeHtml(feed.id)}">
            <td>${escapeHtml(feed.name)}</td>
            <td>${feed.kind === 'system' ? 'システム' : 'コンテンツ'}</td>
            <td>${feed.enabled ? '有効' : '無効'}</td>
            <td>${feed.rssTokenStatus === 'active' ? `${escapeHtml(feed.rssTokenPrefix ?? '')}... (有効)` : '失効済み'}</td>
            <td>${escapeHtml(formatDate(feed.rssTokenIssuedAt))}</td>
            <td>${escapeHtml(formatDate(feed.rssTokenLastUsedAt))}</td>
            <td>
              <button class="secondary rotate-btn" data-id="${escapeHtml(feed.id)}">トークン再発行</button>
              <button class="secondary revoke-btn" data-id="${escapeHtml(feed.id)}">失効</button>
            </td>
          </tr>`,
        )
        .join('')}
    </tbody>
  </table>
  <div id="token-reveal"></div>
</div>

<div class="card">
  <h2>Feedを作成</h2>
  <form id="create-feed-form">
    <p><label>名前<br/><input type="text" id="feed-name" required /></label></p>
    <p><label>スラッグ（半角英数とハイフン）<br/><input type="text" id="feed-slug" pattern="[a-z0-9-]+" required /></label></p>
    <p><label>種別<br/>
      <select id="feed-kind">
        <option value="content">コンテンツ</option>
        <option value="system">システム</option>
      </select>
    </label></p>
    <input type="submit" value="作成" />
  </form>
</div>

<script>
const csrfToken = '${escapeJs(csrfToken)}';

function showToken(feedName, rssUrl, rssToken) {
  const el = document.getElementById('token-reveal');
  el.innerHTML =
    '<div class="card" style="border: 2px solid #1a7f37;">' +
    '<strong>' + feedName + ' のRSSトークンが発行されました。この画面でのみ表示されます。</strong>' +
    '<p style="word-break: break-all;">' + rssUrl + '</p>' +
    '<button id="copy-token-btn">URLをコピー</button>' +
    '</div>';
  document.getElementById('copy-token-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(rssUrl);
  });
}

document.getElementById('create-feed-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('feed-name').value;
  const slug = document.getElementById('feed-slug').value;
  const kind = document.getElementById('feed-kind').value;
  const res = await fetch('/api/feeds', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({ name, slug, kind }),
  });
  if (res.ok) {
    const feed = await res.json();
    showToken(feed.name, feed.rssUrl, feed.rssToken);
    window.setTimeout(() => window.location.reload(), 3000);
  } else {
    alert('作成に失敗しました');
  }
});

document.querySelectorAll('.rotate-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-id');
    const res = await fetch('/api/feeds/' + id + '/rotate-token', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken },
    });
    if (res.ok) {
      const feed = await res.json();
      showToken(feed.name, feed.rssUrl, feed.rssToken);
    }
  });
});

document.querySelectorAll('.revoke-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-id');
    if (!confirm('このFeedのRSSトークンを失効します。よろしいですか？')) return;
    await fetch('/api/feeds/' + id + '/revoke-token', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken },
    });
    window.location.reload();
  });
});
</script>
`;
  return layout('Feed管理', body);
}
