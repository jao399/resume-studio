import { createBilingualVersion, createBlankResumeForLanguage, mergeLegacyRecordIntoResume, normalizeResume, toLegacyLanguageData } from "./model.js";
import { createDemoResume } from "./defaults.js";

const APP_STORAGE_KEY = "resume-studio:bilingual-state";
const VERSION_STORAGE_KEY = "resume-studio:bilingual-versions";
const AI_STORAGE_KEY = "resume-studio:ai-settings";
const UI_STORAGE_KEY = "resume-studio:ui-preferences";
const LEGACY_VERSION_KEYS = {
  en: "resume-editor-versions:en",
  ar: "resume-editor-versions:ar"
};

export function loadAppState() {
  const fallbackResume = normalizeResume(createDemoResume());
  const fallbackVersions = [createBilingualVersion("Demo bilingual baseline", fallbackResume)];
  const storedResume = safeParse(APP_STORAGE_KEY);
  const storedVersions = safeParse(VERSION_STORAGE_KEY);
  const aiSettings = {
    provider: "openrouter-auto",
    model: "",
    apiKey: "",
    ...safeParse(AI_STORAGE_KEY)
  };
  const uiPreferences = {
    theme: "system",
    collapseSidebar: false,
    centerPreview: false,
    previewZoom: 100,
    ...safeParse(UI_STORAGE_KEY)
  };

  const migrated = !storedVersions ? migrateLegacyVersions() : null;
  const versions = normalizeVersionList(storedVersions?.versions || migrated || fallbackVersions);
  const selectedVersionId = storedVersions?.selectedVersionId || versions[0]?.id || "";
  const currentVersion = versions.find((item) => item.id === selectedVersionId) || versions[0];
  const resume = normalizeResume(storedResume?.resume || currentVersion?.resume || fallbackResume);

  return {
    resume,
    versions,
    selectedVersionId: currentVersion?.id || "",
    aiSettings,
    uiPreferences
  };
}

export function persistResume(resume) {
  window.localStorage.setItem(APP_STORAGE_KEY, JSON.stringify({ resume }));
}

export function persistVersions(versions, selectedVersionId) {
  window.localStorage.setItem(VERSION_STORAGE_KEY, JSON.stringify({
    versions,
    selectedVersionId
  }));
}

export function persistAiSettings(settings) {
  window.localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(settings));
}

export function persistUiPreferences(settings) {
  window.localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(settings));
}

export function exportSharePayload(resume) {
  return encodeBase64UrlUtf8(exportBilingualData(resume));
}

export function importSharePayload(value) {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(decodeBase64UrlUtf8(value));
    if (parsed?.type === "resume-studio-bilingual-resume" && parsed.resume) {
      return normalizeResume(parsed.resume);
    }
    return null;
  } catch (_error) {
    return null;
  }
}

export function exportBilingualData(resume) {
  return JSON.stringify({
    type: "resume-studio-bilingual-resume",
    exportedAt: new Date().toISOString(),
    resume: normalizeResume(resume)
  }, null, 2);
}

export function exportVersionBundle(versions, selectedVersionId) {
  return JSON.stringify({
    type: "resume-studio-bilingual-versions",
    exportedAt: new Date().toISOString(),
    selectedVersionId,
    versions: normalizeVersionList(versions)
  }, null, 2);
}

export function importAnyJson(rawText, currentResume) {
  const parsed = JSON.parse(rawText);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid data file.");
  }

  if (parsed.type === "resume-studio-bilingual-resume" && parsed.resume) {
    return { kind: "resume", resume: normalizeResume(parsed.resume) };
  }

  if (parsed.type === "resume-studio-bilingual-versions" && Array.isArray(parsed.versions)) {
    return {
      kind: "versions",
      versions: normalizeVersionList(parsed.versions),
      selectedVersionId: String(parsed.selectedVersionId || "")
    };
  }

  if (Array.isArray(parsed.versions) || Array.isArray(parsed.presets)) {
    const lang = detectLegacyBundleLanguage(parsed);
    const migrated = migrateLegacyBundle(parsed, lang);
    return { kind: "versions", versions: migrated, selectedVersionId: migrated[0]?.id || "" };
  }

  if (parsed.resume || (parsed.languages && parsed.shared)) {
    return { kind: "resume", resume: normalizeResume(parsed.resume || parsed) };
  }

  if (parsed.meta?.lang) {
    return {
      kind: "resume",
      resume: mergeLegacyRecordIntoResume(currentResume || createBlankResumeForLanguage(parsed.meta.lang), parsed, parsed.meta.lang === "ar" ? "ar" : "en")
    };
  }

  throw new Error("The selected file is not valid for this app.");
}

export function createVersionFromCurrent(name, resume) {
  return createBilingualVersion(name, resume);
}

export function convertResumeToLegacyExport(resume, lang) {
  return JSON.stringify(toLegacyLanguageData(resume, lang), null, 2);
}

function safeParse(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_error) {
    return null;
  }
}

function encodeBase64UrlUtf8(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64UrlUtf8(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function normalizeVersionList(list) {
  return (Array.isArray(list) ? list : [])
    .filter((item) => item && typeof item === "object" && item.resume)
    .map((item, index) => ({
      id: String(item.id || `version-${Date.now()}-${index}`),
      name: String(item.name || `Version ${index + 1}`),
      createdAt: Number(item.createdAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Date.now(),
      resume: normalizeResume(item.resume)
    }));
}

function migrateLegacyVersions() {
  const english = safeParse(LEGACY_VERSION_KEYS.en);
  const arabic = safeParse(LEGACY_VERSION_KEYS.ar);
  const enVersions = Array.isArray(english?.versions) ? english.versions : Array.isArray(english) ? english : [];
  const arVersions = Array.isArray(arabic?.versions) ? arabic.versions : Array.isArray(arabic) ? arabic : [];

  if (!enVersions.length && !arVersions.length) {
    return null;
  }

  const arByDerived = new Map();
  arVersions.forEach((item) => {
    const key = String(item?.derivedFromVersionId || "");
    if (key) {
      arByDerived.set(key, item);
    }
  });

  const result = [];

  enVersions.forEach((item, index) => {
    let resume = createDemoResume();
    resume = mergeLegacyRecordIntoResume(resume, item.data, "en");
    const linked = arByDerived.get(String(item.id || "")) || null;
    if (linked?.data) {
      resume = mergeLegacyRecordIntoResume(resume, linked.data, "ar");
    }
    if (item.coverLetter) {
      resume.languages.en.coverLetter = item.coverLetter;
    }
    if (linked?.coverLetter) {
      resume.languages.ar.coverLetter = linked.coverLetter;
    }
    resume.shared.targeting = {
      jobTitle: String(item.targetRole || ""),
      company: String(item.company || ""),
      jobDescription: String(item.jobDescription || ""),
      focusKeywords: String(item.focusKeywords || ""),
      notes: String(item.notes || "")
    };
    resume.shared.stylePreset = item.data?.ui?.stylePreset === "refined" ? "refined" : "default";
    result.push({
      id: `migrated-${String(item.id || index)}`,
      name: String(item.name || `Migrated ${index + 1}`),
      createdAt: Number(item.updatedAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Date.now(),
      resume: normalizeResume(resume)
    });
  });

  arVersions
    .filter((item) => !String(item?.derivedFromVersionId || ""))
    .forEach((item, index) => {
      let resume = createDemoResume();
      resume = mergeLegacyRecordIntoResume(resume, item.data, "ar");
      if (item.coverLetter) {
        resume.languages.ar.coverLetter = item.coverLetter;
      }
      result.push({
        id: `migrated-ar-${String(item.id || index)}`,
        name: `${String(item.name || `Arabic ${index + 1}`)} [AR]`,
        createdAt: Number(item.updatedAt) || Date.now(),
        updatedAt: Number(item.updatedAt) || Date.now(),
        resume: normalizeResume(resume)
      });
    });

  return normalizeVersionList(result);
}

function detectLegacyBundleLanguage(bundle) {
  const sample = Array.isArray(bundle?.versions) ? bundle.versions[0] : Array.isArray(bundle?.presets) ? bundle.presets[0] : null;
  const lang = sample?.data?.meta?.lang || sample?.sourceLanguage || bundle?.lang || "en";
  return lang === "ar" ? "ar" : "en";
}

function migrateLegacyBundle(bundle, lang) {
  const list = Array.isArray(bundle?.versions)
    ? bundle.versions
    : Array.isArray(bundle?.presets)
      ? bundle.presets
      : [];

  return normalizeVersionList(list.map((item, index) => {
    let resume = createDemoResume();
    resume = mergeLegacyRecordIntoResume(resume, item.data, lang);
    if (item.coverLetter) {
      resume.languages[lang].coverLetter = item.coverLetter;
    }
    resume.shared.targeting = {
      jobTitle: String(item.targetRole || ""),
      company: String(item.company || ""),
      jobDescription: String(item.jobDescription || ""),
      focusKeywords: String(item.focusKeywords || ""),
      notes: String(item.notes || "")
    };
    return {
      id: `imported-${String(item.id || index)}`,
      name: String(item.name || `Imported ${index + 1}`),
      createdAt: Number(item.updatedAt) || Date.now(),
      updatedAt: Number(item.updatedAt) || Date.now(),
      resume
    };
  }));
}
