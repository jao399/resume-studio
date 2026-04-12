const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function requestAiText(settings, messages, { json = false } = {}) {
  const provider = normalizeProvider(settings.provider, settings.apiKey);
  const model = resolveModel(settings);
  const endpoint = provider === "openrouter" ? OPENROUTER_URL : OPENAI_URL;

  const payload = {
    model,
    messages,
    temperature: 0.2
  };
  if (json) {
    payload.response_format = { type: "json_object" };
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${settings.apiKey}`
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = window.location.origin || "https://jao399.github.io/resume-studio/";
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
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content.map((item) => item?.text || "").join("\n").trim();
  }
  throw new Error("The AI response was empty.");
}

export async function requestAiJson(settings, messages) {
  const text = await requestAiText(settings, messages, { json: true });
  try {
    return JSON.parse(text);
  } catch (_error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("The AI response was not valid JSON.");
    }
    return JSON.parse(match[0]);
  }
}

export async function runHrReview(settings, payload) {
  return requestAiJson(settings, [
    {
      role: "system",
      content: [
        "Act as a senior HR recruiter and hiring manager reviewing this CV for real hiring decisions.",
        "Your job is to evaluate the CV like a strict HR professional, not like a supportive coach.",
        "Review the CV using these sections:",
        "1. Overall first impression",
        "2. Role fit",
        "3. HR review",
        "4. ATS review",
        "5. Red flags",
        "6. Shortlist decision",
        "7. Improvement recommendations",
        "Output rules:",
        "- Be direct, honest, and realistic.",
        "- Think like HR deciding quickly.",
        "- Do not praise unnecessarily.",
        "- Focus on employability, clarity, relevance, professionalism, and impact.",
        "- Use a clear structured format.",
        "- Give scores out of 10 for Relevance, Professionalism, ATS strength, Achievement impact, and Overall shortlist potential.",
        "Return valid JSON only with this shape:",
        "{\"summary\":\"\",\"scores\":{\"relevance\":0,\"professionalism\":0,\"atsStrength\":0,\"achievementImpact\":0,\"shortlistPotential\":0},\"firstImpression\":\"\",\"roleFit\":{\"strongMatches\":[\"\"],\"weakMatches\":[\"\"]},\"hrReview\":[{\"title\":\"\",\"message\":\"\",\"severity\":\"info\"}],\"atsReview\":[{\"title\":\"\",\"message\":\"\",\"severity\":\"info\"}],\"redFlags\":[\"\"],\"shortlistDecision\":{\"decision\":\"Reject|Maybe|Shortlist\",\"reason\":\"\"},\"improvementRecommendations\":[\"\"],\"rewrittenSuggestions\":[{\"title\":\"\",\"before\":\"\",\"after\":\"\"}]}"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `CV:\n${payload.cvText}`,
        `Target Job Title:\n${payload.jobTitle}`,
        `Target Job Description:\n${payload.jobDescription}`
      ].join("\n\n")
    }
  ]);
}

export async function generateCoverLetter(settings, payload) {
  return requestAiJson(settings, [
    {
      role: "system",
      content: [
        "You write recruiter-ready cover letters for the current resume only.",
        "Use the resume facts exactly as provided.",
        "Do not invent achievements, metrics, employers, dates, or tools.",
        "Keep the tone professional, concise, specific, and believable.",
        "Return valid JSON only in this shape:",
        "{\"recipientName\":\"\",\"company\":\"\",\"targetRole\":\"\",\"hiringManager\":\"\",\"opening\":\"\",\"body\":\"\",\"closing\":\"\",\"signatureName\":\"\",\"notes\":\"\"}"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `CV:\n${payload.cvText}`,
        `Target Job Title:\n${payload.jobTitle}`,
        `Target Job Description:\n${payload.jobDescription}`,
        `Current Draft: ${JSON.stringify(payload.draft || {})}`
      ].join("\n\n")
    }
  ]);
}

export async function translateSections(settings, payload) {
  return requestAiJson(settings, [
    {
      role: "system",
      content: [
        "You localize resume content between English and Arabic.",
        "Never invent facts.",
        "Preserve names, dates, links, phone, email, and technical product names unless translation is explicitly better.",
        "For narrative text, write natural recruiter-friendly language rather than literal translation.",
        "Return valid JSON only with this shape:",
        "{\"sections\":{\"summary\":\"\",\"experience\":[],\"internships\":[],\"projects\":[],\"education\":[],\"certificates\":[],\"skills\":[],\"softSkills\":[],\"coverLetter\":{}},\"notes\":[\"\"]}"
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Source language: ${payload.sourceLanguage}`,
        `Target language: ${payload.targetLanguage}`,
        `Selected sections: ${JSON.stringify(payload.sectionKeys)}`,
        `Source content: ${JSON.stringify(payload.sourceContent)}`,
        `Existing target content: ${JSON.stringify(payload.targetContent)}`
      ].join("\n\n")
    }
  ]);
}

export function hasAiKey(settings) {
  return Boolean(String(settings?.apiKey || "").trim());
}

function normalizeProvider(provider, apiKey) {
  const normalized = String(provider || "").trim().toLowerCase();
  if (normalized.startsWith("openrouter")) {
    return "openrouter";
  }
  if (normalized === "openai") {
    return "openai";
  }
  return String(apiKey || "").trim().startsWith("sk-or-") ? "openrouter" : "openai";
}

function resolveModel(settings) {
  const provider = String(settings?.provider || "");
  const model = String(settings?.model || "").trim();
  if (model) {
    return model;
  }
  if (provider === "openrouter-free") {
    return "google/gemma-3-27b-it:free";
  }
  if (provider === "openrouter-manual") {
    return "openrouter/auto";
  }
  if (provider === "openrouter-auto") {
    return "openrouter/auto";
  }
  return "gpt-4.1-mini";
}
