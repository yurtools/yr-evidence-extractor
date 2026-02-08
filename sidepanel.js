// ========= UI Elements =========
const refreshBtn = document.getElementById("refreshBtn");
const settingsBtn = document.getElementById("settingsBtn");
const drawer = document.getElementById("drawer");
const drawerClose = document.getElementById("drawerClose");
const closeSettingsBtn = document.getElementById("closeSettings");

const statusEl = document.getElementById("status");
const pageTitleEl = document.getElementById("pageTitle");

const searchEl = document.getElementById("search");
const tabFactsBtn = document.getElementById("tabFacts");
const tabClaimsBtn = document.getElementById("tabClaims");
const tabOpinionsBtn = document.getElementById("tabOpinions");

const chipsEl = document.getElementById("chips");
const factsCountEl = document.getElementById("factsCount");
const claimsCountEl = document.getElementById("claimsCount");
const opinionsCountEl = document.getElementById("opinionsCount");

const listEl = document.getElementById("list");
const pagePreviewEl = document.getElementById("pagePreview");
const errorWrapEl = document.getElementById("errorWrap");
const errorsEl = document.getElementById("errors");

// Settings controls
const providerEl = document.getElementById("provider");
const apiKeyEl = document.getElementById("apiKey");
const endpointEl = document.getElementById("endpoint");
const modelSelectEl = document.getElementById("modelSelect");
const loadModelsBtn = document.getElementById("loadModelsBtn");
const modelCustomWrapEl = document.getElementById("modelCustomWrap");
const modelCustomEl = document.getElementById("modelCustom");
const maxCharsEl = document.getElementById("maxChars");
const promptPyEl = document.getElementById("promptPy");
const providerHintEl = document.getElementById("providerHint");

// ========= Defaults =========
const DEFAULT_LOCAL_ENDPOINT = "http://127.0.0.1:1234/v1/chat/completions";

// Python-style template stored as text (NOT executed)
const DEFAULT_PROMPT_PY = `prompt = f"""
You are an information extraction engine.

Return STRICT JSON ONLY (no markdown, no backticks, no commentary).
Your JSON MUST match the schema exactly.

LANGUAGE RULES:
- The input text may be in any language.
- Always write the output fields (facts[].text, claims[].text, claims[].why_claim, opinions[].text, opinions[].why_opinion) in ENGLISH.
- Evidence must be an translated to english snippet from the provided text.

Classify atomic statements into:
1) facts: verifiable statements presented as true
2) claims: assertions that require external verification, are disputed, or are predictive
3) opinions: subjective judgments / value statements

Output schema:
{
    "source": { "title": string, "url": string },
    "facts": [ { "text": string, "evidence": string } ],
    "claims": [ { "text": string, "why_claim": string, "evidence": string } ],
    "opinions": [ { "text": string, "why_opinion": string } ]
}

STRICT RULES:
- Output MUST be valid JSON.
- Use double-quotes for all strings and keys.
- No trailing commas.
- ALL output MUST be English
- Evidence must be short and exact.
- If evidence contains double-quotes, escape them as \\\\".
- Do NOT invent anything not in the text.
- If a category is empty, return [].

SOURCE:
Title: {title}
URL: {url}

TEXT:
{text}

Return ONLY the JSON object. Nothing before or after it.
""".strip()
`;

// ========= State =========
let activeTab = "facts";
let lastResult = null;

// ========= Helpers =========
function setStatus(s) { statusEl.textContent = s; }
function escHtml(s) {
    return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}
function showDrawer(open){ drawer.classList.toggle("open", !!open); }
function showError(err){
    errorsEl.textContent = String(err?.message || err || "Unknown error");
    errorWrapEl.style.display = "block";
}
function clearError(){
    errorsEl.textContent = "";
    errorWrapEl.style.display = "none";
}
function safeTruncate(s, maxChars){
    if (!s) return "";
    if (s.length <= maxChars) return s;
    return s.slice(0, maxChars) + "\n\n[TRUNCATED]";
}
async function safeFetch(url, init, label){
    const resp = await fetch(url, init);
    if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`${label} HTTP ${resp.status}: ${t}`);
    }
    return resp;
}
function setLoading(on){
    refreshBtn.disabled = on;
    if (on) setStatus("Working…");
}

// ========= JSON parse with repair =========
function parseModelJson(raw) {
    try { return JSON.parse(raw); } catch {}

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) {
        throw new Error("No JSON object found in model output.");
    }

    let s = raw.slice(start, end + 1);
    s = s.replace(/,\s*([}\]])/g, "$1"); // remove trailing commas

    try { return JSON.parse(s); } catch {}

    const preview = s.slice(0, 2000);
    throw new Error("Model returned invalid JSON even after basic repair.\n\nPreview:\n" + preview);
}

// ========= Prompt rendering =========
function renderPromptFromPythonTemplate(pyTemplate, vars) {
    const m = (pyTemplate || "").match(/([fF]?)("""|''')([\s\S]*?)\2/);
    const body = m ? m[3] : (pyTemplate || "");

    return body
        .replaceAll("{title}", String(vars.title ?? ""))
        .replaceAll("{url}", String(vars.url ?? ""))
        .replaceAll("{text}", String(vars.text ?? ""))
        .trim();
}
function buildPrompt({ title, url, text }) {
    const py = (promptPyEl?.value || "").trim() || DEFAULT_PROMPT_PY;
    return renderPromptFromPythonTemplate(py, { title, url, text });
}

// ========= Provider config =========
function providerDefaults(provider) {
    switch (provider) {
        case "local":
            return { chat: DEFAULT_LOCAL_ENDPOINT, models: null, needsKey: false, fixedEndpoints: false, label:"Local (LM Studio)" };
        case "openai":
            return { chat: "https://api.openai.com/v1/chat/completions", models: "https://api.openai.com/v1/models", needsKey: true, fixedEndpoints: false, label:"OpenAI" };
        case "claude":
            return { chat: "https://api.anthropic.com/v1/messages", models: "https://api.anthropic.com/v1/models", needsKey: true, fixedEndpoints: true, label:"Claude" };
        case "gemini":
            return { chat: null, models: "https://generativelanguage.googleapis.com/v1beta/models", needsKey: true, fixedEndpoints: true, label:"Gemini" };
        case "kimi_global":
            return { chat: "https://api.moonshot.ai/v1/chat/completions", models: "https://api.moonshot.ai/v1/models", needsKey: true, fixedEndpoints: false, label:"Kimi Global" };
        case "kimi_cn":
            return { chat: "https://api.moonshot.cn/v1/chat/completions", models: "https://api.moonshot.cn/v1/models", needsKey: true, fixedEndpoints: false, label:"Kimi China" };
        default:
            return { chat: DEFAULT_LOCAL_ENDPOINT, models: null, needsKey: false, fixedEndpoints: false, label:"Local" };
    }
}

const FALLBACK_MODELS = {
    claude: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
    gemini: ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-flash", "gemini-1.5-pro"],
    kimi: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
    local: []
};

// ========= Models dropdown =========
function setModelCustomVisible(isVisible){
    modelCustomWrapEl.style.display = isVisible ? "block" : "none";
}
function setModelOptions(models, preferred){
    const uniq = [...new Set((models || []).filter(Boolean))];
    modelSelectEl.innerHTML = "";

    if (uniq.length === 0) {
        modelSelectEl.insertAdjacentHTML("beforeend", `<option value="__custom__">Custom…</option>`);
        modelSelectEl.value = "__custom__";
        setModelCustomVisible(true);
        return;
    }

    modelSelectEl.insertAdjacentHTML("beforeend", `<option value="">Select model…</option>`);
    for (const m of uniq) {
        modelSelectEl.insertAdjacentHTML("beforeend", `<option value="${escHtml(m)}">${escHtml(m)}</option>`);
    }
    modelSelectEl.insertAdjacentHTML("beforeend", `<option value="__custom__">Custom…</option>`);

    if (preferred && uniq.includes(preferred)) modelSelectEl.value = preferred;
    else modelSelectEl.value = "";

    setModelCustomVisible(modelSelectEl.value === "__custom__");
}
function getSelectedModelValue(){
    const v = modelSelectEl.value;
    if (v === "__custom__") return modelCustomEl.value.trim();
    return v.trim();
}

// ========= Model list fetching =========
async function fetchModelsForProvider(provider, apiKey, endpointOverride) {
    const def = providerDefaults(provider);

    if (provider === "local") {
        const chatUrl = (endpointOverride && endpointOverride.trim()) ? endpointOverride.trim() : def.chat;
        let modelsUrl = chatUrl.replace(/\/v1\/chat\/completions$/, "/v1/models");
        if (modelsUrl === chatUrl) modelsUrl = "http://127.0.0.1:1234/v1/models";
        try {
            const resp = await safeFetch(modelsUrl, { method: "GET" }, "Local models");
            const data = await resp.json();
            return (data?.data || []).map(x => x?.id).filter(Boolean);
        } catch {
            return FALLBACK_MODELS.local;
        }
    }

    if (provider === "openai") {
        if (!apiKey) throw new Error("OpenAI requires API key to list models.");
        const resp = await safeFetch(def.models, {
            method: "GET",
            headers: { "Authorization": `Bearer ${apiKey}` }
        }, "OpenAI models");
        const data = await resp.json();
        return (data?.data || []).map(x => x?.id).filter(Boolean);
    }

    if (provider === "kimi_global" || provider === "kimi_cn") {
        if (!apiKey) throw new Error("Kimi requires API key to list models.");
        const resp = await safeFetch(def.models, {
            method: "GET",
            headers: { "Authorization": `Bearer ${apiKey}` }
        }, "Kimi models");
        const data = await resp.json();
        const ids = (data?.data || []).map(x => x?.id).filter(Boolean);
        return ids.length ? ids : FALLBACK_MODELS.kimi;
    }

    if (provider === "claude") {
        if (!apiKey) throw new Error("Claude requires API key to list models.");
        const resp = await safeFetch(def.models, {
            method: "GET",
            headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
        }, "Claude models");
        const data = await resp.json();
        const ids = (data?.data || []).map(x => x?.id).filter(Boolean);
        return ids.length ? ids : FALLBACK_MODELS.claude;
    }

    if (provider === "gemini") {
        if (!apiKey) throw new Error("Gemini requires an API key to list models.");
        const url = `${def.models}?key=${encodeURIComponent(apiKey)}`;
        try {
            const resp = await safeFetch(url, { method: "GET" }, "Gemini models");
            const data = await resp.json();
            const models = (data?.models || [])
                .map(m => m?.name)
                .filter(Boolean)
                .map(n => n.startsWith("models/") ? n.slice("models/".length) : n);
            return models.length ? models : FALLBACK_MODELS.gemini;
        } catch {
            return FALLBACK_MODELS.gemini;
        }
    }

    return [];
}

async function loadModels({ force = false } = {}) {
    setStatus("Loading models…");
    clearError();

    const provider = providerEl.value;
    const apiKey = apiKeyEl.value.trim();
    const endpointOverride = endpointEl.value.trim();

    if (!force) {
        const cached = await new Promise(res => chrome.storage.local.get(["models_cache"], v => res((v.models_cache || {})[provider])));
        if (Array.isArray(cached) && cached.length) {
            setStatus("Models ready");
            return;
        }
    }

    try {
        const models = await fetchModelsForProvider(provider, apiKey, endpointOverride);

        chrome.storage.local.get(["models_cache", "model_by_provider"], (v) => {
            const cache = v.models_cache || {};
            cache[provider] = models;

            const mbp = v.model_by_provider || {};
            const preferred = mbp[provider] || "";

            chrome.storage.local.set({ models_cache: cache }, () => {
                setModelOptions(models, preferred);

                if (preferred && !models.includes(preferred)) {
                    modelSelectEl.value = "__custom__";
                    setModelCustomVisible(true);
                    modelCustomEl.value = preferred;
                }

                setStatus(models.length ? "Models loaded" : "Use Custom model");
            });
        });
    } catch (e) {
        let fallback = [];
        if (provider === "claude") fallback = FALLBACK_MODELS.claude;
        else if (provider === "gemini") fallback = FALLBACK_MODELS.gemini;
        else if (provider.startsWith("kimi")) fallback = FALLBACK_MODELS.kimi;

        setModelOptions(fallback, "");
        showError(e);
        setStatus("Model load failed (fallback)");
    }
}

// ========= json_schema for LM Studio Local =========
function getEvidenceJsonSchema() {
    return {
        name: "evidence_extract",
        schema: {
            type: "object",
            additionalProperties: false,
            properties: {
                source: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        title: { type: "string" },
                        url: { type: "string" }
                    },
                    required: ["title", "url"]
                },
                facts: {
                    type: "array",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            text: { type: "string" },
                            evidence: { type: "string" }
                        },
                        required: ["text", "evidence"]
                    }
                },
                claims: {
                    type: "array",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            text: { type: "string" },
                            why_claim: { type: "string" },
                            evidence: { type: "string" }
                        },
                        required: ["text", "why_claim", "evidence"]
                    }
                },
                opinions: {
                    type: "array",
                    items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            text: { type: "string" },
                            why_opinion: { type: "string" }
                        },
                        required: ["text", "why_opinion"]
                    }
                }
            },
            required: ["source", "facts", "claims", "opinions"]
        }
    };
}

// ========= Provider calls =========
async function callOpenAICompatible({ url, apiKey, model, prompt, temperature = 0.2, useJsonSchema = false }) {
    const body = {
        model: model || undefined,
        messages: [
            { role: "system", content: "Return only valid JSON that matches the schema/rules." },
            { role: "user", content: prompt }
        ],
        temperature
    };

    if (useJsonSchema) {
        body.response_format = {
            type: "json_schema",
            json_schema: getEvidenceJsonSchema()
        };
    }

    const headers = { "Content-Type": "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const resp = await safeFetch(url, { method: "POST", headers, body: JSON.stringify(body) }, "Provider");
    const data = await resp.json();

    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content in response (OpenAI-compatible).");
    return content;
}

async function callClaude({ apiKey, model, prompt }) {
    if (!apiKey) throw new Error("Claude requires an API key.");
    if (!model) throw new Error("Claude requires a model name.");

    const url = "https://api.anthropic.com/v1/messages";
    const body = { model, max_tokens: 1024, messages: [{ role: "user", content: prompt }] };

    const headers = {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
    };

    const resp = await safeFetch(url, { method: "POST", headers, body: JSON.stringify(body) }, "Claude");
    const data = await resp.json();

    const blocks = Array.isArray(data?.content) ? data.content : [];
    const text = blocks.map(b => b?.text).filter(Boolean).join("");
    if (!text) throw new Error("No text in Claude response.");
    return text;
}

async function callGemini({ apiKey, model, prompt }) {
    if (!apiKey) throw new Error("Gemini requires an API key.");
    if (!model) throw new Error("Gemini requires a model name (e.g., gemini-2.0-flash).");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = { contents: [{ parts: [{ text: prompt }] }] };

    const resp = await safeFetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    }, "Gemini");

    const data = await resp.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map(p => p?.text).filter(Boolean).join("") : "";
    if (!text) throw new Error("No text in Gemini response.");
    return text;
}

async function callProvider({ provider, apiKey, endpointOverride, model, prompt }) {
    const def = providerDefaults(provider);

    if (provider === "claude") return await callClaude({ apiKey, model, prompt });
    if (provider === "gemini") return await callGemini({ apiKey, model, prompt });

    const url = (endpointOverride && endpointOverride.trim()) ? endpointOverride.trim() : def.chat;
    if (provider !== "local" && def.needsKey && !apiKey) throw new Error("This provider requires an API key.");

    const useJsonSchema = (provider === "local");
    return await callOpenAICompatible({
        url,
        apiKey: provider === "local" ? (apiKey || "") : apiKey,
        model,
        prompt,
        temperature: 0.2,
        useJsonSchema
    });
}

// ========= Render =========
function renderCounts(json){
    const facts = Array.isArray(json?.facts) ? json.facts.length : 0;
    const claims = Array.isArray(json?.claims) ? json.claims.length : 0;
    const opinions = Array.isArray(json?.opinions) ? json.opinions.length : 0;

    factsCountEl.textContent = String(facts);
    claimsCountEl.textContent = String(claims);
    opinionsCountEl.textContent = String(opinions);
    chipsEl.style.display = "flex";
}

function getActiveItems() {
    if (!lastResult) return [];
    if (activeTab === "facts") return (lastResult.facts || []).map(x => ({ ...x, __type:"fact" }));
    if (activeTab === "claims") return (lastResult.claims || []).map(x => ({ ...x, __type:"claim" }));
    return (lastResult.opinions || []).map(x => ({ ...x, __type:"opinion" }));
}

function matchesSearch(item, q){
    if (!q) return true;
    const hay = JSON.stringify(item).toLowerCase();
    return hay.includes(q);
}

function setSkeleton() {
    const n = 6;
    listEl.innerHTML = Array.from({ length: n }).map(() => `
        <div class="skeleton">
        <div class="sk-row">
        <div class="sk-pill"></div>
        <div class="sk-lines">
        <div class="sk-line"></div>
        <div class="sk-line s2"></div>
        <div class="sk-line s3"></div>
        </div>
        </div>
        </div>
        `).join("");
}

function renderList(){
    const items = getActiveItems();
    const q = (searchEl.value || "").trim().toLowerCase();
    const filtered = items.filter(it => matchesSearch(it, q));

    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div class="card" style="padding:14px;">
            <div style="color:rgba(255,255,255,.85); font-weight:650;">No results</div>
            <div style="color:rgba(255,255,255,.55); font-size:12px; margin-top:6px;">
            Try clearing search or switch tabs.
            </div>
            </div>
            `;
        return;
    }

    listEl.innerHTML = filtered.map((it, idx) => {
        const t = it.__type;
        const badge = t === "fact" ? "fact" : t === "claim" ? "claim" : "opinion";
        const label = t === "fact" ? "FACT" : t === "claim" ? "CLAIM" : "OPINION";

        const title = escHtml(it.text || "");
        const evidence = escHtml(it.evidence || "");
        const whyClaim = escHtml(it.why_claim || "");
        const whyOpinion = escHtml(it.why_opinion || "");

        let secondary = "";
        let body = "";

        if (t === "fact") {
            secondary = evidence ? `Evidence available` : `No evidence returned`;
            body = `
                <div class="kv">
                <div class="k">Evidence quote (original language)</div>
                <div class="v">"${evidence || "(none)"}"</div>
                </div>
                `;
        } else if (t === "claim") {
            secondary = whyClaim || "Needs verification";
            body = `
                <div class="kv">
                <div class="k">Why it’s a claim (English)</div>
                <div class="v">${whyClaim || "Needs verification."}</div>
                </div>
                <div class="kv">
                <div class="k">Evidence quote (original language)</div>
                <div class="v">"${evidence || "(none)"}"</div>
                </div>
                `;
        } else {
            secondary = whyOpinion || "Subjective language / value judgment";
            body = `
                <div class="kv">
                <div class="k">Why it’s an opinion (English)</div>
                <div class="v">${whyOpinion || "Subjective language / value judgment."}</div>
                </div>
                `;
        }

        return `
            <details class="card">
            <summary>
            <span class="badge ${badge}">${label}</span>
            <div class="textblock">
            <div class="title">${idx + 1}. ${title}</div>
            <div class="subtitle">${secondary}</div>
            </div>
            </summary>
            <div class="body">
            ${body}
            </div>
            </details>
            `;
    }).join("");
}

function setTab(tab){
    activeTab = tab;
    tabFactsBtn.classList.toggle("active", tab === "facts");
    tabClaimsBtn.classList.toggle("active", tab === "claims");
    tabOpinionsBtn.classList.toggle("active", tab === "opinions");
    renderList();
}

// ========= Settings persistence =========
function applyProviderUI(){
    const def = providerDefaults(providerEl.value);
    providerHintEl.textContent =
        `${def.label} • ` +
        (def.needsKey ? "API key required" : "No key required") +
        (def.fixedEndpoints ? " • Fixed endpoint" : " • Endpoint override allowed");

    endpointEl.placeholder = (providerEl.value === "local") ? DEFAULT_LOCAL_ENDPOINT : (def.chat || "(not used)");
    endpointEl.disabled = def.fixedEndpoints;

    if (!promptPyEl.value.trim()) promptPyEl.value = DEFAULT_PROMPT_PY;
}

function saveSettings(){
    chrome.storage.local.get(["model_by_provider", "models_cache"], (v) => {
        const provider = providerEl.value;
        const mbp = v.model_by_provider || {};
        mbp[provider] = getSelectedModelValue();

        chrome.storage.local.set({
            provider,
            apiKey: apiKeyEl.value.trim(),
            endpoint: endpointEl.value.trim(),
            maxChars: maxCharsEl.value.trim(),
            promptPy: promptPyEl.value,
            model_by_provider: mbp,
            models_cache: v.models_cache || {}
        });
    });
}

function loadSettings(){
    chrome.storage.local.get([
        "provider","apiKey","endpoint","maxChars","promptPy",
        "model_by_provider","models_cache"
    ], (v) => {
        providerEl.value = v.provider || "local";
        apiKeyEl.value = v.apiKey || "";
        endpointEl.value = v.endpoint || "";
        maxCharsEl.value = v.maxChars || "30000";
        promptPyEl.value = (v.promptPy && v.promptPy.trim()) ? v.promptPy : DEFAULT_PROMPT_PY;

        applyProviderUI();

        const mbp = v.model_by_provider || {};
        const preferred = mbp[providerEl.value] || "";
        const cache = v.models_cache || {};
        const cachedModels = cache[providerEl.value] || [];

        setModelOptions(cachedModels, preferred);
        if (preferred && cachedModels.length && !cachedModels.includes(preferred)) {
            modelSelectEl.value = "__custom__";
            setModelCustomVisible(true);
            modelCustomEl.value = preferred;
        } else if (preferred && !cachedModels.length) {
            modelSelectEl.value = "__custom__";
            setModelCustomVisible(true);
            modelCustomEl.value = preferred;
        }

        loadModels({ force: false }).catch(() => {});
    });
}

// ========= Tab extraction =========
async function getActiveTabId(){
    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
    return tab?.id;
}
async function extractFromPage(tabId){
    return await chrome.tabs.sendMessage(tabId, { type:"EXTRACT_TEXT" });
}

// ========= Main action =========
refreshBtn.addEventListener("click", async () => {
    clearError();
    setLoading(true);
    setSkeleton();

    try {
        setStatus("Extracting…");
        const tabId = await getActiveTabId();
        if (!tabId) throw new Error("No active tab.");

        const extracted = await extractFromPage(tabId);
        if (!extracted?.ok) throw new Error(extracted?.error || "Failed to extract text from page.");

        pageTitleEl.textContent = extracted.title || "Untitled page";

        const maxChars = Math.max(1000, parseInt(maxCharsEl.value || "30000", 10));
        const text = safeTruncate(extracted.text, maxChars);
        pagePreviewEl.value = text.slice(0, 4000);

        const provider = providerEl.value;
        const apiKey = apiKeyEl.value.trim();
        const endpointOverride = endpointEl.value.trim();
        const model = getSelectedModelValue();

        setStatus("Analyzing…");
        const prompt = buildPrompt({ title: extracted.title, url: extracted.url, text });

        const raw = await callProvider({ provider, apiKey, endpointOverride, model, prompt });

        setStatus("Rendering…");
        const json = parseModelJson(raw);

        lastResult = json;
        renderCounts(json);
        renderList();

        setStatus("Done");
    } catch (e) {
        showError(e);
        listEl.innerHTML = "";
        setStatus("Error");
    } finally {
        setLoading(false);
    }
});

// ========= Events =========
tabFactsBtn.addEventListener("click", () => setTab("facts"));
tabClaimsBtn.addEventListener("click", () => setTab("claims"));
tabOpinionsBtn.addEventListener("click", () => setTab("opinions"));
searchEl.addEventListener("input", () => renderList());

settingsBtn.addEventListener("click", () => showDrawer(true));
drawerClose.addEventListener("click", () => showDrawer(false));
closeSettingsBtn.addEventListener("click", () => showDrawer(false));

providerEl.addEventListener("change", async () => {
    applyProviderUI();
    saveSettings();
    await loadModels({ force:false });
});

apiKeyEl.addEventListener("change", saveSettings);
endpointEl.addEventListener("change", saveSettings);
maxCharsEl.addEventListener("change", saveSettings);
promptPyEl.addEventListener("change", saveSettings);

modelSelectEl.addEventListener("change", () => {
    setModelCustomVisible(modelSelectEl.value === "__custom__");
    saveSettings();
});
modelCustomEl.addEventListener("change", saveSettings);

loadModelsBtn.addEventListener("click", async () => {
    clearError();
    await loadModels({ force:true });
});

// ========= Init =========
loadSettings();
setTab("facts");
setStatus("Idle");
