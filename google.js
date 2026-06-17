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
  const DEBUG = true; // ポップアップ窓の DevTools(右クリック→検証) で動作ログを確認できる
  const log = (...a) => DEBUG && console.log("[Classi自動ログイン]", ...a);

  const TTL = 10 * 60 * 1000; // Classiフローとみなす有効時間（10分）
  const EMAIL_RE = /[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]+/;

  let cfg = { email: "", password: "" };
  let acted = false;
  let chooserTimer = null;

  const normEmail = (s) => (s || "").trim().toLowerCase();

  function pageMentionsClassi() {
    const text = (document.body && document.body.innerText) || "";
    return /classi|クラッシー/i.test(text);
  }

  // クリックをGoogleのハンドラ（jsaction等）に確実に伝えるため、イベント一式を発火
  function realClick(el) {
    if (!el) return;
    try {
      el.scrollIntoView({ block: "center" });
    } catch (e) {}
    const o = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new PointerEvent("pointerdown", o));
    el.dispatchEvent(new MouseEvent("mousedown", o));
    el.dispatchEvent(new PointerEvent("pointerup", o));
    el.dispatchEvent(new MouseEvent("mouseup", o));
    el.dispatchEvent(new MouseEvent("click", o));
    if (typeof el.click === "function") el.click();
  }

  // GoogleのフォームにJS経由で値を入れても認識されるよう、ネイティブsetter + イベント発火
  function setNativeValue(el, value) {
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // テキストが regex に一致する「最も内側の短い要素」を返す（クリックはバブリングで伝わる）
  function findByText(regex, maxLen = 40) {
    let best = null;
    document.querySelectorAll("*").forEach((el) => {
      const t = (el.textContent || "").trim();
      if (t.length === 0 || t.length > maxLen) return;
      if (regex.test(t)) {
        if (!best || t.length < best.textContent.trim().length) best = el;
      }
    });
    return best;
  }

  // アカウント候補マップ email -> クリックする要素
  //  1) data属性ベース（従来の確実な方法）を優先
  //  2) 無ければテキストからメールを検出（data属性が無い新UI対応）
  function getAccountMap() {
    const map = new Map();
    document.querySelectorAll("[data-identifier], [data-email]").forEach((el) => {
      const raw = el.getAttribute("data-identifier") || el.getAttribute("data-email") || "";
      const m = raw.toLowerCase().match(EMAIL_RE) || (el.textContent || "").toLowerCase().match(EMAIL_RE);
      if (m && !map.has(m[0])) map.set(m[0], el);
    });
    if (map.size > 0) return map;

    document.querySelectorAll("*").forEach((el) => {
      const t = (el.textContent || "").trim();
      if (t.length === 0 || t.length > 60) return;
      const m = t.toLowerCase().match(EMAIL_RE);
      if (!m) return;
      const prev = map.get(m[0]);
      if (!prev || t.length < (prev.textContent || "").trim().length) map.set(m[0], el);
    });
    return map;
  }

  function findUseAnotherAccount() {
    return findByText(/別のアカウントを使用|別のアカウント|アカウントを追加|use another account|add account/i);
  }

  function isChooser() {
    return (
      /accountchooser/i.test(location.href) ||
      getAccountMap().size > 0 ||
      !!findUseAnotherAccount()
    );
  }

  // アカウント選択画面の処理。クリックできたら true、描画待ちなら false。
  function handleChooser() {
    const map = getAccountMap();
    log("アカウント候補:", [...map.keys()], "/ 探したいメール:", cfg.email || "(一番上)");

    let target = null;
    if (!cfg.email) {
      const first = [...map.values()][0];
      target = first || null;
    } else {
      target = map.get(normEmail(cfg.email)) || null;
    }

    if (target) {
      log("該当アカウントをクリック");
      realClick(target);
      acted = true;
      return true;
    }

    // 該当アカウントが一覧に無い → 描画完了を待って再確認 →「別のアカウントを使用」へ
    if (cfg.email && !chooserTimer) {
      chooserTimer = setTimeout(() => {
        if (acted) return;
        const t2 = getAccountMap().get(normEmail(cfg.email));
        if (t2) {
          log("該当アカウント（遅延描画）をクリック");
          realClick(t2);
          acted = true;
          return;
        }
        const another = findUseAnotherAccount();
        if (another) {
          log("該当なし →「別のアカウントを使用」をクリック");
          realClick(another);
          acted = true;
        } else {
          log("「別のアカウントを使用」が見つからない");
        }
      }, 1200);
    }
    return false;
  }

  function fillEmail() {
    if (!cfg.email) return false;
    const input = document.querySelector('input[type="email"]:not([aria-hidden="true"])');
    if (!input) return false;
    log("メールアドレスを入力");
    setNativeValue(input, cfg.email);
    const next = document.querySelector("#identifierNext button, #identifierNext, button[jsname]");
    if (next) realClick(next);
    return true;
  }

  function fillPassword() {
    const input = document.querySelector('input[type="password"]:not([aria-hidden="true"])');
    if (!input) return false;
    if (!cfg.password) {
      log("パスワード欄あり / 保存パスワード未設定 → 手入力に任せる");
      return false;
    }
    log("パスワードを入力");
    setNativeValue(input, cfg.password);
    const next = document.querySelector("#passwordNext button, #passwordNext, button[jsname]");
    if (next) realClick(next);
    return true;
  }

  function clickConsent() {
    if (!pageMentionsClassi()) return false; // 同意画面はClassi表記がある時のみ
    const btns = [...document.querySelectorAll('button, [role="button"]')];
    const b = btns.find((x) => /^(続行|許可|continue|allow)$/i.test((x.textContent || "").trim()));
    if (b) {
      log("同意画面で続行をクリック");
      realClick(b);
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

    // アカウント選択画面
    if (isChooser()) {
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
    const recentAtStart = data.classiFlow && Date.now() - data.classiFlow < TTL;
    log("起動", { url: location.href, recent: recentAtStart, email: cfg.email });

    let started = false;

    // ゲート判定を「描画されるまで待って何度も再評価」する。
    // Googleの画面はJSで後から描画されるため、起動時点ではClassi表記が無いことがある。
    function tick() {
      if (acted) return true;
      if (!started) {
        if (!(recentAtStart || pageMentionsClassi())) return false; // まだClassiと確認できない
        started = true;
        chrome.storage.local.set({ classiFlow: Date.now() }); // フロー継続中として期限を延長
        log("Classiフローを確認 → 自動操作を開始");
      }
      return step();
    }

    if (tick()) return;
    const obs = new MutationObserver(() => {
      if (tick()) obs.disconnect();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => obs.disconnect(), 25000);
  });
})();
