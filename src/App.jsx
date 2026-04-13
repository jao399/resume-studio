import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AI_PROVIDER_OPTIONS,
  COPY,
  DEFAULT_STYLE_TOKENS,
  REFINED_STYLE_TOKENS,
  SECTION_KEYS,
  createDemoResume
} from "./lib/defaults.js";
import {
  clone,
  createBilingualVersion,
  getStyleTokens,
  normalizeCoverLetter,
  normalizeResume
} from "./lib/model.js";
import {
  convertResumeToLegacyExport,
  createVersionFromCurrent,
  exportBilingualData,
  exportSharePayload,
  exportVersionBundle,
  importAnyJson,
  importSharePayload,
  loadAppState,
  persistAiSettings,
  persistResume,
  persistUiPreferences,
  persistVersions
} from "./lib/storage.js";
import { analyzeAts, analyzeHrBaseline, analyzeQuality, buildResumeText } from "./lib/analysis.js";
import { generateCoverLetter, hasAiKey, runHrReview, translateSections } from "./lib/ai.js";

const WORKSPACE_AREAS = ["content", "layout", "style", "analysis", "aiTools", "sync", "versions"];
const ANALYSIS_TABS = ["quality", "ats", "hr"];
const AI_TOOL_TABS = ["commands", "coverLetter", "settings"];
const TOP_LEVEL_NAV = [
  {
    labelKey: "app",
    items: [
      { key: "dashboard", icon: "spark" },
      { key: "resumes", icon: "resume" },
      { key: "jobSearch", icon: "briefcase" }
    ]
  },
  {
    labelKey: "settings",
    items: [
      { key: "profile", icon: "profile" },
      { key: "preferences", icon: "settings" },
      { key: "authentication", icon: "shield" },
      { key: "apiKeys", icon: "key" },
      { key: "jobSearchApi", icon: "link" },
      { key: "dangerZone", icon: "warning" }
    ]
  }
];

const SYNC_SECTION_KEYS = [...SECTION_KEYS, "coverLetter"];
const MAX_HISTORY_ENTRIES = 40;
const SHARE_HASH_PREFIX = "#resume=";

export default function App({ routeConfig }) {
  const initial = useMemo(() => loadAppState(), []);
  const routeSearch = useMemo(() => new URLSearchParams(window.location.search), []);
  const requestedArea = routeSearch.get("area") || (routeConfig.mode === "cover-letter" ? "resumes" : "dashboard");
  const initialArea = requestedArea === "artificialIntelligence" ? "apiKeys" : requestedArea;
  const initialWorkspaceArea = routeSearch.get("workspace") || (routeConfig.mode === "cover-letter" ? "aiTools" : "content");
  const [resume, setResume] = useState(initial.resume);
  const [versions, setVersions] = useState(initial.versions);
  const [selectedVersionId, setSelectedVersionId] = useState(initial.selectedVersionId);
  const [aiSettings, setAiSettings] = useState(initial.aiSettings);
  const [uiPreferences, setUiPreferences] = useState({
    ...initial.uiPreferences,
    centerPreview: routeSearch.get("center") === "1" ? true : initial.uiPreferences.centerPreview
  });
  const [uiLanguage, setUiLanguage] = useState(routeConfig.uiLanguage || "en");
  const [contentLanguage, setContentLanguage] = useState(routeConfig.contentLanguage || "en");
  const [previewLanguage, setPreviewLanguage] = useState(routeConfig.previewLanguage || "en");
  const [editMode, setEditMode] = useState("single");
  const [activeArea, setActiveArea] = useState(initialArea);
  const [workspaceArea, setWorkspaceArea] = useState(initialWorkspaceArea);
  const [activeSection, setActiveSection] = useState(routeConfig.mode === "cover-letter" ? "coverLetter" : "summary");
  const [analysisTab, setAnalysisTab] = useState("quality");
  const [aiToolsTab, setAiToolsTab] = useState(routeConfig.mode === "cover-letter" ? "coverLetter" : "commands");
  const [syncSourceLanguage, setSyncSourceLanguage] = useState("en");
  const [syncTargetLanguage, setSyncTargetLanguage] = useState("ar");
  const [syncSections, setSyncSections] = useState(["summary", "skills"]);
  const [syncPreview, setSyncPreview] = useState(null);
  const [syncStatus, setSyncStatus] = useState("");
  const [commandsState, setCommandsState] = useState({
    command: "",
    content: "",
    sections: ["skills"],
    preview: null,
    note: ""
  });
  const [hrReview, setHrReview] = useState(null);
  const [hrLoading, setHrLoading] = useState(false);
  const [coverLetterStatus, setCoverLetterStatus] = useState("");
  const [uiMessage, setUiMessage] = useState("");
  const [pendingEditorFocus, setPendingEditorFocus] = useState(null);
  const importRef = useRef(null);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const resumeShellRef = useRef(null);
  const resizeStateRef = useRef({ active: false });
  const previewStageRef = useRef(null);

  const t = COPY[uiLanguage];
  const styleTokens = getStyleTokens(resume, previewLanguage, DEFAULT_STYLE_TOKENS, REFINED_STYLE_TOKENS);
  const currentAreaLabel = activeArea === "resumes" ? t.topAreas.resumes : (t.topAreas[activeArea] || t.appTitle);
  const quality = useMemo(() => analyzeQuality(resume, contentLanguage), [resume, contentLanguage]);
  const ats = useMemo(
    () => analyzeAts(resume, contentLanguage, resume.shared.targeting.jobTitle, resume.shared.targeting.jobDescription),
    [resume, contentLanguage]
  );
  const hrBaseline = useMemo(
    () => analyzeHrBaseline(resume, contentLanguage, resume.shared.targeting.jobTitle, resume.shared.targeting.jobDescription),
    [resume, contentLanguage]
  );

  useEffect(() => {
    persistResume(resume);
  }, [resume]);

  useEffect(() => {
    persistVersions(versions, selectedVersionId);
  }, [versions, selectedVersionId]);

  useEffect(() => {
    persistUiPreferences(uiPreferences);
  }, [uiPreferences]);

  useEffect(() => {
    document.documentElement.lang = uiLanguage;
    document.documentElement.dir = uiLanguage === "ar" ? "rtl" : "ltr";
    document.body.dir = uiLanguage === "ar" ? "rtl" : "ltr";
    document.title = `${t.appTitle} - ${currentAreaLabel}`;
  }, [uiLanguage, currentAreaLabel, t]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const resolvedTheme = uiPreferences.theme === "system"
      ? (media.matches ? "dark" : "light")
      : uiPreferences.theme;
    document.documentElement.dataset.theme = resolvedTheme;
    document.body.dataset.theme = resolvedTheme;
    document.body.dataset.sidebar = uiPreferences.collapseSidebar ? "collapsed" : "expanded";
    document.body.dataset.previewMode = uiPreferences.centerPreview ? "center" : "normal";
    const listener = () => {
      if (uiPreferences.theme === "system") {
        const nextTheme = media.matches ? "dark" : "light";
        document.documentElement.dataset.theme = nextTheme;
        document.body.dataset.theme = nextTheme;
      }
    };
    media.addEventListener?.("change", listener);
    return () => media.removeEventListener?.("change", listener);
  }, [uiPreferences]);

  useEffect(() => {
    const sharedResume = readSharedResumeFromUrl();
    if (sharedResume) {
      replaceResume(sharedResume, { clearHistory: true });
      setActiveArea("resumes");
      setUiMessage(t.shareLoaded);
    }
  }, []);

  useEffect(() => {
    if (!uiMessage) {
      return undefined;
    }
    const timer = window.setTimeout(() => setUiMessage(""), 2600);
    return () => window.clearTimeout(timer);
  }, [uiMessage]);

  useEffect(() => {
    const canFocusEditorTarget =
      activeArea === "profile" ||
      (activeArea === "resumes" && workspaceArea === "content");

    if (!pendingEditorFocus || !canFocusEditorTarget) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const selector = pendingEditorFocus.itemIndex == null
        ? `[data-editor-section="${pendingEditorFocus.sectionKey}"]`
        : `[data-editor-section="${pendingEditorFocus.sectionKey}"][data-editor-index="${pendingEditorFocus.itemIndex}"]`;
      const target = document.querySelector(selector) || document.querySelector(`[data-editor-section="${pendingEditorFocus.sectionKey}"]`);
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("is-editor-focus-target");
        const focusable = target.querySelector("textarea, input, select, button:not([disabled])");
        if (focusable instanceof HTMLElement) {
          focusable.focus({ preventScroll: true });
        }
        window.setTimeout(() => target.classList.remove("is-editor-focus-target"), 1800);
      }
      setPendingEditorFocus(null);
    }, 80);

    return () => window.clearTimeout(timer);
  }, [pendingEditorFocus, activeArea, workspaceArea]);

  useEffect(() => {
    function handlePointerMove(event) {
      if (!resizeStateRef.current.active || !resumeShellRef.current) {
        return;
      }
      const bounds = resumeShellRef.current.getBoundingClientRect();
      const nextWidth = Math.min(560, Math.max(320, bounds.right - event.clientX));
      setUiPreferences((current) => (
        current.rightPanelWidth === nextWidth ? current : { ...current, rightPanelWidth: nextWidth }
      ));
    }

    function handlePointerUp() {
      if (!resizeStateRef.current.active) {
        return;
      }
      resizeStateRef.current = { active: false };
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  useEffect(() => {
    const previewStage = previewStageRef.current;
    if (!previewStage) {
      return undefined;
    }

    function handleWheel(event) {
      if (!event.ctrlKey) {
        return;
      }
      event.preventDefault();
      const step = event.deltaY > 0 ? -5 : 5;
      setUiPreferences((current) => ({
        ...current,
        previewZoom: Math.min(170, Math.max(80, current.previewZoom + step))
      }));
    }

    previewStage.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      previewStage.removeEventListener("wheel", handleWheel);
    };
  }, [activeArea]);

  function replaceResume(nextResume, options = {}) {
    if (options.clearHistory) {
      undoStackRef.current = [];
      redoStackRef.current = [];
    }
    setResume(normalizeResume(nextResume));
  }

  function patchResume(updater) {
    setResume((current) => {
      const base = normalizeResume(current);
      const next = normalizeResume(typeof updater === "function" ? updater(clone(base)) : updater);
      if (JSON.stringify(base) !== JSON.stringify(next)) {
        undoStackRef.current = [...undoStackRef.current.slice(-(MAX_HISTORY_ENTRIES - 1)), clone(base)];
        redoStackRef.current = [];
      }
      return next;
    });
  }

  function updateSharedField(key, value) {
    patchResume((draft) => {
      draft.shared[key] = value;
      return draft;
    });
  }

  function updateTargetingField(key, value) {
    patchResume((draft) => {
      draft.shared.targeting[key] = value;
      return draft;
    });
  }

  function updateLanguageField(lang, path, value) {
    patchResume((draft) => {
      let cursor = draft.languages[lang];
      for (let index = 0; index < path.length - 1; index += 1) {
        cursor = cursor[path[index]];
      }
      cursor[path[path.length - 1]] = value;
      return draft;
    });
  }

  function updateListItem(lang, sectionKey, index, field, value) {
    patchResume((draft) => {
      draft.languages[lang].sections[sectionKey][index][field] = value;
      return draft;
    });
  }

  function updateBullet(lang, sectionKey, itemIndex, bulletIndex, value) {
    patchResume((draft) => {
      draft.languages[lang].sections[sectionKey][itemIndex].bullets[bulletIndex] = value;
      return draft;
    });
  }

  function addSectionItem(lang, sectionKey) {
    const templates = {
      experience: { date: "", location: "", organization: "", role: "", bullets: [""] },
      internships: { date: "", location: "", organization: "", role: "", bullets: [""] },
      projects: { date: "", title: "", linkLabel: "", linkHref: "", bullets: [""] },
      education: { date: "", location: "", degree: "", institution: "" },
      certificates: { title: "", description: "" },
      skills: { label: "", items: "" },
      softSkills: ""
    };
    patchResume((draft) => {
      draft.languages[lang].sections[sectionKey].push(clone(templates[sectionKey]));
      return draft;
    });
  }

  function removeSectionItem(lang, sectionKey, index) {
    patchResume((draft) => {
      draft.languages[lang].sections[sectionKey].splice(index, 1);
      return draft;
    });
  }

  function moveSectionOrder(sectionKey, direction) {
    patchResume((draft) => {
      const order = draft.shared.sectionOrder;
      const index = order.indexOf(sectionKey);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= order.length) {
        return draft;
      }
      [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
      return draft;
    });
  }

  function moveSectionItem(lang, sectionKey, index, direction) {
    patchResume((draft) => {
      const list = draft.languages[lang].sections[sectionKey];
      if (!Array.isArray(list)) {
        return draft;
      }
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= list.length) {
        return draft;
      }
      [list[index], list[nextIndex]] = [list[nextIndex], list[index]];
      return draft;
    });
  }

  function jumpToEditorTarget(sectionKey, itemIndex = null, lang = previewLanguage) {
    if (sectionKey === "profile") {
      setActiveArea("profile");
      setUiPreferences((current) => ({ ...current, centerPreview: false, rightPanelCollapsed: false }));
      setPendingEditorFocus({ sectionKey: "profile", itemIndex: null });
      return;
    }

    setActiveArea("resumes");
    setWorkspaceArea("content");
    setContentLanguage(lang);
    setEditMode("single");
    setActiveSection(sectionKey);
    setUiPreferences((current) => ({ ...current, centerPreview: false, rightPanelCollapsed: false }));
    setPendingEditorFocus({ sectionKey, itemIndex });
  }

  function currentVersion() {
    return versions.find((item) => item.id === selectedVersionId) || null;
  }

  function saveNewVersion() {
    const name = window.prompt(t.newVersionName, currentVersion()?.name || t.demoVersionName);
    if (name === null) {
      return;
    }
    const version = createVersionFromCurrent(String(name || "").trim() || t.newVersionName, resume);
    setVersions((current) => [version, ...current]);
    setSelectedVersionId(version.id);
  }

  function updateSelectedVersion() {
    const selected = currentVersion();
    if (!selected) {
      return;
    }
    setVersions((current) => current.map((item) => (
      item.id === selected.id
        ? { ...item, updatedAt: Date.now(), resume: normalizeResume(resume) }
        : item
    )));
  }

  function renameSelectedVersion() {
    const selected = currentVersion();
    if (!selected) {
      return;
    }
    const name = window.prompt(t.newVersionName, selected.name);
    if (name === null) {
      return;
    }
    setVersions((current) => current.map((item) => (item.id === selected.id ? { ...item, name } : item)));
  }

  function deleteSelectedVersion() {
    if (!window.confirm(t.deleteConfirm)) {
      return;
    }
    setVersions((current) => {
      const next = current.filter((item) => item.id !== selectedVersionId);
      const fallback = next[0] || createBilingualVersion(t.demoVersionName, createDemoResume());
      setSelectedVersionId(fallback.id);
      replaceResume(fallback.resume, { clearHistory: true });
      return next.length ? next : [fallback];
    });
  }

  function loadSelectedVersion(versionId) {
    setSelectedVersionId(versionId);
    const version = versions.find((item) => item.id === versionId);
    if (version) {
      replaceResume(version.resume, { clearHistory: true });
    }
  }

  function handleUndo() {
    const previous = undoStackRef.current.pop();
    if (!previous) {
      setUiMessage(t.nothingToUndo);
      return;
    }
    redoStackRef.current = [...redoStackRef.current, clone(resume)];
    setResume(normalizeResume(previous));
  }

  function handleRedo() {
    const next = redoStackRef.current.pop();
    if (!next) {
      setUiMessage(t.nothingToRedo);
      return;
    }
    undoStackRef.current = [...undoStackRef.current, clone(resume)];
    setResume(normalizeResume(next));
  }

  function updatePreviewZoom(nextZoom) {
    setUiPreferences((current) => ({
      ...current,
      previewZoom: Math.min(170, Math.max(80, nextZoom))
    }));
  }

  function startRightPanelResize(event) {
    if (uiPreferences.centerPreview || uiPreferences.rightPanelCollapsed) {
      return;
    }
    resizeStateRef.current = { active: true };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    event.preventDefault();
  }

  function handleExportData() {
    downloadFile("resume-studio-bilingual.json", exportBilingualData(resume), "application/json");
  }

  function handleExportVersions() {
    downloadFile("resume-studio-version-bundle.json", exportVersionBundle(versions, selectedVersionId), "application/json");
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = importAnyJson(text, resume);
      if (parsed.kind === "resume") {
        replaceResume(parsed.resume, { clearHistory: true });
      } else if (parsed.kind === "versions") {
        setVersions(parsed.versions);
        setSelectedVersionId(parsed.selectedVersionId || parsed.versions[0]?.id || "");
        if (parsed.selectedVersionId) {
          const selected = parsed.versions.find((item) => item.id === parsed.selectedVersionId);
          if (selected) {
            replaceResume(selected.resume, { clearHistory: true });
          }
        }
      }
    } catch (error) {
      window.alert(error.message || t.importInvalid);
    } finally {
      event.target.value = "";
    }
  }

  function handleLegacyExport(lang) {
    const fileName = lang === "ar" ? "resume-studio-ar-legacy.json" : "resume-studio-en-legacy.json";
    downloadFile(fileName, convertResumeToLegacyExport(resume, lang), "application/json");
  }

  function handleImportClick() {
    importRef.current?.click();
  }

  async function handleCopyShareUrl() {
    try {
      const url = new URL(window.location.href);
      url.hash = `resume=${exportSharePayload(resume)}`;
      await navigator.clipboard.writeText(url.toString());
      setUiMessage(t.shareCopied);
    } catch (_error) {
      setUiMessage(t.shareFailed);
    }
  }

  async function runSyncPreview() {
    const sourceLanguage = syncSourceLanguage;
    const targetLanguage = syncTargetLanguage;
    const selectedKeys = syncSections.length ? syncSections : ["summary"];
    const nextPreview = { sections: {}, notes: [] };
    const source = resume.languages[sourceLanguage];
    const target = resume.languages[targetLanguage];

    selectedKeys.forEach((key) => {
      if (key === "skills") {
        nextPreview.sections.skills = source.sections.skills.map((group) => ({
          label: localizeSkillLabel(group.label, targetLanguage),
          items: group.items
        }));
        return;
      }
      if (key === "softSkills") {
        nextPreview.sections.softSkills = [...source.sections.softSkills];
        return;
      }
      if (key === "certificates") {
        nextPreview.sections.certificates = source.sections.certificates.map((item) => ({
          title: item.title,
          description: item.description
        }));
        return;
      }
      if (key === "education") {
        nextPreview.sections.education = clone(source.sections.education);
      }
    });

    const aiKeys = selectedKeys.filter((key) => ["summary", "experience", "internships", "projects", "coverLetter"].includes(key));
    if (aiKeys.length) {
      if (!hasAiKey(aiSettings)) {
        nextPreview.notes.push(t.sync.requiresAi);
      } else {
        setSyncStatus("Generating AI sync preview...");
        try {
          const translated = await translateSections(aiSettings, {
            sourceLanguage,
            targetLanguage,
            sectionKeys: aiKeys,
            sourceContent: buildSyncSourcePayload(source, aiKeys),
            targetContent: buildSyncSourcePayload(target, aiKeys)
          });
          Object.assign(nextPreview.sections, translated.sections || {});
          (translated.notes || []).forEach((note) => nextPreview.notes.push(note));
        } catch (error) {
          nextPreview.notes.push(error.message || "AI sync failed.");
        }
      }
    }

    setSyncPreview(nextPreview);
    setSyncStatus(t.sync.generated);
  }

  function applySyncPreview() {
    if (!syncPreview?.sections) {
      return;
    }
    patchResume((draft) => {
      Object.entries(syncPreview.sections).forEach(([key, value]) => {
        if (key === "coverLetter") {
          draft.languages[syncTargetLanguage].coverLetter = normalizeCoverLetter(value, draft.languages[syncTargetLanguage].profile.name);
        } else if (key === "summary") {
          draft.languages[syncTargetLanguage].summary = String(value || "");
        } else if (key in draft.languages[syncTargetLanguage].sections) {
          draft.languages[syncTargetLanguage].sections[key] = clone(value);
        }
      });
      return draft;
    });
  }

  function clearSyncPreview() {
    setSyncPreview(null);
    setSyncStatus("");
  }

  function generateCommandPreview() {
    const preview = buildCommandPreview(commandsState.command, commandsState.content, commandsState.sections, resume, contentLanguage);
    setCommandsState((current) => ({ ...current, preview: preview.updates, note: preview.note }));
  }

  function applyCommandPreview() {
    if (!commandsState.preview) {
      return;
    }
    patchResume((draft) => {
      Object.entries(commandsState.preview).forEach(([key, value]) => {
        if (key === "summary") {
          draft.languages[contentLanguage].summary = String(value || "");
        } else if (key === "coverLetter") {
          draft.languages[contentLanguage].coverLetter = normalizeCoverLetter(value, draft.languages[contentLanguage].profile.name);
        } else if (key in draft.languages[contentLanguage].sections) {
          draft.languages[contentLanguage].sections[key] = clone(value);
        }
      });
      return draft;
    });
  }

  async function handleRunAiHrReview() {
    if (!hasAiKey(aiSettings)) {
      setHrReview({ error: t.ai.missing });
      return;
    }
    setHrLoading(true);
    try {
      const review = await runHrReview(aiSettings, {
        cvText: buildResumeText(resume, contentLanguage),
        jobTitle: resume.shared.targeting.jobTitle,
        jobDescription: resume.shared.targeting.jobDescription
      });
      setHrReview(review);
    } catch (error) {
      setHrReview({ error: error.message || "AI review failed." });
    } finally {
      setHrLoading(false);
    }
  }

  async function handleGenerateCoverLetter() {
    if (!hasAiKey(aiSettings)) {
      setCoverLetterStatus(t.ai.missing);
      return;
    }
    setCoverLetterStatus("Generating cover letter...");
    try {
      const draft = await generateCoverLetter(aiSettings, {
        cvText: buildResumeText(resume, contentLanguage),
        jobTitle: resume.shared.targeting.jobTitle,
        jobDescription: resume.shared.targeting.jobDescription,
        draft: resume.languages[contentLanguage].coverLetter
      });
      patchResume((current) => {
        current.languages[contentLanguage].coverLetter = normalizeCoverLetter(draft, current.languages[contentLanguage].profile.name);
        return current;
      });
      setCoverLetterStatus("Cover letter updated.");
    } catch (error) {
      setCoverLetterStatus(error.message || "Cover letter generation failed.");
    }
  }

  function saveAiSettings() {
    persistAiSettings(aiSettings);
  }

  function toggleSyncSection(key) {
    setSyncSections((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  const showPreview = activeArea === "resumes";
  const showRightTasks = showPreview && !uiPreferences.centerPreview && !uiPreferences.rightPanelCollapsed;
  const shouldHideEditorPanel = showPreview && !showRightTasks;
  const resumeShellStyle = showPreview
    ? { "--right-panel-width": `${Math.min(560, Math.max(320, uiPreferences.rightPanelWidth || 430))}px` }
    : undefined;
  const headerTitle = currentAreaLabel;
  const headerDescription = getAreaDescription(t, activeArea);

  return (
    <div className={`studio-app ${uiLanguage === "ar" ? "is-rtl-ui" : ""}`}>
      <aside className="studio-sidebar">
        <button
          type="button"
          className="sidebar-collapse"
          aria-label={uiPreferences.collapseSidebar ? "Expand sidebar" : "Collapse sidebar"}
          title={uiPreferences.collapseSidebar ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setUiPreferences((current) => ({ ...current, collapseSidebar: !current.collapseSidebar }))}
        >
          <GlyphIcon name={uiPreferences.collapseSidebar ? "chevronRight" : "chevronLeft"} />
        </button>
        <div className="brand-block">
          <p className="brand-kicker">{t.appTitle}</p>
          <h1>{headerTitle}</h1>
          <p>{t.tagline}</p>
        </div>
        {TOP_LEVEL_NAV.map((group) => (
          <div key={group.labelKey} className="nav-group">
            <p className="nav-group__label">{t.navGroups[group.labelKey]}</p>
            <nav className="rail-nav" aria-label={t.navGroups[group.labelKey]}>
              {group.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`rail-nav__button ${activeArea === item.key ? "is-active" : ""}`}
                  onClick={() => setActiveArea(item.key)}
                >
                  <span className="rail-nav__button-icon"><GlyphIcon name={item.icon} /></span>
                  <span className="rail-nav__button-text">{t.topAreas[item.key]}</span>
                </button>
              ))}
            </nav>
          </div>
        ))}
        <div className="sidebar-meta">
          <SmallSelect
            label={t.uiLanguage}
            value={uiLanguage}
            onChange={setUiLanguage}
            options={[{ value: "en", label: "English" }, { value: "ar", label: "العربية" }]}
          />
          <SmallSelect
            label={t.contentLanguage}
            value={contentLanguage}
            onChange={setContentLanguage}
            options={[{ value: "en", label: t.languages.en }, { value: "ar", label: t.languages.ar }]}
          />
          <SmallSelect
            label={t.previewLanguage}
            value={previewLanguage}
            onChange={setPreviewLanguage}
            options={[{ value: "en", label: t.languages.en }, { value: "ar", label: t.languages.ar }]}
          />
        </div>
        <footer className="sidebar-footer">
          <p>{t.footer.licensed}</p>
          <p>{t.footer.projectBy}</p>
        </footer>
      </aside>

      <main className="studio-main">
        <header className="topbar">
          <div className="topbar__headline">
            <p className="brand-kicker">{showPreview ? t.topAreas.resumes : t.navGroups.app}</p>
            <h1>{headerTitle}</h1>
            <p>{headerDescription}</p>
          </div>
          <div className="topbar__group topbar__group--utility">
            <SmallSelect
              label={t.theme}
              value={uiPreferences.theme}
              onChange={(value) => setUiPreferences((current) => ({ ...current, theme: value }))}
              options={[
                { value: "system", label: t.themeOptions.system },
                { value: "light", label: t.themeOptions.light },
                { value: "dark", label: t.themeOptions.dark }
              ]}
            />
            <div className="topbar__inline-tools">
              <button type="button" className="chip" onClick={handleImportClick}>{t.importData}</button>
              <button type="button" className="chip" onClick={handleExportVersions}>{t.exportVersions}</button>
            </div>
          </div>
          <input ref={importRef} hidden type="file" accept=".json,application/json" onChange={handleImportFile} />
        </header>

        {uiMessage ? <div className="status-notice"><p>{uiMessage}</p></div> : null}

        <div
          ref={resumeShellRef}
          className={`workspace-shell ${showPreview ? "workspace-shell--resumes" : "is-single-column"} ${showRightTasks ? "workspace-shell--tasks-open" : ""}`}
          style={resumeShellStyle}
        >
          {showPreview ? <section className="preview-panel preview-panel--resumes">
            <div className="preview-panel__header">
              <div>
                <h2>{t.previewTitle}</h2>
                <p>{previewLanguage === "ar" ? "RTL preview" : "LTR preview"}</p>
              </div>
              <div className="preview-panel__header-actions preview-dock">
                <ActionDockButton icon="download" label={t.exportJson} onClick={handleExportData} />
                <ActionDockButton icon="pdf" label={t.printPdf} onClick={() => window.print()} />
                <ActionDockButton icon="link" label={t.copyUrl} onClick={handleCopyShareUrl} />
                <ActionDockButton icon="undo" label={t.undo} onClick={handleUndo} />
                <ActionDockButton icon="redo" label={t.redo} onClick={handleRedo} />
                <ActionDockButton icon="center" label={t.centerView} isActive={uiPreferences.centerPreview} onClick={() => setUiPreferences((current) => ({ ...current, centerPreview: !current.centerPreview }))} />
                <ActionDockButton icon="zoomOut" label={t.zoom} onClick={() => updatePreviewZoom(uiPreferences.previewZoom - 10)} />
                <button type="button" className="action-dock__button action-dock__button--static" onClick={() => updatePreviewZoom(110)}>{uiPreferences.previewZoom}%</button>
                <ActionDockButton icon="zoomIn" label={t.zoom} onClick={() => updatePreviewZoom(uiPreferences.previewZoom + 10)} />
                <button type="button" className={`topbar__button topbar__button--secondary ${previewLanguage === "en" ? "is-active-toggle" : ""}`} onClick={() => setPreviewLanguage("en")}>{t.languages.en}</button>
                <button type="button" className={`topbar__button topbar__button--secondary ${previewLanguage === "ar" ? "is-active-toggle" : ""}`} onClick={() => setPreviewLanguage("ar")}>{t.languages.ar}</button>
              </div>
            </div>
            <div ref={previewStageRef} className="preview-stage">
              <PreviewSheet
                resume={resume}
                language={previewLanguage}
                mode={routeConfig.mode}
                styleTokens={styleTokens}
                zoom={uiPreferences.previewZoom}
                onNavigate={jumpToEditorTarget}
                onMoveSection={moveSectionOrder}
                onMoveItem={moveSectionItem}
                activeContentLanguage={contentLanguage}
              />
            </div>
          </section> : null}

          {showRightTasks ? (
            <button
              type="button"
              className="panel-resize-handle"
              aria-label="Resize tasks panel"
              title="Resize tasks panel"
              onPointerDown={startRightPanelResize}
            >
              <span />
            </button>
          ) : null}

          {showPreview && !uiPreferences.centerPreview && uiPreferences.rightPanelCollapsed ? (
            <button
              type="button"
              className="right-panel-expand"
              aria-label={t.viewOptions.expandTasks}
              title={t.viewOptions.expandTasks}
              onClick={() => setUiPreferences((current) => ({ ...current, rightPanelCollapsed: false }))}
            >
              <GlyphIcon name="panelExpand" />
            </button>
          ) : null}

          <section className={`editor-panel ${showPreview ? "editor-panel--resumes" : ""} ${shouldHideEditorPanel ? "editor-panel--hidden" : ""}`}>
            {showPreview ? (
              <div className="editor-panel__topbar">
                <strong>{t.editorArea}</strong>
                {!uiPreferences.centerPreview ? (
                  <button
                    type="button"
                    className="panel-edge-toggle panel-edge-toggle--inline"
                    aria-label={t.viewOptions.collapseTasks}
                    title={t.viewOptions.collapseTasks}
                    onClick={() => setUiPreferences((current) => ({ ...current, rightPanelCollapsed: true }))}
                  >
                    <GlyphIcon name="panelCollapse" />
                  </button>
                ) : null}
              </div>
            ) : null}
            {activeArea === "dashboard" && (
              <DashboardArea
                t={t}
                versions={versions}
                selectedVersionId={selectedVersionId}
                setActiveArea={setActiveArea}
              />
            )}
            {activeArea === "resumes" && (
              <ResumeWorkspaceShell t={t} workspaceArea={workspaceArea} setWorkspaceArea={setWorkspaceArea} />
            )}
            {activeArea === "resumes" && workspaceArea === "content" && (
              <ContentArea
                t={t}
                resume={resume}
                contentLanguage={contentLanguage}
                editMode={editMode}
                setEditMode={setEditMode}
                activeSection={activeSection}
                setActiveSection={setActiveSection}
                updateSharedField={updateSharedField}
                updateTargetingField={updateTargetingField}
                updateLanguageField={updateLanguageField}
                updateListItem={updateListItem}
                updateBullet={updateBullet}
                addSectionItem={addSectionItem}
                removeSectionItem={removeSectionItem}
              />
            )}
            {activeArea === "resumes" && workspaceArea === "layout" && (
              <LayoutArea
                t={t}
                resume={resume}
                moveSectionOrder={moveSectionOrder}
                previewLanguage={previewLanguage}
                setPreviewLanguage={setPreviewLanguage}
              />
            )}
            {activeArea === "resumes" && workspaceArea === "style" && (
              <StyleArea
                t={t}
                resume={resume}
                setStylePreset={(value) => updateSharedField("stylePreset", value)}
              />
            )}
            {activeArea === "resumes" && workspaceArea === "analysis" && (
              <AnalysisArea
                t={t}
                tab={analysisTab}
                setTab={setAnalysisTab}
                quality={quality}
                ats={ats}
                hrBaseline={hrBaseline}
                hrReview={hrReview}
                hrLoading={hrLoading}
                runAiReview={handleRunAiHrReview}
                targeting={resume.shared.targeting}
              />
            )}
            {activeArea === "resumes" && workspaceArea === "aiTools" && (
              <AiToolsArea
                t={t}
                tab={aiToolsTab}
                setTab={setAiToolsTab}
                commandsState={commandsState}
                setCommandsState={setCommandsState}
                generateCommandPreview={generateCommandPreview}
                applyCommandPreview={applyCommandPreview}
                clearCommandPreview={() => setCommandsState((current) => ({ ...current, preview: null, note: "" }))}
                previewLanguage={contentLanguage}
                coverLetter={resume.languages[contentLanguage].coverLetter}
                updateCoverLetter={(field, value) => updateLanguageField(contentLanguage, ["coverLetter", field], value)}
                generateCoverLetter={handleGenerateCoverLetter}
                coverLetterStatus={coverLetterStatus}
                aiSettings={aiSettings}
                setAiSettings={setAiSettings}
                saveAiSettings={saveAiSettings}
              />
            )}
            {activeArea === "resumes" && workspaceArea === "sync" && (
              <SyncArea
                t={t}
                sourceLanguage={syncSourceLanguage}
                setSourceLanguage={setSyncSourceLanguage}
                targetLanguage={syncTargetLanguage}
                setTargetLanguage={setSyncTargetLanguage}
                syncSections={syncSections}
                toggleSyncSection={toggleSyncSection}
                generatePreview={runSyncPreview}
                applyPreview={applySyncPreview}
                clearPreview={clearSyncPreview}
                preview={syncPreview}
                status={syncStatus}
              />
            )}
            {activeArea === "resumes" && workspaceArea === "versions" && (
              <VersionsArea
                t={t}
                versions={versions}
                selectedVersionId={selectedVersionId}
                setSelectedVersionId={loadSelectedVersion}
                saveNewVersion={saveNewVersion}
                updateSelectedVersion={updateSelectedVersion}
                renameSelectedVersion={renameSelectedVersion}
                deleteSelectedVersion={deleteSelectedVersion}
                exportEnglish={() => handleLegacyExport("en")}
                exportArabic={() => handleLegacyExport("ar")}
                importData={handleImportClick}
                importVersions={handleImportClick}
              />
            )}
            {activeArea === "profile" && <ProfileArea t={t} resume={resume} contentLanguage={contentLanguage} updateSharedField={updateSharedField} updateLanguageField={updateLanguageField} />}
            {activeArea === "preferences" && <PreferencesArea t={t} uiLanguage={uiLanguage} setUiLanguage={setUiLanguage} previewLanguage={previewLanguage} setPreviewLanguage={setPreviewLanguage} contentLanguage={contentLanguage} setContentLanguage={setContentLanguage} resume={resume} setStylePreset={(value) => updateSharedField("stylePreset", value)} />}
            {activeArea === "authentication" && <FutureArea t={t} title={t.topAreas.authentication} body="Authentication management will be added in a later release." />}
            {activeArea === "apiKeys" && <AiSettingsCardOnly t={t} title={t.topAreas.apiKeys} aiSettings={aiSettings} setAiSettings={setAiSettings} saveAiSettings={saveAiSettings} />}
            {activeArea === "jobSearch" && <FutureArea t={t} title={t.topAreas.jobSearch} body={t.dashboard.cards.jobSearchBody} badge={t.dashboard.futureBadge} />}
            {activeArea === "jobSearchApi" && <FutureArea t={t} title={t.topAreas.jobSearchApi} body="A future integration point for external job search providers and saved search pipelines." badge={t.dashboard.futureBadge} />}
            {activeArea === "dangerZone" && <DangerZoneArea t={t} resetApp={() => { undoStackRef.current = []; redoStackRef.current = []; const demo = normalizeResume(createDemoResume()); replaceResume(demo, { clearHistory: true }); const fresh = createBilingualVersion(t.demoVersionName, demo); setVersions([fresh]); setSelectedVersionId(fresh.id); }} />}
          </section>
        </div>
      </main>
    </div>
  );
}

function getAreaDescription(t, activeArea) {
  if (activeArea === "dashboard") {
    return t.dashboard.heroBody;
  }
  if (activeArea === "resumes") {
    return t.dashboard.cards.resumesBody;
  }
  if (activeArea === "jobSearch" || activeArea === "jobSearchApi") {
    return t.dashboard.futureBadge;
  }
  if (activeArea === "apiKeys") {
    return t.ai.missing;
  }
  return t.tagline;
}

function readSharedResumeFromUrl() {
  const hash = window.location.hash || "";
  if (!hash.startsWith(SHARE_HASH_PREFIX)) {
    return null;
  }
  return importSharePayload(hash.slice(SHARE_HASH_PREFIX.length));
}

function ResumeWorkspaceShell({ t, workspaceArea, setWorkspaceArea }) {
  return (
    <SectionCard title={t.topAreas.resumes} description={t.dashboard.cards.resumesBody}>
      <div className="workspace-nav">
        {WORKSPACE_AREAS.map((area) => (
          <button
            key={area}
            type="button"
            className={`chip ${workspaceArea === area ? "is-active" : ""}`}
            onClick={() => setWorkspaceArea(area)}
          >
            {t.areas[area]}
          </button>
        ))}
      </div>
    </SectionCard>
  );
}

function DashboardArea({ t, versions, selectedVersionId, setActiveArea }) {
  const selected = versions.find((item) => item.id === selectedVersionId) || versions[0];
  return (
    <div className="stack">
      <section className="dashboard-hero panel-card">
        <div className="dashboard-hero__copy">
          <p className="brand-kicker">{t.appTitle}</p>
          <h2>{t.dashboard.heroTitle}</h2>
          <p>{t.dashboard.heroBody}</p>
          <div className="dashboard-hero__actions">
            <button type="button" className="topbar__button" onClick={() => setActiveArea("resumes")}>{t.dashboard.primaryCta}</button>
            <button type="button" className="topbar__button topbar__button--secondary" onClick={() => setActiveArea("apiKeys")}>{t.dashboard.secondaryCta}</button>
          </div>
        </div>
        <div className="dashboard-hero__meta">
          <span className="dashboard-stat__label">{t.versionPlaceholder}</span>
          <strong>{selected?.name || t.demoVersionName}</strong>
          <span className="dashboard-stat__label">{versions.length} versions</span>
        </div>
      </section>

      <div className="dashboard-grid">
        <DashboardCard title={t.dashboard.cards.resumes} body={t.dashboard.cards.resumesBody} icon="resume" onClick={() => setActiveArea("resumes")} />
        <DashboardCard title={t.dashboard.cards.ai} body={t.dashboard.cards.aiBody} icon="brain" onClick={() => setActiveArea("apiKeys")} />
        <DashboardCard title={t.dashboard.cards.sharing} body={t.dashboard.cards.sharingBody} icon="link" onClick={() => setActiveArea("resumes")} />
        <DashboardCard title={t.dashboard.cards.jobSearch} body={t.dashboard.cards.jobSearchBody} icon="briefcase" badge={t.dashboard.futureBadge} onClick={() => setActiveArea("jobSearch")} />
      </div>
    </div>
  );
}

function DashboardCard({ title, body, icon, onClick, badge }) {
  return (
    <button type="button" className="dashboard-card" onClick={onClick}>
      <span className="dashboard-card__icon"><GlyphIcon name={icon} /></span>
      <div className="dashboard-card__copy">
        <div className="dashboard-card__title-row">
          <strong>{title}</strong>
          {badge ? <span className="dashboard-badge">{badge}</span> : null}
        </div>
        <p>{body}</p>
      </div>
    </button>
  );
}

function ProfileArea({ t, resume, contentLanguage, updateSharedField, updateLanguageField }) {
  const source = resume.languages[contentLanguage];
  return (
    <SectionCard title={t.topAreas.profile} description={t.sharedFields} sectionKey="profile">
      <div className="grid-two">
        <InputField label={t.fieldLabels.fullName} value={source.profile.name} onChange={(value) => updateLanguageField(contentLanguage, ["profile", "name"], value)} />
        <InputField label={t.fieldLabels.location} value={source.profile.location} onChange={(value) => updateLanguageField(contentLanguage, ["profile", "location"], value)} />
        <InputField label={t.fieldLabels.email} value={resume.shared.email} onChange={(value) => updateSharedField("email", value)} />
        <InputField label={t.fieldLabels.phone} value={resume.shared.phone} onChange={(value) => updateSharedField("phone", value)} />
        <InputField label={t.fieldLabels.linkedinHref} value={resume.shared.linkedinHref} onChange={(value) => updateSharedField("linkedinHref", value)} />
        <InputField label={t.fieldLabels.githubHref} value={resume.shared.githubHref} onChange={(value) => updateSharedField("githubHref", value)} />
      </div>
    </SectionCard>
  );
}

function PreferencesArea({ t, uiLanguage, setUiLanguage, previewLanguage, setPreviewLanguage, contentLanguage, setContentLanguage, resume, setStylePreset }) {
  return (
    <div className="stack">
      <SectionCard title={t.topAreas.preferences} description={t.styleDescription}>
        <div className="grid-two">
          <SmallSelect label={t.uiLanguage} value={uiLanguage} onChange={setUiLanguage} options={[{ value: "en", label: "English" }, { value: "ar", label: "العربية" }]} />
          <SmallSelect label={t.contentLanguage} value={contentLanguage} onChange={setContentLanguage} options={[{ value: "en", label: t.languages.en }, { value: "ar", label: t.languages.ar }]} />
          <SmallSelect label={t.previewLanguage} value={previewLanguage} onChange={setPreviewLanguage} options={[{ value: "en", label: t.languages.en }, { value: "ar", label: t.languages.ar }]} />
          <SmallSelect label={t.areas.style} value={resume.shared.stylePreset} onChange={setStylePreset} options={[{ value: "default", label: t.style.default }, { value: "refined", label: t.style.refined }]} />
        </div>
      </SectionCard>
      <StyleArea t={t} resume={resume} setStylePreset={setStylePreset} />
    </div>
  );
}

function AiSettingsCardOnly({ t, title, aiSettings, setAiSettings, saveAiSettings }) {
  return (
    <SectionCard title={title} description={t.dashboard.cards.aiBody}>
      <AiSettingsForm t={t} aiSettings={aiSettings} setAiSettings={setAiSettings} saveAiSettings={saveAiSettings} />
    </SectionCard>
  );
}

function FutureArea({ title, body, badge }) {
  return (
    <SectionCard title={title}>
      <div className="future-area">
        {badge ? <span className="dashboard-badge">{badge}</span> : null}
        <p>{body}</p>
      </div>
    </SectionCard>
  );
}

function DangerZoneArea({ t, resetApp }) {
  return (
    <SectionCard title={t.topAreas.dangerZone} description="Local-only destructive actions.">
      <div className="future-area">
        <p>Reset the local bilingual resume, versions, and draft state back to the public demo baseline.</p>
        <button
          type="button"
          className="topbar__button topbar__button--secondary"
          onClick={() => {
            if (window.confirm("Reset local resume data and versions?")) {
              resetApp();
            }
          }}
        >
          Reset local workspace
        </button>
      </div>
    </SectionCard>
  );
}

function ActionDockButton({ icon, label, onClick, isActive = false }) {
  return (
    <button type="button" className={`action-dock__button ${isActive ? "is-active" : ""}`} onClick={onClick} title={label} aria-label={label}>
      <GlyphIcon name={icon} />
    </button>
  );
}

function GlyphIcon({ name }) {
  const icons = {
    chevronLeft: <path d="M10 5 5 10l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    chevronRight: <path d="m6 5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    spark: <path d="M12 2 9.9 7.1 5 9.2l4.9 2.1L12 16l2.1-4.7 4.9-2.1-4.9-2.1Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
    resume: <path d="M7 3.5h6l3 3v10a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 6 16.5v-11A2 2 0 0 1 8 3.5Zm1 5h6M8 11h6M8 14h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
    briefcase: <path d="M7 6.5V5.3A1.3 1.3 0 0 1 8.3 4h3.4A1.3 1.3 0 0 1 13 5.3v1.2m-8 1h10a1 1 0 0 1 1 1v5.7a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 14.2V8.5a1 1 0 0 1 1-1Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
    profile: <path d="M12 11a3.5 3.5 0 1 0-3.5-3.5A3.5 3.5 0 0 0 12 11Zm-6 6a6 6 0 0 1 12 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
    settings: <path d="m12 3 1 2.2 2.5.5-.9 2.3 1.7 1.8-1.7 1.8.9 2.3-2.5.5-1 2.2-1-2.2-2.5-.5.9-2.3-1.7-1.8 1.7-1.8-.9-2.3 2.5-.5Zm0 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
    shield: <path d="M12 3.5 6 5.8v3.7c0 3.5 2.3 6.7 6 8 3.7-1.3 6-4.5 6-8V5.8Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />,
    key: <path d="M9.5 11a3.5 3.5 0 1 1 3 3.46H11v2H9v2H7v-3.3l2-2.16A3.48 3.48 0 0 1 9.5 11Zm6-1.5h.01" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
    brain: <path d="M8.2 6a2.2 2.2 0 0 1 4-1.3A2.5 2.5 0 0 1 16 7v5a2.5 2.5 0 0 1-2.5 2.5h-1.2a2.3 2.3 0 0 1-4.5 0H6.5A2.5 2.5 0 0 1 4 12V8.4A2.4 2.4 0 0 1 6.4 6Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />,
    link: <path d="M9.5 14.5 8 16a3 3 0 0 1-4.2-4.2l2.2-2.2A3 3 0 0 1 10.2 10m3.6-4L16 4a3 3 0 0 1 4.2 4.2L18 10.4A3 3 0 0 1 13.8 10M8.8 11.2l6.4-6.4" transform="translate(-4 -1)" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
    warning: <path d="M12 4 4.6 17h14.8Zm0 4.5v3.8m0 2.7h.01" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
    panelCollapse: <path d="M15 5 9 12l6 7M9 5v14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    panelExpand: <path d="m9 5 6 7-6 7M15 5v14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
    moveUp: <path d="m12 6-4 4m4-4 4 4M12 6v12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
    moveDown: <path d="m12 18 4-4m-4 4-4-4m4 4V6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
    download: <path d="M12 4v7m0 0 3-3m-3 3-3-3M5 15.5h14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
    pdf: <path d="M7 3.5h6l3 3v10a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 6 16.5v-11A2 2 0 0 1 8 3.5Zm1 9.5h8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
    undo: <path d="M8 7H4v4m0-4 3.5-3.5M4 7h7a5 5 0 1 1 0 10h-1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
    redo: <path d="M16 7h4v4m0-4-3.5-3.5M20 7h-7a5 5 0 1 0 0 10h1" transform="translate(-4 0)" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
    center: <path d="M4.5 6.5h5v5h-5Zm10 0h5v5h-5Zm-10 8h5v5h-5Zm10 0h5v5h-5Z" transform="translate(-4 -4)" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />,
    zoomIn: (
      <>
        <path d="M10.5 10.5h4m-2-2v4m4.5 4.5L15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12.5" cy="10.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </>
    ),
    zoomOut: (
      <>
        <path d="M10.5 10.5h4m4.5 4.5L15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12.5" cy="10.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </>
    )
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {icons[name] || icons.spark}
    </svg>
  );
}

function ContentArea(props) {
  const {
    t,
    resume,
    contentLanguage,
    editMode,
    setEditMode,
    activeSection,
    setActiveSection,
    updateSharedField,
    updateTargetingField,
    updateLanguageField,
    updateListItem,
    updateBullet,
    addSectionItem,
    removeSectionItem
  } = props;
  const source = resume.languages[contentLanguage];
  const sectionTabs = ["summary", "experience", "internships", "projects", "education", "certificates", "skills", "softSkills"];

  return (
    <div className="stack">
      <SectionCard title={t.sharedFields} description={t.profile}>
        <div className="grid-two">
          <InputField label={t.fieldLabels.email} value={resume.shared.email} onChange={(value) => updateSharedField("email", value)} />
          <InputField label={t.fieldLabels.phone} value={resume.shared.phone} onChange={(value) => updateSharedField("phone", value)} />
          <InputField label={t.fieldLabels.linkedinHref} value={resume.shared.linkedinHref} onChange={(value) => updateSharedField("linkedinHref", value)} />
          <InputField label={t.fieldLabels.githubHref} value={resume.shared.githubHref} onChange={(value) => updateSharedField("githubHref", value)} />
        </div>
        <div className="grid-two">
          <InputField label={t.fieldLabels.targetRole} value={resume.shared.targeting.jobTitle} onChange={(value) => updateTargetingField("jobTitle", value)} />
          <InputField label={t.fieldLabels.company} value={resume.shared.targeting.company} onChange={(value) => updateTargetingField("company", value)} />
        </div>
        <TextAreaField label={t.fieldLabels.jobDescription} rows={5} value={resume.shared.targeting.jobDescription} onChange={(value) => updateTargetingField("jobDescription", value)} />
      </SectionCard>

      <SectionCard title={t.editorArea}>
        <div className="mode-switch">
          <button type="button" className={editMode === "single" ? "chip is-active" : "chip"} onClick={() => setEditMode("single")}>{t.modes.editEnglish} / {t.modes.editArabic}</button>
          <button type="button" className={editMode === "compare" ? "chip is-active" : "chip"} onClick={() => setEditMode("compare")}>{t.modes.compare}</button>
        </div>
        <div className="section-switcher">
          {sectionTabs.map((key) => (
            <button key={key} type="button" className={`chip ${activeSection === key ? "is-active" : ""}`} onClick={() => setActiveSection(key)}>
              {source.labels[key] || t[key]}
            </button>
          ))}
        </div>
      </SectionCard>

      {editMode === "compare"
        ? <CompareEditor t={t} resume={resume} sectionKey={activeSection} updateLanguageField={updateLanguageField} />
        : <SingleLanguageEditor
            t={t}
            lang={contentLanguage}
            source={source}
            sectionKey={activeSection}
            updateLanguageField={updateLanguageField}
            updateListItem={updateListItem}
            updateBullet={updateBullet}
            addSectionItem={addSectionItem}
            removeSectionItem={removeSectionItem}
          />}
    </div>
  );
}

function CompareEditor({ t, resume, sectionKey, updateLanguageField }) {
  return (
    <div className="compare-grid">
      {["en", "ar"].map((lang) => (
        <SectionCard key={lang} title={`${t.languages[lang]} - ${resume.languages[lang].labels[sectionKey] || t[sectionKey]}`}>
          {sectionKey === "summary" ? (
            <TextAreaField
              label={t.summary}
              rows={7}
              value={resume.languages[lang].summary}
              onChange={(value) => updateLanguageField(lang, ["summary"], value)}
            />
          ) : (
            <pre className="compare-block">{JSON.stringify(sectionKey === "coverLetter" ? resume.languages[lang].coverLetter : resume.languages[lang].sections[sectionKey], null, 2)}</pre>
          )}
        </SectionCard>
      ))}
    </div>
  );
}

function SingleLanguageEditor({ t, lang, source, sectionKey, updateLanguageField, updateListItem, updateBullet, addSectionItem, removeSectionItem }) {
  if (sectionKey === "summary") {
    return (
      <SectionCard title={source.labels.summary} sectionKey="summary">
        <div className="grid-two">
          <InputField label={t.fieldLabels.fullName} value={source.profile.name} onChange={(value) => updateLanguageField(lang, ["profile", "name"], value)} />
          <InputField label={t.fieldLabels.location} value={source.profile.location} onChange={(value) => updateLanguageField(lang, ["profile", "location"], value)} />
          <InputField label={t.fieldLabels.linkedinLabel} value={source.profile.linkedinLabel} onChange={(value) => updateLanguageField(lang, ["profile", "linkedinLabel"], value)} />
          <InputField label={t.fieldLabels.githubLabel} value={source.profile.githubLabel} onChange={(value) => updateLanguageField(lang, ["profile", "githubLabel"], value)} />
          <InputField label={t.fieldLabels.portfolioLabel} value={source.profile.portfolioLabel} onChange={(value) => updateLanguageField(lang, ["profile", "portfolioLabel"], value)} />
          <InputField label={t.fieldLabels.sectionTitle} value={source.labels.summary} onChange={(value) => updateLanguageField(lang, ["labels", "summary"], value)} />
        </div>
        <TextAreaField label={source.labels.summary} rows={8} value={source.summary} onChange={(value) => updateLanguageField(lang, ["summary"], value)} />
      </SectionCard>
    );
  }

  if (sectionKey === "softSkills") {
    return (
      <SectionCard title={source.labels.softSkills} sectionKey="softSkills">
        <InputField label={t.fieldLabels.sectionTitle} value={source.labels.softSkills} onChange={(value) => updateLanguageField(lang, ["labels", "softSkills"], value)} />
        {source.sections.softSkills.map((skill, index) => (
          <InlineRow key={`${sectionKey}-${index}`} sectionKey="softSkills" itemIndex={index}>
            <input value={skill} onChange={(event) => updateLanguageField(lang, ["sections", "softSkills", index], event.target.value)} />
            <button type="button" className="icon-button" onClick={() => removeSectionItem(lang, "softSkills", index)}>×</button>
          </InlineRow>
        ))}
        <button type="button" className="panel-action" onClick={() => addSectionItem(lang, "softSkills")}>{t.actions.addSoftSkill}</button>
      </SectionCard>
    );
  }

  if (sectionKey === "skills") {
    return (
      <SectionCard title={source.labels.skills} sectionKey="skills">
        <InputField label={t.fieldLabels.sectionTitle} value={source.labels.skills} onChange={(value) => updateLanguageField(lang, ["labels", "skills"], value)} />
        {source.sections.skills.map((item, index) => (
          <div className="item-card" key={`${sectionKey}-${index}`} data-editor-section="skills" data-editor-index={index}>
            <InlineRow>
              <strong>{index + 1}</strong>
              <button type="button" className="icon-button" onClick={() => removeSectionItem(lang, "skills", index)}>×</button>
            </InlineRow>
            <InputField label="Label" value={item.label} onChange={(value) => updateListItem(lang, "skills", index, "label", value)} />
            <TextAreaField label="Items" rows={3} value={item.items} onChange={(value) => updateListItem(lang, "skills", index, "items", value)} />
          </div>
        ))}
        <button type="button" className="panel-action" onClick={() => addSectionItem(lang, "skills")}>{t.actions.addSkillGroup}</button>
      </SectionCard>
    );
  }

  const configMap = {
    experience: { fields: ["date", "location", "organization", "role"], bullets: true },
    internships: { fields: ["date", "location", "organization", "role"], bullets: true },
    projects: { fields: ["date", "title", "linkLabel", "linkHref"], bullets: true },
    education: { fields: ["date", "location", "degree", "institution"], bullets: false },
    certificates: { fields: ["title", "description"], bullets: false }
  };

  const config = configMap[sectionKey];
  const items = source.sections[sectionKey];
  return (
    <SectionCard title={source.labels[sectionKey] || t[sectionKey]} sectionKey={sectionKey}>
      <InputField label={t.fieldLabels.sectionTitle} value={source.labels[sectionKey]} onChange={(value) => updateLanguageField(lang, ["labels", sectionKey], value)} />
      {items.map((item, index) => (
        <div className="item-card" key={`${sectionKey}-${index}`} data-editor-section={sectionKey} data-editor-index={index}>
          <InlineRow>
            <strong>{index + 1}</strong>
            <button type="button" className="icon-button" onClick={() => removeSectionItem(lang, sectionKey, index)}>×</button>
          </InlineRow>
          {config.fields.map((field) => (
            field === "description" || field === "linkHref"
              ? <TextAreaField key={field} label={field} rows={field === "description" ? 3 : 2} value={item[field] || ""} onChange={(value) => updateListItem(lang, sectionKey, index, field, value)} />
              : <InputField key={field} label={field} value={item[field] || ""} onChange={(value) => updateListItem(lang, sectionKey, index, field, value)} />
          ))}
          {config.bullets ? (
            <div className="stack">
              <label className="field-label">Bullets</label>
              {item.bullets.map((bullet, bulletIndex) => (
                <InlineRow key={`${sectionKey}-${index}-${bulletIndex}`}>
                  <textarea value={bullet} rows={3} onChange={(event) => updateBullet(lang, sectionKey, index, bulletIndex, event.target.value)} />
                  <button type="button" className="icon-button" onClick={() => {
                    const next = [...item.bullets];
                    next.splice(bulletIndex, 1);
                    updateListItem(lang, sectionKey, index, "bullets", next);
                  }}>×</button>
                </InlineRow>
              ))}
              <button type="button" className="panel-action panel-action--secondary" onClick={() => updateListItem(lang, sectionKey, index, "bullets", [...item.bullets, ""])}>Add bullet</button>
            </div>
          ) : null}
        </div>
      ))}
      <button type="button" className="panel-action" onClick={() => addSectionItem(lang, sectionKey)}>{t.actions.addItem}</button>
    </SectionCard>
  );
}

function LayoutArea({ t, resume, moveSectionOrder, previewLanguage, setPreviewLanguage }) {
  return (
    <div className="stack">
      <SectionCard title={t.areas.layout} description={t.layoutDescription}>
        <SmallSelect
          label={t.previewLanguage}
          value={previewLanguage}
          onChange={setPreviewLanguage}
          options={[{ value: "en", label: t.languages.en }, { value: "ar", label: t.languages.ar }]}
        />
        <div className="stack">
          {resume.shared.sectionOrder.map((key) => (
            <InlineRow key={key}>
              <span>{resume.languages[previewLanguage].labels[key] || t[key]}</span>
              <div className="inline-actions">
                <button type="button" className="icon-button" onClick={() => moveSectionOrder(key, -1)}>↑</button>
                <button type="button" className="icon-button" onClick={() => moveSectionOrder(key, 1)}>↓</button>
              </div>
            </InlineRow>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function StyleArea({ t, resume, setStylePreset }) {
  const preset = resume.shared.stylePreset === "refined" ? "refined" : "default";
  return (
    <div className="stack">
      <SectionCard title={t.areas.style} description={t.styleDescription}>
        <div className="mode-switch">
          <button type="button" className={preset === "default" ? "chip is-active" : "chip"} onClick={() => setStylePreset("default")}>{t.style.default}</button>
          <button type="button" className={preset === "refined" ? "chip is-active" : "chip"} onClick={() => setStylePreset("refined")}>{t.style.refined}</button>
        </div>
        <PresetSummary preset={preset} t={t} />
      </SectionCard>
    </div>
  );
}

function AnalysisArea({ t, tab, setTab, quality, ats, hrBaseline, hrReview, hrLoading, runAiReview, targeting }) {
  return (
    <div className="stack">
      <SectionCard title={t.areas.analysis}>
        <div className="section-switcher">
          {ANALYSIS_TABS.map((item) => (
            <button key={item} type="button" className={`chip ${tab === item ? "is-active" : ""}`} onClick={() => setTab(item)}>
              {t.analysis[item]}
            </button>
          ))}
        </div>
      </SectionCard>
      {tab === "quality" && <QualityPanel quality={quality} />}
      {tab === "ats" && <AtsPanel t={t} ats={ats} jobDescription={targeting.jobDescription} />}
      {tab === "hr" && <HrPanel baseline={hrBaseline} review={hrReview} loading={hrLoading} runAiReview={runAiReview} />}
    </div>
  );
}

function AiToolsArea(props) {
  const {
    t,
    tab,
    setTab,
    commandsState,
    setCommandsState,
    generateCommandPreview,
    applyCommandPreview,
    clearCommandPreview,
    previewLanguage,
    coverLetter,
    updateCoverLetter,
    generateCoverLetter,
    coverLetterStatus,
    aiSettings,
    setAiSettings,
    saveAiSettings
  } = props;

  return (
    <div className="stack">
      <SectionCard title={t.areas.aiTools}>
        <div className="section-switcher">
          {AI_TOOL_TABS.map((item) => (
            <button key={item} type="button" className={`chip ${tab === item ? "is-active" : ""}`} onClick={() => setTab(item)}>
              {item === "commands" ? t.commands.title : item === "coverLetter" ? t.coverLetter : "AI Settings"}
            </button>
          ))}
        </div>
      </SectionCard>

      {tab === "commands" && (
        <SectionCard title={t.commands.title} description={t.commands.description}>
          <MultiSelectChecklist label={t.commands.selectedSections} values={commandsState.sections} onToggle={(value) => setCommandsState((current) => ({
            ...current,
            sections: current.sections.includes(value) ? current.sections.filter((item) => item !== value) : [...current.sections, value]
          }))} options={SECTION_KEYS} />
          <InputField label={t.commands.command} value={commandsState.command} onChange={(value) => setCommandsState((current) => ({ ...current, command: value }))} />
          <TextAreaField label={t.commands.content} rows={8} value={commandsState.content} onChange={(value) => setCommandsState((current) => ({ ...current, content: value }))} />
          <InlineRow>
            <button type="button" className="panel-action" onClick={generateCommandPreview}>{t.actions.generatePreview}</button>
            <button type="button" className="panel-action panel-action--secondary" onClick={applyCommandPreview}>{t.actions.applyChanges}</button>
            <button type="button" className="panel-action panel-action--ghost" onClick={clearCommandPreview}>{t.actions.clear}</button>
          </InlineRow>
          <PreviewJson title={commandsState.note || t.commands.noPreview} data={commandsState.preview} />
        </SectionCard>
      )}

      {tab === "coverLetter" && (
        <SectionCard title={`${t.coverLetter} - ${t.languages[previewLanguage]}`}>
          <div className="grid-two">
            <InputField label={t.fieldLabels.recipientName} value={coverLetter.recipientName} onChange={(value) => updateCoverLetter("recipientName", value)} />
            <InputField label={t.fieldLabels.hiringManager} value={coverLetter.hiringManager} onChange={(value) => updateCoverLetter("hiringManager", value)} />
            <InputField label={t.fieldLabels.company} value={coverLetter.company} onChange={(value) => updateCoverLetter("company", value)} />
            <InputField label={t.fieldLabels.targetRole} value={coverLetter.targetRole} onChange={(value) => updateCoverLetter("targetRole", value)} />
          </div>
          <TextAreaField label={t.fieldLabels.opening} rows={3} value={coverLetter.opening} onChange={(value) => updateCoverLetter("opening", value)} />
          <TextAreaField label={t.fieldLabels.body} rows={6} value={coverLetter.body} onChange={(value) => updateCoverLetter("body", value)} />
          <TextAreaField label={t.fieldLabels.closing} rows={3} value={coverLetter.closing} onChange={(value) => updateCoverLetter("closing", value)} />
          <InputField label={t.fieldLabels.signatureName} value={coverLetter.signatureName} onChange={(value) => updateCoverLetter("signatureName", value)} />
          <TextAreaField label={t.fieldLabels.notes} rows={2} value={coverLetter.notes} onChange={(value) => updateCoverLetter("notes", value)} />
          <InlineRow>
            <button type="button" className="panel-action" onClick={generateCoverLetter}>{t.actions.generateCoverLetter}</button>
            <button type="button" className="panel-action panel-action--secondary" onClick={() => navigator.clipboard.writeText(createCoverLetterPlainText(coverLetter))}>{t.actions.copyCoverLetter}</button>
          </InlineRow>
          {coverLetterStatus ? <StatusNotice>{coverLetterStatus}</StatusNotice> : null}
        </SectionCard>
      )}

      {tab === "settings" && (
        <SectionCard title="AI Settings">
          <AiSettingsForm t={t} aiSettings={aiSettings} setAiSettings={setAiSettings} saveAiSettings={saveAiSettings} />
        </SectionCard>
      )}
    </div>
  );
}

function SyncArea({ t, sourceLanguage, setSourceLanguage, targetLanguage, setTargetLanguage, syncSections, toggleSyncSection, generatePreview, applyPreview, clearPreview, preview, status }) {
  return (
    <div className="stack">
      <SectionCard title={t.areas.sync} description={t.syncDescription}>
        <div className="grid-two">
          <SmallSelect label={t.sync.sourceLanguage} value={sourceLanguage} onChange={setSourceLanguage} options={[{ value: "en", label: t.languages.en }, { value: "ar", label: t.languages.ar }]} />
          <SmallSelect label={t.sync.targetLanguage} value={targetLanguage} onChange={setTargetLanguage} options={[{ value: "en", label: t.languages.en }, { value: "ar", label: t.languages.ar }]} />
        </div>
        <MultiSelectChecklist label={t.sync.selectedSections} values={syncSections} onToggle={toggleSyncSection} options={SYNC_SECTION_KEYS} />
        <InlineRow>
          <button type="button" className="panel-action" onClick={generatePreview}>{t.actions.generatePreview}</button>
          <button type="button" className="panel-action panel-action--secondary" onClick={applyPreview}>{t.actions.applyChanges}</button>
          <button type="button" className="panel-action panel-action--ghost" onClick={clearPreview}>{t.actions.clear}</button>
        </InlineRow>
        {status ? <StatusNotice>{status}</StatusNotice> : null}
        <PreviewJson title={preview ? "Sync preview" : t.sync.noPreview} data={preview} />
      </SectionCard>
    </div>
  );
}

function VersionsArea({ t, versions, selectedVersionId, setSelectedVersionId, saveNewVersion, updateSelectedVersion, renameSelectedVersion, deleteSelectedVersion, exportEnglish, exportArabic, importData, importVersions }) {
  return (
    <div className="stack">
      <SectionCard title={t.areas.versions} description={t.versionsDescription}>
        <SmallSelect label={t.versionPlaceholder} value={selectedVersionId} onChange={setSelectedVersionId} options={versions.map((item) => ({ value: item.id, label: item.name }))} />
        <div className="button-grid">
          <button type="button" className="panel-action" onClick={saveNewVersion}>{t.saveVersion}</button>
          <button type="button" className="panel-action panel-action--secondary" onClick={updateSelectedVersion}>{t.updateVersion}</button>
          <button type="button" className="panel-action panel-action--secondary" onClick={renameSelectedVersion}>{t.renameVersion}</button>
          <button type="button" className="panel-action panel-action--ghost" onClick={deleteSelectedVersion}>{t.deleteVersion}</button>
        </div>
        <div className="button-grid">
          <button type="button" className="panel-action panel-action--secondary" onClick={importData}>{t.importData}</button>
          <button type="button" className="panel-action panel-action--secondary" onClick={importVersions}>{t.importVersions}</button>
          <button type="button" className="panel-action panel-action--secondary" onClick={exportEnglish}>Legacy EN export</button>
          <button type="button" className="panel-action panel-action--secondary" onClick={exportArabic}>Legacy AR export</button>
        </div>
      </SectionCard>
    </div>
  );
}

function QualityPanel({ quality }) {
  return (
    <div className="stack">
      <ScoreRow title="Overall Scores" scores={quality.scores} />
      <SectionCard title="Top Problems"><BulletTextList items={quality.topProblems} /></SectionCard>
      <SectionCard title="Strongest Points"><BulletTextList items={quality.strongestPoints} /></SectionCard>
      <SectionCard title="Weak Bullets">
        {(quality.weakBullets || []).map((item, index) => (
          <div className="review-card" key={`weak-${index}`}>
            <strong>{item.issue}</strong>
            <p>{item.bullet}</p>
            <p><strong>Better verb:</strong> {item.betterVerb}</p>
            <p><strong>Rewrite:</strong> {item.rewrite}</p>
          </div>
        ))}
      </SectionCard>
      <SectionCard title="Generic Wording Issues">
        {(quality.genericWording || []).map((item, index) => (
          <div className="review-card" key={`generic-${index}`}>
            <strong>{item.where}</strong>
            <p>{item.phrase}</p>
            <p>{item.why}</p>
            <p><strong>Sharper replacement:</strong> {item.replacement}</p>
          </div>
        ))}
      </SectionCard>
      <SectionCard title="Duplicate / Redundant Skills"><BulletTextList items={quality.duplicateSkills} /></SectionCard>
      <SectionCard title="Missing Metrics">
        {(quality.missingMetrics || []).map((item, index) => (
          <div className="review-card" key={`metric-${index}`}>
            <p>{item.bullet}</p>
            <p><strong>Suggestion:</strong> {item.suggestion}</p>
          </div>
        ))}
      </SectionCard>
      <SectionCard title="Recruiter Impression"><p>{quality.recruiterImpression}</p></SectionCard>
      <SectionCard title="Rewritten Suggestions">
        {(quality.rewrittenSuggestions || []).map((item, index) => (
          <div className="review-card" key={`rewrite-${index}`}>
            <strong>{item.title}</strong>
            <p>{item.before}</p>
            <p><strong>After:</strong> {item.after}</p>
          </div>
        ))}
      </SectionCard>
    </div>
  );
}

function AtsPanel({ t, ats, jobDescription }) {
  return (
    <div className="stack">
      <ScoreRow title="Overall Scores" scores={ats.scores} />
      <SectionCard title="ATS Match Review"><p>{ats.summary}</p></SectionCard>
      {!jobDescription ? <StatusNotice>{t.analysis.noJobDescription}</StatusNotice> : null}
      <SectionCard title="Required / Preferred Skills">
        <p><strong>Hard skills:</strong> {ats.hardSkills.join(", ") || "—"}</p>
        <p><strong>Soft skills:</strong> {ats.softSkills.join(", ") || "—"}</p>
        <p><strong>Domain focus:</strong> {ats.domainFocus}</p>
      </SectionCard>
      <SectionCard title="Matches"><BulletTextList items={ats.matched} /></SectionCard>
      <SectionCard title="Missing Keywords"><BulletTextList items={ats.missing} /></SectionCard>
      <SectionCard title="Evidence Strength"><p>{ats.evidenceStrength} matched keyword(s) are supported by experience bullets.</p></SectionCard>
    </div>
  );
}

function HrPanel({ baseline, review, loading, runAiReview }) {
  return (
    <div className="stack">
      <ScoreRow title="Baseline recruiter read" scores={baseline.scores} />
      <SectionCard title="Shortlist decision">
        <p><strong>{baseline.decision}</strong></p>
        <p>{baseline.reason}</p>
      </SectionCard>
      <button type="button" className="panel-action" onClick={runAiReview} disabled={loading}>{loading ? "Running..." : "Run AI HR Review"}</button>
      {review?.error ? <StatusNotice>{review.error}</StatusNotice> : null}
      {review && !review.error ? (
        <>
          <SectionCard title="Overall first impression"><p>{review.firstImpression || review.summary}</p></SectionCard>
          <ScoreRow title="AI review scores" scores={review.scores} />
          <SectionCard title="Role fit">
            <p><strong>Strong matches:</strong> {(review.roleFit?.strongMatches || []).join(", ") || "—"}</p>
            <p><strong>Weak matches:</strong> {(review.roleFit?.weakMatches || []).join(", ") || "—"}</p>
          </SectionCard>
          <SectionCard title="HR review"><BulletReviewItems items={review.hrReview} /></SectionCard>
          <SectionCard title="ATS review"><BulletReviewItems items={review.atsReview} /></SectionCard>
          <SectionCard title="Red flags"><BulletTextList items={review.redFlags} /></SectionCard>
          <SectionCard title="Shortlist decision">
            <p><strong>{review.shortlistDecision?.decision}</strong></p>
            <p>{review.shortlistDecision?.reason}</p>
          </SectionCard>
          <SectionCard title="Improvement recommendations"><BulletTextList items={review.improvementRecommendations} /></SectionCard>
          <SectionCard title="Rewritten Suggestions">
            {(review.rewrittenSuggestions || []).map((item, index) => (
              <div className="review-card" key={`ai-hr-${index}`}>
                <strong>{item.title}</strong>
                <p>{item.before}</p>
                <p><strong>After:</strong> {item.after}</p>
              </div>
            ))}
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}

function AiSettingsForm({ t, aiSettings, setAiSettings, saveAiSettings }) {
  return (
    <>
      <SmallSelect label={t.ai.provider} value={aiSettings.provider} onChange={(value) => setAiSettings((current) => ({ ...current, provider: value }))} options={AI_PROVIDER_OPTIONS} />
      <InputField label={t.ai.model} value={aiSettings.model} onChange={(value) => setAiSettings((current) => ({ ...current, model: value }))} />
      <InputField label={t.ai.apiKey} type="password" value={aiSettings.apiKey} onChange={(value) => setAiSettings((current) => ({ ...current, apiKey: value }))} />
      <button type="button" className="panel-action" onClick={saveAiSettings}>{t.ai.save}</button>
      <StatusNotice>{aiSettings.apiKey ? t.ai.ready : t.ai.missing}</StatusNotice>
    </>
  );
}

function PreviewSheet({ resume, language, mode, styleTokens, zoom, onNavigate, onMoveSection, onMoveItem, activeContentLanguage }) {
  const style = {
    "--cv-font-family": styleTokens.fontFamily,
    "--cv-name-size": styleTokens.nameSize,
    "--cv-name-size-first": styleTokens.nameSize,
    "--cv-heading-size": styleTokens.headingSize,
    "--cv-body-copy-size": styleTokens.bodySize,
    "--cv-contact-size": styleTokens.contactSize,
    "--cv-contact-size-first": styleTokens.contactSize,
    "--cv-content-line-height": styleTokens.lineHeight,
    transform: `scale(${zoom / 100})`
  };

  return (
    <div className={`preview-sheet ${language === "ar" ? "is-rtl" : ""}`} dir={language === "ar" ? "rtl" : "ltr"} style={style}>
      {mode === "cover-letter"
        ? <CoverLetterPreview resume={resume} language={language} onNavigate={onNavigate} />
        : <ResumePreview resume={resume} language={language} onNavigate={onNavigate} onMoveSection={onMoveSection} onMoveItem={onMoveItem} activeContentLanguage={activeContentLanguage} />}
    </div>
  );
}

function ResumePreview({ resume, language, onNavigate, onMoveSection, onMoveItem }) {
  const source = resume.languages[language];
  const pages = splitResumePreviewPages(resume.shared.sectionOrder);
  return (
    <div className="sheet-stack">
      {pages.map((pageKeys, pageIndex) => (
        <article className={`sheet ${pageIndex === 0 ? "sheet--first" : "sheet--flow"}`} key={`page-${pageIndex}`}>
          <div className="sheet__body">
            {pageIndex === 0 ? (
              <header className="hero">
                {resume.shared.photo ? (
                  <div className="hero__photo-wrap preview-jump-target preview-jump-target--item" role="button" tabIndex={0} onClick={() => onNavigate?.("profile", null, language)} onKeyDown={(event) => handlePreviewActivate(event, () => onNavigate?.("profile", null, language))}>
                    <img className="hero__photo" src={resume.shared.photo} alt={source.profile.name} />
                  </div>
                ) : null}
                <h1 className="hero__name preview-jump-target preview-jump-target--item" role="button" tabIndex={0} onClick={() => onNavigate?.("profile", null, language)} onKeyDown={(event) => handlePreviewActivate(event, () => onNavigate?.("profile", null, language))}>{source.profile.name}</h1>
                <div className="hero__contact-row preview-jump-target preview-jump-target--item" role="button" tabIndex={0} onClick={() => onNavigate?.("profile", null, language)} onKeyDown={(event) => handlePreviewActivate(event, () => onNavigate?.("profile", null, language))}>
                  <ContactItem type="email" label={resume.shared.email} href={`mailto:${resume.shared.email}`} />
                  <ContactItem type="phone" label={resume.shared.phone} href={resume.shared.phoneHref} />
                  <ContactItem type="location" label={source.profile.location} isStatic />
                  <ContactItem type="linkedin" label={source.profile.linkedinLabel} href={resume.shared.linkedinHref} />
                  <ContactItem type="github" label={source.profile.githubLabel} href={resume.shared.githubHref} />
                  <ContactItem type="portfolio" label={source.profile.portfolioLabel} href={resume.shared.portfolioHref} />
                </div>
              </header>
            ) : null}

            {pageKeys.map((key) => (
              <PreviewSection
                key={key}
                title={source.labels[key]}
                sectionKey={key}
                sectionIndex={resume.shared.sectionOrder.indexOf(key)}
                totalSections={resume.shared.sectionOrder.length}
                onNavigate={onNavigate}
                onMoveSection={onMoveSection}
                language={language}
              >
                {renderResumeSection({ key, source, rtl: language === "ar", language, onNavigate, onMoveItem })}
              </PreviewSection>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function CoverLetterPreview({ resume, language, onNavigate }) {
  const source = resume.languages[language];
  const letter = source.coverLetter;
  return (
    <article className="sheet cover-letter-sheet">
      <div className="sheet__body">
        <header className="hero">
          <h1 className="hero__name preview-jump-target preview-jump-target--item" role="button" tabIndex={0} onClick={() => onNavigate?.("profile", null, language)} onKeyDown={(event) => handlePreviewActivate(event, () => onNavigate?.("profile", null, language))}>{source.profile.name}</h1>
          <div className="hero__contact-row preview-jump-target preview-jump-target--item" role="button" tabIndex={0} onClick={() => onNavigate?.("profile", null, language)} onKeyDown={(event) => handlePreviewActivate(event, () => onNavigate?.("profile", null, language))}>
            <ContactItem type="email" label={resume.shared.email} href={`mailto:${resume.shared.email}`} />
            <ContactItem type="phone" label={resume.shared.phone} href={resume.shared.phoneHref} />
            <ContactItem type="location" label={source.profile.location} isStatic />
          </div>
        </header>
        <div className="cover-letter-body">
        <p>{letter.recipientName || letter.hiringManager || (language === "ar" ? "فريق التوظيف" : "Hiring Team")}</p>
        <p>{letter.company}</p>
        <h2>{letter.targetRole}</h2>
        <p>{letter.opening}</p>
        <p>{letter.body}</p>
        <p>{letter.closing}</p>
          <p>{letter.signatureName}</p>
        </div>
      </div>
    </article>
  );
}

function splitResumePreviewPages(sectionOrder) {
  const order = Array.isArray(sectionOrder) ? sectionOrder.filter(Boolean) : [];
  if (!order.length) {
    return [[]];
  }

  const splitIndex = order.indexOf("education");
  if (splitIndex > 0) {
    return [order.slice(0, splitIndex), order.slice(splitIndex)];
  }

  if (order.length > 4) {
    return [order.slice(0, 4), order.slice(4)];
  }

  return [order];
}

function renderResumeSection({ key, source, rtl, language, onNavigate, onMoveItem }) {
  switch (key) {
    case "summary":
      return <p className="summary-text preview-jump-target preview-jump-target--item" role="button" tabIndex={0} onClick={() => onNavigate?.("summary", null, language)} onKeyDown={(event) => handlePreviewActivate(event, () => onNavigate?.("summary", null, language))}>{source.summary}</p>;
    case "experience":
      return <Timeline items={source.sections.experience} rtl={rtl} language={language} sectionKey="experience" onNavigate={onNavigate} onMoveItem={onMoveItem} />;
    case "internships":
      return <Timeline items={source.sections.internships} rtl={rtl} language={language} sectionKey="internships" onNavigate={onNavigate} onMoveItem={onMoveItem} />;
    case "projects":
      return <ProjectsPreview items={source.sections.projects} rtl={rtl} language={language} sectionKey="projects" onNavigate={onNavigate} onMoveItem={onMoveItem} />;
    case "education":
      return <EducationPreview items={source.sections.education} rtl={rtl} language={language} sectionKey="education" onNavigate={onNavigate} onMoveItem={onMoveItem} />;
    case "certificates":
      return <CertificatesPreview items={source.sections.certificates} rtl={rtl} language={language} sectionKey="certificates" onNavigate={onNavigate} onMoveItem={onMoveItem} />;
    case "skills":
      return <SkillsPreview items={source.sections.skills} language={language} sectionKey="skills" onNavigate={onNavigate} onMoveItem={onMoveItem} />;
    case "softSkills":
      return <SoftSkillsPreview items={source.sections.softSkills} language={language} sectionKey="softSkills" onNavigate={onNavigate} onMoveItem={onMoveItem} />;
    default:
      return null;
  }
}

function Timeline({ items, rtl, language, sectionKey, onNavigate, onMoveItem }) {
  return (
    <div className="timeline">
      {items.map((item, index) => (
        <article className="timeline-item preview-jump-target preview-jump-target--item" role="button" tabIndex={0} key={`${item.organization}-${index}`} onClick={() => onNavigate?.(sectionKey, index, language)} onKeyDown={(event) => handlePreviewActivate(event, () => onNavigate?.(sectionKey, index, language))}>
          <PreviewMoveButtons onMoveUp={(event) => { event.stopPropagation(); onMoveItem?.(language, sectionKey, index, -1); }} onMoveDown={(event) => { event.stopPropagation(); onMoveItem?.(language, sectionKey, index, 1); }} disableUp={index === 0} disableDown={index === items.length - 1} />
          <div className="timeline-item__meta">
            <div className="timeline-item__date">{item.date}</div>
            {item.location ? <div className="timeline-item__location">{item.location}</div> : null}
          </div>
          <div className="timeline-item__content">
            <h3 className="timeline-item__title">{item.organization}</h3>
            <p className="timeline-item__subtitle">{item.role}</p>
            <ul className="bullet-list">
              {item.bullets.map((bullet, bulletIndex) => <li key={`${index}-${bulletIndex}`}>{bullet}</li>)}
            </ul>
          </div>
        </article>
      ))}
    </div>
  );
}

function ProjectsPreview({ items, rtl, language, sectionKey, onNavigate, onMoveItem }) {
  return (
    <div className="timeline">
      {items.map((item, index) => (
        <article className="timeline-item preview-jump-target preview-jump-target--item" role="button" tabIndex={0} key={`${item.title}-${index}`} onClick={() => onNavigate?.(sectionKey, index, language)} onKeyDown={(event) => handlePreviewActivate(event, () => onNavigate?.(sectionKey, index, language))}>
          <PreviewMoveButtons onMoveUp={(event) => { event.stopPropagation(); onMoveItem?.(language, sectionKey, index, -1); }} onMoveDown={(event) => { event.stopPropagation(); onMoveItem?.(language, sectionKey, index, 1); }} disableUp={index === 0} disableDown={index === items.length - 1} />
          <div className="timeline-item__meta">
            <div className="timeline-item__date">{item.date}</div>
          </div>
          <div className="timeline-item__content">
            <h3 className="timeline-item__title">{item.title}</h3>
            {item.linkHref ? <a className="timeline-item__link" href={item.linkHref} target="_blank" rel="noreferrer">{item.linkLabel || item.linkHref}</a> : null}
            <ul className="bullet-list">
              {item.bullets.map((bullet, bulletIndex) => <li key={`${index}-${bulletIndex}`}>{bullet}</li>)}
            </ul>
          </div>
        </article>
      ))}
    </div>
  );
}

function EducationPreview({ items, rtl, language, sectionKey, onNavigate, onMoveItem }) {
  return (
    <div className="timeline">
      {items.map((item, index) => (
        <article className="timeline-item preview-jump-target preview-jump-target--item" role="button" tabIndex={0} key={`${item.degree}-${index}`} onClick={() => onNavigate?.(sectionKey, index, language)} onKeyDown={(event) => handlePreviewActivate(event, () => onNavigate?.(sectionKey, index, language))}>
          <PreviewMoveButtons onMoveUp={(event) => { event.stopPropagation(); onMoveItem?.(language, sectionKey, index, -1); }} onMoveDown={(event) => { event.stopPropagation(); onMoveItem?.(language, sectionKey, index, 1); }} disableUp={index === 0} disableDown={index === items.length - 1} />
          <div className="timeline-item__meta">
            <div className="timeline-item__date">{item.date}</div>
            {item.location ? <div className="timeline-item__location">{item.location}</div> : null}
          </div>
          <div className="timeline-item__content">
            <h3 className="timeline-item__title">{item.degree}</h3>
            <p className="timeline-item__subtitle">{item.institution}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function CertificatesPreview({ items, rtl, language, sectionKey, onNavigate, onMoveItem }) {
  return (
    <div className="certificate-list">
      {items.map((item, index) => (
        <article className={`certificate-card ${rtl ? "certificate-card--stacked" : ""} preview-jump-target preview-jump-target--item`} role="button" tabIndex={0} key={`${item.title}-${index}`} onClick={() => onNavigate?.(sectionKey, index, language)} onKeyDown={(event) => handlePreviewActivate(event, () => onNavigate?.(sectionKey, index, language))}>
          <PreviewMoveButtons onMoveUp={(event) => { event.stopPropagation(); onMoveItem?.(language, sectionKey, index, -1); }} onMoveDown={(event) => { event.stopPropagation(); onMoveItem?.(language, sectionKey, index, 1); }} disableUp={index === 0} disableDown={index === items.length - 1} />
          {rtl ? (
            <>
              <p className="certificate-card__title" dir="ltr">
                <strong>{splitCertificateTitle(item.title).title}</strong>
                {splitCertificateTitle(item.title).date ? <span className="certificate-card__date">{splitCertificateTitle(item.title).date}</span> : null}
              </p>
              <p className="certificate-card__description">{item.description}</p>
            </>
          ) : (
            <p className="certificate-card__text">
              <strong>{item.title}</strong>
              <span className="certificate-card__dash"> - </span>
              <span>{item.description}</span>
            </p>
          )}
        </article>
      ))}
    </div>
  );
}

function SkillsPreview({ items, language, sectionKey, onNavigate, onMoveItem }) {
  return (
    <ul className="skill-list technical-skill-list">
      {items.map((item, index) => (
        <li className="skill-list__item preview-jump-target preview-jump-target--item" role="button" tabIndex={0} key={`${item.label}-${index}`} onClick={() => onNavigate?.(sectionKey, index, language)} onKeyDown={(event) => handlePreviewActivate(event, () => onNavigate?.(sectionKey, index, language))}>
          <PreviewMoveButtons onMoveUp={(event) => { event.stopPropagation(); onMoveItem?.(language, sectionKey, index, -1); }} onMoveDown={(event) => { event.stopPropagation(); onMoveItem?.(language, sectionKey, index, 1); }} disableUp={index === 0} disableDown={index === items.length - 1} />
          <strong>{item.label}:</strong> {item.items}
        </li>
      ))}
    </ul>
  );
}

function SoftSkillsPreview({ items, language, sectionKey, onNavigate, onMoveItem }) {
  const rows = [];
  for (let index = 0; index < items.length; index += 2) {
    rows.push([items[index] || "", items[index + 1] || ""]);
  }
  return (
    <section className="soft-skills-panel">
      <table className="soft-skill-table">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr className="soft-skill-row" key={`soft-row-${rowIndex}`}>
              {row.map((item, cellIndex) => (
                <td className="soft-skill-cell" key={`soft-cell-${rowIndex}-${cellIndex}`}>
                  <ul className="soft-skill-list">
                    {item ? (
                      <li className="soft-skill-item preview-jump-target preview-jump-target--item" role="button" tabIndex={0} onClick={() => onNavigate?.(sectionKey, rowIndex * 2 + cellIndex, language)} onKeyDown={(event) => handlePreviewActivate(event, () => onNavigate?.(sectionKey, rowIndex * 2 + cellIndex, language))}>
                        <PreviewMoveButtons onMoveUp={(event) => { event.stopPropagation(); onMoveItem?.(language, sectionKey, rowIndex * 2 + cellIndex, -1); }} onMoveDown={(event) => { event.stopPropagation(); onMoveItem?.(language, sectionKey, rowIndex * 2 + cellIndex, 1); }} disableUp={rowIndex * 2 + cellIndex === 0} disableDown={rowIndex * 2 + cellIndex === items.length - 1} />
                        {item}
                      </li>
                    ) : null}
                  </ul>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PreviewSection({ title, children, sectionKey, sectionIndex, totalSections, onNavigate, onMoveSection, language }) {
  return (
    <section className="preview-section preview-jump-target preview-jump-target--section" role="button" tabIndex={0} onClick={() => onNavigate?.(sectionKey, null, language)} onKeyDown={(event) => handlePreviewActivate(event, () => onNavigate?.(sectionKey, null, language))}>
      <PreviewMoveButtons onMoveUp={(event) => { event.stopPropagation(); onMoveSection?.(sectionKey, -1); }} onMoveDown={(event) => { event.stopPropagation(); onMoveSection?.(sectionKey, 1); }} disableUp={sectionIndex <= 0} disableDown={sectionIndex >= totalSections - 1} />
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}

function PreviewMoveButtons({ onMoveUp, onMoveDown, disableUp = false, disableDown = false }) {
  return (
    <div className="preview-move-buttons">
      <button type="button" className="preview-move-button" aria-label="Move up" title="Move up" onClick={onMoveUp} disabled={disableUp}>
        <GlyphIcon name="moveUp" />
      </button>
      <button type="button" className="preview-move-button" aria-label="Move down" title="Move down" onClick={onMoveDown} disabled={disableDown}>
        <GlyphIcon name="moveDown" />
      </button>
    </div>
  );
}

function handlePreviewActivate(event, action) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

function splitCertificateTitle(title) {
  const match = String(title || "").match(/^(.*?)(?:\s*\|\s*(\d{4}))$/);
  return {
    title: match ? match[1].trim() : String(title || "").trim(),
    date: match ? match[2].trim() : ""
  };
}

function ContactItem({ type, label, href, isStatic = false }) {
  if (!String(label || "").trim()) {
    return null;
  }

  const icon = CONTACT_ICONS[type];
  const isLtr = ["email", "phone", "linkedin", "github", "portfolio"].includes(type);
  const content = isStatic || !href
    ? <span className={`contact-item__label contact-item__label--${type}`} dir={isLtr ? "ltr" : "auto"}>{label}</span>
    : (
        <a className={`contact-item__label contact-item__label--${type}`} href={href} target={["linkedin", "github", "portfolio"].includes(type) ? "_blank" : "_self"} rel="noreferrer" dir={isLtr ? "ltr" : "auto"}>
          {label}
        </a>
      );

  return (
    <span className={`contact-item contact-item--${type}`}>
      {icon ? <span className="contact-item__icon" aria-hidden="true">{icon}</span> : null}
      {content}
    </span>
  );
}

const CONTACT_ICONS = {
  email: <svg viewBox="0 0 24 24"><path d="M3 6.75A1.75 1.75 0 0 1 4.75 5h14.5C20.22 5 21 5.78 21 6.75v10.5A1.75 1.75 0 0 1 19.25 19H4.75A1.75 1.75 0 0 1 3 17.25V6.75Zm1.9-.25L12 11.72l7.1-5.22H4.9Zm14.6 11V8.38l-7.06 5.2a.75.75 0 0 1-.88 0L4.5 8.38v9.12h15Z" /></svg>,
  phone: <svg viewBox="0 0 24 24"><path d="M7.12 3.25c.4 0 .77.23.94.6l1.34 2.98a1.5 1.5 0 0 1-.22 1.56L7.94 9.86a14.8 14.8 0 0 0 6.2 6.2l1.47-1.24a1.5 1.5 0 0 1 1.56-.22l2.98 1.34c.37.17.6.54.6.94v2.13c0 .83-.67 1.5-1.5 1.5C9.72 20.5 3.5 14.28 3.5 6.88c0-.83.67-1.5 1.5-1.5h2.12Z" /></svg>,
  location: <svg viewBox="0 0 24 24"><path d="M12 21c-.24 0-.47-.1-.64-.28C10.5 19.86 5 14.05 5 9.5a7 7 0 1 1 14 0c0 4.55-5.5 10.36-6.36 11.22A.9.9 0 0 1 12 21Zm0-16.5A5.5 5.5 0 0 0 6.5 9.5c0 3.2 3.61 7.63 5.5 9.6 1.89-1.97 5.5-6.4 5.5-9.6A5.5 5.5 0 0 0 12 4.5Zm0 7.25a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5Z" /></svg>,
  github: <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.59 2 12.25c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.88-2.78.62-3.37-1.2-3.37-1.2-.45-1.2-1.11-1.52-1.11-1.52-.9-.64.07-.63.07-.63 1 .08 1.53 1.05 1.53 1.05.88 1.56 2.3 1.11 2.86.85.09-.66.34-1.11.62-1.36-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.74 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.84a9.3 9.3 0 0 1 2.5.35c1.9-1.33 2.74-1.05 2.74-1.05.56 1.43.21 2.48.11 2.74.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.95.68 1.92 0 1.39-.01 2.5-.01 2.84 0 .27.18.6.69.49A10.2 10.2 0 0 0 22 12.25C22 6.59 17.52 2 12 2Z" /></svg>,
  linkedin: <svg viewBox="0 0 24 24"><path d="M6.45 8.5a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6ZM4.9 19V9.8H8V19H4.9Zm5.08 0V9.8h2.97v1.25h.04c.41-.78 1.42-1.6 2.92-1.6 3.12 0 3.7 2.05 3.7 4.71V19h-3.1v-4.3c0-1.02-.02-2.34-1.42-2.34-1.42 0-1.64 1.1-1.64 2.27V19H9.98Z" /></svg>,
  portfolio: <svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm6.92 8h-3.01a14.3 14.3 0 0 0-1.25-4.27A7.53 7.53 0 0 1 18.92 11Zm-6.17-5.38c.78.92 1.58 2.8 1.88 5.38h-5.26c.3-2.58 1.1-4.46 1.88-5.38.24-.28.48-.45.75-.45s.51.17.75.45ZM9.34 6.73A14.3 14.3 0 0 0 8.09 11H5.08a7.53 7.53 0 0 1 4.26-4.27ZM4.58 13h3.31c.08 1.56.42 3.02.94 4.27A7.53 7.53 0 0 1 4.58 13Zm4.79 0h5.26c-.3 2.58-1.1 4.46-1.88 5.38-.24.28-.48.45-.75.45s-.51-.17-.75-.45c-.78-.92-1.58-2.8-1.88-5.38Zm6.8 4.27c.52-1.25.86-2.71.94-4.27h3.31a7.53 7.53 0 0 1-4.25 4.27Z" /></svg>
};

function PresetSummary({ preset, t }) {
  const tokens = preset === "refined" ? REFINED_STYLE_TOKENS : DEFAULT_STYLE_TOKENS;
  const rows = [
    ["fontFamily", t.style.fontFamily],
    ["nameSize", t.style.nameSize],
    ["headingSize", t.style.headingSize],
    ["bodySize", t.style.bodySize],
    ["contactSize", t.style.contactSize],
    ["lineHeight", t.style.lineHeight]
  ];
  return (
    <div className="compare-grid">
      {["en", "ar"].map((lang) => (
        <div className="review-card" key={lang}>
          <strong>{lang === "en" ? t.languages.en : t.languages.ar}</strong>
          <div className="token-list">
            {rows.map(([key, label]) => (
              <div className="token-list__row" key={key}>
                <span>{label}</span>
                <strong>{String(tokens[lang][key])}</strong>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScoreRow({ title, scores }) {
  return (
    <SectionCard title={title}>
      <div className="score-grid">
        {Object.entries(scores || {}).map(([key, value]) => (
          <article className="score-card" key={key}>
            <strong>{formatScoreLabel(key)}</strong>
            <span>{value}/10</span>
          </article>
        ))}
      </div>
    </SectionCard>
  );
}

function SectionCard({ title, description, children, sectionKey = "", itemIndex = null }) {
  return (
    <section className="panel-card" data-editor-section={sectionKey || undefined} data-editor-index={itemIndex == null ? undefined : itemIndex}>
      <div className="panel-card__header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      </div>
      <div className="panel-card__body">{children}</div>
    </section>
  );
}

function SmallSelect({ label, value, onChange, options }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function InputField({ label, value, onChange, type = "text" }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input type={type} value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextAreaField({ label, value, onChange, rows = 4 }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <textarea rows={rows} value={value || ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function InlineRow({ children, sectionKey = "", itemIndex = null }) {
  return <div className="inline-row" data-editor-section={sectionKey || undefined} data-editor-index={itemIndex == null ? undefined : itemIndex}>{children}</div>;
}

function StatusNotice({ children }) {
  return <div className="status-notice">{children}</div>;
}

function BulletTextList({ items = [] }) {
  if (!items.length) {
    return <p>-</p>;
  }
  return <ul className="plain-list">{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul>;
}

function BulletReviewItems({ items = [] }) {
  if (!items.length) {
    return <p>-</p>;
  }
  return (
    <div className="stack">
      {items.map((item, index) => (
        <div className="review-card" key={`${item.title}-${index}`}>
          <strong>{item.title}</strong>
          <p>{item.message}</p>
        </div>
      ))}
    </div>
  );
}

function PreviewJson({ title, data }) {
  return (
    <div className="review-card">
      <strong>{title}</strong>
      <pre className="compare-block">{data ? JSON.stringify(data, null, 2) : "-"}</pre>
    </div>
  );
}

function MultiSelectChecklist({ label, values, onToggle, options }) {
  return (
    <fieldset className="field">
      <legend className="field-label">{label}</legend>
      <div className="multi-checks">
        {options.map((option) => (
          <label className="checkbox-pill" key={option}>
            <input type="checkbox" checked={values.includes(option)} onChange={() => onToggle(option)} />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function formatScoreLabel(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
}

function localizeSkillLabel(label, targetLanguage) {
  const map = {
    "Platform & Web": { ar: "المنصات والويب", en: "Platform & Web" },
    "Programming & Data": { ar: "البرمجة والبيانات", en: "Programming & Data" },
    "Cloud & DevOps": { ar: "السحابة وDevOps", en: "Cloud & DevOps" },
    "Security & IT Ops": { ar: "الأمن وعمليات تقنية المعلومات", en: "Security & IT Ops" },
    "Tools & Collaboration": { ar: "الأدوات والتعاون", en: "Tools & Collaboration" }
  };
  return map[label]?.[targetLanguage] || label;
}

function buildSyncSourcePayload(source, keys) {
  const payload = {};
  keys.forEach((key) => {
    if (key === "summary") {
      payload.summary = source.summary;
    } else if (key === "coverLetter") {
      payload.coverLetter = source.coverLetter;
    } else {
      payload[key] = source.sections[key];
    }
  });
  return payload;
}

function buildCommandPreview(command, content, sections, resume, lang) {
  const text = String(command || "").trim().toLowerCase();
  const updates = {};
  const replaceIntent = /(replace|overwrite|use only|keep only|from scratch|start over|remove (the )?old|remove old ones|remove existing|clear old)/i.test(text);
  const clearIntent = /\bclear\b/i.test(text);
  const source = resume.languages[lang];

  sections.forEach((key) => {
    if (key === "summary") {
      if (clearIntent) {
        updates.summary = "";
      } else if (content.trim()) {
        updates.summary = content.trim();
      }
    } else if (key === "skills") {
      const groups = parseSkillGroups(content || command);
      if (groups.length) {
        updates.skills = replaceIntent ? groups : [...source.sections.skills, ...groups];
      }
    } else if (key === "softSkills") {
      const list = splitLinesOrComma(content || command);
      if (list.length) {
        updates.softSkills = replaceIntent ? list : [...source.sections.softSkills, ...list];
      } else if (clearIntent) {
        updates.softSkills = [];
      }
    } else if (key === "certificates") {
      const certificates = parseCertificates(content || command);
      if (certificates.length) {
        updates.certificates = replaceIntent ? certificates : [...source.sections.certificates, ...certificates];
      }
    } else if (["experience", "internships", "projects", "education"].includes(key)) {
      const parsed = parseStructuredBlocks(content, key);
      if (parsed.length) {
        updates[key] = replaceIntent ? parsed : [...source.sections[key], ...parsed];
      }
    } else if (key === "coverLetter") {
      if (content.trim()) {
        updates.coverLetter = { ...source.coverLetter, body: content.trim() };
      }
    }
  });

  return {
    updates,
    note: Object.keys(updates).length ? "Command preview ready." : "No deterministic changes were detected from this command."
  };
}

function parseSkillGroups(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(":");
      if (parts.length < 2) {
        return null;
      }
      return { label: parts.shift().trim(), items: parts.join(":").trim() };
    })
    .filter(Boolean);
}

function parseCertificates(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+\|\s+|\s+-\s+/);
      return { title: parts[0] || "", description: parts.slice(1).join(" - ") };
    });
}

function parseStructuredBlocks(raw, key) {
  const blocks = String(raw || "").split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const bullets = lines.filter((line) => /^[-•]/.test(line)).map((line) => line.replace(/^[-•]\s*/, ""));
    const content = lines.filter((line) => !/^[-•]/.test(line));
    if (key === "education") {
      return { date: content[0] || "", degree: content[1] || "", institution: content[2] || "", location: content[3] || "" };
    }
    if (key === "projects") {
      return { date: content[0] || "", title: content[1] || "", linkLabel: content[2] || "", linkHref: content[3] || "", bullets };
    }
    return { date: content[0] || "", role: content[1] || "", organization: content[2] || "", location: content[3] || "", bullets };
  });
}

function splitLinesOrComma(raw) {
  return String(raw || "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function createCoverLetterPlainText(letter) {
  return [
    letter.recipientName || letter.hiringManager,
    letter.company,
    letter.targetRole,
    "",
    letter.opening,
    "",
    letter.body,
    "",
    letter.closing,
    "",
    letter.signatureName
  ].filter((line) => line !== undefined && line !== null).join("\n");
}

function downloadFile(fileName, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
