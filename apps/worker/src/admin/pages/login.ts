import { layout } from './layout.js';

export function loginPage(errorMessage?: string): string {
  const errorHtml = errorMessage ? `<p class="status-error">${errorMessage}</p>` : '';
  return layout(
    'ログイン',
    `
<div class="card" style="max-width: 360px; margin: 3rem auto;">
  <h1>ログイン</h1>
  ${errorHtml}
  <form id="login-form">
    <p>
      <label for="password">管理者パスワード</label><br />
      <input type="password" id="password" name="password" required autofocus />
    </p>
    <input type="submit" value="ログイン" />
  </form>
</div>
<script>
document.getElementById('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = document.getElementById('password').value;
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
    credentials: 'same-origin',
  });
  if (res.ok) {
    window.location.href = '/monitors';
  } else {
    window.location.reload();
  }
});
</script>
`,
  );
}
