import { normalizeResume } from "./model.js";

const STRONG_VERBS = [
  "built",
  "developed",
  "implemented",
  "led",
  "managed",
  "coordinated",
  "designed",
  "automated",
  "diagnosed",
  "resolved",
  "analyzed",
  "streamlined",
  "secured",
  "launched"
];

const GENERIC_PHRASES = [
  "responsible for",
  "worked on",
  "helped with",
  "involved in",
  "hands-on experience",
  "good knowledge of",
  "familiar with",
  "team player",
  "hardworking",
  "fast learner",
  "excellent communication"
];

const CONTEXT_VERBS = [
  { match: /(troubleshoot|incident|support|ticket|issue|vpn|device|network)/i, verb: "Diagnosed" },
  { match: /(build|develop|create|platform|app|service|dashboard|portal|api)/i, verb: "Built" },
  { match: /(automate|pipeline|ci|deploy|release|workflow)/i, verb: "Automated" },
  { match: /(lead|manage|coordinate|mentor|own)/i, verb: "Led" },
  { match: /(security|threat|analysis|log|investigation|siem)/i, verb: "Analyzed" }
];

export function buildResumeText(resume, lang) {
  const data = normalizeResume(resume);
  const source = data.languages[lang];
  const parts = [
    source.profile.name,
    source.summary,
    ...source.sections.experience.flatMap((item) => [item.role, item.organization, ...item.bullets]),
    ...source.sections.internships.flatMap((item) => [item.role, item.organization, ...item.bullets]),
    ...source.sections.projects.flatMap((item) => [item.title, ...item.bullets]),
    ...source.sections.education.flatMap((item) => [item.degree, item.institution]),
    ...source.sections.certificates.flatMap((item) => [item.title, item.description]),
    ...source.sections.skills.flatMap((item) => [item.label, item.items]),
    ...source.sections.softSkills
  ];
  return parts.filter(Boolean).join("\n");
}

export function analyzeQuality(resume, lang) {
  const data = normalizeResume(resume);
  const source = data.languages[lang];
  const bullets = [
    ...source.sections.experience.flatMap((item) => item.bullets.map((bullet, index) => ({ section: "experience", title: item.role, bullet, index }))),
    ...source.sections.internships.flatMap((item) => item.bullets.map((bullet, index) => ({ section: "internships", title: item.role, bullet, index }))),
    ...source.sections.projects.flatMap((item) => item.bullets.map((bullet, index) => ({ section: "projects", title: item.title, bullet, index })))
  ];

  const weakBullets = bullets.map((entry) => analyzeBullet(entry.bullet)).filter((entry) => entry.score < 2).slice(0, 8);
  const genericWording = collectGenericWording(source.summary, bullets.map((item) => item.bullet));
  const missingMetrics = bullets
    .filter((entry) => !hasMetric(entry.bullet))
    .slice(0, 6)
    .map((entry) => ({
      bullet: entry.bullet,
      suggestion: suggestMetricType(entry.bullet)
    }));
  const duplicateSkills = detectDuplicateSkills(source.sections.skills, source.sections.softSkills);

  const topProblems = [];
  if (weakBullets.length) {
    topProblems.push(`${weakBullets.length} weak bullets need stronger action and impact.`);
  }
  if (genericWording.length) {
    topProblems.push(`${genericWording.length} generic phrases reduce recruiter confidence.`);
  }
  if (missingMetrics.length > 2) {
    topProblems.push("Too many bullets still read like duties instead of evidence-backed outcomes.");
  }
  if (!source.summary || source.summary.length < 90) {
    topProblems.push("The summary is too short to establish clear specialization and target role fit.");
  }

  const strongestPoints = [];
  if (source.sections.projects.length) {
    strongestPoints.push("Projects give the CV technical evidence beyond the skills list.");
  }
  if (source.sections.certificates.length) {
    strongestPoints.push("Certifications support the technical narrative when paired with relevant experience.");
  }
  if (bullets.some((entry) => hasMetric(entry.bullet))) {
    strongestPoints.push("There is measurable evidence in the experience section.");
  }

  const writingStrength = clamp(10 - weakBullets.length - Math.min(genericWording.length, 4), 2, 10);
  const evidenceMetrics = clamp(4 + bullets.filter((entry) => hasMetric(entry.bullet)).length, 2, 10);
  const roleRelevance = clamp(6 + (source.sections.projects.length ? 1 : 0) + (source.sections.skills.length > 2 ? 1 : 0), 2, 10);
  const recruiterImpact = clamp(Math.round((writingStrength + evidenceMetrics + roleRelevance) / 3), 2, 10);
  const overall = clamp(Math.round((writingStrength + evidenceMetrics + recruiterImpact + roleRelevance) / 4), 2, 10);

  return {
    scores: {
      overall,
      atsMatch: 0,
      recruiterImpact,
      writingStrength,
      evidenceMetrics,
      roleRelevance
    },
    topProblems,
    strongestPoints,
    weakBullets,
    genericWording,
    duplicateSkills,
    missingMetrics,
    recruiterImpression: buildRecruiterImpression(source, weakBullets, genericWording),
    rewrittenSuggestions: weakBullets.map((item) => ({
      title: item.title,
      before: item.bullet,
      after: item.rewrite
    }))
  };
}

export function analyzeAts(resume, lang, jobTitle, jobDescription) {
  const data = normalizeResume(resume);
  const source = data.languages[lang];
  const cvText = buildResumeText(data, lang).toLowerCase();
  const jdText = String(jobDescription || "").toLowerCase();
  const tokens = extractKeywords(jdText || jobTitle);
  const matched = tokens.filter((token) => cvText.includes(token));
  const missing = tokens.filter((token) => !cvText.includes(token));
  const hardSkills = tokens.filter((token) => /(react|node|python|sql|cloud|docker|azure|aws|security|api|typescript|javascript|linux)/.test(token));
  const softSkills = tokens.filter((token) => /(communication|collaboration|ownership|stakeholder|teamwork|leadership|problem solving)/.test(token));
  const domainFocus = detectDomain(jobDescription || jobTitle || cvText);
  const evidenceStrength = matched.filter((token) => source.sections.experience.some((item) => item.bullets.join(" ").toLowerCase().includes(token))).length;

  const atsMatch = clamp(Math.round((matched.length / Math.max(tokens.length, 1)) * 10), 1, 10);
  const recruiterImpact = clamp(4 + evidenceStrength, 1, 10);
  const writingStrength = analyzeQuality(data, lang).scores.writingStrength;
  const evidenceMetrics = analyzeQuality(data, lang).scores.evidenceMetrics;
  const roleRelevance = clamp(Math.round((atsMatch + recruiterImpact) / 2), 1, 10);
  const overall = clamp(Math.round((atsMatch + recruiterImpact + writingStrength + evidenceMetrics + roleRelevance) / 5), 1, 10);

  return {
    scores: {
      overall,
      atsMatch,
      recruiterImpact,
      writingStrength,
      evidenceMetrics,
      roleRelevance
    },
    hardSkills,
    softSkills,
    matched,
    missing,
    domainFocus,
    evidenceStrength,
    summary: jdText
      ? `Matched ${matched.length} of ${tokens.length || 0} tracked job terms. Evidence-backed matches matter more than keyword-only mentions.`
      : "Baseline ATS review is active. Paste a job description for a targeted match analysis."
  };
}

export function analyzeHrBaseline(resume, lang, jobTitle, jobDescription) {
  const quality = analyzeQuality(resume, lang);
  const ats = analyzeAts(resume, lang, jobTitle, jobDescription);
  const shortlistPotential = clamp(Math.round((quality.scores.overall + ats.scores.atsMatch + ats.evidenceStrength) / 3), 1, 10);
  return {
    scores: {
      relevance: ats.scores.roleRelevance,
      professionalism: quality.scores.recruiterImpact,
      atsStrength: ats.scores.atsMatch,
      achievementImpact: quality.scores.evidenceMetrics,
      shortlistPotential
    },
    decision: shortlistPotential >= 7 ? "Shortlist" : shortlistPotential >= 5 ? "Maybe" : "Reject",
    reason: shortlistPotential >= 7
      ? "The CV presents credible technical range with enough evidence to justify recruiter follow-up."
      : shortlistPotential >= 5
        ? "The CV is viable, but recruiter confidence is reduced by generic phrasing or missing evidence."
        : "The CV currently reads too generic or too weakly evidenced for a confident shortlist."
  };
}

function analyzeBullet(bullet) {
  const normalized = String(bullet || "").trim();
  const firstWord = normalized.split(/\s+/)[0]?.toLowerCase() || "";
  const strongVerb = STRONG_VERBS.includes(firstWord.replace(/[^a-z]/g, ""));
  const task = normalized.length > 30;
  const metric = hasMetric(normalized);
  const impact = /(reduc|improv|accelerat|streamlin|enable|support|launch|cut|increase|lower|faster|risk)/i.test(normalized);
  const score = [strongVerb, task, metric, impact].filter(Boolean).length;
  return {
    bullet: normalized,
    title: strongVerb ? "Tighten bullet" : "Weak opening",
    issue: !strongVerb ? "The bullet opens weakly." : !metric ? "The bullet lacks measurable evidence." : "The bullet reads as a task more than an outcome.",
    betterVerb: suggestVerb(normalized),
    rewrite: rewriteBullet(normalized),
    score
  };
}

function collectGenericWording(summary, bullets) {
  const entries = [];
  const summaryText = String(summary || "");
  GENERIC_PHRASES.forEach((phrase) => {
    if (summaryText.toLowerCase().includes(phrase)) {
      entries.push({
        where: "Summary",
        phrase,
        why: "This phrase sounds generic and does not show concrete value.",
        replacement: suggestReplacement(phrase)
      });
    }
  });
  bullets.forEach((bullet) => {
    GENERIC_PHRASES.forEach((phrase) => {
      if (String(bullet || "").toLowerCase().includes(phrase)) {
        entries.push({
          where: "Bullet",
          phrase,
          why: "This phrase reads like filler and weakens the recruiter signal.",
          replacement: suggestReplacement(phrase)
        });
      }
    });
  });
  return entries.slice(0, 10);
}

function detectDuplicateSkills(skillGroups, softSkills) {
  const seen = new Map();
  const duplicates = [];
  skillGroups.forEach((group) => {
    String(group.items || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean).forEach((item) => {
      if (seen.has(item) && !duplicates.includes(item)) {
        duplicates.push(item);
      }
      seen.set(item, "technical");
    });
  });
  softSkills.forEach((item) => {
    const key = String(item || "").trim().toLowerCase();
    if (!key) {
      return;
    }
    if (seen.has(key) && !duplicates.includes(key)) {
      duplicates.push(key);
    }
    seen.set(key, "soft");
  });
  return duplicates;
}

function buildRecruiterImpression(source, weakBullets, genericWording) {
  if (!source.summary) {
    return "The CV lacks a strong opening and makes the recruiter work too hard to infer target fit.";
  }
  if (weakBullets.length > 4 || genericWording.length > 3) {
    return "The profile looks relevant, but too much of the experience still reads like duties instead of differentiated impact.";
  }
  return "The CV looks coherent and relevant, with enough specificity to justify a closer read.";
}

function suggestVerb(text) {
  const match = CONTEXT_VERBS.find((item) => item.match.test(text));
  return match ? match.verb : "Delivered";
}

function rewriteBullet(text) {
  const trimmed = String(text || "").trim().replace(/^[•\-]\s*/, "");
  const betterVerb = suggestVerb(trimmed);
  const noWeakLead = trimmed
    .replace(/^(worked on|responsible for|helped with|involved in|assisted with|participated in)\s+/i, "")
    .replace(/^made\s+/i, "")
    .replace(/^did troubleshooting\s+/i, "")
    .trim();
  const sentence = noWeakLead ? `${betterVerb} ${lowercaseFirst(noWeakLead)}` : `${betterVerb} core work in this area.`;
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
}

function suggestReplacement(phrase) {
  const map = {
    "responsible for": "Led or managed specific work with scope.",
    "worked on": "Built, implemented, or delivered a concrete output.",
    "helped with": "Supported or contributed to a named deliverable.",
    "involved in": "Owned a defined task, workflow, or deliverable.",
    "hands-on experience": "Applied directly in projects or production work.",
    "good knowledge of": "Working knowledge of",
    "familiar with": "Used in projects or operational work",
    "team player": "Collaborates effectively across teams",
    "hardworking": "Reliable under deadlines",
    "fast learner": "Adapted quickly to new tools or domains",
    "excellent communication": "Communicates technical ideas clearly to stakeholders"
  };
  return map[phrase] || "Replace with a specific capability or outcome.";
}

function lowercaseFirst(text) {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

function hasMetric(text) {
  return /(\d+%|\d+\+?|\bminutes?\b|\bhours?\b|\bdays?\b|\bweeks?\b|\bmonths?\b|\busers?\b|\bdevices?\b|\btickets?\b|\bsystems?\b|\bincidents?\b|\bprojects?\b|\bendpoints?\b|\bteams?\b)/i.test(String(text || ""));
}

function suggestMetricType(text) {
  if (/(support|ticket|issue|incident|device|user)/i.test(text)) {
    return "Add ticket volume, user count, device count, or time-to-resolution if you have it.";
  }
  if (/(build|develop|platform|service|api|dashboard|project)/i.test(text)) {
    return "Add scope metrics such as endpoints, modules, users, or reduction in manual work if known.";
  }
  if (/(automate|deploy|ci|workflow|release)/i.test(text)) {
    return "Add time saved, deployment frequency, or validation time improvement if known.";
  }
  return "Add a realistic metric for scale, volume, or measurable outcome if you have one.";
}

function extractKeywords(text) {
  const words = String(text || "")
    .toLowerCase()
    .match(/[a-z][a-z0-9+.#/-]{2,}/g) || [];
  return [...new Set(words.filter((word) => !STOPWORDS.has(word)).slice(0, 40))];
}

function detectDomain(text) {
  const normalized = String(text || "").toLowerCase();
  if (/cyber|security|siem|incident|threat/.test(normalized)) return "Cybersecurity";
  if (/cloud|aws|azure|gcp|google cloud|devops|pipeline|docker/.test(normalized)) return "Cloud / DevOps";
  if (/support|help desk|endpoint|ticket|it operations/.test(normalized)) return "IT Support / Operations";
  if (/react|frontend|backend|full[- ]stack|web/.test(normalized)) return "Web Development";
  if (/data|analytics|etl|sql|dashboard/.test(normalized)) return "Data / Analytics";
  return "General Technical";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "using", "your", "you", "our",
  "will", "have", "has", "are", "job", "role", "team", "work", "ability", "strong", "experience",
  "years", "plus", "must", "preferred", "required", "should", "across", "through", "about"
]);
