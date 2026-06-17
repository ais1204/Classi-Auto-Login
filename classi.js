// Classiログイン画面 (id.classi.jp) で「Googleでログイン」ボタンを自動クリックする。
(() => {
  let clicked = false;

  // このページ(id.classi.jp)にいる＝Classiにログインする意思が明確。
  // 以降のGoogle画面（自動／手動どちらで進んでも）で自動入力を許可するためのフラグを立てる。
  // これにより、手動で「別のアカウントを使用」を押してメール/パスワード画面に進んだ場合でも
  // 自動入力が有効になる（有効期間10分）。
  chrome.storage.local.set({ classiFlow: Date.now() });

  // 「Google」と「ログイン/sign in」を含む短いボタン・リンクを探す。
  function findGoogleButton() {
    const candidates = document.querySelectorAll('button, a, [role="button"]');

    // 1) "Google" と ログイン系ワードの両方を含むもの（最優先）
    for (const el of candidates) {
      const t = (el.textContent || "").trim();
      if (/google/i.test(t) && /(ログイン|でログイン|sign\s*in|log\s*in)/i.test(t)) {
        return el;
      }
    }
    // 2) テキストが短く "Google" を含むもの（フッターの長文リンク等を除外するため文字数で絞る）
    for (const el of candidates) {
      const t = (el.textContent || "").trim();
      if (t.length > 0 && t.length <= 25 && /google/i.test(t)) {
        return el;
      }
    }
    return null;
  }

  function tryClick() {
    if (clicked) return true;
    const btn = findGoogleButton();
    if (!btn) return false;
    clicked = true;
    // Google側のスクリプトに「Classi経由のフローだ」と伝えるためのフラグ
    chrome.storage.local.set({ classiFlow: Date.now() });
    btn.click();
    return true;
  }

  if (tryClick()) return;

  // ボタンが後から描画される場合に備えて監視
  const obs = new MutationObserver(() => {
    if (tryClick()) obs.disconnect();
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => obs.disconnect(), 15000);
})();
