// Googleログイン (accounts.google.com) 側の自動操作。
//  - アカウント選択画面: 保存したアカウント（なければ一番上）を選択
//  - メール入力画面    : 保存したメールを入力して次へ
//  - パスワード入力画面: 保存したパスワードを入力して次へ（未設定なら何もしない）
//  - 同意画面          : 「続行/許可」を押す
//
// 設定（メール・パスワード）はポップアップから chrome.storage.local に保存される。
// 安全策: 「直近にClassiから来た」または「ページに Classi 表記がある」場合のみ動作する。
(() => {
  const TTL = 10 * 60 * 1000; // Classiフローとみなす有効時間（10分）
  let cfg = { email: "", password: "" };
  let acted = false;

  function pageMentionsClassi() {
    const text = (document.body && document.body.innerText) || "";
    return /classi|クラッシー/i.test(text);
  }

  // GoogleのフォームにJS経由で値を入れても認識されるよう、ネイティブsetter + イベント発火
  function setNativeValue(el, value) {
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function clickAccount() {
    const rows = [...document.querySelectorAll("[data-identifier], [data-email]")];
    if (!rows.length) return false;
    let target = null;
    if (cfg.email) {
      target = rows.find(
        (r) => (r.getAttribute("data-identifier") || r.getAttribute("data-email")) === cfg.email
      );
    }
    target = target || rows[0];
    target.click();
    return true;
  }

  function fillEmail() {
    if (!cfg.email) return false;
    const input = document.querySelector('input[type="email"]:not([aria-hidden="true"])');
    if (!input) return false;
    setNativeValue(input, cfg.email);
    const next = document.querySelector("#identifierNext button, #identifierNext");
    if (next) {
      next.click();
      return true;
    }
    return false;
  }

  function fillPassword() {
    const input = document.querySelector('input[type="password"]:not([aria-hidden="true"])');
    if (!input) return false;
    if (!cfg.password) return false; // パスワード未設定 → 手入力に任せる
    setNativeValue(input, cfg.password);
    const next = document.querySelector("#passwordNext button, #passwordNext");
    if (next) next.click();
    return true;
  }

  function clickConsent() {
    if (!pageMentionsClassi()) return false; // 同意画面はClassi表記がある時のみ
    const btns = [...document.querySelectorAll('button, [role="button"]')];
    const b = btns.find((x) => /^(続行|許可|continue|allow)$/i.test((x.textContent || "").trim()));
    if (b) {
      b.click();
      return true;
    }
    return false;
  }

  function step() {
    if (acted) return true;

    // パスワード欄があればパスワード処理を最優先
    if (document.querySelector('input[type="password"]:not([aria-hidden="true"])')) {
      if (fillPassword()) {
        acted = true;
        return true;
      }
      return false; // 欄はあるが未設定 → 手入力に任せて以後何もしない
    }
    // アカウント選択
    if (clickAccount()) {
      acted = true;
      return true;
    }
    // メール入力
    if (document.querySelector('input[type="email"]:not([aria-hidden="true"])')) {
      if (fillEmail()) {
        acted = true;
        return true;
      }
    }
    // 同意画面
    if (clickConsent()) {
      acted = true;
      return true;
    }
    return false;
  }

  chrome.storage.local.get(["email", "password", "classiFlow"], (data) => {
    cfg.email = data.email || "";
    cfg.password = data.password || "";

    const recent = data.classiFlow && Date.now() - data.classiFlow < TTL;
    const allowed = recent || pageMentionsClassi();
    if (!allowed) return; // Classiのフローでなければ一切操作しない

    if (step()) return;
    const obs = new MutationObserver(() => {
      if (step()) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 20000);
  });
})();
