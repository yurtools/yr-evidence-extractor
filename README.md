# Evidence Extractor — Chrome Side Panel Extension

Evidence Extractor is a **Chrome extension (Manifest V3)** that opens in the **Side Panel**, extracts the active page’s readable text, sends it to an LLM (Local LM Studio or public providers), and renders:

- **Facts** (expand to see *evidence quote*)
- **Claims** (unproven assertions; expand to see *why + evidence quote*)
- **Opinions** (subjective statements; expand to see *why it’s opinion*)

**Language behavior**
- Output items (`facts[].text`, `claims[].text`, `why_claim`, `opinions[].text`, `why_opinion`) are always **English**.
- Evidence is an **exact quote** from the original page text (original language; not translated).

---

## Project Structure

Typical files in the extension folder:

- `manifest.json`
- `service_worker.js`
- `content.js`
- `sidepanel.html`
- `sidepanel.js`
- (optional) `icons/` for extension icons

---

## Requirements

- **Google Chrome** (Manifest V3 support)
- One of the following:
  - **Local**: LM Studio running an OpenAI-compatible server
  - **Cloud**: OpenAI / Anthropic Claude / Google Gemini / Kimi (Moonshot) API access (requires API key)

---

## Installation (Chrome “Load unpacked”)

1. Put the project files into a folder, e.g. `evidence-extractor/`
2. Open Chrome and go to: `chrome://extensions`
3. Enable **Developer mode** (top-right)
4. Click **Load unpacked**
5. Select the `evidence-extractor/` folder
6. (Optional) Pin the extension in the toolbar:
   - Extensions icon → pin “Evidence Extractor”

---

## LM Studio Setup (Local Provider)

1. Open **LM Studio**
2. Download and load any chat model you want
3. Enable the **Local Server** (OpenAI-compatible)
4. Ensure the server is reachable, usually:
   - `http://127.0.0.1:1234/v1/chat/completions`
5. (Optional) Confirm models endpoint works:
   - `http://127.0.0.1:1234/v1/models`

**Important:** Local provider uses `response_format.type = "json_schema"` for strict JSON output (LM Studio compatible).

---

## How to Use

1. Navigate to any article/page in Chrome
2. Open the extension Side Panel:
   - Click the extension icon (or open side panel via Chrome UI)
3. Click **⟳ Refresh**
4. Review results:
   - Switch tabs: **Facts / Claims / Opinions**
   - Expand a card to see evidence or reasoning
   - Use Search to filter items

---

## Settings

Click **⚙️** to open Settings. You can configure:

### Provider
Choose one:
- Local (LM Studio / OpenAI-compatible)
- OpenAI
- Claude (Anthropic)
- Gemini (Google)
- Kimi (Moonshot) — Global
- Kimi (Moonshot) — China

### API Key
- Required for most cloud providers.
- Stored in `chrome.storage.local` (extension local storage).

### Model
- Click **Load** to fetch model list (where supported)
- Choose a model from dropdown
- Or select **Custom…** and type the model id

### Endpoint override
- Used primarily for **Local** (LM Studio)
- Disabled for Claude/Gemini (fixed endpoints)

### Max chars to send
- Default: `30000`
- Long pages are truncated with `[TRUNCATED]` marker

### Prompt template (Python)
- Editable prompt template shown as Python-style triple-quoted f-string text
- Not executed as Python; placeholders are replaced:
  - `{title}`, `{url}`, `{text}`
- Must preserve rules:
  - Output is strict JSON only
  - Output items in English
  - Evidence is exact quote from the original text

---

## Output JSON Contract

The extension expects the model to return **one JSON object** with this shape:

```json
{
  "source": { "title": "…", "url": "…" },
  "facts": [
    { "text": "…", "evidence": "…" }
  ],
  "claims": [
    { "text": "…", "why_claim": "…", "evidence": "…" }
  ],
  "opinions": [
    { "text": "…", "why_opinion": "…" }
  ]
}
```

## Notes

- Missing categories must be `[]` (not `null`).
- Evidence must be a **direct quote** from the input text.

---

## Troubleshooting

### “Provider HTTP 401 invalid_api_key”
Your cloud provider API key is missing or invalid.

- Open **Settings → API Key**
- Paste the correct key for that provider
- For **OpenAI**, keys are managed in your OpenAI account dashboard

### “Provider HTTP 400: 'response_format.type' must be 'json_schema' or 'text'”
This usually indicates a Local (LM Studio) compatibility issue:

- Ensure provider is **Local**
- Ensure the request uses `json_schema` (the app does for Local)
- Confirm you’re targeting the correct LM Studio endpoint

### “Expected ',' or '}' after property value in JSON…”
The model returned malformed JSON.

- Try a different model
- Reduce output verbosity (edit prompt)
- The extension includes basic JSON repair, but cannot fix heavily broken output

### Cannot extract text on some pages
Chrome restricts content scripts on certain URLs (e.g., `chrome://…`).

- Use a normal web page (`http`/`https`)
- For PDF viewer pages, extraction may be limited

---

## Security Notes

- API keys are stored locally in the browser extension storage (`chrome.storage.local`)
- Keys are only used from the extension context (not injected into web pages)
- Do not share your extension storage/profile if it contains keys

---

## Development Notes (Optional)

### Use Chrome DevTools
- Side panel DevTools: open side panel → right click → **Inspect**
- Service worker logs: `chrome://extensions` → extension → **Service worker**

### Reload extension after edits
- `chrome://extensions` → click **Reload** on the extension card
