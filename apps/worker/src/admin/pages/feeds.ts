import type { Feed } from '@web-monitor/shared';
import { layout } from './layout.js';
import { escapeHtml, escapeJs } from './escape.js';

export interface FeedRow extends Feed {
  rssUrl: string | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

export function feedsPage(feeds: FeedRow[], csrfToken: string): string {
  const body = `
<p><a href="/monitors">&larr; Watchlistへ戻る</a></p>
<div class="card">
  <h1>Feed管理</h1>
  <table>
    <thead>
      <tr><th>名前</th><th>種別</th><th>有効</th><th>RSS URL</th><th>発行日時</th><th>最終利用</th><th>操作</th></tr>
    </thead>
    <tbody id="feeds-table-body">
      ${feeds
        .map(
          (feed) => `<tr data-feed-id="${escapeHtml(feed.id)}">
            <td>${escapeHtml(feed.name)}</td>
            <td>${feed.kind === 'system' ? 'システム' : 'コンテンツ'}</td>
            <td>${feed.enabled ? '有効' : '無効'}</td>
            <td>
              ${
                feed.rssUrl
                  ? `<input type="text" readonly value="${escapeHtml(feed.rssUrl)}" style="width: 260px;" onclick="this.select()" />
                     <button class="secondary copy-btn" data-url="${escapeHtml(feed.rssUrl)}">コピー</button>`
                  : feed.rssTokenStatus === 'active'
                    ? '<span class="muted">有効（このシステム更新より前に発行されたためURLは非表示。再発行すると表示されます）</span>'
                    : '<span class="muted">(失効済み)</span>'
              }
            </td>
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
  <p class="muted">RSS URLにはアクセス用のトークンが含まれています。他人に共有しないでください。</p>
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
    window.location.reload();
  } else {
    alert('作成に失敗しました');
  }
});

document.querySelectorAll('.rotate-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-id');
    if (!confirm('現在のRSS URLは無効になり、新しいURLに置き換わります。よろしいですか？')) return;
    const res = await fetch('/api/feeds/' + id + '/rotate-token', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken },
    });
    if (res.ok) window.location.reload();
  });
});

document.querySelectorAll('.revoke-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const id = btn.getAttribute('data-id');
    if (!confirm('このFeedのRSS URLを失効します。よろしいですか？')) return;
    await fetch('/api/feeds/' + id + '/revoke-token', {
      method: 'POST',
      headers: { 'x-csrf-token': csrfToken },
    });
    window.location.reload();
  });
});

document.querySelectorAll('.copy-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(btn.getAttribute('data-url'));
  });
});
</script>
`;
  return layout('Feed管理', body);
}
