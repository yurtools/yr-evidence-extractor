chrome.runtime.onInstalled.addListener(() => {
    // Optional: configure behavior per tab if needed later.
});

chrome.action.onClicked.addListener(async (tab) => {
    if (!tab?.id) return;
    await chrome.sidePanel.open({ tabId: tab.id });
});
