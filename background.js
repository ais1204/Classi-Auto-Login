// インストール直後に設定画面（ポップアップ）をタブで開き、初期設定を促す。
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
  }
});
