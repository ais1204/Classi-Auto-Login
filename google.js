// Googleログイン (accounts.google.com) 側の自動操作。
//  - アカウント選択画面: 保存したメールのアカウントを選択（複数あっても該当を選ぶ）
//                        一覧に無ければ「別のアカウントを使用」へ
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
  let chooserTimer = null;

  function pageMentionsClassi() {
    const text = (document.body && document.body.innerText) || "";
    return /classi|クラッシー/i.test(text);
  }

  const normEmail = (s) => (s || "").trim().toLowerCase();
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // GoogleのフォームにJS経由で値を入れても認識されるよう、ネイティブsetter + イベント発火
  function setNativeValue(el, value) {
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // テキストが regex に一致する「最も内側の短い要素」を探し、クリック可能な祖先を返す
  function findClickable(regex, maxLen = 40) {
    const all = [...document.querySelectorAll('li, button, a, [role="link"], [role="button"], [jsaction], span, div')];
    const matches = all.filter((el) => {
      const t = (el.textContent || "").trim();
      return t.length > 0 && t.length <= maxLen && regex.test(t);
    });
    if (!matches.length) return null;
    matches.sort((a, b) => a.textContent.trim().length - b.textContent.trim().length);
    const el = matches[0];
    return el.closest('li, button, a, [role="link"], [role="button"], [jsaction]') || el;
  }

  // 行（アカウント候補）が指定メールと一致するか。
  //  - data属性での完全一致を最優先
  //  - 表示テキスト中に「独立したトークンとして」メールが含まれるか（部分一致の誤爆を防止）
  function rowMatchesEmail(row, wanted) {
    const attr = normEmail(row.getAttribute("data-identifier") || row.getAttribute("data-email"));
    if (attr && attr === wanted) return true;
    const re = new RegExp("(^|[^a-z0-9._%+\\-])" + escapeRegex(wanted) + "([^a-z0-9._%+\\-]|$)", "i");
    return re.test(row.textContent || "");
  }

  // 一覧から該当アカウント要素を返す。メール未設定なら一番上。無ければ null。
  function pickAccount(rows) {
    if (!cfg.email) return rows[0] || null;
    const wanted = normEmail(cfg.email);
    return rows.find((r) => rowMatchesEmail(r, wanted)) || null;
  }

  function findUseAnotherAccount() {
    return findClickable(/別のアカウントを使用|別のアカウント|アカウントを追加|use another account|add account/i);
  }

  // アカウント選択画面の処理。クリックできたら true、描画待ちなら false。
  function handleChooser() {
    const rows = [...document.querySelectorAll("[data-identifier], [data-email]")];
    const hit = pickAccount(rows);
    if (hit) {
      hit.click();
      acted = true;
      return true;
    }
    // 該当アカウントが一覧に無い → 描画完了を待ってから判定し「別のアカウントを使用」へ
    // （アカウントが遅れて描画されるケースの誤判定を避けるため少し待つ）
    if (cfg.email && !chooserTimer) {
      chooserTimer = setTimeout(() => {
        if (acted) return;
        const rows2 = [...document.querySelectorAll("[data-identifier], [data-email]")];
        const hit2 = pickAccount(rows2);
        if (hit2) {
          hit2.click();
          acted = true;
          return;
        }
        const another = findUseAnotherAccount();
        if (another) {
          another.click();
          acted = true;
        }
      }, 1200);
    }
    return false;
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

    // アカウント選択画面（候補行がある）
    if (document.querySelector("[data-identifier], [data-email]")) {
      return handleChooser();
    }

    // メール入力画面
    if (document.querySelector('input[type="email"]:not([aria-hidden="true"])')) {
      if (fillEmail()) {
        acted = true;
        return true;
      }
      return false;
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
