// 設定ポップアップ: メール・パスワードを chrome.storage.local に保存する。
const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const showEl = document.getElementById("show");
const saveEl = document.getElementById("save");
const statusEl = document.getElementById("status");

// 保存済みの値を読み込んで表示
chrome.storage.local.get(["email", "password"], (data) => {
  if (data.email) emailEl.value = data.email;
  if (data.password) passEl.value = data.password;
});

// パスワード表示切り替え
showEl.addEventListener("change", () => {
  passEl.type = showEl.checked ? "text" : "password";
});

// 保存
saveEl.addEventListener("click", () => {
  const email = emailEl.value.trim();
  const password = passEl.value;
  chrome.storage.local.set({ email, password }, () => {
    statusEl.textContent = "保存しました ✓";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  });
});

// Enterキーでも保存
[emailEl, passEl].forEach((el) => {
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveEl.click();
  });
});
