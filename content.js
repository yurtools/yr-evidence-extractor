function extractMainText() {
    // Simple heuristic: prefer <main>, otherwise body.
    const main = document.querySelector("main");
    const root = main || document.body;

    // Remove obvious junk nodes.
    const clone = root.cloneNode(true);
    clone.querySelectorAll("script, style, noscript, nav, footer, header, aside").forEach(n => n.remove());

    // Normalize whitespace.
    const text = clone.innerText
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

    return text;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "EXTRACT_TEXT") {
        sendResponse({
            ok: true,
            title: document.title || "",
            url: location.href,
            text: extractMainText()
        });
        return true;
    }
});
