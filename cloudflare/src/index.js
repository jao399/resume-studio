function buildCorsHeaders(origin, allowedOrigin) {
  const allowOrigin = allowedOrigin && allowedOrigin.trim() ? allowedOrigin.trim() : origin || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  };
}

function jsonResponse(body, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders
    }
  });
}

function normalizeProvider(provider, apiKey) {
  const normalized = String(provider || "").trim().toLowerCase();
  if (normalized === "openai" || normalized === "openrouter") {
    return normalized;
  }
  return String(apiKey || "").trim().startsWith("sk-or-") ? "openrouter" : "openai";
}

function defaultModelForProvider(provider) {
  return provider === "openrouter" ? "openai/gpt-4.1-mini" : "gpt-4.1-mini";
}

async function requestChatCompletion(provider, apiKey, model, messages, requireJson = false) {
  if (!String(apiKey || "").trim()) {
    throw new Error("API key is required for AI requests.");
  }

  const normalizedProvider = normalizeProvider(provider, apiKey);
  const endpoint = normalizedProvider === "openrouter"
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";

  const payload = {
    model: model || defaultModelForProvider(normalizedProvider),
    messages,
    temperature: 0.2
  };
  if (requireJson) {
    payload.response_format = { type: "json_object" };
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`
  };
  if (normalizedProvider === "openrouter") {
    headers["HTTP-Referer"] = "https://resume-studio.github.io";
    headers["X-Title"] = "Resume Studio";
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || "AI request failed.");
  }

  const choices = Array.isArray(data?.choices) ? data.choices : [];
  const content = choices[0]?.message?.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const text = content
      .map((item) => (item && typeof item.text === "string" ? item.text : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (text) {
      return text;
    }
  }
  throw new Error("The AI response was empty.");
}

function extractJsonPayload(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    throw new Error("The AI response was empty.");
  }
  try {
    return JSON.parse(raw);
  } catch (_error) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("The AI response was not valid JSON.");
    }
    return JSON.parse(match[0]);
  }
}

async function commandPlan(body) {
  const prompt = [
    "You plan structured resume editor updates in English.",
    "Return valid JSON only.",
    "Do not invent facts, metrics, dates, links, or employers.",
    "Use the user's pasted content and current section data only.",
    "When the command is a section rename, return it in sectionTitles.",
    "Otherwise return structured replacements in updates.",
    "Only include the selected section keys.",
    "JSON shape:",
    "{\"updates\": {\"sectionKey\": ...}, \"sectionTitles\": {\"sectionKey\": \"New title\"}, \"note\": \"...\"}",
    "Section data rules:",
    "- profile: object with profile fields only.",
    "- summary: plain string.",
    "- professionalExperience/internships: array of {date, location, organization, role, bullets}.",
    "- projects: array of {date, title, linkLabel, linkHref, bullets}.",
    "- education: array of {date, location, degree, institution}.",
    "- certificates: array of {title, description}.",
    "- skills: array of {label, items}.",
    "- softSkills: array of strings.",
    "- coverLetter: object with recipientName, company, targetRole, hiringManager, opening, body, closing, signatureName, notes.",
    "- custom sections: preserve the current layout shape and return the updated section object."
  ].join("\n");

  const suggestion = await requestChatCompletion(
    body.provider,
    body.apiKey,
    body.model,
    [
      { role: "system", content: prompt },
      {
        role: "user",
        content: [
          `Selected sections: ${JSON.stringify(body.selectedSections || [])}`,
          `Command: ${String(body.command || "")}`,
          `Pasted content: ${String(body.content || "")}`,
          `Current sections: ${JSON.stringify(body.currentSections || {})}`,
          "Return only the updates needed for the selected sections."
        ].join("\n")
      }
    ],
    true
  );

  const structured = extractJsonPayload(suggestion);
  return {
    updates: structured && typeof structured.updates === "object" ? structured.updates : {},
    sectionTitles: structured && typeof structured.sectionTitles === "object" ? structured.sectionTitles : {},
    note: String(structured?.note || "")
  };
}

async function translateVersion(body) {
  const prompt = [
    "You localize resumes from English into strong, native, ATS-friendly Arabic.",
    "Rules:",
    "1. Never invent facts.",
    "2. Preserve names, dates, email, phone, phoneHref, linkedinHref, and URLs exactly unless the field is clearly display-only.",
    "3. Keep certification titles, product names, and technical terms in English when a literal Arabic rendering would sound weak or unnatural.",
    "4. Rewrite naturally in Arabic rather than translating literally.",
    "5. Return valid JSON only.",
    "6. Only include the requested section keys in the sections object.",
    "7. For profile, preserve email/phone/link URLs exactly and localize display text professionally.",
    "8. For coverLetter, return a structured object with recipientName, company, targetRole, hiringManager, opening, body, closing, signatureName, notes, generatedAt.",
    "Return JSON in this shape: {\"sections\": {...}, \"notes\": {...}}"
  ].join("\n");

  const suggestion = await requestChatCompletion(
    body.provider,
    body.apiKey,
    body.model,
    [
      { role: "system", content: prompt },
      {
        role: "user",
        content: [
          `Source language: ${String(body.sourceLanguage || "en")}`,
          `Target language: ${String(body.targetLanguage || "ar")}`,
          `Mode: ${String(body.mode || "sync")}`,
          `Source version: ${JSON.stringify(body.sourceVersion || {})}`,
          `Requested sections: ${JSON.stringify(body.requestedSections || [])}`,
          `Job description: ${String(body.jobDescription || "")}`,
          `English sections: ${JSON.stringify(body.sections || {})}`,
          `Existing Arabic context: ${JSON.stringify(body.existingArabic || {})}`,
          "Localize each requested section into polished Arabic while preserving all facts exactly."
        ].join("\n")
      }
    ],
    true
  );

  const structured = extractJsonPayload(suggestion);
  if (!structured || typeof structured.sections !== "object") {
    throw new Error("The translation response did not include structured sections.");
  }
  return {
    sections: structured.sections,
    notes: structured && typeof structured.notes === "object" ? structured.notes : {}
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsHeaders = buildCorsHeaders(origin, env.ALLOWED_ORIGIN);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ success: true, status: "ok" }, 200, corsHeaders);
    }

    if (request.method !== "POST") {
      return jsonResponse({ success: false, error: "Method not allowed." }, 405, corsHeaders);
    }

    try {
      const body = await request.json();
      if (url.pathname === "/command-plan") {
        const result = await commandPlan(body || {});
        return jsonResponse({ success: true, ...result }, 200, corsHeaders);
      }
      if (url.pathname === "/translate-version") {
        const result = await translateVersion(body || {});
        return jsonResponse({ success: true, ...result }, 200, corsHeaders);
      }
      return jsonResponse({ success: false, error: "Unknown endpoint." }, 404, corsHeaders);
    } catch (error) {
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : "Request failed." }, 500, corsHeaders);
    }
  }
};
