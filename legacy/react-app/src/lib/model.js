import { SECTION_KEYS, createDemoResume, createEmptyCoverLetter } from "./defaults.js";

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createBilingualVersion(name = "Demo bilingual baseline", resume = createDemoResume()) {
  return {
    id: `version-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    resume: normalizeResume(resume)
  };
}

export function getStyleTokens(resume, lang, defaults, refined) {
  const preset = resume?.shared?.stylePreset === "refined" ? "refined" : "default";
  return preset === "refined" ? refined[lang] : defaults[lang];
}

export function normalizeResume(input) {
  const demo = createDemoResume();
  const resume = clone(input || demo);
  const shared = resume.shared || {};
  const en = resume.languages?.en || {};
  const ar = resume.languages?.ar || {};

  return {
    id: String(resume.id || `resume-${Date.now()}`),
    shared: {
      photo: shared.photo == null ? String(demo.shared.photo) : String(shared.photo),
      email: String(shared.email || ""),
      phone: String(shared.phone || ""),
      phoneHref: String(shared.phoneHref || ""),
      linkedinHref: String(shared.linkedinHref || ""),
      githubHref: String(shared.githubHref || ""),
      portfolioHref: String(shared.portfolioHref || ""),
      stylePreset: shared.stylePreset === "refined" ? "refined" : "default",
      sectionOrder: normalizeSectionOrder(shared.sectionOrder),
      targeting: {
        jobTitle: String(shared.targeting?.jobTitle || ""),
        company: String(shared.targeting?.company || ""),
        jobDescription: String(shared.targeting?.jobDescription || ""),
        focusKeywords: String(shared.targeting?.focusKeywords || ""),
        notes: String(shared.targeting?.notes || "")
      }
    },
    languages: {
      en: normalizeLanguageRecord("en", en, demo.languages.en),
      ar: normalizeLanguageRecord("ar", ar, demo.languages.ar)
    }
  };
}

function normalizeSectionOrder(order) {
  const list = Array.isArray(order) ? order.map((item) => String(item || "")) : [];
  const known = list.filter((key) => SECTION_KEYS.includes(key));
  SECTION_KEYS.forEach((key) => {
    if (!known.includes(key)) {
      known.push(key);
    }
  });
  return known;
}

function normalizeLanguageRecord(lang, value, fallback) {
  const data = value || {};
  return {
    meta: { lang, dir: lang === "ar" ? "rtl" : "ltr" },
    labels: {
      summary: String(data.labels?.summary || fallback.labels.summary),
      experience: String(data.labels?.experience || fallback.labels.experience),
      internships: String(data.labels?.internships || fallback.labels.internships),
      projects: String(data.labels?.projects || fallback.labels.projects),
      education: String(data.labels?.education || fallback.labels.education),
      certificates: String(data.labels?.certificates || fallback.labels.certificates),
      skills: String(data.labels?.skills || fallback.labels.skills),
      softSkills: String(data.labels?.softSkills || fallback.labels.softSkills)
    },
    profile: {
      name: String(data.profile?.name || fallback.profile.name),
      location: String(data.profile?.location || fallback.profile.location),
      linkedinLabel: String(data.profile?.linkedinLabel || fallback.profile.linkedinLabel),
      githubLabel: String(data.profile?.githubLabel || fallback.profile.githubLabel),
      portfolioLabel: String(data.profile?.portfolioLabel || fallback.profile.portfolioLabel)
    },
    summary: String(data.summary || ""),
    sections: {
      experience: normalizeList(data.sections?.experience || fallback.sections.experience, normalizeTimelineItem),
      internships: normalizeList(data.sections?.internships || fallback.sections.internships, normalizeTimelineItem),
      projects: normalizeList(data.sections?.projects || fallback.sections.projects, normalizeProjectItem),
      education: normalizeList(data.sections?.education || fallback.sections.education, normalizeEducationItem),
      certificates: normalizeList(data.sections?.certificates || fallback.sections.certificates, normalizeCertificateItem),
      skills: normalizeList(data.sections?.skills || fallback.sections.skills, normalizeSkillGroup),
      softSkills: Array.isArray(data.sections?.softSkills || fallback.sections.softSkills)
        ? (data.sections?.softSkills || fallback.sections.softSkills).map((item) => String(item || "")).filter(Boolean)
        : [],
    },
    coverLetter: normalizeCoverLetter(data.coverLetter || fallback.coverLetter, data.profile?.name || fallback.profile.name)
  };
}

function normalizeList(list, mapper) {
  return Array.isArray(list) ? list.map((item) => mapper(item)).filter(Boolean) : [];
}

function normalizeTimelineItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  return {
    date: String(item.date || ""),
    location: String(item.location || ""),
    organization: String(item.organization || ""),
    role: String(item.role || ""),
    bullets: Array.isArray(item.bullets) ? item.bullets.map((bullet) => String(bullet || "")).filter(Boolean) : []
  };
}

function normalizeProjectItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  return {
    date: String(item.date || ""),
    title: String(item.title || ""),
    linkLabel: String(item.linkLabel || ""),
    linkHref: String(item.linkHref || ""),
    bullets: Array.isArray(item.bullets) ? item.bullets.map((bullet) => String(bullet || "")).filter(Boolean) : []
  };
}

function normalizeEducationItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  return {
    date: String(item.date || ""),
    location: String(item.location || ""),
    degree: String(item.degree || ""),
    institution: String(item.institution || "")
  };
}

function normalizeCertificateItem(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  return {
    title: String(item.title || ""),
    description: String(item.description || "")
  };
}

function normalizeSkillGroup(item) {
  if (!item || typeof item !== "object") {
    return null;
  }
  return {
    label: String(item.label || ""),
    items: String(item.items || "")
  };
}

export function normalizeCoverLetter(value, fallbackName = "") {
  const item = value || {};
  return {
    recipientName: String(item.recipientName || ""),
    company: String(item.company || ""),
    targetRole: String(item.targetRole || ""),
    hiringManager: String(item.hiringManager || ""),
    opening: String(item.opening || ""),
    body: String(item.body || ""),
    closing: String(item.closing || ""),
    signatureName: String(item.signatureName || fallbackName || ""),
    notes: String(item.notes || "")
  };
}

export function mergeLegacyRecordIntoResume(resume, legacyData, lang) {
  const next = normalizeResume(resume);
  const language = next.languages[lang];
  language.profile.name = String(legacyData?.profile?.name || language.profile.name);
  language.profile.location = String(legacyData?.profile?.location || language.profile.location);
  language.profile.linkedinLabel = String(legacyData?.profile?.linkedinLabel || language.profile.linkedinLabel);
  language.profile.githubLabel = String(legacyData?.profile?.githubLabel || language.profile.githubLabel);
  language.profile.portfolioLabel = String(legacyData?.profile?.portfolioLabel || language.profile.portfolioLabel);
  next.shared.photo = String(legacyData?.profile?.photo || next.shared.photo);
  next.shared.email = String(legacyData?.profile?.email || next.shared.email);
  next.shared.phone = String(legacyData?.profile?.phone || next.shared.phone);
  next.shared.phoneHref = String(legacyData?.profile?.phoneHref || next.shared.phoneHref);
  next.shared.linkedinHref = String(legacyData?.profile?.linkedinHref || next.shared.linkedinHref);
  next.shared.githubHref = String(legacyData?.profile?.githubHref || next.shared.githubHref);
  next.shared.portfolioHref = String(legacyData?.profile?.portfolioHref || next.shared.portfolioHref);
  language.summary = String(legacyData?.summary || language.summary);
  language.labels.summary = String(legacyData?.labels?.summary || language.labels.summary);
  language.labels.experience = String(legacyData?.labels?.professionalExperience || language.labels.experience);
  language.labels.internships = String(legacyData?.labels?.internships || language.labels.internships);
  language.labels.projects = String(legacyData?.labels?.projects || language.labels.projects);
  language.labels.education = String(legacyData?.labels?.education || language.labels.education);
  language.labels.certificates = String(legacyData?.labels?.certificates || language.labels.certificates);
  language.labels.skills = String(legacyData?.labels?.skills || language.labels.skills);
  language.labels.softSkills = String(legacyData?.labels?.softSkills || language.labels.softSkills);
  language.sections.experience = normalizeList(legacyData?.professionalExperience, normalizeTimelineItem);
  language.sections.internships = normalizeList(legacyData?.internships, normalizeTimelineItem);
  language.sections.projects = normalizeList(legacyData?.projects, normalizeProjectItem);
  language.sections.education = normalizeList(legacyData?.education, normalizeEducationItem);
  language.sections.certificates = normalizeList(legacyData?.certificates, normalizeCertificateItem);
  language.sections.skills = normalizeList(legacyData?.skills?.technical, normalizeSkillGroup);
  language.sections.softSkills = Array.isArray(legacyData?.skills?.soft)
    ? legacyData.skills.soft.map((item) => String(item || "")).filter(Boolean)
    : language.sections.softSkills;
  language.coverLetter = normalizeCoverLetter(legacyData?.coverLetter, language.profile.name);
  next.shared.stylePreset = legacyData?.ui?.stylePreset === "refined" ? "refined" : next.shared.stylePreset;
  return next;
}

export function toLegacyLanguageData(resume, lang) {
  const normalized = normalizeResume(resume);
  const source = normalized.languages[lang];
  return {
    meta: {
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      documentTitle: lang === "ar" ? "Resume Studio - السيرة الذاتية العربية" : "Resume Studio - English Resume"
    },
    ui: {
      stylePreset: normalized.shared.stylePreset
    },
    labels: {
      summary: source.labels.summary,
      professionalExperience: source.labels.experience,
      internships: source.labels.internships,
      projects: source.labels.projects,
      education: source.labels.education,
      certificates: source.labels.certificates,
      skills: source.labels.skills,
      softSkills: source.labels.softSkills
    },
    profile: {
      name: source.profile.name,
      photo: normalized.shared.photo,
      email: normalized.shared.email,
      phone: normalized.shared.phone,
      phoneHref: normalized.shared.phoneHref,
      location: source.profile.location,
      linkedinLabel: source.profile.linkedinLabel,
      linkedinHref: normalized.shared.linkedinHref,
      githubLabel: source.profile.githubLabel,
      githubHref: normalized.shared.githubHref,
      portfolioLabel: source.profile.portfolioLabel,
      portfolioHref: normalized.shared.portfolioHref
    },
    summary: source.summary,
    professionalExperience: clone(source.sections.experience),
    internships: clone(source.sections.internships),
    projects: clone(source.sections.projects),
    education: clone(source.sections.education),
    certificates: clone(source.sections.certificates),
    skills: {
      technical: clone(source.sections.skills),
      soft: clone(source.sections.softSkills)
    },
    coverLetter: clone(source.coverLetter)
  };
}

export function createBlankResumeForLanguage(lang) {
  const resume = createDemoResume();
  const target = resume.languages[lang];
  target.summary = "";
  target.sections.experience = [];
  target.sections.internships = [];
  target.sections.projects = [];
  target.sections.education = [];
  target.sections.certificates = [];
  target.sections.skills = [];
  target.sections.softSkills = [];
  target.coverLetter = createEmptyCoverLetter(target.profile.name);
  return resume;
}
