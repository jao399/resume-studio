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
  if (normalized.startsWith("openrouter")) {
    return "openrouter";
  }
  if (normalized === "openai" || normalized === "openrouter") {
    return normalized;
  }
  return String(apiKey || "").trim().startsWith("sk-or-") ? "openrouter" : "openai";
}

function defaultModelForProvider(provider, requestedModel = "") {
  const rawModel = String(requestedModel || "").trim();
  if (rawModel) {
    return rawModel;
  }
  return normalizeProvider(provider) === "openrouter" ? "openrouter/auto" : "gpt-4.1-mini";
}

async function requestChatCompletion(provider, apiKey, model, messages, requireJson = false, requestOrigin = "", allowedOrigin = "") {
  if (!String(apiKey || "").trim()) {
    throw new Error("API key is required for AI requests.");
  }

  const normalizedProvider = normalizeProvider(provider, apiKey);
  const endpoint = normalizedProvider === "openrouter"
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";

  const payload = {
    model: defaultModelForProvider(normalizedProvider, model),
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
    headers["HTTP-Referer"] = allowedOrigin || requestOrigin || "https://jao399.github.io/resume-studio/";
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

  const content = data?.choices?.[0]?.message?.content;
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

async function requestStructuredTask(body, prompt, requestOrigin, allowedOrigin) {
  const content = await requestChatCompletion(
    body.provider,
    body.apiKey,
    body.model,
    [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ],
    true,
    requestOrigin,
    allowedOrigin
  );
  return extractJsonPayload(content);
}

async function commandPlan(body, requestOrigin, allowedOrigin) {
  const structured = await requestStructuredTask(body, {
    system: [
      "You plan structured resume editor updates in English.",
      "Return valid JSON only.",
      "Do not invent facts, metrics, dates, links, or employers.",
      "Use the user's pasted content and current section data only.",
      "When the command is a section rename, return it in sectionTitles.",
      "Otherwise return structured replacements in updates.",
      "Only include the selected section keys.",
      "JSON shape:",
      "{\"updates\": {\"sectionKey\": ...}, \"sectionTitles\": {\"sectionKey\": \"New title\"}, \"note\": \"...\"}"
    ].join("\n"),
    user: [
      `Selected sections: ${JSON.stringify(body.selectedSections || [])}`,
      `Command: ${String(body.command || "")}`,
      `Pasted content: ${String(body.content || "")}`,
      `Current sections: ${JSON.stringify(body.currentSections || {})}`,
      "Return only the updates needed for the selected sections."
    ].join("\n")
  }, requestOrigin, allowedOrigin);

  return {
    updates: structured && typeof structured.updates === "object" ? structured.updates : {},
    sectionTitles: structured && typeof structured.sectionTitles === "object" ? structured.sectionTitles : {},
    note: String(structured?.note || "")
  };
}

async function translateVersion(body, requestOrigin, allowedOrigin) {
  const structured = await requestStructuredTask(body, {
    system: [
      "You localize resumes from English into strong, native, ATS-friendly Arabic.",
      "Never invent facts.",
      "Preserve names, dates, email, phone, phoneHref, linkedinHref, and URLs exactly unless the field is clearly display-only.",
      "Keep certification titles, product names, and technical terms in English when a literal Arabic rendering would sound weak or unnatural.",
      "Rewrite naturally in Arabic rather than translating literally.",
      "Return valid JSON only.",
      "Only include the requested section keys in the sections object.",
      "For coverLetter, return a structured object with recipientName, company, targetRole, hiringManager, opening, body, closing, signatureName, notes, generatedAt.",
      "Return JSON in this shape: {\"sections\": {...}, \"notes\": {...}}"
    ].join("\n"),
    user: [
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
  }, requestOrigin, allowedOrigin);

  return {
    sections: structured && typeof structured.sections === "object" ? structured.sections : {},
    notes: structured && typeof structured.notes === "object" ? structured.notes : {}
  };
}

async function coverLetterDraft(body, requestOrigin, allowedOrigin) {
  const structured = await requestStructuredTask(body, {
    system: [
      "You write recruiter-ready cover letters for the current resume only.",
      "Use the resume facts exactly as provided.",
      "Do not invent achievements, metrics, employers, dates, or tools.",
      "Use the target role and job description when available.",
      "Keep the tone professional, concise, specific, and believable.",
      "Return valid JSON only in this shape:",
      "{\"recipientName\":\"\",\"company\":\"\",\"targetRole\":\"\",\"hiringManager\":\"\",\"opening\":\"\",\"body\":\"\",\"closing\":\"\",\"signatureName\":\"\",\"notes\":\"\"}"
    ].join("\n"),
    user: [
      `CV:\n${String(body.cvText || "")}`,
      `Target Job Title:\n${String(body.jobTitle || "")}`,
      `Target Job Description:\n${String(body.jobDescription || "")}`,
      `Current Draft: ${JSON.stringify(body.draft || {})}`,
      "Write a stronger, role-aware cover letter draft for this exact resume."
    ].join("\n\n")
  }, requestOrigin, allowedOrigin);

  return {
    draft: structured && typeof structured === "object" ? structured : {}
  };
}

async function aiReview(body, requestOrigin, allowedOrigin) {
  const reviewType = String(body.reviewType || "quality").trim().toLowerCase();
  const systemPromptMap = {
    quality: [
      "You are an experienced recruiter-grade resume reviewer.",
      "Evaluate this specific CV only.",
      "Do not invent facts or achievements.",
      "Return valid JSON only with this shape:",
      "{\"summary\":\"\",\"scores\":{\"overall\":0,\"atsMatch\":0,\"recruiterImpact\":0,\"writingStrength\":0,\"evidenceMetrics\":0,\"roleRelevance\":0},\"topProblems\":[\"\"],\"strongestPoints\":[\"\"],\"recommendations\":[\"\"],\"rewrittenSuggestions\":[{\"title\":\"\",\"before\":\"\",\"after\":\"\"}]}"
    ].join("\n"),
    ats: [
      "You are a strict ATS and recruiter reviewer.",
      "Evaluate this specific CV against the target job title and job description when provided.",
      "Do not invent facts.",
      "Return valid JSON only with this shape:",
      "{\"summary\":\"\",\"scores\":{\"overall\":0,\"atsMatch\":0,\"recruiterImpact\":0,\"writingStrength\":0,\"evidenceMetrics\":0,\"roleRelevance\":0},\"topProblems\":[\"\"],\"strongestPoints\":[\"\"],\"recommendations\":[\"\"],\"rewrittenSuggestions\":[{\"title\":\"\",\"before\":\"\",\"after\":\"\"}]}"
    ].join("\n"),
    hr: [
      "Act as a senior HR recruiter and hiring manager reviewing this CV for real hiring decisions.",
      "Be direct, honest, and realistic.",
      "Do not praise unnecessarily.",
      "Do not invent achievements, fake numbers, or fake impact.",
      "Return valid JSON only with this shape:",
      "{\"summary\":\"\",\"scores\":{\"relevance\":0,\"professionalism\":0,\"atsStrength\":0,\"achievementImpact\":0,\"shortlistPotential\":0},\"firstImpression\":\"\",\"roleFit\":{\"strongMatches\":[\"\"],\"weakMatches\":[\"\"]},\"hrReview\":[{\"title\":\"\",\"message\":\"\",\"severity\":\"info\"}],\"atsReview\":[{\"title\":\"\",\"message\":\"\",\"severity\":\"info\"}],\"redFlags\":[\"\"],\"shortlistDecision\":{\"decision\":\"Reject|Maybe|Shortlist\",\"reason\":\"\"},\"improvementRecommendations\":[\"\"],\"rewrittenSuggestions\":[{\"title\":\"\",\"before\":\"\",\"after\":\"\"}]}"
    ].join("\n")
  };

  const structured = await requestStructuredTask(body, {
    system: systemPromptMap[reviewType] || systemPromptMap.quality,
    user: [
      `CV:\n${String(body.cvText || "")}`,
      `Target Job Title:\n${String(body.jobTitle || "")}`,
      `Target Job Description:\n${String(body.jobDescription || "")}`,
      `Local Quality Summary:\n${JSON.stringify(body.qualitySummary || {})}`,
      `Local ATS Summary:\n${JSON.stringify(body.atsSummary || {})}`
    ].join("\n\n")
  }, requestOrigin, allowedOrigin);

  return {
    review: structured && typeof structured === "object" ? structured : {}
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
        return jsonResponse({ success: true, ...(await commandPlan(body || {}, origin, env.ALLOWED_ORIGIN)) }, 200, corsHeaders);
      }
      if (url.pathname === "/translate-version") {
        return jsonResponse({ success: true, ...(await translateVersion(body || {}, origin, env.ALLOWED_ORIGIN)) }, 200, corsHeaders);
      }
      if (url.pathname === "/cover-letter-draft") {
        return jsonResponse({ success: true, ...(await coverLetterDraft(body || {}, origin, env.ALLOWED_ORIGIN)) }, 200, corsHeaders);
      }
      if (url.pathname === "/ai-review") {
        return jsonResponse({ success: true, ...(await aiReview(body || {}, origin, env.ALLOWED_ORIGIN)) }, 200, corsHeaders);
      }
      return jsonResponse({ success: false, error: "Unknown endpoint." }, 404, corsHeaders);
    } catch (error) {
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : "Request failed." }, 500, corsHeaders);
    }
  }
};
