(function () {
  const sourceData = window.resumeData;
  const documentLanguage = sourceData.meta?.lang || "en";
  const draftStorageKey = `resume-editor-draft:${documentLanguage}`;
  const versionsStorageKey = `resume-editor-versions:${documentLanguage}`;
  const legacyPresetsStorageKey = `resume-editor-presets:${documentLanguage}`;
  const atsStorageKey = `resume-editor-ats:${documentLanguage}`;
  const aiConfigStorageKey = "resume-editor-ai-config";
  const previewZoomStorageKey = `resume-editor-preview-zoom:${documentLanguage}`;
  const runtimeConfig = normalizeRuntimeConfig(window.resumeRuntimeConfig || {});
  const pdfHelperOrigin = resolveHelperOrigin();
  const runningLocally = isLocalRuntime();
  const defaultPreviewZoom = 100;
  const previewZoomStep = 5;
  const minPreviewZoom = 70;
  const maxPreviewZoom = 150;
  const stylePresetChoices = ["default", "refined"];
  const linkedLanguages = ["en", "ar"];
  const trackedTranslationSections = [
    "profile",
    "summary",
    "professionalExperience",
    "internships",
    "projects",
    "education",
    "certificates",
    "skills",
    "softSkills",
    "coverLetter"
  ];
  const builtInResumeSectionKeys = [
    "profile",
    "summary",
    "professionalExperience",
    "internships",
    "projects",
    "education",
    "certificates",
    "skills",
    "softSkills"
  ];
  const customSectionLayouts = ["single-list", "two-column-list", "certificate-cards"];
  const forcedDocumentMode = window.resumeDocumentMode === "cover-letter" ? "cover-letter" : "resume";
  const printLayoutRequested = new URLSearchParams(window.location.search).get("print") === "1";
  const initialDraft = loadDraftData();
  const state = {
    data: normalizeResumeData(initialDraft?.data || sourceData),
    activeSection: getInitialSection(initialDraft?.activeSection),
    documentMode: forcedDocumentMode === "cover-letter"
      ? "cover-letter"
      : normalizeDocumentMode(initialDraft?.documentMode, initialDraft?.activeSection || getInitialSection()),
    lastResumeSection: normalizeResumeSection(initialDraft?.lastResumeSection || getInitialSection()),
    editorOpen: true,
    draft: {
      status: initialDraft ? "restored" : "clean",
      lastSavedAt: initialDraft?.savedAt || 0,
      hasLocalDraft: Boolean(initialDraft)
    },
    targeting: normalizeTargeting(initialDraft?.targeting),
    presets: loadStoredPresets(),
    selectedPresetId: getLinkedVersionQueryId() || initialDraft?.selectedPresetId || "",
    ats: {
      jobDescription: initialDraft?.atsJobDescription || loadAtsDraft(),
      analysis: null
    },
    quality: {
      analysis: null,
      activeHighlight: null
    },
    ai: loadAiConfig(),
    aiReviews: {
      quality: createAiReviewState(),
      ats: createAiReviewState(),
      hr: createAiReviewState()
    },
    pdf: {
      ready: false,
      checking: false,
      message: ""
    },
    pdfImport: {
      loading: false,
      review: null,
      error: "",
      dragActive: false
    },
    coverLetter: createEmptyCoverLetter(),
    coverLetterAssistant: {
      loading: false,
      suggestion: null,
      error: ""
    },
    translation: {
      loading: false,
      review: null,
      error: "",
      message: "",
      currentOverrides: {}
    },
    help: {
      overrideLabel: "",
      overrideText: ""
    },
    command: {
      entries: {},
      workspace: createCommandWorkspaceState()
    },
    preview: {
      zoom: loadPreviewZoom()
    },
    previewFocus: null,
    rewriter: {
      entries: {}
    },
    history: {
      undoStack: [],
      redoStack: [],
      pendingSnapshot: null
    }
  };

  ensureDefaultArabicBestVersion();

  const WEAK_ACTION_VERB_RULES = [
    { pattern: /^(supported|supporting|provided|providing)\b/i, suggestion: "Delivered" },
    { pattern: /^(assisted|helped)\b/i, suggestion: "Resolved" },
    { pattern: /^(participated|collaborated|worked)\b/i, suggestion: "Built" },
    { pattern: /^(contributed)\b/i, suggestion: "Developed" },
    { pattern: /^(responsible|tasked|involved)\b/i, suggestion: "Led" }
  ];

  const GENERIC_SUMMARY_PHRASES = [
    "hands-on experience",
    "good knowledge of",
    "familiar with",
    "modern web applications",
    "user-focused solutions",
    "strong problem-solving",
    "known for",
    "results-driven",
    "dynamic professional",
    "hardworking",
    "fast learner",
    "team player",
    "excellent communication"
  ];
  const importedSectionKeys = [
    "profile",
    "summary",
    "professionalExperience",
    "internships",
    "projects",
    "education",
    "certificates",
    "skills",
    "softSkills"
  ];
  const importedSectionHeadings = {
    "professional summary": "summary",
    "summary": "summary",
    "professional experience": "professionalExperience",
    "internship experience": "internships",
    "internships": "internships",
    "projects": "projects",
    "education": "education",
    "certifications": "certificates",
    "certificates": "certificates",
    "core skills": "skills",
    "skills": "skills",
    "soft skills": "softSkills"
  };
  const importedDatePattern = /^(?:(?:\d{2}|\d{1,2})\/\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4})\s*-\s*(?:Present|Current|(?:\d{2}|\d{1,2})\/\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4})$/i;
  const importedEmailPattern = /[\w.+-]+@[\w.-]+\.\w+/;
  const importedPhonePattern = /\+?\d[\d\s()\-]{7,}/;
  const importedUrlPattern = /(https?:\/\/\S+|(?:linkedin|github)\.com\/\S+)/i;

  function isLocalRuntime() {
    const host = String(window.location.hostname || "").toLowerCase();
    const protocol = String(window.location.protocol || "").toLowerCase();
    return protocol === "file:" || host === "127.0.0.1" || host === "localhost";
  }

  function normalizeRuntimeConfig(value) {
    const input = value && typeof value === "object" ? value : {};
    return {
      apiOrigin: String(input.apiOrigin || "").trim().replace(/\/+$/, ""),
      mode: String(input.mode || "auto").trim().toLowerCase(),
      savePdfBehavior: String(input.savePdfBehavior || "").trim().toLowerCase() || "print",
      hostedPdfImport: input.hostedPdfImport === false ? false : true
    };
  }

  function resolveHelperOrigin() {
    if (isLocalRuntime()) {
      return "http://127.0.0.1:8767";
    }
    return runtimeConfig.apiOrigin || "";
  }

  function canReachHostedApi() {
    return Boolean(!runningLocally && pdfHelperOrigin);
  }

  function canUseDirectPdfExport() {
    if (runningLocally) {
      return true;
    }
    return runtimeConfig.savePdfBehavior === "helper" && Boolean(pdfHelperOrigin);
  }

  const GENERIC_BULLET_PHRASES = [
    "responsible for",
    "worked on",
    "helped with",
    "assisted with",
    "participated in",
    "involved in",
    "good knowledge of",
    "familiar with",
    "contributed to",
    "cross-functional development activities",
    "technical problem-solving",
    "user-focused solutions",
    "modern web applications",
    "excellent communication"
  ];

  const STRONG_ACTION_VERBS = new Set([
    "achieved", "analyzed", "automated", "built", "configured", "coordinated", "created", "defined",
    "delivered", "designed", "developed", "diagnosed", "drove", "enhanced", "established", "executed",
    "generated", "hardened", "implemented", "improved", "increased", "investigated", "launched",
    "led", "maintained", "managed", "monitored", "optimized", "reduced", "resolved", "secured",
    "streamlined", "strengthened", "standardized", "supported"
  ]);

  const IMPACT_KEYWORDS = [
    "accuracy", "availability", "compliance", "coverage", "efficiency", "performance", "reliability",
    "response time", "scalability", "security", "stability", "uptime", "user experience", "visibility",
    "workflow", "operations", "risk", "automation", "delivery", "maintainability"
  ];

  const SOFT_SKILL_PHRASES = [
    "communication", "teamwork", "collaboration", "leadership", "problem solving", "stakeholder management",
    "adaptability", "time management", "mentoring", "ownership", "attention to detail"
  ];

  const DOMAIN_KEYWORDS = {
    "web development": ["frontend", "backend", "javascript", "typescript", "react", "node", "api", "web", "firebase", "html", "css"],
    cybersecurity: ["security", "siem", "incident", "threat", "log", "honeypot", "ids", "ips", "forensics", "vulnerability", "splunk", "sentinel"],
    "it support": ["support", "troubleshooting", "ticket", "hardware", "software", "device", "endpoint", "help desk", "network"],
    cloud: ["cloud", "azure", "aws", "gcp", "deployment", "vmware", "virtualbox", "infrastructure"],
    data: ["sql", "database", "analytics", "analysis", "reporting", "dashboard", "data"],
    devops: ["ci/cd", "deployment", "pipeline", "automation", "monitoring", "infrastructure", "docker", "kubernetes"]
  };

  const ROLE_HINT_PATTERNS = [
    { label: "Cybersecurity", pattern: /\b(cybersecurity|security analyst|soc|incident response|threat)\b/i },
    { label: "IT Support", pattern: /\b(it support|technical support|help desk|support specialist|system support)\b/i },
    { label: "Full-Stack Development", pattern: /\b(full[- ]stack|frontend|backend|web developer|software engineer|application developer)\b/i },
    { label: "Cloud / Infrastructure", pattern: /\b(cloud|azure|aws|infrastructure|systems engineer)\b/i }
  ];

  // Analysis constants must exist before the initial ATS/Quality render runs.
  const ENGLISH_SHORT_KEYWORDS = new Set([
    "ai",
    "api",
    "aws",
    "css",
    "c#",
    "c++",
    "db",
    "go",
    "it",
    "ml",
    "qa",
    "seo",
    "sql",
    "ui",
    "ux"
  ]);

  const ENGLISH_STOPWORDS = new Set([
    "about",
    "across",
    "after",
    "also",
    "and",
    "any",
    "are",
    "around",
    "been",
    "best",
    "both",
    "candidate",
    "company",
    "current",
    "currently",
    "deliver",
    "delivering",
    "development",
    "each",
    "ensure",
    "experience",
    "experienced",
    "from",
    "have",
    "into",
    "join",
    "knowledge",
    "looking",
    "management",
    "must",
    "need",
    "our",
    "role",
    "seeking",
    "skills",
    "solutions",
    "strong",
    "such",
    "that",
    "their",
    "them",
    "they",
    "this",
    "through",
    "using",
    "well",
    "will",
    "with",
    "work",
    "worked",
    "working",
    "years",
    "your"
  ]);

  const ARABIC_STOPWORDS = new Set([
    "\u0623\u0648",
    "\u0625\u0644\u0649",
    "\u0627\u0630\u0627",
    "\u0627\u0644\u062a\u064a",
    "\u0627\u0644\u0630\u064a",
    "\u0627\u0644\u0645\u0637\u0644\u0648\u0628",
    "\u0627\u0644\u0648\u0638\u064a\u0641\u0629",
    "\u0627\u0644\u0645\u0647\u0627\u0645",
    "\u0627\u0644\u062e\u0628\u0631\u0629",
    "\u0627\u0644\u062e\u0628\u0631\u0627\u062a",
    "\u0627\u0644\u0639\u0645\u0644",
    "\u0627\u0644\u0642\u062f\u0631\u0629",
    "\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062a",
    "\u0627\u0644\u0634\u0631\u0643\u0629",
    "\u0627\u0644\u0641\u0631\u064a\u0642",
    "\u0628\u064a\u0646",
    "\u0628\u0639\u062f",
    "\u0628\u0634\u0643\u0644",
    "\u0628\u0647\u0627",
    "\u0628\u0647",
    "\u062a\u0645",
    "\u062b\u0645",
    "\u062d\u0648\u0644",
    "\u062d\u064a\u062b",
    "\u0636\u0645\u0646",
    "\u0639\u0644\u0649",
    "\u0639\u0646",
    "\u0641\u064a",
    "\u0644\u062f\u0649",
    "\u0645\u0639",
    "\u0645\u0647\u0645",
    "\u0645\u0647\u0627\u0631\u0629",
    "\u0647\u0630\u0627",
    "\u0647\u0630\u0647",
    "\u0648",
    "\u0648\u0645\u0639",
    "\u064a\u062c\u0628",
    "\u064a\u0643\u0648\u0646"
  ]);


  const root = document.getElementById("resume");
  const editorSidebar = document.getElementById("editorSidebar");
  const printButton = document.getElementById("printPdfButton");
  const printHint = document.getElementById("printPdfHint");
  const switchEnglish = document.getElementById("switchEnglish");
  const switchArabic = document.getElementById("switchArabic");
  const toggleEditorButton = document.getElementById("toggleEditorButton");
  const importDataButton = document.getElementById("importDataButton");
  const exportDataButton = document.getElementById("exportDataButton");
  const saveLivePdfButton = document.getElementById("saveLivePdfButton");
  const importDataInput = document.getElementById("importDataInput");
  const zoomOutButton = document.getElementById("zoomOutButton");
  const zoomResetButton = document.getElementById("zoomResetButton");
  const zoomInButton = document.getElementById("zoomInButton");
  const toolbarRoot = document.querySelector(".screen-toolbar");
  const locale = applyLocaleDefaults(buildLocale(documentLanguage), documentLanguage);
  state.coverLetter = normalizeCoverLetter(
    window.resumeCoverLetterData || getPresetById(state.presets, state.selectedPresetId)?.coverLetter,
    state.data.profile?.name
  );
  state.translation.currentOverrides = normalizeManualOverrides(
    initialDraft?.manualOverrides || getPresetById(state.presets, state.selectedPresetId)?.manualOverrides
  );
  if (forcedDocumentMode === "cover-letter" || state.documentMode === "cover-letter") {
    state.activeSection = "coverLetter";
  } else {
    state.activeSection = normalizeResumeSection(state.activeSection);
    state.lastResumeSection = normalizeResumeSection(state.activeSection || state.lastResumeSection);
  }
  if (getLinkedVersionQueryId()) {
    const linkedPreset = getSelectedPreset();
    if (linkedPreset) {
      state.data = normalizeResumeData(linkedPreset.data, buildResumeTemplateForLanguage(documentLanguage));
      state.targeting = normalizeTargeting(linkedPreset);
      state.ats.jobDescription = linkedPreset.jobDescription || "";
      state.coverLetter = normalizeCoverLetter(linkedPreset.coverLetter, linkedPreset.data?.profile?.name);
      state.translation.currentOverrides = normalizeManualOverrides(linkedPreset.manualOverrides);
    }
  }

  let renderTimer = 0;
  let previewTimer = 0;
  let draftTimer = 0;
  let atsTimer = 0;
  let qualityTimer = 0;
  let qualityHighlightTimer = 0;
  let historyTimer = 0;
  let editorFocusTimer = 0;
  let editorFocusFrame = 0;
  let atsResultsHost = null;
  let qualityResultsHost = null;
  let atsTextarea = null;
  let draftStatusHost = null;
  let draftSavedAtHost = null;
  let undoButtonHost = null;
  let redoButtonHost = null;
  let documentModeToggleHost = null;
  let translationPanelHost = null;
  let contextualHelpTitleHost = null;
  let contextualHelpTextHost = null;
  let dragState = null;
  let previewDragState = null;
  let previewDropTarget = null;
  let previewDragSuppressUntil = 0;
  let nextArrayId = 1;
  const arrayIds = new WeakMap();

  initializeDocument();
  bindToolbar();
  updateAtsAnalysis();
  updateQualityAnalysis();
  renderEditor();
  renderPreview();

  window.addEventListener("resize", debounce(handleResize, 120));
  window.addEventListener("beforeprint", handleBeforePrint);
  window.addEventListener("afterprint", handleAfterPrint);

  if (window.matchMedia) {
    const mediaQuery = window.matchMedia("print");
    const onPrintChange = (event) => {
      if (event.matches) {
        handleBeforePrint();
      } else {
        handleAfterPrint();
      }
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onPrintChange);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(onPrintChange);
    }
  }

  function initializeDocument() {
    if (state.data.meta) {
      document.documentElement.lang = state.data.meta.lang || "en";
      document.documentElement.dir = state.data.meta.dir || "ltr";
      if (forcedDocumentMode !== "cover-letter" && state.documentMode !== "cover-letter") {
        document.title = state.data.meta.documentTitle || document.title;
      }
    }

    applyStylePreset();

    if (printButton) {
      printButton.textContent = state.data.ui?.printButton || locale.printButton;
    }

    if (printHint) {
      printHint.textContent = state.data.ui?.printHint || locale.printHint;
    }

    if (switchEnglish) {
      switchEnglish.textContent = state.data.ui?.switchEnglish || locale.switchEnglish;
    }

    if (switchArabic) {
      switchArabic.textContent = state.data.ui?.switchArabic || locale.switchArabic;
    }

    if (importDataButton) {
      importDataButton.textContent = locale.importData;
    }

    if (exportDataButton) {
      exportDataButton.textContent = locale.exportData;
    }

    if (saveLivePdfButton) {
      saveLivePdfButton.textContent = locale.savePdfNow;
    }

    ensureDocumentModeToggle();
    syncDocumentModeToggle();
    syncLanguageSwitcher();
    handleResize();
    updateToggleButton();
    syncPdfHelperDisplay();
    initializeContextualHelp();
    applyPreviewZoom();
  }

  function bindToolbar() {
    if (printButton) {
      printButton.addEventListener("click", () => {
        handleBeforePrint();
        window.setTimeout(() => window.print(), 60);
      });
    }

    if (toggleEditorButton) {
      toggleEditorButton.addEventListener("click", () => {
        state.editorOpen = !state.editorOpen;
        syncEditorState();
      });
    }

    if (importDataButton && importDataInput) {
      importDataButton.addEventListener("click", () => importDataInput.click());
      importDataInput.addEventListener("change", handleImportData);
    }

    if (exportDataButton) {
      exportDataButton.addEventListener("click", handleExportData);
    }

    if (saveLivePdfButton) {
      saveLivePdfButton.addEventListener("click", () => handleLivePdfExport());
    }

    if (zoomOutButton) {
      zoomOutButton.addEventListener("click", () => changePreviewZoom(-previewZoomStep));
    }

    if (zoomResetButton) {
      zoomResetButton.addEventListener("click", resetPreviewZoom);
    }

    if (zoomInButton) {
      zoomInButton.addEventListener("click", () => changePreviewZoom(previewZoomStep));
    }

    document.addEventListener("input", handleDerivedVersionInput, true);
    document.addEventListener("keydown", handleHistoryShortcut);
    if (root) {
      root.addEventListener("click", handlePreviewNavigationClick);
      root.addEventListener("keydown", handlePreviewNavigationKeydown);
      root.addEventListener("wheel", handlePreviewWheelZoom, { passive: false });
      root.addEventListener("dragstart", handlePreviewReorderDragStart);
      root.addEventListener("dragover", handlePreviewReorderDragOver);
      root.addEventListener("drop", handlePreviewReorderDrop);
      root.addEventListener("dragend", handlePreviewReorderDragEnd);
      root.addEventListener("dragleave", handlePreviewReorderDragLeave);
    }
    refreshPdfHelperStatus();
  }

  function handlePreviewWheelZoom(event) {
    if (!root) {
      return;
    }

    if (!event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();

    const direction = event.deltaY > 0 ? -previewZoomStep : previewZoomStep;
    changePreviewZoom(direction);
  }

  function handleDerivedVersionInput(event) {
    if (documentLanguage !== "ar") {
      return;
    }

    const preset = getSelectedPreset();
    if (!preset || preset.sourceLanguage !== "en" || !preset.derivedFromVersionId) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
      return;
    }

    if (target.closest(".editor-persistence")) {
      return;
    }

    const sectionKey = getTrackedSectionFromActiveSection(state.activeSection);
    if (!sectionKey || sectionKey === "coverLetter" && state.documentMode !== "cover-letter" && state.activeSection !== "coverLetter") {
      return;
    }

    state.translation.currentOverrides[sectionKey] = Date.now();
  }

  function handleResize() {
    if (!isMobileLayout()) {
      state.editorOpen = true;
    }
    syncEditorState();
    fitHeroContactRows();
  }

  function syncEditorState() {
    document.body.classList.toggle("editor-collapsed", isMobileLayout() && !state.editorOpen);
    updateToggleButton();
  }

  function updateToggleButton() {
    if (!toggleEditorButton) {
      return;
    }

    if (!isMobileLayout()) {
      toggleEditorButton.hidden = true;
      return;
    }

    toggleEditorButton.hidden = false;
    toggleEditorButton.textContent = state.editorOpen ? locale.showPreview : locale.showEditor;
    attachHelp(toggleEditorButton, { helpKey: "toolbar.toggleEditor", label: toggleEditorButton.textContent || "" });
  }

  function isMobileLayout() {
    return window.innerWidth <= 1100;
  }

  function getInitialSection(fallback = "") {
    const value = String(window.location.hash || "").replace(/^#/, "");
    const candidate = value || String(fallback || "");
    return isKnownSectionKey(candidate) ? candidate : "summary";
  }

  function getLinkedVersionQueryId() {
    try {
      return new URLSearchParams(window.location.search).get("linkedVersion") || "";
    } catch (error) {
      return "";
    }
  }

  function normalizeResumeSection(value) {
    const section = String(value || "");
    return section && section !== "coverLetter" && isKnownSectionKey(section) ? section : "summary";
  }

  function getVersionStorageKey(lang) {
    return `resume-editor-versions:${lang}`;
  }

  function getLegacyPresetStorageKey(lang) {
    return `resume-editor-presets:${lang}`;
  }

  function createPresetId() {
    return `preset-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function createCustomSectionId(index = 0) {
    return `custom-${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`;
  }

  function createCommandWorkspaceState() {
    return {
      selectedSections: [],
      command: "",
      content: "",
      preview: null,
      loading: false,
      error: "",
      note: "",
      showFallbackSettings: false
    };
  }

  function isCustomSectionKey(value) {
    return String(value || "").startsWith("custom:");
  }

  function getCustomSectionIdFromKey(value) {
    return isCustomSectionKey(value) ? String(value).slice("custom:".length) : "";
  }

  function getBaseAvailableSections() {
    return [
      "profile",
      "summary",
      "sections",
      "style",
      "commands",
      "aiHr",
      "coverLetter",
      "professionalExperience",
      "internships",
      "projects",
      "education",
      "certificates",
      "skills",
      "softSkills",
      "ats",
      "quality"
    ];
  }

  function isKnownSectionKey(sectionKey) {
    const key = String(sectionKey || "");
    if (!key) {
      return false;
    }
    if (getBaseAvailableSections().includes(key)) {
      return true;
    }
    if (isCustomSectionKey(key)) {
      return true;
    }
    return false;
  }

  function normalizeDocumentMode(value, section = "") {
    if (value === "cover-letter" || section === "coverLetter") {
      return "cover-letter";
    }
    return "resume";
  }

  function syncLocationHash() {
    if (!window.history?.replaceState) {
      return;
    }
    const hash = state.activeSection ? `#${state.activeSection}` : "";
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${hash}`);
  }

  function syncLanguageSwitcher() {
    if (switchEnglish) {
      switchEnglish.href = buildLanguageHref("en");
    }
    if (switchArabic) {
      switchArabic.href = buildLanguageHref("ar");
    }
  }

  function buildLanguageHref(targetLang) {
    const page = targetLang === "ar" ? "./arabic.html" : "./index.html";
    const url = new URL(page, window.location.href);
    const linkedId = getLinkedVersionIdForLanguage(targetLang);
    if (linkedId) {
      url.searchParams.set("linkedVersion", linkedId);
    }
    url.hash = state.documentMode === "cover-letter" ? "#coverLetter" : `#${normalizeResumeSection(state.activeSection)}`;
    return url.toString();
  }

  function getLinkedVersionIdForLanguage(targetLang) {
    const selectedPreset = getSelectedPreset();
    if (!selectedPreset) {
      return "";
    }

    if (targetLang === documentLanguage) {
      return selectedPreset.id;
    }

    if (documentLanguage === "en" && targetLang === "ar") {
      return normalizeDerivedVersionIds(selectedPreset.derivedVersionIds).ar || "";
    }

    if (documentLanguage === "ar" && targetLang === "en") {
      return selectedPreset.derivedFromVersionId || "";
    }

    return "";
  }

  function ensureDocumentModeToggle() {
    if (forcedDocumentMode === "cover-letter") {
      return;
    }

    const toolbar = document.querySelector(".screen-toolbar");
    if (!toolbar) {
      return;
    }

    if (!documentModeToggleHost) {
      documentModeToggleHost = document.createElement("div");
      documentModeToggleHost.className = "screen-toolbar__document-toggle";
      toolbar.insertBefore(documentModeToggleHost, toolbar.querySelector(".screen-toolbar__actions") || null);
    }
  }

  function syncDocumentModeToggle() {
    if (!documentModeToggleHost) {
      return;
    }

    documentModeToggleHost.innerHTML = "";
    documentModeToggleHost.append(
      createDocumentModeButton(locale.documentModeResume, "resume"),
      createDocumentModeButton(locale.documentModeCoverLetter, "cover-letter")
    );
  }

  function createDocumentModeButton(label, mode) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "screen-toolbar__mode-button";
    if (state.documentMode === mode) {
      button.classList.add("is-active");
    }
    button.textContent = label;
    button.addEventListener("click", () => setDocumentMode(mode));
    attachHelp(button, {
      helpKey: mode === "cover-letter" ? "toolbar.mode.coverLetter" : "toolbar.mode.resume",
      label
    });
    return button;
  }

  function isContextHelpEnabled() {
    return true;
  }

  function initializeContextualHelp() {
    if (!isContextHelpEnabled()) {
      return;
    }

    attachHelp(toggleEditorButton, { helpKey: "toolbar.toggleEditor", label: toggleEditorButton?.textContent || "" });
    attachHelp(importDataButton, { helpKey: "toolbar.importData", label: importDataButton?.textContent || "" });
    attachHelp(exportDataButton, { helpKey: "toolbar.exportData", label: exportDataButton?.textContent || "" });
    attachHelp(saveLivePdfButton, { helpKey: "toolbar.savePdf", label: saveLivePdfButton?.textContent || "" });
    attachHelp(printButton, { helpKey: "toolbar.printPdf", label: printButton?.textContent || "" });
    attachHelp(zoomOutButton, { helpKey: "toolbar.zoomOut", label: zoomOutButton?.textContent || "" });
    attachHelp(zoomResetButton, { helpKey: "toolbar.zoomReset", label: zoomResetButton?.textContent || "" });
    attachHelp(zoomInButton, { helpKey: "toolbar.zoomIn", label: zoomInButton?.textContent || "" });
    if (toolbarRoot) {
      attachHelp(toolbarRoot, {
        helpKey: "toolbar.general",
        label: locale.editorTitle
      });
    }
    updateContextualHelpPanel();
  }

  function attachHelp(node, options = {}) {
    if (!isContextHelpEnabled() || !node) {
      return node;
    }

    const descriptor = resolveHelpDescriptor(options);
    if (!descriptor.text) {
      return node;
    }

    node.dataset.helpLabel = descriptor.label || "";
    node.dataset.helpText = descriptor.text;
    node.setAttribute("title", descriptor.text);

    if (node.dataset.helpBound === "true") {
      return node;
    }

    node.dataset.helpBound = "true";
    node.addEventListener("mouseenter", () => setContextualHelpOverride(node.dataset.helpLabel || "", node.dataset.helpText || ""));
    node.addEventListener("focus", () => setContextualHelpOverride(node.dataset.helpLabel || "", node.dataset.helpText || ""), true);
    node.addEventListener("mouseleave", (event) => clearContextualHelpOverride(event, node));
    node.addEventListener("blur", (event) => clearContextualHelpOverride(event, node), true);
    return node;
  }

  function clearContextualHelpOverride(event, node) {
    const related = event?.relatedTarget;
    if (related instanceof Node && node.contains(related)) {
      return;
    }
    state.help.overrideLabel = "";
    state.help.overrideText = "";
    updateContextualHelpPanel();
  }

  function setContextualHelpOverride(label, text) {
    if (!isContextHelpEnabled()) {
      return;
    }
    state.help.overrideLabel = String(label || "");
    state.help.overrideText = String(text || "");
    updateContextualHelpPanel();
  }

  function createContextualHelpPanel() {
    const panel = document.createElement("section");
    panel.className = "editor-context-help";

    const eyebrow = document.createElement("p");
    eyebrow.className = "editor-context-help__eyebrow";
    eyebrow.textContent = locale.contextualHelpEyebrow;

    const title = document.createElement("h2");
    title.className = "editor-context-help__title";
    contextualHelpTitleHost = title;

    const text = document.createElement("p");
    text.className = "editor-context-help__text";
    contextualHelpTextHost = text;

    panel.append(eyebrow, title, text);
    updateContextualHelpPanel();
    return panel;
  }

  function updateContextualHelpPanel() {
    if (!contextualHelpTitleHost || !contextualHelpTextHost || !isContextHelpEnabled()) {
      return;
    }

    const descriptor = state.help.overrideText
      ? {
          label: state.help.overrideLabel || locale.contextualHelpTitle,
          text: state.help.overrideText
        }
      : getDefaultContextualHelpDescriptor();

    contextualHelpTitleHost.textContent = descriptor.label || locale.contextualHelpTitle;
    contextualHelpTextHost.textContent = descriptor.text || locale.contextualHelpFallback;
  }

  function getDefaultContextualHelpDescriptor() {
    const sectionKey = state.activeSection;
    return {
      label: getSectionLabel(sectionKey),
      text: getSectionHelpText(sectionKey)
    };
  }

  function resolveHelpDescriptor(options = {}) {
    const label = String(options.label || "").trim();
    const helpKey = String(options.helpKey || "").trim();
    const explicitText = String(options.text || "").trim();
    const fallbackType = options.fallbackType || "";
    const text = explicitText
      || (helpKey ? getHelpTextByKey(helpKey, label) : "")
      || getHelpTextByLabel(label, fallbackType);

    return {
      label: label || getHelpLabelFromKey(helpKey),
      text
    };
  }

  function getHelpLabelFromKey(helpKey) {
    if (!helpKey) {
      return "";
    }
    if (helpKey.startsWith("section:")) {
      return getSectionLabel(helpKey.slice("section:".length));
    }
    const map = getHelpTextMap();
    return map[helpKey]?.label || "";
  }

  function getHelpTextByKey(helpKey, label = "") {
    if (!helpKey) {
      return "";
    }
    if (helpKey.startsWith("section:")) {
      return getSectionHelpText(helpKey.slice("section:".length));
    }
    const map = getHelpTextMap();
    return map[helpKey]?.text || getHelpTextByLabel(label, "");
  }

  function getHelpTextMap() {
    return {
      "toolbar.general": {
        label: locale.editorTitle,
        text: locale.helpToolbarGeneral
      },
      "toolbar.mode.resume": {
        label: locale.documentModeResume,
        text: locale.helpToolbarResumeMode
      },
      "toolbar.mode.coverLetter": {
        label: locale.documentModeCoverLetter,
        text: locale.helpToolbarCoverLetterMode
      },
      "toolbar.toggleEditor": {
        label: toggleEditorButton?.textContent || "Editor",
        text: locale.helpToggleEditor
      },
      "toolbar.importData": {
        label: importDataButton?.textContent || locale.importData,
        text: locale.helpImportData
      },
      "toolbar.exportData": {
        label: exportDataButton?.textContent || locale.exportData,
        text: locale.helpExportData
      },
      "toolbar.savePdf": {
        label: saveLivePdfButton?.textContent || locale.savePdfNow,
        text: locale.helpSavePdfNow
      },
      "toolbar.printPdf": {
        label: printButton?.textContent || locale.printButton,
        text: locale.helpPrintPdf
      },
      "toolbar.zoomOut": {
        label: locale.zoomOut,
        text: locale.helpZoomOut
      },
      "toolbar.zoomReset": {
        label: locale.contextualHelpZoomLabel,
        text: locale.helpZoomReset
      },
      "toolbar.zoomIn": {
        label: locale.zoomIn,
        text: locale.helpZoomIn
      },
      "persistence.versions": {
        label: locale.versionTitle,
        text: locale.helpVersionSelect
      },
      "section.ai": {
        label: locale.aiTitle,
        text: locale.helpAiSettings
      },
      "section.translation": {
        label: locale.translationTitle,
        text: locale.helpBilingualSync
      },
      "style.preset": {
        label: locale.stylePresetLabel,
        text: locale.helpStylePreset
      },
      "commands.targets": {
        label: locale.commandsTargetsLabel,
        text: locale.helpCommandsTargets
      },
      "commands.prompt": {
        label: locale.commandsPromptLabel,
        text: locale.helpCommandsPrompt
      },
      "commands.content": {
        label: locale.commandsContentLabel,
        text: locale.helpCommandsContent
      },
      "commands.preview": {
        label: locale.commandsGeneratePreview,
        text: locale.helpCommandsPreview
      },
      "commands.apply": {
        label: locale.commandsApply,
        text: locale.helpCommandsApply
      },
      "commands.clear": {
        label: locale.commandsClear,
        text: locale.helpCommandsClear
      },
      "commands.fallback": {
        label: locale.commandsFallbackTitle,
        text: locale.helpCommandsFallback
      },
      "commands.fallbackEnabled": {
        label: locale.commandsFallbackEnabled,
        text: locale.helpCommandsFallbackEnabled
      },
      "commands.fallbackProvider": {
        label: locale.aiProvider,
        text: locale.helpAiProvider
      },
      "commands.fallbackApiKey": {
        label: locale.aiApiKey,
        text: locale.helpAiApiKey
      },
      "commands.fallbackModel": {
        label: locale.aiModel,
        text: locale.helpAiModel
      },
      "section.pdfImport": {
        label: locale.pdfImportTitle,
        text: locale.helpPdfImport
      },
      "pdfImport.dropzone": {
        label: locale.pdfImportDropzone,
        text: locale.helpPdfDropzone
      },
      "translation.review": {
        label: locale.translationTitle,
        text: locale.helpTranslationReview
      },
      "rewrite.suggest": {
        label: locale.rewriteSuggest,
        text: locale.helpRewriteSuggest
      },
      "rewrite.apply": {
        label: locale.rewriteApply,
        text: locale.helpRewriteApply
      },
      "rewrite.regenerate": {
        label: locale.rewriteRegenerate,
        text: locale.helpRewriteRegenerate
      },
      "command.open": {
        label: locale.commandOpen,
        text: locale.helpCommandOpen
      },
      "command.preview": {
        label: locale.commandGeneratePreview,
        text: locale.helpCommandPreview
      },
      "command.apply": {
        label: locale.commandApply,
        text: locale.helpCommandApply
      },
      "command.cancel": {
        label: locale.commandCancel,
        text: locale.helpCommandCancel
      },
      "command.scope": {
        label: locale.commandScopeLabel,
        text: locale.helpCommandScope
      },
      "command.prompt": {
        label: locale.commandPromptLabel,
        text: locale.helpCommandPrompt
      }
    };
  }

  function getHelpTextByLabel(labelText, fallbackType = "") {
    const label = String(labelText || "").trim();
    if (!label) {
      return "";
    }

    const map = {
      [locale.saveNewVersion]: locale.helpSaveNewVersion,
      [locale.updateVersion]: locale.helpUpdateVersion,
      [locale.loadVersion]: locale.helpLoadVersion,
      [locale.renameVersion]: locale.helpRenameVersion,
      [locale.deleteVersion]: locale.helpDeleteVersion,
      [locale.exportVersions]: locale.helpExportVersions,
      [locale.importVersions]: locale.helpImportVersions,
      [locale.resetDraft]: locale.helpResetDraft,
      [locale.clearLocalDraft]: locale.helpClearLocalDraft,
      [locale.translationGenerateArabic]: locale.helpGenerateArabic,
      [locale.translationSyncArabic]: locale.helpSyncArabic,
      [locale.translationOpenArabic]: locale.helpOpenArabic,
      [locale.translationOpenEnglish]: locale.helpOpenEnglish,
      [locale.translationSelectAll]: locale.helpSelectAllTranslation,
      [locale.translationSelectNone]: locale.helpSelectNoneTranslation,
      [locale.translationApplySelected]: locale.helpApplySelectedTranslation,
      [locale.pdfImportUpload]: locale.helpPdfUpload,
      [locale.aiUseWhenAvailable]: locale.helpAiToggle,
      [locale.aiProvider]: locale.helpAiProvider,
      [locale.aiApiKey]: locale.helpAiApiKey,
      [locale.aiModel]: locale.helpAiModel,
      [locale.undo]: locale.helpUndo,
      [locale.redo]: locale.helpRedo,
      [locale.coverLetterGenerate]: locale.helpCoverLetterGenerate,
      [locale.coverLetterApply]: locale.helpCoverLetterApply,
      [locale.coverLetterRegenerate]: locale.helpCoverLetterRegenerate,
      [locale.coverLetterCopy]: locale.helpCoverLetterCopy,
      [locale.coverLetterSavePdf]: locale.helpCoverLetterSavePdf,
      [locale.rewriteSuggest]: locale.helpRewriteSuggest,
      [locale.rewriteApply]: locale.helpRewriteApply,
      [locale.rewriteRegenerate]: locale.helpRewriteRegenerate,
      [locale.commandOpen]: locale.helpCommandOpen,
      [locale.commandGeneratePreview]: locale.helpCommandPreview,
      [locale.commandApply]: locale.helpCommandApply,
      [locale.commandCancel]: locale.helpCommandCancel,
      [locale.commandsGeneratePreview]: locale.helpCommandsPreview,
      [locale.commandsApply]: locale.helpCommandsApply,
      [locale.commandsClear]: locale.helpCommandsClear,
      [locale.addItem]: locale.helpAddItem,
      [locale.addBullet]: locale.helpAddBullet,
      [locale.addCustomSection]: locale.helpAddCustomSection,
      [locale.addCustomSectionItem]: locale.helpAddCustomSectionItem,
      [locale.moveUp]: locale.helpMoveUp,
      [locale.moveDown]: locale.helpMoveDown,
      [locale.remove]: locale.helpRemove,
      [locale.dragLabel]: locale.helpDrag,
      [locale.qualityOpenItem]: locale.helpQualityOpenItem,
      [locale.qualityOpenSection]: locale.helpQualityOpenSection,
      [locale.atsJumpToSection]: locale.helpAtsOpenSection
    };

    if (map[label]) {
      return map[label];
    }

    if (getAvailableSections().includes(label) || Object.values({
      profile: getSectionLabel("profile"),
      summary: getSectionLabel("summary"),
      sections: getSectionLabel("sections"),
      style: getSectionLabel("style"),
      commands: getSectionLabel("commands"),
      coverLetter: getSectionLabel("coverLetter"),
      professionalExperience: getSectionLabel("professionalExperience"),
      internships: getSectionLabel("internships"),
      projects: getSectionLabel("projects"),
      education: getSectionLabel("education"),
      certificates: getSectionLabel("certificates"),
      skills: getSectionLabel("skills"),
      softSkills: getSectionLabel("softSkills"),
      ats: getSectionLabel("ats"),
      quality: getSectionLabel("quality")
    }).includes(label)) {
      return locale.helpSectionNav;
    }

    if (fallbackType === "field") {
      return locale.helpFieldFallback.replace("{field}", label);
    }

    if (fallbackType === "button") {
      return locale.helpButtonFallback.replace("{action}", label);
    }

    if (fallbackType === "toggle") {
      return locale.helpToggleFallback.replace("{action}", label);
    }

    return "";
  }

  function getSectionHelpText(sectionKey) {
    if (isCustomSectionKey(sectionKey)) {
      const customSection = getCustomSectionById(getCustomSectionIdFromKey(sectionKey));
      if (!customSection) {
        return locale.contextualHelpFallback;
      }
      return locale.helpCustomSection.replace("{layout}", getCustomLayoutDescription(customSection.layout).toLowerCase());
    }

    const sectionHelpMap = {
      profile: locale.helpProfileSection,
      summary: locale.helpSummarySection,
      sections: locale.helpSectionsManager,
      style: locale.helpStyleSection,
      commands: locale.helpCommandsSection,
      coverLetter: locale.coverLetterDescription,
      professionalExperience: locale.helpExperienceSection,
      internships: locale.helpInternshipsSection,
      projects: locale.helpProjectsSection,
      education: locale.helpEducationSection,
      certificates: locale.helpCertificatesSection,
      skills: locale.helpSkillsSection,
      softSkills: locale.helpSoftSkillsSection,
      ats: locale.atsDescription,
      quality: locale.qualityDescription
    };

    return sectionHelpMap[sectionKey] || locale.contextualHelpFallback;
  }

  function setDocumentMode(mode) {
    if (forcedDocumentMode === "cover-letter") {
      return;
    }

    const nextMode = mode === "cover-letter" ? "cover-letter" : "resume";
    const previousMode = state.documentMode;

    if (nextMode === "cover-letter") {
      if (state.activeSection !== "coverLetter") {
        state.lastResumeSection = normalizeResumeSection(state.activeSection);
      }
      state.activeSection = "coverLetter";
    } else {
      state.activeSection = normalizeResumeSection(state.lastResumeSection || state.activeSection);
    }

    state.documentMode = nextMode;
    syncLocationHash();
    syncDocumentModeToggle();
    scheduleDraftSave();
    renderEditor();
    if (previousMode !== nextMode) {
      renderPreview();
    }
  }

  function openEditorSection(sectionKey) {
    const nextSection = getAvailableSections().includes(sectionKey) ? sectionKey : "summary";
    const previousMode = state.documentMode;
    state.activeSection = nextSection;
    if (nextSection === "coverLetter") {
      state.documentMode = "cover-letter";
    } else {
      state.documentMode = "resume";
      state.lastResumeSection = normalizeResumeSection(nextSection);
    }
    syncLocationHash();
    syncDocumentModeToggle();
    scheduleDraftSave();
    renderEditor();
    if (previousMode !== state.documentMode) {
      renderPreview();
    }
  }

  function shouldEnablePreviewNavigation() {
    return forcedDocumentMode !== "cover-letter";
  }

  function shouldEnablePreviewReorder() {
    return shouldEnablePreviewNavigation() && getPreviewDocumentType() === "resume";
  }

  function handlePreviewNavigationClick(event) {
    if (!shouldEnablePreviewNavigation() || getPreviewDocumentType() !== "resume") {
      return;
    }

    if (Date.now() < previewDragSuppressUntil) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest("a, button, input, textarea, select")) {
      return;
    }

    const navigationTarget = target.closest("[data-preview-nav='true']");
    if (!navigationTarget || !root.contains(navigationTarget)) {
      return;
    }

    event.preventDefault();
    handlePreviewNavigationTarget(navigationTarget);
  }

  function getPreviewReorderList(sectionKey, itemKind = "") {
    if (!sectionKey) {
      return null;
    }

    if (isCustomSectionKey(sectionKey)) {
      return getCustomSectionById(getCustomSectionIdFromKey(sectionKey))?.items || null;
    }

    if (sectionKey === "professionalExperience") {
      return state.data.professionalExperience || null;
    }

    if (sectionKey === "internships") {
      return state.data.internships || null;
    }

    if (sectionKey === "projects") {
      return state.data.projects || null;
    }

    if (sectionKey === "education") {
      return state.data.education || null;
    }

    if (sectionKey === "certificates") {
      return state.data.certificates || null;
    }

    if (sectionKey === "skills" && itemKind === "technical-skill") {
      return state.data.skills?.technical || null;
    }

    if (sectionKey === "softSkills") {
      return state.data.skills?.soft || null;
    }

    return null;
  }

  function getPreviewSectionOrderEntries() {
    return getOrderedResumeSections(state.data)
      .map((entry) => ({
        key: entry.key,
        type: entry.type
      }));
  }

  function canReorderPreviewSections() {
    return getOrderedResumeSections(state.data).filter((entry) => entry.key !== "profile").length > 1;
  }

  function removePreviewReorderHandle(node) {
    if (!(node instanceof HTMLElement)) {
      return;
    }

    Array.from(node.children)
      .filter((child) => child instanceof HTMLElement && child.classList.contains("preview-reorder-handle"))
      .forEach((child) => child.remove());
  }

  function createPreviewReorderHandle(label = "") {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "preview-reorder-handle";
    handle.textContent = "|||";
    handle.draggable = true;
    handle.tabIndex = -1;
    handle.setAttribute("aria-hidden", "true");
    handle.title = label ? `Drag to reorder ${label}` : "Drag to reorder";
    return handle;
  }

  function clearPreviewDropTarget() {
    if (previewDropTarget instanceof HTMLElement) {
      previewDropTarget.classList.remove("is-preview-drop-target");
    }
    previewDropTarget = null;
  }

  function clearPreviewDragState() {
    previewDragState = null;
    clearPreviewDropTarget();
    if (!root) {
      return;
    }
    root.querySelectorAll(".is-preview-dragging").forEach((node) => node.classList.remove("is-preview-dragging"));
  }

  function findPreviewReorderNode(target) {
    if (!(target instanceof Element) || !root) {
      return null;
    }

    const node = target.closest("[data-preview-reorder='true']");
    if (!(node instanceof HTMLElement) || !root.contains(node)) {
      return null;
    }
    return node;
  }

  function getPreviewReorderMeta(node) {
    if (!(node instanceof HTMLElement) || node.dataset.previewReorder !== "true") {
      return null;
    }

    const sectionKey = String(node.dataset.previewSection || "");
    const listId = String(node.dataset.previewListId || "");
    const itemKind = String(node.dataset.previewKind || "");
    const reorderType = String(node.dataset.previewReorderType || "item");
    const rawIndex = Number(
      reorderType === "section"
        ? node.dataset.previewSectionOrder
        : node.dataset.previewIndex
    );
    if (!sectionKey || !listId || !Number.isInteger(rawIndex)) {
      return null;
    }

    return {
      node,
      sectionKey,
      listId,
      itemKind,
      type: reorderType,
      index: rawIndex
    };
  }

  function resolvePreviewReorderList(meta) {
    if (!meta?.sectionKey) {
      return null;
    }

    const list = getPreviewReorderList(meta.sectionKey, meta.itemKind);
    if (!Array.isArray(list) || !list.length) {
      return null;
    }

    if (meta.listId && getArrayIdentity(list) !== meta.listId) {
      return null;
    }

    return list;
  }

  function movePreviewSectionEntry(fromIndex, toIndex) {
    const entries = getPreviewSectionOrderEntries();
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= entries.length ||
      toIndex >= entries.length
    ) {
      return false;
    }

    moveItem(entries, fromIndex, toIndex);
    applySectionEntryOrder(entries);
    return true;
  }

  function setPreviewDropTarget(node) {
    if (previewDropTarget === node) {
      return;
    }

    clearPreviewDropTarget();
    if (node instanceof HTMLElement) {
      node.classList.add("is-preview-drop-target");
      previewDropTarget = node;
    }
  }

  function handlePreviewReorderDragStart(event) {
    if (!shouldEnablePreviewReorder()) {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const handle = target.closest(".preview-reorder-handle");
    if (!(handle instanceof HTMLElement) || !root?.contains(handle)) {
      return;
    }

    const itemNode = findPreviewReorderNode(handle);
    const meta = getPreviewReorderMeta(itemNode);
    if (!meta) {
      return;
    }

    previewDragState = meta;
    meta.node.classList.add("is-preview-dragging");
    previewDragSuppressUntil = Date.now() + 600;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", `${meta.listId}:${meta.index}`);
    }
  }

  function handlePreviewReorderDragOver(event) {
    if (!shouldEnablePreviewReorder() || !previewDragState) {
      return;
    }

    const targetNode = findPreviewReorderNode(event.target);
    const targetMeta = getPreviewReorderMeta(targetNode);
    if (!targetMeta || targetMeta.listId !== previewDragState.listId || targetMeta.type !== previewDragState.type) {
      clearPreviewDropTarget();
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    if (targetMeta.index === previewDragState.index) {
      clearPreviewDropTarget();
      return;
    }

    setPreviewDropTarget(targetMeta.node);
  }

  function handlePreviewReorderDrop(event) {
    if (!shouldEnablePreviewReorder() || !previewDragState) {
      return;
    }

    const targetNode = findPreviewReorderNode(event.target);
    const targetMeta = getPreviewReorderMeta(targetNode);
    if (!targetMeta || targetMeta.listId !== previewDragState.listId || targetMeta.type !== previewDragState.type) {
      clearPreviewDragState();
      return;
    }

    event.preventDefault();
    previewDragSuppressUntil = Date.now() + 700;
    clearPreviewDropTarget();

    if (targetMeta.index === previewDragState.index) {
      clearPreviewDragState();
      return;
    }

    commitPendingHistory();
    const historyBefore = createHistorySnapshot();
    if (previewDragState.type === "section") {
      if (!movePreviewSectionEntry(previewDragState.index, targetMeta.index)) {
        clearPreviewDragState();
        return;
      }
    } else {
      const list = resolvePreviewReorderList(previewDragState);
      if (!list) {
        clearPreviewDragState();
        return;
      }
      moveItem(list, previewDragState.index, targetMeta.index);
    }
    clearPreviewDragState();
    commitHistorySnapshot(historyBefore);
    refreshAll();
  }

  function handlePreviewReorderDragEnd() {
    clearPreviewDragState();
  }

  function handlePreviewReorderDragLeave(event) {
    if (!previewDragState || !(event.target instanceof Element)) {
      return;
    }

    const targetNode = findPreviewReorderNode(event.target);
    if (!targetNode || previewDropTarget !== targetNode) {
      return;
    }

    const related = event.relatedTarget;
    if (related instanceof Node && targetNode.contains(related)) {
      return;
    }

    clearPreviewDropTarget();
  }

  function handlePreviewNavigationKeydown(event) {
    if (!shouldEnablePreviewNavigation() || getPreviewDocumentType() !== "resume") {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const navigationTarget = target.closest("[data-preview-nav='true']");
    if (!navigationTarget || !root.contains(navigationTarget)) {
      return;
    }

    event.preventDefault();
    handlePreviewNavigationTarget(navigationTarget);
  }

  function handlePreviewNavigationTarget(node) {
    const sectionKey = String(node.dataset.previewSection || "");
    if (!sectionKey) {
      return;
    }

    const rawIndex = node.dataset.previewIndex;
    const parsedIndex = rawIndex === undefined ? null : Number(rawIndex);
    state.previewFocus = {
      sectionKey,
      itemIndex: Number.isInteger(parsedIndex) ? parsedIndex : null,
      itemKind: String(node.dataset.previewKind || ""),
      focusSelector: String(node.dataset.previewFocusSelector || "")
    };
    openEditorSection(sectionKey);
  }

  function setEditorFocusTarget(targetMeta) {
    if (!targetMeta?.sectionKey) {
      return;
    }
    state.previewFocus = {
      sectionKey: String(targetMeta.sectionKey || ""),
      itemIndex: Number.isInteger(targetMeta.itemIndex) ? targetMeta.itemIndex : null,
      itemKind: String(targetMeta.itemKind || ""),
      focusSelector: String(targetMeta.focusSelector || "")
    };
  }

  function resolvePendingEditorFocus() {
    if (!state.previewFocus || !editorSidebar) {
      return;
    }

    const targetMeta = state.previewFocus;
    state.previewFocus = null;
    window.clearTimeout(editorFocusTimer);
    window.cancelAnimationFrame(editorFocusFrame);
    editorFocusFrame = window.requestAnimationFrame(() => {
      const target = findEditorFocusTarget(targetMeta);
      if (!target) {
        return;
      }

      target.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest"
      });

      target.classList.remove("editor-focus-flash");
      void target.offsetWidth;
      target.classList.add("editor-focus-flash");

      const focusable = findEditorFocusableTarget(target, targetMeta.focusSelector);
      if (focusable && typeof focusable.focus === "function") {
        focusable.focus({ preventScroll: true });
      }

      editorFocusTimer = window.setTimeout(() => {
        target.classList.remove("editor-focus-flash");
      }, 1800);
    });
  }

  function getQualityHighlightDuration() {
    return 2000;
  }

  function getPreviewItemKindForSection(sectionKey) {
    const map = {
      professionalExperience: "timeline-item",
      internships: "timeline-item",
      projects: "project",
      education: "education",
      certificates: "certificate",
      skills: "technical-skill",
      softSkills: "soft-skill"
    };
    return map[sectionKey] || "";
  }

  function clearActiveQualityPreviewHighlight() {
    state.quality.activeHighlight = null;
    window.clearTimeout(qualityHighlightTimer);
    if (!root) {
      return;
    }
    root.querySelectorAll(".is-quality-highlight, .is-quality-highlight--critical, .is-quality-highlight--warning, .is-quality-highlight--info, .is-quality-highlight-text, .is-quality-highlight-text--critical, .is-quality-highlight-text--warning, .is-quality-highlight-text--info")
      .forEach((node) => {
        node.classList.remove(
          "is-quality-highlight",
          "is-quality-highlight--critical",
          "is-quality-highlight--warning",
          "is-quality-highlight--info",
          "is-quality-highlight-text",
          "is-quality-highlight-text--critical",
          "is-quality-highlight-text--warning",
          "is-quality-highlight-text--info"
        );
      });
  }

  function findPreviewHighlightTarget(targetMeta) {
    if (!root || !targetMeta?.sectionKey) {
      return null;
    }

    if (Number.isInteger(targetMeta.itemIndex)) {
      let selector = `[data-preview-section="${targetMeta.sectionKey}"][data-preview-index="${targetMeta.itemIndex}"]`;
      if (targetMeta.itemKind) {
        selector += `[data-preview-kind="${targetMeta.itemKind}"]`;
      }
      const exact = root.querySelector(selector);
      if (exact instanceof HTMLElement) {
        return exact;
      }
    }

    if (targetMeta.sectionKey === "profile") {
      return root.querySelector(".hero");
    }

    if (targetMeta.sectionKey === "summary") {
      return root.querySelector(".summary-text");
    }

    if (targetMeta.sectionKey === "skills") {
      return root.querySelector(".technical-skill-list");
    }

    if (targetMeta.sectionKey === "softSkills") {
      return root.querySelector(".soft-skills-panel");
    }

    return root.querySelector(`[data-preview-section="${targetMeta.sectionKey}"]`);
  }

  function syncQualityPreviewHighlight() {
    if (!root) {
      return;
    }

    root.querySelectorAll(".is-quality-highlight, .is-quality-highlight--critical, .is-quality-highlight--warning, .is-quality-highlight--info, .is-quality-highlight-text, .is-quality-highlight-text--critical, .is-quality-highlight-text--warning, .is-quality-highlight-text--info")
      .forEach((node) => {
        node.classList.remove(
          "is-quality-highlight",
          "is-quality-highlight--critical",
          "is-quality-highlight--warning",
          "is-quality-highlight--info",
          "is-quality-highlight-text",
          "is-quality-highlight-text--critical",
          "is-quality-highlight-text--warning",
          "is-quality-highlight-text--info"
        );
      });

    if (!state.quality.activeHighlight) {
      return;
    }

    const target = findPreviewHighlightTarget(state.quality.activeHighlight);
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const severity = state.quality.activeHighlight.severity || "info";
    target.classList.add("is-quality-highlight", `is-quality-highlight--${severity}`);
    findPreviewHighlightTextTargets(target, state.quality.activeHighlight).forEach((node) => {
      node.classList.add("is-quality-highlight-text", `is-quality-highlight-text--${severity}`);
    });
  }

  function activateQualityPreviewHighlight(targetMeta) {
    clearActiveQualityPreviewHighlight();
    if (!targetMeta?.sectionKey) {
      return;
    }

    state.quality.activeHighlight = {
      sectionKey: String(targetMeta.sectionKey || ""),
      itemIndex: Number.isInteger(targetMeta.itemIndex) ? targetMeta.itemIndex : null,
      bulletIndex: Number.isInteger(targetMeta.bulletIndex) ? targetMeta.bulletIndex : null,
      itemKind: String(targetMeta.itemKind || ""),
      severity: String(targetMeta.severity || "info")
    };
    syncQualityPreviewHighlight();
    qualityHighlightTimer = window.setTimeout(() => {
      clearActiveQualityPreviewHighlight();
    }, getQualityHighlightDuration());
  }

  function openQualityIssue(issue) {
    if (!issue?.sectionKey) {
      return;
    }

    setEditorFocusTarget({
      sectionKey: issue.sectionKey,
      itemIndex: Number.isInteger(issue.itemIndex) ? issue.itemIndex : null,
      itemKind: issue.itemKind || "",
      focusSelector: issue.focusSelector || ""
    });
    activateQualityPreviewHighlight(issue);
    openEditorSection(issue.sectionKey);
  }

  function findPreviewHighlightTextTargets(target, targetMeta) {
    if (!(target instanceof HTMLElement)) {
      return [];
    }

    const nodes = [];
    const pushIfElement = (node) => {
      if (node instanceof HTMLElement && !nodes.includes(node)) {
        nodes.push(node);
      }
    };

    if (Number.isInteger(targetMeta?.bulletIndex)) {
      pushIfElement(target.querySelector(`.bullet-list__item:nth-of-type(${targetMeta.bulletIndex + 1})`));
      if (nodes.length) {
        return nodes;
      }
    }

    if (targetMeta?.sectionKey === "profile") {
      pushIfElement(target.matches(".hero__name, .hero__contact-item, .hero__contact-text") ? target : target.querySelector(".hero__name"));
      target.querySelectorAll(".hero__contact-item").forEach(pushIfElement);
      return nodes.length ? nodes : [target];
    }

    if (targetMeta?.sectionKey === "summary") {
      return [target];
    }

    if (target.matches(".skill-list__item, .soft-skill-item, .summary-text, .section-title, .certificate-card__text")) {
      return [target];
    }

    switch (String(targetMeta?.itemKind || "")) {
      case "timeline-item":
      case "project":
      case "education":
        pushIfElement(target.querySelector(".timeline-item__title"));
        pushIfElement(target.querySelector(".timeline-item__subtitle"));
        pushIfElement(target.querySelector(".timeline-item__link"));
        target.querySelectorAll(".bullet-list__item").forEach(pushIfElement);
        break;
      case "technical-skill":
      case "soft-skill":
      case "two-column-list":
        pushIfElement(target);
        break;
      case "certificate":
      case "certificate-cards":
        pushIfElement(target.querySelector(".certificate-card__text"));
        break;
      case "summary-body":
        pushIfElement(target);
        break;
      default:
        pushIfElement(target.querySelector(".timeline-item__title"));
        pushIfElement(target.querySelector(".timeline-item__subtitle"));
        target.querySelectorAll(".bullet-list__item").forEach(pushIfElement);
        break;
    }

    return nodes.length ? nodes : [target];
  }

  function findEditorFocusTarget(targetMeta) {
    if (!editorSidebar || !targetMeta?.sectionKey) {
      return null;
    }

    if (Number.isInteger(targetMeta.itemIndex)) {
      let selector = `[data-editor-section="${targetMeta.sectionKey}"][data-editor-item-index="${targetMeta.itemIndex}"]`;
      if (targetMeta.itemKind) {
        selector += `[data-editor-kind="${targetMeta.itemKind}"]`;
      }
      const itemTarget = editorSidebar.querySelector(selector);
      if (itemTarget) {
        return itemTarget;
      }
    }

    return editorSidebar.querySelector(`[data-editor-section="${targetMeta.sectionKey}"]`);
  }

  function findEditorFocusableTarget(target, explicitSelector = "") {
    if (!(target instanceof Element)) {
      return null;
    }

    const selector = explicitSelector || String(target.dataset.editorFocusSelector || "");
    if (selector) {
      const explicitTarget = target.querySelector(selector);
      if (explicitTarget instanceof HTMLElement) {
        if (explicitTarget.matches("textarea, input, select, button:not([disabled])")) {
          return explicitTarget;
        }
        const nestedFocusable = explicitTarget.querySelector("textarea, input, select, button:not([disabled])");
        if (nestedFocusable instanceof HTMLElement) {
          return nestedFocusable;
        }
      }
    }

    return target.querySelector("textarea, input, select, button:not([disabled])");
  }

  function applyPreviewTarget(node, { sectionKey, itemIndex = null, itemKind = "", label = "", focusSelector = "", reorderList = null, sectionOrder = null } = {}) {
    if (!shouldEnablePreviewNavigation() || !(node instanceof HTMLElement) || !sectionKey) {
      return node;
    }

    node.dataset.previewNav = "true";
    node.dataset.previewSection = sectionKey;
    if (Number.isInteger(itemIndex)) {
      node.dataset.previewIndex = String(itemIndex);
    } else {
      delete node.dataset.previewIndex;
    }
    if (itemKind) {
      node.dataset.previewKind = itemKind;
    } else {
      delete node.dataset.previewKind;
    }
    if (focusSelector) {
      node.dataset.previewFocusSelector = focusSelector;
    } else {
      delete node.dataset.previewFocusSelector;
    }
    node.classList.add("preview-jump-target");
    if (Number.isInteger(itemIndex)) {
      node.classList.add("preview-jump-target--item");
    } else {
      node.classList.add("preview-jump-target--section");
    }
    node.tabIndex = 0;
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", label || node.textContent?.trim() || sectionKey);
    removePreviewReorderHandle(node);
    if (shouldEnablePreviewReorder() && Number.isInteger(itemIndex) && Array.isArray(reorderList) && reorderList.length > 1) {
      node.dataset.previewReorder = "true";
      node.dataset.previewReorderType = "item";
      node.dataset.previewListId = getArrayIdentity(reorderList);
      node.appendChild(createPreviewReorderHandle(label || node.textContent?.trim() || sectionKey));
    } else if (shouldEnablePreviewReorder() && Number.isInteger(sectionOrder) && canReorderPreviewSections()) {
      node.dataset.previewReorder = "true";
      node.dataset.previewReorderType = "section";
      node.dataset.previewSectionOrder = String(sectionOrder);
      node.dataset.previewListId = "section-order";
      node.appendChild(createPreviewReorderHandle(label ? `section ${label}` : "section"));
    } else {
      delete node.dataset.previewReorder;
      delete node.dataset.previewReorderType;
      delete node.dataset.previewListId;
      delete node.dataset.previewSectionOrder;
    }
    return node;
  }

  function applyEditorTarget(node, { sectionKey, itemIndex = null, itemKind = "", focusSelector = "" } = {}) {
    if (!(node instanceof HTMLElement) || !sectionKey) {
      return node;
    }

    node.dataset.editorSection = sectionKey;
    if (Number.isInteger(itemIndex)) {
      node.dataset.editorItemIndex = String(itemIndex);
    } else {
      delete node.dataset.editorItemIndex;
    }
    if (itemKind) {
      node.dataset.editorKind = itemKind;
    } else {
      delete node.dataset.editorKind;
    }
    if (focusSelector) {
      node.dataset.editorFocusSelector = focusSelector;
    } else {
      delete node.dataset.editorFocusSelector;
    }
    return node;
  }

  function handleBeforePrint() {
    document.body.classList.add("is-printing");
    if (root) {
      root.style.setProperty("--preview-zoom", "100%");
    }
    renderPreview();
  }

  function handleAfterPrint() {
    document.body.classList.remove("is-printing");
    applyPreviewZoom();
    renderTimer = window.setTimeout(renderPreview, 40);
  }

  window.__resumePrepareForPrint = () => {
    handleBeforePrint();
    return true;
  };

  window.__resumeRestoreAfterPrint = () => {
    handleAfterPrint();
    return true;
  };

  if (printLayoutRequested) {
    handleBeforePrint();
  }

  function schedulePreviewRender() {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(renderPreview, 50);
    scheduleAtsAnalysis();
    scheduleQualityAnalysis();
    scheduleDraftSave();
  }

  function refreshAll() {
    updateAtsAnalysis();
    updateQualityAnalysis();
    scheduleDraftSave();
    renderEditor();
    renderPreview();
  }

  function handleHistoryShortcut(event) {
    if (event.defaultPrevented || event.altKey) {
      return;
    }

    const hasModifier = event.ctrlKey || event.metaKey;
    if (!hasModifier) {
      return;
    }

    const key = String(event.key || "").toLowerCase();
    const isUndo = key === "z" && !event.shiftKey;
    const isRedo = key === "y" || (key === "z" && event.shiftKey);

    if (isUndo) {
      event.preventDefault();
      handleUndo();
      return;
    }

    if (isRedo) {
      event.preventDefault();
      handleRedo();
    }
  }

  async function refreshPdfHelperStatus() {
    if (!pdfHelperOrigin) {
      state.pdf.ready = false;
      state.pdf.checking = false;
      state.pdf.message = runningLocally ? locale.pdfHelperOffline : locale.hostedPrintReady;
      syncPdfHelperDisplay();
      return false;
    }

    if (state.pdf.checking) {
      return state.pdf.ready;
    }

    state.pdf.checking = true;
    syncPdfHelperDisplay();
    try {
      const response = await fetch(`${pdfHelperOrigin}/health`, {
        method: "GET",
        cache: "no-store"
      });
      state.pdf.ready = response.ok;
      state.pdf.message = response.ok
        ? (runningLocally ? locale.pdfHelperReady : locale.hostedApiReady)
        : (runningLocally ? locale.pdfHelperOffline : locale.hostedApiOffline);
    } catch (error) {
      state.pdf.ready = false;
      state.pdf.message = runningLocally ? locale.pdfHelperOffline : locale.hostedApiOffline;
    } finally {
      state.pdf.checking = false;
      syncPdfHelperDisplay();
    }

    return state.pdf.ready;
  }

  function syncPdfHelperDisplay() {
    if (saveLivePdfButton) {
      const useDirectExport = canUseDirectPdfExport();
      saveLivePdfButton.hidden = !useDirectExport && !runningLocally;
      saveLivePdfButton.disabled = Boolean(state.pdf.checking) || (!useDirectExport && runningLocally);
      saveLivePdfButton.textContent = state.pdf.checking ? locale.pdfHelperChecking : locale.savePdfNow;
    }

    if (printHint) {
      const statusLabel = state.pdf.checking
        ? locale.pdfHelperChecking
        : (state.pdf.message || (runningLocally ? locale.pdfHelperOffline : locale.hostedPrintReady));
      printHint.textContent = `${state.data.ui?.printHint || locale.printHint} - ${statusLabel}`;
    }
  }

  function getPreviewDocumentType() {
    if (forcedDocumentMode === "cover-letter") {
      return "cover-letter";
    }
    return state.documentMode === "cover-letter" ? "cover-letter" : "resume";
  }

  function getLiveExportPayload(documentType = getPreviewDocumentType()) {
    const isCoverLetter = documentType === "cover-letter";
    return {
      documentType,
      lang: documentLanguage,
      page: isCoverLetter
        ? (documentLanguage === "ar" ? "cover-letter-ar.html" : "cover-letter.html")
        : (documentLanguage === "ar" ? "arabic.html" : "index.html"),
      outputName: isCoverLetter
        ? (documentLanguage === "ar" ? "resume-studio-demo-cover-letter-ar.pdf" : "resume-studio-demo-cover-letter.pdf")
        : (documentLanguage === "ar" ? "resume-studio-demo-cv-ar.pdf" : "resume-studio-demo-cv.pdf"),
      resumeData: state.data,
      coverLetterData: isCoverLetter ? normalizeCoverLetter(state.coverLetter, state.data.profile?.name) : null
    };
  }

  async function handleLivePdfExport(documentType = getPreviewDocumentType()) {
    if (!canUseDirectPdfExport()) {
      window.alert(locale.pdfPrintPreferredMessage);
      window.print();
      return;
    }

    const ready = await refreshPdfHelperStatus();
    if (!ready) {
      window.alert(runningLocally ? locale.pdfHelperOfflineMessage : locale.hostedApiOfflineMessage);
      return;
    }

    if (saveLivePdfButton) {
      saveLivePdfButton.disabled = true;
      saveLivePdfButton.textContent = locale.pdfExportSaving;
    }

    try {
      const response = await fetch(`${pdfHelperOrigin}/export`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(getLiveExportPayload(documentType))
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || locale.pdfExportFailed);
      }

      state.pdf.message = locale.pdfExportSuccess.replace("{path}", payload.pdfPath || "");
      syncPdfHelperDisplay();
      window.alert(state.pdf.message);
    } catch (error) {
      state.pdf.message = locale.pdfExportFailed;
      syncPdfHelperDisplay();
      window.alert(error.message || locale.pdfExportFailed);
    } finally {
      if (saveLivePdfButton) {
        saveLivePdfButton.disabled = false;
        saveLivePdfButton.textContent = locale.savePdfNow;
      }
    }
  }

  async function handleImportData(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const imported = parseImportedData(text);

      if (!imported || typeof imported !== "object") {
        throw new Error(locale.importInvalid);
      }

      if (imported.meta?.lang && imported.meta.lang !== sourceData.meta?.lang) {
        throw new Error(locale.importLanguageMismatch);
      }

      commitPendingHistory();
      const historyBefore = createHistorySnapshot();
    state.data = normalizeResumeData(imported);
      initializeDocument();
      commitHistorySnapshot(historyBefore);
      refreshAll();
    } catch (error) {
      window.alert(error.message || locale.importFailed);
    } finally {
      event.target.value = "";
    }
  }

  function handleExportData() {
    const filename = state.data.meta?.lang === "ar" ? "resume-data-ar.js" : "resume-data.js";
    const content = `window.resumeData = ${JSON.stringify(state.data, null, 2)};\n`;
    const blob = new Blob([content], { type: "application/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function createPdfImportPanel() {
    const section = document.createElement("section");
    section.className = "editor-pdf-import";
    attachHelp(section, { helpKey: "section.pdfImport", label: locale.pdfImportTitle });

    const title = document.createElement("h3");
    title.className = "editor-card__title";
    title.textContent = locale.pdfImportTitle;
    attachHelp(title, { helpKey: "section.pdfImport", label: locale.pdfImportTitle });

    const hint = document.createElement("p");
    hint.className = "editor-section__description";
    hint.textContent = locale.pdfImportDescription;

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,application/pdf";
    input.hidden = true;
    input.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (file) {
        await handlePdfImportFile(file);
      }
      event.target.value = "";
    });

    const actions = document.createElement("div");
    actions.className = "editor-actions";
    actions.appendChild(
      createActionButton(
        locale.pdfImportUpload,
        "is-primary",
        () => input.click(),
        state.pdfImport.loading || documentLanguage !== "en"
      )
    );

    const dropZone = document.createElement("div");
    dropZone.className = `editor-pdf-import__dropzone ${state.pdfImport.dragActive ? "is-active" : ""}`.trim();
    dropZone.textContent = documentLanguage !== "en"
      ? locale.pdfImportLanguageNotice
      : state.pdfImport.loading
        ? locale.pdfImportLoading
        : locale.pdfImportDropzone;
    attachHelp(dropZone, { helpKey: "pdfImport.dropzone", label: locale.pdfImportDropzone });
    if (documentLanguage === "en") {
      bindPdfDropZone(dropZone);
    } else {
      dropZone.setAttribute("aria-disabled", "true");
    }

    section.append(title, hint, actions, dropZone, input);

    if (documentLanguage !== "en") {
      section.appendChild(createAtsNotice(locale.pdfImportLanguageNotice));
      return section;
    }

    if (state.pdfImport.error) {
      section.appendChild(createAtsNotice(state.pdfImport.error, "is-warning"));
    }

    if (state.pdfImport.review) {
      section.appendChild(createPdfImportReviewPanel());
    }

    return section;
  }

  function bindPdfDropZone(node) {
    ["dragenter", "dragover"].forEach((eventName) => {
      node.addEventListener(eventName, (event) => {
        event.preventDefault();
        if (!state.pdfImport.dragActive) {
          state.pdfImport.dragActive = true;
          renderEditor();
        }
      });
    });

    ["dragleave", "dragend", "drop"].forEach((eventName) => {
      node.addEventListener(eventName, (event) => {
        event.preventDefault();
        if (state.pdfImport.dragActive) {
          state.pdfImport.dragActive = false;
          renderEditor();
        }
      });
    });

    node.addEventListener("drop", async (event) => {
      const file = Array.from(event.dataTransfer?.files || []).find((item) => /\.pdf$/i.test(item.name));
      if (!file) {
        state.pdfImport.error = locale.pdfImportFileRequired;
        renderEditor();
        return;
      }
      await handlePdfImportFile(file);
    });
  }

  async function handlePdfImportFile(file) {
    if (documentLanguage !== "en") {
      state.pdfImport.error = locale.pdfImportLanguageNotice;
      renderEditor();
      return;
    }

    state.pdfImport = {
      loading: true,
      review: null,
      error: "",
      dragActive: false
    };
    renderEditor();

    try {
      const buffer = await file.arrayBuffer();
      let payload;
      if (runningLocally && pdfHelperOrigin) {
        const pdfBase64 = encodeBase64(buffer);
        const response = await fetch(`${pdfHelperOrigin}/import-pdf`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            lang: documentLanguage,
            pdfBase64
          })
        });

        payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || locale.pdfImportFailed);
        }
      } else {
        payload = await importPdfInBrowser(buffer);
      }

      state.pdfImport = {
        loading: false,
        error: "",
        dragActive: false,
        review: buildPdfImportReview(payload)
      };
    } catch (error) {
      state.pdfImport = {
        loading: false,
        review: null,
        dragActive: false,
        error: error.message || locale.pdfImportFailed
      };
    }

    renderEditor();
  }

  function encodeBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 32768;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return window.btoa(binary);
  }

  async function importPdfInBrowser(buffer) {
    if (!runtimeConfig.hostedPdfImport) {
      throw new Error(locale.pdfImportHostedUnavailable);
    }

    const extracted = await extractPdfTextInBrowser(buffer);
    const localResult = parseResumeTextLocallyInBrowser(extracted.text);
    const resumeData = localResult.resumeData;
    return {
      success: true,
      resumeData,
      sectionMeta: makeImportedSectionMeta(resumeData, extracted.sourceType),
      warnings: [...extracted.warnings, ...localResult.warnings],
      sourceType: extracted.sourceType,
      aiAssisted: false
    };
  }

  async function loadPdfJsLibrary() {
    if (window.pdfjsLib) {
      return window.pdfjsLib;
    }

    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-pdfjs="true"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error(locale.pdfImportHostedUnavailable)), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.async = true;
      script.dataset.pdfjs = "true";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(locale.pdfImportHostedUnavailable));
      document.head.appendChild(script);
    });

    if (!window.pdfjsLib) {
      throw new Error(locale.pdfImportHostedUnavailable);
    }

    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    return window.pdfjsLib;
  }

  async function extractPdfTextInBrowser(buffer) {
    const pdfjsLib = await loadPdfJsLibrary();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pageTexts = [];

    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const textContent = await page.getTextContent();
      const lines = [];
      let currentTop = null;
      let currentParts = [];

      textContent.items.forEach((item) => {
        const chunk = String(item?.str || "").trim();
        if (!chunk) {
          return;
        }
        const top = Math.round(Number(item?.transform?.[5] || 0));
        if (currentTop === null || Math.abs(top - currentTop) <= 3) {
          currentParts.push(chunk);
          currentTop = currentTop === null ? top : currentTop;
          return;
        }
        lines.push(currentParts.join(" ").replace(/\s+/g, " ").trim());
        currentTop = top;
        currentParts = [chunk];
      });

      if (currentParts.length) {
        lines.push(currentParts.join(" ").replace(/\s+/g, " ").trim());
      }

      pageTexts.push(lines.filter(Boolean).join("\n"));
    }

    const fullText = pageTexts.filter(Boolean).join("\n").trim();
    const warnings = [];
    if (fullText.length < 80) {
      warnings.push(locale.pdfImportLowTextWarning);
    }

    return {
      text: fullText,
      sourceType: fullText.length < 400 ? "ocr" : "text",
      warnings
    };
  }

  function createImportedResumePayload() {
    return {
      meta: { lang: "en", dir: "ltr" },
      profile: {
        name: "",
        photo: "",
        email: "",
        phone: "",
        phoneHref: "",
        location: "",
        linkedinLabel: "",
        linkedinHref: "",
        githubLabel: "",
        githubHref: "",
        portfolioLabel: "",
        portfolioHref: ""
      },
      summary: "",
      professionalExperience: [],
      internships: [],
      projects: [],
      education: [],
      certificates: [],
      skills: {
        technical: [],
        soft: []
      }
    };
  }

  function splitImportedLines(text) {
    return String(text || "")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function normalizeImportedHeading(line) {
    return String(line || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function splitImportedSections(text) {
    const profileLines = [];
    const sections = importedSectionKeys
      .filter((key) => key !== "profile")
      .reduce((accumulator, key) => {
        accumulator[key] = [];
        return accumulator;
      }, {});
    let currentKey = "";

    splitImportedLines(text).forEach((line) => {
      const headingKey = importedSectionHeadings[normalizeImportedHeading(line)];
      if (headingKey) {
        currentKey = headingKey;
        return;
      }
      if (currentKey) {
        sections[currentKey].push(line);
      } else {
        profileLines.push(line);
      }
    });

    return { profileLines, sections };
  }

  function parseImportedProfileLines(lines) {
    const profile = createImportedResumePayload().profile;
    const leftovers = [];
    if (lines.length) {
      profile.name = lines[0];
    }

    lines.slice(1).forEach((line) => {
      const email = line.match(importedEmailPattern);
      const urlMatch = line.match(importedUrlPattern);
      if (email && !profile.email) {
        profile.email = email[0];
        return;
      }
      if (importedPhonePattern.test(line) && !profile.phone) {
        profile.phone = line.trim();
        const digits = profile.phone.replace(/[^\d+]/g, "");
        if (digits) {
          profile.phoneHref = `tel:${digits}`;
        }
        return;
      }
      if (urlMatch) {
        const url = urlMatch[0];
        const normalized = /^https?:/i.test(url) ? url : `https://${url}`;
        if (/linkedin\.com/i.test(normalized) && !profile.linkedinHref) {
          profile.linkedinHref = normalized;
          profile.linkedinLabel = url;
          return;
        }
        if (/github\.com/i.test(normalized) && !profile.githubHref) {
          profile.githubHref = normalized;
          profile.githubLabel = url;
          return;
        }
      }
      if (!profile.location) {
        profile.location = line;
      } else {
        leftovers.push(line);
      }
    });

    return { profile, leftovers };
  }

  function consumeImportedWorkItems(lines, options = {}) {
    const items = [];
    const includeRole = options.includeRole !== false;
    const includeLocation = options.includeLocation !== false;
    let index = 0;
    while (index < lines.length) {
      if (!importedDatePattern.test(lines[index])) {
        index += 1;
        continue;
      }
      const item = {
        date: lines[index],
        location: "",
        organization: "",
        role: "",
        bullets: []
      };
      index += 1;
      if (includeLocation && index < lines.length) {
        item.location = lines[index];
        index += 1;
      }
      if (index < lines.length) {
        item.organization = lines[index];
        index += 1;
      }
      if (includeRole && index < lines.length) {
        item.role = lines[index];
        index += 1;
      }
      while (index < lines.length && !importedDatePattern.test(lines[index])) {
        item.bullets.push(lines[index]);
        index += 1;
      }
      item.bullets = item.bullets.filter(Boolean);
      items.push(item);
    }
    return items;
  }

  function consumeImportedProjectItems(lines) {
    const items = [];
    let index = 0;
    while (index < lines.length) {
      if (!importedDatePattern.test(lines[index])) {
        index += 1;
        continue;
      }
      const item = {
        date: lines[index],
        title: "",
        linkLabel: "",
        linkHref: "",
        bullets: []
      };
      index += 1;
      if (index < lines.length) {
        item.title = lines[index];
        index += 1;
      }
      while (index < lines.length && !importedDatePattern.test(lines[index])) {
        const line = lines[index];
        const urlMatch = line.match(importedUrlPattern);
        if (urlMatch && !item.linkHref) {
          const url = urlMatch[0];
          item.linkHref = /^https?:/i.test(url) ? url : `https://${url}`;
          item.linkLabel = url;
        } else {
          item.bullets.push(line);
        }
        index += 1;
      }
      items.push(item);
    }
    return items;
  }

  function consumeImportedEducationItems(lines) {
    const items = [];
    let index = 0;
    while (index < lines.length) {
      if (!importedDatePattern.test(lines[index])) {
        index += 1;
        continue;
      }
      const item = {
        date: lines[index],
        location: "",
        degree: "",
        institution: ""
      };
      index += 1;
      if (index < lines.length) {
        item.location = lines[index];
        index += 1;
      }
      if (index < lines.length) {
        item.degree = lines[index];
        index += 1;
      }
      if (index < lines.length) {
        item.institution = lines[index];
        index += 1;
      }
      items.push(item);
    }
    return items;
  }

  function consumeImportedCertificateItems(lines) {
    if (!lines.length) {
      return [];
    }
    const paragraphs = [];
    let current = [];
    lines.forEach((line) => {
      current.push(line);
      if (/[.!?]$/.test(line)) {
        paragraphs.push(current.join(" "));
        current = [];
      }
    });
    if (current.length) {
      paragraphs.push(current.join(" "));
    }

    return paragraphs.map((paragraph) => {
      const parts = paragraph.split(" - ").map((part) => part.trim()).filter(Boolean);
      if (parts.length >= 2) {
        return {
          title: parts.length > 2 ? parts.slice(0, 2).join(" - ") : parts[0],
          description: parts.length > 2 ? parts.slice(2).join(" - ") : parts[1]
        };
      }
      return { title: paragraph, description: "" };
    });
  }

  function consumeImportedSkillSections(lines) {
    const technical = [];
    const soft = [];
    let currentLabel = "";
    let currentText = "";

    function flushCurrentSkill() {
      if (!currentLabel) {
        return;
      }
      technical.push({
        label: currentLabel,
        items: currentText.trim().replace(/^[, ]+|[, ]+$/g, "")
      });
      currentLabel = "";
      currentText = "";
    }

    lines.forEach((line) => {
      if (line.includes(":")) {
        flushCurrentSkill();
        const [label, ...rest] = line.split(":");
        currentLabel = label.trim();
        currentText = rest.join(":").trim();
        return;
      }
      if (currentLabel) {
        currentText = `${currentText} ${line}`.trim();
      } else {
        soft.push(line);
      }
    });

    flushCurrentSkill();
    return { technical, soft };
  }

  function parseResumeTextLocallyInBrowser(text) {
    const { profileLines, sections } = splitImportedSections(text);
    const parsedProfile = parseImportedProfileLines(profileLines);
    const data = createImportedResumePayload();
    data.profile = parsedProfile.profile;
    data.summary = sections.summary.join(" ").trim();
    data.professionalExperience = consumeImportedWorkItems(sections.professionalExperience);
    data.internships = consumeImportedWorkItems(sections.internships);
    data.projects = consumeImportedProjectItems(sections.projects);
    data.education = consumeImportedEducationItems(sections.education);
    data.certificates = consumeImportedCertificateItems(sections.certificates);
    const skillSections = consumeImportedSkillSections(sections.skills);
    data.skills.technical = skillSections.technical;
    data.skills.soft = skillSections.soft.length ? skillSections.soft : sections.softSkills.filter(Boolean);
    const warnings = [];
    if (parsedProfile.leftovers.length) {
      warnings.push(locale.pdfImportHeaderWarning);
    }
    return { resumeData: data, warnings };
  }

  function makeImportedSectionMeta(data, sourceType) {
    const lowConfidence = sourceType === "ocr" ? "low" : "medium";
    return importedSectionKeys.reduce((accumulator, key) => {
      let value = data[key];
      if (key === "skills") {
        value = data.skills?.technical || [];
      }
      if (key === "softSkills") {
        value = data.skills?.soft || [];
      }

      let present = false;
      if (typeof value === "string") {
        present = Boolean(value.trim());
      } else if (Array.isArray(value)) {
        present = value.length > 0;
      } else if (value && typeof value === "object") {
        present = Object.values(value).some((item) => item != null && String(item).trim());
      } else {
        present = Boolean(value);
      }

      accumulator[key] = {
        confidence: present ? (sourceType === "text" ? "high" : lowConfidence) : "low",
        warning: present ? "" : locale.pdfImportNoSectionContent
      };
      return accumulator;
    }, {});
  }

  function buildPdfImportReview(payload) {
    const imported = normalizeResumeData(payload?.resumeData || {}, buildResumeTemplateForLanguage("en"));
    const sectionMeta = normalizePdfImportSectionMeta(payload?.sectionMeta);
    return {
      data: imported,
      sectionMeta,
      selectedSections: {
        profile: true,
        summary: true,
        professionalExperience: true,
        internships: true,
        projects: true,
        education: true,
        certificates: true,
        skills: true,
        softSkills: true
      },
      warnings: Array.isArray(payload?.warnings) ? payload.warnings.map((item) => String(item || "")).filter(Boolean) : [],
      sourceType: payload?.sourceType === "ocr" ? "ocr" : "text",
      aiAssisted: Boolean(payload?.aiAssisted)
    };
  }

  function normalizePdfImportSectionMeta(value) {
    const fallback = {};
    [
      "profile",
      "summary",
      "professionalExperience",
      "internships",
      "projects",
      "education",
      "certificates",
      "skills",
      "softSkills"
    ].forEach((key) => {
      const item = value?.[key] || {};
      fallback[key] = {
        confidence: ["high", "medium", "low"].includes(item.confidence) ? item.confidence : "medium",
        warning: String(item.warning || "")
      };
    });
    return fallback;
  }

  function createPdfImportReviewPanel() {
    const review = state.pdfImport.review;
    if (!review) {
      return document.createDocumentFragment();
    }

    const panel = document.createElement("section");
    panel.className = "editor-pdf-import__review";

    const title = document.createElement("h3");
    title.className = "editor-card__title";
    title.textContent = locale.pdfImportReviewTitle;

    const meta = document.createElement("p");
    meta.className = "editor-section__description";
    meta.textContent = review.aiAssisted
      ? locale.pdfImportReviewMetaAi.replace("{source}", review.sourceType === "ocr" ? locale.pdfImportSourceOcr : locale.pdfImportSourceText)
      : locale.pdfImportReviewMeta.replace("{source}", review.sourceType === "ocr" ? locale.pdfImportSourceOcr : locale.pdfImportSourceText);

    panel.append(title, meta);

    review.warnings.forEach((warning) => panel.appendChild(createAtsNotice(warning, "is-warning")));

    panel.append(
      createPdfImportSectionCard("profile", locale.profileSectionTitle, createPdfImportProfileEditor),
      createPdfImportSectionCard("summary", locale.summarySectionTitle, createPdfImportSummaryEditor),
      createPdfImportSectionCard("professionalExperience", state.data.labels.professionalExperience, createPdfImportWorkEditor),
      createPdfImportSectionCard("internships", state.data.labels.internships, createPdfImportWorkEditor),
      createPdfImportSectionCard("projects", state.data.labels.projects, createPdfImportProjectsEditor),
      createPdfImportSectionCard("education", state.data.labels.education, createPdfImportEducationEditor),
      createPdfImportSectionCard("certificates", state.data.labels.certificates, createPdfImportCertificatesEditor),
      createPdfImportSectionCard("skills", state.data.labels.skills, createPdfImportSkillsEditor),
      createPdfImportSectionCard("softSkills", state.data.labels.softSkills, createPdfImportSoftSkillsEditor)
    );

    const actions = document.createElement("div");
    actions.className = "editor-actions";
    actions.append(
      createActionButton(locale.pdfImportApply, "is-primary", handleApplyPdfImportReview),
      createActionButton(locale.pdfImportCancel, "", () => {
        state.pdfImport.review = null;
        state.pdfImport.error = "";
        renderEditor();
      })
    );
    panel.appendChild(actions);
    return panel;
  }

  function createPdfImportSectionCard(sectionKey, titleText, renderContent) {
    const review = state.pdfImport.review;
    const card = document.createElement("section");
    card.className = "editor-card";

    const header = document.createElement("div");
    header.className = "editor-card__header";

    const title = document.createElement("h4");
    title.className = "editor-card__title";
    title.textContent = titleText;

    const toggle = createCheckboxField(locale.pdfImportIncludeSection, review.selectedSections[sectionKey], (checked) => {
      review.selectedSections[sectionKey] = checked;
    });

    header.append(title, toggle);
    card.appendChild(header);

    const meta = review.sectionMeta[sectionKey] || { confidence: "medium", warning: "" };
    card.appendChild(createAtsNotice(locale.pdfImportConfidence.replace("{level}", meta.confidence)));
    if (meta.warning) {
      card.appendChild(createAtsNotice(meta.warning, meta.confidence === "low" ? "is-warning" : ""));
    }

    const body = document.createElement("div");
    body.className = "editor-card__body";
    renderContent(body, review.data, sectionKey);
    card.appendChild(body);
    return card;
  }

  function createPdfImportProfileEditor(host, data) {
    const profile = data.profile;
    host.append(
      createInputField(locale.fields.name, profile.name, (value) => { profile.name = value; }),
      createInputField(locale.fields.photo, profile.photo || "", (value) => { profile.photo = value; }),
      createInputField(locale.fields.email, profile.email, (value) => { profile.email = value; }, { trackHistory: false }),
      createInputField(locale.fields.phone, profile.phone, (value) => { profile.phone = value; }, { trackHistory: false }),
      createInputField(locale.fields.phoneHref, profile.phoneHref || "", (value) => { profile.phoneHref = value; }, { trackHistory: false }),
      createInputField(locale.fields.location, profile.location, (value) => { profile.location = value; }, { trackHistory: false }),
      createInputField(locale.fields.linkedinLabel, profile.linkedinLabel || "", (value) => { profile.linkedinLabel = value; }, { trackHistory: false }),
      createInputField(locale.fields.linkedinHref, profile.linkedinHref || "", (value) => { profile.linkedinHref = value; }, { trackHistory: false }),
      createInputField(locale.fields.githubLabel, profile.githubLabel || "", (value) => { profile.githubLabel = value; }, { trackHistory: false }),
      createInputField(locale.fields.githubHref, profile.githubHref || "", (value) => { profile.githubHref = value; }, { trackHistory: false }),
      createInputField(locale.fields.portfolioLabel, profile.portfolioLabel || "", (value) => { profile.portfolioLabel = value; }, { trackHistory: false }),
      createInputField(locale.fields.portfolioHref, profile.portfolioHref || "", (value) => { profile.portfolioHref = value; }, { trackHistory: false })
    );
  }

  function createPdfImportSummaryEditor(host, data) {
    host.append(
      createTextAreaField(locale.fields.summary, data.summary || "", (value) => {
        data.summary = value;
      }, { rows: 6, trackHistory: false })
    );
  }

  function createPdfImportWorkEditor(host, data, sectionKey) {
    const list = data[sectionKey] || [];
    list.forEach((item, index) => {
      host.appendChild(
        createEditorCard({
          heading: `${index + 1}`,
          onMoveUp: index > 0 ? () => moveItem(list, index, index - 1) : null,
          onMoveDown: index < list.length - 1 ? () => moveItem(list, index, index + 1) : null,
          onRemove: () => {
            list.splice(index, 1);
            renderEditor();
          },
          body: [
            createInputField(locale.fields.date, item.date || "", (value) => { item.date = value; }, { trackHistory: false }),
            createInputField(locale.fields.location, item.location || "", (value) => { item.location = value; }, { trackHistory: false }),
            createInputField(locale.fields.organization, item.organization || "", (value) => { item.organization = value; }, { trackHistory: false }),
            createInputField(locale.fields.role, item.role || "", (value) => { item.role = value; }, { trackHistory: false }),
            createBulletEditor(item.bullets || (item.bullets = [""]), locale.fields.bullets)
          ]
        })
      );
    });

    host.appendChild(
      createActionButton(locale.addItem, "", () => {
        list.push({ date: "", location: "", organization: "", role: "", bullets: [""] });
        renderEditor();
      })
    );
  }

  function createPdfImportProjectsEditor(host, data) {
    const list = data.projects || [];
    list.forEach((item, index) => {
      host.appendChild(
        createEditorCard({
          heading: `${index + 1}`,
          onMoveUp: index > 0 ? () => moveItem(list, index, index - 1) : null,
          onMoveDown: index < list.length - 1 ? () => moveItem(list, index, index + 1) : null,
          onRemove: () => {
            list.splice(index, 1);
            renderEditor();
          },
          body: [
            createInputField(locale.fields.date, item.date || "", (value) => { item.date = value; }, { trackHistory: false }),
            createInputField(locale.fields.title, item.title || "", (value) => { item.title = value; }, { trackHistory: false }),
            createInputField(locale.fields.projectLinkLabel, item.linkLabel || "", (value) => { item.linkLabel = value; }, { trackHistory: false }),
            createInputField(locale.fields.projectLinkHref, item.linkHref || "", (value) => { item.linkHref = value; }, { trackHistory: false }),
            createBulletEditor(item.bullets || (item.bullets = [""]), locale.fields.bullets)
          ]
        })
      );
    });

    host.appendChild(
      createActionButton(locale.addItem, "", () => {
        list.push({ date: "", title: "", linkLabel: "", linkHref: "", bullets: [""] });
        renderEditor();
      })
    );
  }

  function createPdfImportEducationEditor(host, data) {
    const list = data.education || [];
    list.forEach((item, index) => {
      host.appendChild(
        createEditorCard({
          heading: `${index + 1}`,
          onMoveUp: index > 0 ? () => moveItem(list, index, index - 1) : null,
          onMoveDown: index < list.length - 1 ? () => moveItem(list, index, index + 1) : null,
          onRemove: () => {
            list.splice(index, 1);
            renderEditor();
          },
          body: [
            createInputField(locale.fields.date, item.date || "", (value) => { item.date = value; }, { trackHistory: false }),
            createInputField(locale.fields.location, item.location || "", (value) => { item.location = value; }, { trackHistory: false }),
            createInputField(locale.fields.degree, item.degree || "", (value) => { item.degree = value; }, { trackHistory: false }),
            createInputField(locale.fields.institution, item.institution || "", (value) => { item.institution = value; }, { trackHistory: false })
          ]
        })
      );
    });
  }

  function createPdfImportCertificatesEditor(host, data) {
    const list = data.certificates || [];
    list.forEach((item, index) => {
      host.appendChild(
        createEditorCard({
          heading: `${index + 1}`,
          onMoveUp: index > 0 ? () => moveItem(list, index, index - 1) : null,
          onMoveDown: index < list.length - 1 ? () => moveItem(list, index, index + 1) : null,
          onRemove: () => {
            list.splice(index, 1);
            renderEditor();
          },
          body: [
            createInputField(locale.fields.title, item.title || "", (value) => { item.title = value; }, { trackHistory: false }),
            createTextAreaField(locale.fields.description, item.description || "", (value) => { item.description = value; }, { rows: 3, trackHistory: false })
          ]
        })
      );
    });
  }

  function createPdfImportSkillsEditor(host, data) {
    const list = data.skills?.technical || [];
    list.forEach((item, index) => {
      host.appendChild(
        createEditorCard({
          heading: `${index + 1}`,
          onMoveUp: index > 0 ? () => moveItem(list, index, index - 1) : null,
          onMoveDown: index < list.length - 1 ? () => moveItem(list, index, index + 1) : null,
          onRemove: () => {
            list.splice(index, 1);
            renderEditor();
          },
          body: [
            createInputField(locale.fields.label, item.label || "", (value) => { item.label = value; }, { trackHistory: false }),
            createTextAreaField(locale.fields.items, item.items || "", (value) => { item.items = value; }, { rows: 3, trackHistory: false })
          ]
        })
      );
    });
  }

  function createPdfImportSoftSkillsEditor(host, data) {
    const list = data.skills?.soft || [];
    list.forEach((item, index) => {
      host.appendChild(
        createEditorCard({
          heading: `${index + 1}`,
          onMoveUp: index > 0 ? () => moveItem(list, index, index - 1) : null,
          onMoveDown: index < list.length - 1 ? () => moveItem(list, index, index + 1) : null,
          onRemove: () => {
            list.splice(index, 1);
            renderEditor();
          },
          body: [
            createInputField(locale.fields.skill, item || "", (value) => {
              list[index] = value;
            }, { trackHistory: false })
          ]
        })
      );
    });
  }

  function handleApplyPdfImportReview() {
    const review = state.pdfImport.review;
    if (!review) {
      return;
    }

    commitPendingHistory();
    const historyBefore = createHistorySnapshot();
    applyPdfImportReviewData(review);
    state.pdfImport.review = null;
    state.pdfImport.error = "";
    initializeDocument();
    commitHistorySnapshot(historyBefore);
    refreshAll();
  }

  function applyPdfImportReviewData(review) {
    const next = cloneData(state.data);
    if (review.selectedSections.profile) {
      next.profile = {
        ...cloneData(review.data.profile || next.profile),
        photo: String(review.data.profile?.photo || next.profile?.photo || "")
      };
    }
    if (review.selectedSections.summary) {
      next.summary = String(review.data.summary || "");
    }
    if (review.selectedSections.professionalExperience) {
      next.professionalExperience = cloneData(review.data.professionalExperience || []);
    }
    if (review.selectedSections.internships) {
      next.internships = cloneData(review.data.internships || []);
    }
    if (review.selectedSections.projects) {
      next.projects = cloneData(review.data.projects || []);
    }
    if (review.selectedSections.education) {
      next.education = cloneData(review.data.education || []);
    }
    if (review.selectedSections.certificates) {
      next.certificates = cloneData(review.data.certificates || []);
    }
    if (review.selectedSections.skills) {
      next.skills = next.skills || {};
      next.skills.technical = cloneData(review.data.skills?.technical || []);
    }
    if (review.selectedSections.softSkills) {
      next.skills = next.skills || {};
      next.skills.soft = cloneData(review.data.skills?.soft || []);
    }
    state.data = normalizeResumeData(next, buildResumeTemplateForLanguage(documentLanguage));
  }

  function renderEditor() {
    if (!editorSidebar) {
      return;
    }

    if (isCustomSectionKey(state.activeSection) && !getCustomSectionById(getCustomSectionIdFromKey(state.activeSection))) {
      state.activeSection = "sections";
    }

    syncLanguageSwitcher();
    atsResultsHost = null;
    qualityResultsHost = null;
    atsTextarea = null;
    draftStatusHost = null;
    draftSavedAtHost = null;
    undoButtonHost = null;
    redoButtonHost = null;
    translationPanelHost = null;
    contextualHelpTitleHost = null;
    contextualHelpTextHost = null;
    editorSidebar.innerHTML = "";
    const header = createEditorHeader();
    const nav = createEditorNav();
    const panel = createEditorPanel();
    editorSidebar.append(header, nav);
    if (isContextHelpEnabled()) {
      editorSidebar.appendChild(createContextualHelpPanel());
    }
    editorSidebar.appendChild(panel);
    resolvePendingEditorFocus();
  }

  function createEditorHeader() {
    const header = document.createElement("div");
    header.className = "editor-sidebar__header";

    const title = document.createElement("h1");
    title.className = "editor-sidebar__title";
    title.textContent = locale.editorTitle;

    const description = document.createElement("p");
    description.className = "editor-sidebar__description";
    description.textContent = locale.editorDescription;

    header.append(title, description, createPersistencePanel());
    return header;
  }

  function createPersistencePanel() {
    const panel = document.createElement("section");
    panel.className = "editor-persistence";

    const heading = document.createElement("h2");
    heading.className = "editor-persistence__title";
    heading.textContent = locale.persistenceTitle;

    const meta = document.createElement("div");
    meta.className = "editor-persistence__meta";

    const languageBadge = document.createElement("span");
    languageBadge.className = "editor-persistence__badge";
    languageBadge.textContent = documentLanguage === "ar" ? locale.languageArabic : locale.languageEnglish;

    const status = document.createElement("span");
    status.className = "editor-persistence__status";
    status.textContent = getDraftStatusText();
    draftStatusHost = status;

    meta.append(languageBadge, status);

    const savedAt = document.createElement("div");
    savedAt.className = "editor-persistence__saved-at";
    savedAt.textContent = state.draft.lastSavedAt ? `${locale.lastSavedLabel}: ${formatTimestamp(state.draft.lastSavedAt)}` : "";
    draftSavedAtHost = savedAt;
    meta.appendChild(savedAt);

    const historyActions = document.createElement("div");
    historyActions.className = "editor-actions";

    const undoButton = createActionButton(locale.undo, "", handleUndo, !canUndo());
    const redoButton = createActionButton(locale.redo, "", handleRedo, !canRedo());
    undoButtonHost = undoButton;
    redoButtonHost = redoButton;
    historyActions.append(undoButton, redoButton);

    const versionField = document.createElement("label");
    versionField.className = "editor-field";

    const versionLabel = document.createElement("span");
    versionLabel.className = "editor-field__label";
    versionLabel.textContent = locale.versionTitle;

    const select = document.createElement("select");
    select.className = "editor-input editor-select";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = locale.versionPlaceholder;
    select.appendChild(placeholder);

    state.presets.forEach((preset) => {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = preset.name;
      if (preset.id === state.selectedPresetId) {
        option.selected = true;
      }
      select.appendChild(option);
    });

    select.addEventListener("change", (event) => {
      state.selectedPresetId = event.target.value;
      state.translation.review = null;
      state.translation.error = "";
      state.translation.message = "";
      state.command.entries = {};
      state.command.workspace = createCommandWorkspaceState();
      renderEditor();
    });
    attachHelp(versionField, { helpKey: "persistence.versions", label: locale.versionTitle });
    attachHelp(select, { helpKey: "persistence.versions", label: locale.versionTitle });

    versionField.append(versionLabel, select);

    const selectedPreset = getSelectedPreset();
    const primaryActions = document.createElement("div");
    primaryActions.className = "editor-actions";
    primaryActions.append(
      createActionButton(locale.saveNewVersion, "is-primary", handleSaveNewPreset),
      createActionButton(locale.updateVersion, "", handleUpdatePreset, !selectedPreset),
      createActionButton(locale.loadVersion, "", handleLoadPreset, !selectedPreset),
      createActionButton(locale.renameVersion, "", handleRenamePreset, !selectedPreset),
      createActionButton(locale.deleteVersion, "", handleDeletePreset, !selectedPreset)
    );

    const versionMeta = document.createElement("div");
    versionMeta.className = "editor-persistence__meta";
    versionMeta.append(
      createInputField(locale.fields.targetRole, state.targeting.targetRole, (value) => {
        state.targeting.targetRole = value;
        scheduleQualityAnalysis();
        scheduleDraftSave();
      }),
      createInputField(locale.fields.company, state.targeting.company, (value) => {
        state.targeting.company = value;
        scheduleQualityAnalysis();
        scheduleDraftSave();
      }),
      createTextAreaField(locale.fields.focusKeywords, state.targeting.focusKeywords, (value) => {
        state.targeting.focusKeywords = value;
        scheduleQualityAnalysis();
        scheduleDraftSave();
      }, { rows: 3 }),
      createTextAreaField(locale.fields.versionNotes, state.targeting.notes, (value) => {
        state.targeting.notes = value;
        scheduleDraftSave();
      }, { rows: 3 })
    );

    const versionHint = document.createElement("p");
    versionHint.className = "editor-section__description";
    versionHint.textContent = locale.versionAtsHint;

    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = ".json,application/json";
    importInput.hidden = true;
    importInput.addEventListener("change", handleImportPresets);

    const secondaryActions = document.createElement("div");
    secondaryActions.className = "editor-actions";
    secondaryActions.append(
      createActionButton(locale.exportVersions, "", handleExportPresets),
      createActionButton(locale.importVersions, "", () => importInput.click()),
      createActionButton(locale.resetDraft, "", handleResetDraft),
      createActionButton(locale.clearLocalDraft, "", handleClearDraft, !state.draft.hasLocalDraft)
    );

    const pdfImportPanel = createPdfImportPanel();

    panel.append(
      heading,
      meta,
      historyActions,
      versionField,
      versionMeta,
      versionHint,
      primaryActions,
      secondaryActions,
      pdfImportPanel,
      importInput
    );
    return panel;
  }

  function createEditorNav() {
    const nav = document.createElement("nav");
    nav.className = "editor-nav";
    nav.setAttribute("aria-label", locale.editorNav);

    getSectionEntries().forEach((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "editor-nav__button";
      button.dataset.sectionKey = entry.key;
      if (entry.key === state.activeSection) {
        button.classList.add("is-active");
      }
      button.textContent = entry.label;
      button.addEventListener("click", () => openEditorSection(entry.key));
      attachHelp(button, { helpKey: `section:${entry.key}`, label: entry.label });
      nav.appendChild(button);
    });

    return nav;
  }

  function createTranslationPanel() {
    const section = document.createElement("section");
    section.className = "editor-translation";
    attachHelp(section, { helpKey: "section.translation", label: locale.translationTitle });

    const heading = document.createElement("h3");
    heading.className = "editor-card__title";
    heading.textContent = locale.translationTitle;
    attachHelp(heading, { helpKey: "section.translation", label: locale.translationTitle });
    section.appendChild(heading);

    const selectedPreset = getSelectedPreset();
    if (!selectedPreset) {
      section.appendChild(createAtsNotice(locale.translationSelectVersion));
      return section;
    }

    if (documentLanguage === "en") {
      const linkedContext = getLinkedArabicContext(selectedPreset);
      const summary = document.createElement("p");
      summary.className = "editor-section__description";
      summary.textContent = linkedContext.arabicVersion
        ? locale.translationLinkedStatus
          .replace("{name}", linkedContext.arabicVersion.name)
          .replace("{status}", linkedContext.status === "needs-sync" ? locale.translationNeedsSync : locale.translationUpToDate)
        : locale.translationNoLinkedArabic;
      section.appendChild(summary);

      if (linkedContext.arabicVersion?.lastTranslationAt) {
        const stamp = document.createElement("p");
        stamp.className = "editor-section__description";
        stamp.textContent = `${locale.translationLastSynced}: ${formatTimestamp(linkedContext.arabicVersion.lastTranslationAt)}`;
        section.appendChild(stamp);
      }

      const actions = document.createElement("div");
      actions.className = "editor-actions";
      actions.append(
        createActionButton(
          linkedContext.arabicVersion ? locale.translationSyncArabic : locale.translationGenerateArabic,
          "is-primary",
          () => handleGenerateArabicReview(linkedContext),
          state.translation.loading
        ),
        createActionButton(locale.translationOpenArabic, "", () => openLinkedArabicVersion(selectedPreset), !linkedContext.arabicVersion)
      );
      section.appendChild(actions);

      if (state.translation.loading) {
        section.appendChild(createAtsNotice(locale.translationGenerating));
      }

      if (state.translation.message) {
        section.appendChild(createAtsNotice(state.translation.message));
      }

      if (state.translation.error) {
        section.appendChild(createAtsNotice(state.translation.error, "is-warning"));
      }

      if (state.translation.review?.sourceVersionId === selectedPreset.id) {
        section.appendChild(createTranslationReviewPanel(state.translation.review));
      }

      return section;
    }

    const sourceContext = getArabicSourceContext(selectedPreset);
    const summary = document.createElement("p");
    summary.className = "editor-section__description";
    summary.textContent = sourceContext.sourceVersion
      ? locale.translationDerivedStatus
        .replace("{name}", sourceContext.sourceVersion.name)
        .replace("{status}", sourceContext.status === "needs-sync" ? locale.translationNeedsSync : locale.translationUpToDate)
      : locale.translationArabicStandalone;
    section.appendChild(summary);

    if (selectedPreset.lastTranslationAt) {
      const stamp = document.createElement("p");
      stamp.className = "editor-section__description";
      stamp.textContent = `${locale.translationLastSynced}: ${formatTimestamp(selectedPreset.lastTranslationAt)}`;
      section.appendChild(stamp);
    }

    const overridden = Object.keys(normalizeManualOverrides(state.translation.currentOverrides));
    if (overridden.length) {
      section.appendChild(
        createAtsNotice(
          locale.translationOverridesNotice.replace("{count}", String(overridden.length)),
          "is-warning"
        )
      );
    }

    if (sourceContext.sourceVersion) {
      const actionRow = document.createElement("div");
      actionRow.className = "editor-actions";
      actionRow.appendChild(createActionButton(locale.translationOpenEnglish, "", () => openEnglishSourceVersion(selectedPreset)));
      section.appendChild(actionRow);
    }

    return section;
  }

  function createTranslationReviewPanel(review) {
    const panel = document.createElement("div");
    panel.className = "editor-translation-review";
    attachHelp(panel, { helpKey: "translation.review", label: locale.translationTitle });

    const description = document.createElement("p");
    description.className = "editor-section__description";
    description.textContent = locale.translationReviewHint.replace("{count}", String(review.items.length));
    panel.appendChild(description);

    const toggles = document.createElement("div");
    toggles.className = "editor-actions";
    toggles.append(
      createActionButton(locale.translationSelectAll, "", () => {
        review.items.forEach((item) => {
          item.apply = true;
        });
        renderEditor();
      }),
      createActionButton(locale.translationSelectNone, "", () => {
        review.items.forEach((item) => {
          item.apply = false;
        });
        renderEditor();
      }),
      createActionButton(locale.translationApplySelected, "is-primary", handleApplyArabicReview, !review.items.some((item) => item.apply))
    );
    panel.appendChild(toggles);

    review.items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "editor-translation-item";

      const top = document.createElement("div");
      top.className = "editor-translation-item__top";

      const check = document.createElement("label");
      check.className = "editor-checkbox";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(item.apply);
      input.addEventListener("change", (event) => {
        item.apply = event.target.checked;
        renderEditor();
      });
      const text = document.createElement("span");
      text.textContent = item.label;
      check.append(input, text);
      top.appendChild(check);
      card.appendChild(top);

      card.appendChild(createTranslationExcerpt(locale.translationSourceLabel, item.sourceExcerpt));
      card.appendChild(createTranslationExcerpt(locale.translationCurrentArabicLabel, item.currentExcerpt));
      card.appendChild(createTranslationExcerpt(locale.translationProposedArabicLabel, item.proposedExcerpt));

      if (item.note) {
        card.appendChild(createAtsNotice(item.note));
      }

      panel.appendChild(card);
    });

    return panel;
  }

  function createTranslationExcerpt(labelText, content) {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-translation-item__excerpt";

    const label = document.createElement("p");
    label.className = "editor-field__label";
    label.textContent = labelText;

    const body = document.createElement("p");
    body.className = "editor-translation-item__text";
    body.textContent = content || locale.translationEmptyExcerpt;

    wrapper.append(label, body);
    return wrapper;
  }

  function createEditorPanel() {
    const panel = document.createElement("section");
    panel.className = "editor-panel";

    switch (state.activeSection) {
      case "profile":
        panel.appendChild(renderProfileEditor());
        break;
      case "summary":
        panel.appendChild(renderSummaryEditor());
        break;
      case "sections":
        panel.appendChild(renderSectionsEditor());
        break;
      case "style":
        panel.appendChild(renderStyleEditor());
        break;
      case "commands":
        panel.appendChild(renderCommandsEditor());
        break;
      case "aiHr":
        panel.appendChild(renderAiHrEditor());
        break;
      case "coverLetter":
        panel.appendChild(renderCoverLetterEditor());
        break;
      case "professionalExperience":
        panel.appendChild(renderWorkLikeSection({
          sectionKey: "professionalExperience",
          title: state.data.labels.professionalExperience,
          createEmptyItem: () => ({
            date: "",
            location: "",
            organization: "",
            role: "",
            bullets: [""]
          })
        }));
        break;
      case "internships":
        panel.appendChild(renderWorkLikeSection({
          sectionKey: "internships",
          title: state.data.labels.internships,
          createEmptyItem: () => ({
            date: "",
            location: "",
            organization: "",
            role: "",
            bullets: [""]
          })
        }));
        break;
      case "projects":
        panel.appendChild(renderProjectsEditor());
        break;
      case "education":
        panel.appendChild(renderEducationEditor());
        break;
      case "certificates":
        panel.appendChild(renderCertificatesEditor());
        break;
      case "skills":
        panel.appendChild(renderTechnicalSkillsEditor());
        break;
      case "softSkills":
        panel.appendChild(renderSoftSkillsEditor());
        break;
      case "ats":
        panel.appendChild(renderAtsEditor());
        break;
      case "quality":
        panel.appendChild(renderQualityEditor());
        break;
      default:
        if (isCustomSectionKey(state.activeSection)) {
          panel.appendChild(renderSectionsEditor(getCustomSectionIdFromKey(state.activeSection)));
        } else {
          panel.appendChild(renderSummaryEditor());
        }
        break;
    }

    return panel;
  }

  function renderProfileEditor() {
    const wrapper = createEditorSection(state.data.labels.profile || locale.profileSectionTitle, locale.profileSectionDescription, {
      sectionKey: "profile",
      focusSelector: "input, textarea, select"
    });
    wrapper.append(
      createInputField(locale.fields.name, state.data.profile.name, (value) => {
        state.data.profile.name = value;
        schedulePreviewRender();
      }, { fieldKey: "name" }),
      createInputField(locale.fields.photo, state.data.profile.photo || "", (value) => {
        state.data.profile.photo = value;
        schedulePreviewRender();
      }, { fieldKey: "photo" }),
      createInputField(locale.fields.email, state.data.profile.email, (value) => {
        state.data.profile.email = value;
        schedulePreviewRender();
      }, { type: "email", fieldKey: "email" }),
      createInputField(locale.fields.phone, state.data.profile.phone, (value) => {
        state.data.profile.phone = value;
        schedulePreviewRender();
      }, { fieldKey: "phone" }),
      createInputField(locale.fields.phoneHref, state.data.profile.phoneHref || "", (value) => {
        state.data.profile.phoneHref = value;
        schedulePreviewRender();
      }, { fieldKey: "phoneHref" }),
      createInputField(locale.fields.location, state.data.profile.location, (value) => {
        state.data.profile.location = value;
        schedulePreviewRender();
      }, { fieldKey: "location" }),
      createInputField(locale.fields.linkedinLabel, state.data.profile.linkedinLabel, (value) => {
        state.data.profile.linkedinLabel = value;
        schedulePreviewRender();
      }, { fieldKey: "linkedinLabel" }),
      createInputField(locale.fields.linkedinHref, state.data.profile.linkedinHref, (value) => {
        state.data.profile.linkedinHref = value;
        schedulePreviewRender();
      }, { fieldKey: "linkedinHref" }),
      createInputField(locale.fields.githubLabel, state.data.profile.githubLabel || "", (value) => {
        state.data.profile.githubLabel = value;
        schedulePreviewRender();
      }, { fieldKey: "githubLabel" }),
      createInputField(locale.fields.githubHref, state.data.profile.githubHref || "", (value) => {
        state.data.profile.githubHref = value;
        schedulePreviewRender();
      }, { fieldKey: "githubHref" }),
      createInputField(locale.fields.portfolioLabel, state.data.profile.portfolioLabel || "", (value) => {
        state.data.profile.portfolioLabel = value;
        schedulePreviewRender();
      }, { fieldKey: "portfolioLabel" }),
      createInputField(locale.fields.portfolioHref, state.data.profile.portfolioHref || "", (value) => {
        state.data.profile.portfolioHref = value;
        schedulePreviewRender();
      }, { fieldKey: "portfolioHref" })
    );
    return wrapper;
  }

  function renderSummaryEditor() {
    const wrapper = createEditorSection(state.data.labels.summary, locale.summarySectionDescription, {
      sectionKey: "summary",
      focusSelector: "textarea"
    });
    const titleField = createBuiltInSectionTitleField("summary");
    if (titleField) {
      wrapper.appendChild(titleField);
    }
    wrapper.append(
      createTextAreaField(locale.fields.summary, state.data.summary, (value) => {
        state.data.summary = value;
        schedulePreviewRender();
      }, { rows: 8 })
    );
    return wrapper;
  }

  function renderSectionsEditor(focusCustomId = "") {
    const wrapper = createEditorSection(locale.sectionsTitle, locale.sectionsDescription, {
      sectionKey: "sections",
      focusSelector: ".editor-card input, .editor-card textarea, .editor-card select"
    });

    const addRow = document.createElement("div");
    addRow.className = "editor-actions";
    addRow.appendChild(createActionButton(locale.addCustomSection, "is-primary", () => {
      commitPendingHistory();
      const historyBefore = createHistorySnapshot();
      const nextOrder = getOrderedResumeSections(state.data, { includeHidden: true }).length;
      const section = {
        id: createCustomSectionId(state.data.customSections.length),
        title: `${locale.customSectionFallback} ${state.data.customSections.length + 1}`,
        visible: true,
        order: nextOrder,
        layout: "single-list",
        items: [{ text: "", title: "", description: "" }]
      };
      state.data.customSections.push(section);
      rebalanceSectionOrders(state.data);
      state.activeSection = `custom:${section.id}`;
      commitHistorySnapshot(historyBefore);
      refreshAll();
    }));
    wrapper.appendChild(addRow);

    const orderEntries = getOrderedResumeSections(state.data, { includeHidden: true }).map((entry) => ({
      key: entry.key,
      title: entry.title,
      type: entry.type
    }));

    orderEntries.forEach((entry, index) => {
      if (entry.type === "custom") {
        const customSection = getCustomSectionById(getCustomSectionIdFromKey(entry.key));
        if (customSection) {
          wrapper.appendChild(renderCustomSectionCard(customSection, orderEntries, index, focusCustomId));
        }
        return;
      }

      wrapper.appendChild(renderBuiltInSectionConfigCard(entry.key, orderEntries, index));
    });

    return wrapper;
  }

  function renderCommandsEditor() {
    const wrapper = createEditorSection(locale.commandsTitle, locale.commandsDescription, {
      sectionKey: "commands",
      focusSelector: "textarea, input, select, button"
    });

    const workspace = state.command.workspace;
    wrapper.appendChild(createAtsNotice(locale.commandsWorkflowHint));
    wrapper.appendChild(renderCommandsTargetPicker());
    wrapper.append(
      createTextAreaField(locale.commandsPromptLabel, workspace.command, (value) => {
        state.command.workspace.command = value;
        state.command.workspace.error = "";
      }, {
        rows: 3,
        placeholder: locale.commandsPromptPlaceholder,
        trackHistory: false,
        helpKey: "commands.prompt"
      }),
      createTextAreaField(locale.commandsContentLabel, workspace.content, (value) => {
        state.command.workspace.content = value;
        state.command.workspace.error = "";
      }, {
        rows: 10,
        placeholder: locale.commandsContentPlaceholder,
        trackHistory: false,
        helpKey: "commands.content"
      })
    );

    const actions = document.createElement("div");
    actions.className = "editor-actions";
    actions.append(
      createActionButton(locale.commandsGeneratePreview, "is-primary", handleGenerateCommandWorkspacePreview, workspace.loading, { helpKey: "commands.preview" }),
      createActionButton(locale.commandsApply, "", handleApplyCommandWorkspacePreview, !workspace.preview || workspace.loading, { helpKey: "commands.apply" }),
      createActionButton(locale.commandsClear, "", handleClearCommandWorkspace, workspace.loading, { helpKey: "commands.clear" })
    );
    wrapper.appendChild(actions);

    const translationPanel = createCommandsArabicSyncPanel();
    if (translationPanel) {
      wrapper.appendChild(translationPanel);
    }

    const fallback = document.createElement("details");
    fallback.className = "editor-command";
    fallback.open = Boolean(workspace.showFallbackSettings);
    fallback.addEventListener("toggle", () => {
      state.command.workspace.showFallbackSettings = fallback.open;
    });

    const summary = document.createElement("summary");
    summary.textContent = locale.aiWorkspaceTitle;
    attachHelp(summary, { helpKey: "commands.fallback", label: locale.commandsFallbackTitle });
    fallback.appendChild(summary);

    const fallbackFields = document.createElement("div");
    fallbackFields.className = "editor-persistence__meta";
    const providerChoices = [
      { value: "openrouter:auto", label: locale.aiProviderOpenRouterAuto },
      { value: "openrouter:free", label: locale.aiProviderOpenRouterFree },
      { value: "openrouter:manual", label: locale.aiProviderOpenRouterManual },
      { value: "openai:manual", label: locale.aiProviderOpenAi }
    ];
    fallbackFields.append(
      createCheckboxField(locale.commandsFallbackEnabled, state.ai.enabled, (checked) => {
        state.ai.enabled = checked;
        persistAiConfig();
      }, { trackHistory: false, helpKey: "commands.fallbackEnabled" }),
      createSelectField(locale.aiProvider, `${state.ai.provider}:${state.ai.mode}`, providerChoices, (value) => {
        const previousDefault = getDefaultAiModel(state.ai.provider, state.ai.mode);
        applyAiProviderSelection(value);
        if (!state.ai.model || state.ai.model === previousDefault) {
          state.ai.model = getDefaultAiModel(state.ai.provider, state.ai.mode);
        }
        persistAiConfig();
        renderEditor();
      }, { trackHistory: false, helpKey: "commands.fallbackProvider" }),
      createInputField(locale.aiApiKey, state.ai.apiKey, (value) => {
        state.ai.apiKey = value;
        state.ai.provider = normalizeAiProvider(state.ai.provider, value);
        persistAiConfig();
        renderEditor();
      }, {
        type: "password",
        placeholder: getAiApiKeyPlaceholder(state.ai.provider),
        trackHistory: false,
        helpKey: "commands.fallbackApiKey"
      })
    );
    if (shouldShowAiModelInput()) {
      fallbackFields.append(
        createInputField(locale.aiModel, state.ai.model, (value) => {
          state.ai.model = value;
          persistAiConfig();
        }, {
          placeholder: getAiModelPlaceholder(state.ai.provider, state.ai.mode),
          trackHistory: false,
          helpKey: "commands.fallbackModel"
        })
      );
    }
    fallback.append(
      fallbackFields,
      createAtsNotice(locale.aiWorkspaceDescription),
      createAtsNotice(formatAiHint())
    );
    wrapper.appendChild(fallback);

    if (workspace.loading) {
      wrapper.appendChild(createAtsNotice(locale.commandsLoading));
      return wrapper;
    }

    if (workspace.error) {
      wrapper.appendChild(createAtsNotice(workspace.error, "is-warning"));
    }

    if (workspace.preview) {
      wrapper.appendChild(renderCommandWorkspacePreview(workspace.preview));
    }

    return wrapper;
  }

  function createCommandsArabicSyncPanel() {
    if (documentLanguage !== "en") {
      return null;
    }

    const panel = document.createElement("section");
    panel.className = "editor-command";
    attachHelp(panel, { helpKey: "translation.review", label: locale.translationTitle });

    const heading = document.createElement("h3");
    heading.className = "editor-card__title";
    heading.textContent = locale.translationTitle;
    panel.appendChild(heading);

    const selectedPreset = getSelectedPreset();
    if (!selectedPreset) {
      panel.appendChild(createAtsNotice(locale.translationSelectVersion));
      return panel;
    }

    const linkedContext = getLinkedArabicContext(selectedPreset);
    const summary = document.createElement("p");
    summary.className = "editor-section__description";
    summary.textContent = linkedContext.arabicVersion
      ? locale.translationLinkedStatus
        .replace("{name}", linkedContext.arabicVersion.name)
        .replace("{status}", linkedContext.status === "needs-sync" ? locale.translationNeedsSync : locale.translationUpToDate)
      : locale.translationNoLinkedArabic;
    panel.appendChild(summary);

    if (linkedContext.arabicVersion?.lastTranslationAt) {
      const stamp = document.createElement("p");
      stamp.className = "editor-section__description";
      stamp.textContent = `${locale.translationLastSynced}: ${formatTimestamp(linkedContext.arabicVersion.lastTranslationAt)}`;
      panel.appendChild(stamp);
    }

    const actions = document.createElement("div");
    actions.className = "editor-actions";
    actions.append(
      createActionButton(
        linkedContext.arabicVersion ? locale.translationSyncArabic : locale.translationGenerateArabic,
        "is-primary",
        () => handleGenerateArabicReview(linkedContext),
        state.translation.loading
      ),
      createActionButton(locale.translationOpenArabic, "", () => openLinkedArabicVersion(selectedPreset), !linkedContext.arabicVersion)
    );
    panel.appendChild(actions);

    if (state.translation.loading) {
      panel.appendChild(createAtsNotice(locale.translationGenerating));
    }

    if (state.translation.message) {
      panel.appendChild(createAtsNotice(state.translation.message));
    }

    if (state.translation.error) {
      panel.appendChild(createAtsNotice(state.translation.error, "is-warning"));
    }

    if (state.translation.review?.sourceVersionId === selectedPreset.id) {
      panel.appendChild(createTranslationReviewPanel(state.translation.review));
    }

    return panel;
  }

  function renderCommandsTargetPicker() {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-command";

    const label = document.createElement("p");
    label.className = "editor-field__label";
    label.textContent = locale.commandsTargetsLabel;
    wrapper.appendChild(label);

    const grid = document.createElement("div");
    grid.className = "editor-persistence__meta";

    getCommandTargetOptions().forEach((option) => {
      grid.appendChild(
        createCheckboxField(option.label, state.command.workspace.selectedSections.includes(option.key), (checked) => {
          const current = new Set(state.command.workspace.selectedSections);
          if (checked) {
            current.add(option.key);
          } else {
            current.delete(option.key);
          }
          state.command.workspace.selectedSections = Array.from(current);
          state.command.workspace.error = "";
          renderEditor();
        }, { trackHistory: false, helpKey: "commands.targets" })
      );
    });

    wrapper.appendChild(grid);
    return wrapper;
  }

  function renderCommandWorkspacePreview(preview) {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-command";

    wrapper.appendChild(createAtsNotice(
      preview.source === "fallback"
        ? locale.commandsFallbackPreviewReady
        : locale.commandsLocalPreviewReady
    ));

    preview.sections.forEach((section) => {
      const card = document.createElement("div");
      card.className = "editor-command__preview";

      const title = document.createElement("p");
      title.className = "editor-field__label";
      title.textContent = section.label;

      card.append(
        title,
        createCommandPreviewBlock(locale.commandsBeforeLabel, section.beforeText),
        createCommandPreviewBlock(locale.commandsAfterLabel, section.afterText)
      );

      if (section.note) {
        card.appendChild(createAtsNotice(section.note));
      }

      wrapper.appendChild(card);
    });

    if (preview.note) {
      wrapper.appendChild(createAtsNotice(preview.note));
    }

    return wrapper;
  }

  function getCommandTargetOptions() {
    const base = [
      "profile",
      "summary",
      "professionalExperience",
      "internships",
      "projects",
      "education",
      "certificates",
      "skills",
      "softSkills",
      "coverLetter"
    ].map((key) => ({
      key,
      label: getSectionLabel(key)
    }));

    return base.concat(
      (state.data.customSections || []).map((section) => ({
        key: `custom:${section.id}`,
        label: section.title || locale.customSectionFallback
      }))
    );
  }

  function renderBuiltInSectionConfigCard(sectionKey, orderEntries, index) {
    const config = getBuiltInSectionConfig(sectionKey);
    const titleText = getSectionLabel(sectionKey);
    const titleField = createInputField(locale.sectionTitleField, config?.title || titleText, (value) => {
      const nextTitle = String(value || "").trim() || getDefaultBuiltInSectionTitle(sectionKey, state.data.labels, locale);
      if (config) {
        config.title = nextTitle;
      }
      state.data.labels[sectionKey] = nextTitle;
      updateNavButtonLabel(sectionKey, nextTitle);
      schedulePreviewRender();
    });
    const card = createEditorCard({
      heading: titleText,
      dragConfig: { list: orderEntries, index, onReorder: applySectionEntryOrder },
      onMoveUp: index > 0 ? () => moveSectionEntry(orderEntries, index, index - 1) : null,
      onMoveDown: index < orderEntries.length - 1 ? () => moveSectionEntry(orderEntries, index, index + 1) : null,
      body: [
        titleField,
        createCheckboxField(locale.sectionVisibleField, config?.visible !== false, (checked) => {
          commitPendingHistory();
          const historyBefore = createHistorySnapshot();
          if (config) {
            config.visible = checked;
          }
          commitHistorySnapshot(historyBefore);
          refreshAll();
        }),
        createAtsNotice(locale.sectionBuiltInNotice)
      ]
    });
    const fieldInput = titleField.querySelector("input");
    fieldInput?.addEventListener("input", () => {
      const heading = card.querySelector(".editor-card__title");
      if (heading) {
        heading.textContent = fieldInput.value.trim() || titleText;
      }
    });
    return card;
  }

  function renderCustomSectionCard(customSection, orderEntries, index, focusCustomId = "") {
    const customKey = `custom:${customSection.id}`;
    const titleField = createInputField(locale.sectionTitleField, customSection.title, (value) => {
      customSection.title = String(value || "").trim() || locale.customSectionFallback;
      updateNavButtonLabel(customKey, customSection.title);
      schedulePreviewRender();
    });
    const card = createEditorCard({
      heading: customSection.title || locale.customSectionFallback,
      targetMeta: {
        sectionKey: customKey,
        itemKind: "custom-section"
      },
      dragConfig: { list: orderEntries, index, onReorder: applySectionEntryOrder },
      onMoveUp: index > 0 ? () => moveSectionEntry(orderEntries, index, index - 1) : null,
      onMoveDown: index < orderEntries.length - 1 ? () => moveSectionEntry(orderEntries, index, index + 1) : null,
      onRemove: () => {
        const customIndex = state.data.customSections.findIndex((item) => item.id === customSection.id);
        if (customIndex === -1) {
          return;
        }
        state.data.customSections.splice(customIndex, 1);
        rebalanceSectionOrders(state.data);
        if (state.activeSection === `custom:${customSection.id}`) {
          state.activeSection = "sections";
        }
      },
      body: [
        titleField,
        createCheckboxField(locale.sectionVisibleField, customSection.visible !== false, (checked) => {
          commitPendingHistory();
          const historyBefore = createHistorySnapshot();
          customSection.visible = checked;
          commitHistorySnapshot(historyBefore);
          refreshAll();
        }),
        createSelectField(locale.customSectionLayoutLabel, customSection.layout, [
          { value: "single-list", label: locale.customLayoutSingleList },
          { value: "two-column-list", label: locale.customLayoutTwoColumnList },
          { value: "certificate-cards", label: locale.customLayoutCertificateCards }
        ], (value) => {
          customSection.layout = normalizeCustomSectionLayout(value);
          if (!customSection.items.length) {
            customSection.items.push({ text: "", title: "", description: "" });
          }
          refreshAll();
        })
      ]
    });

    const body = card.querySelector(".editor-card__body");
    if (body) {
      body.appendChild(renderCustomSectionItemsEditor(customSection));
      if (focusCustomId && focusCustomId === customSection.id) {
        card.classList.add("editor-focus-flash");
      }
    }
    const fieldInput = titleField.querySelector("input");
    fieldInput?.addEventListener("input", () => {
      const heading = card.querySelector(".editor-card__title");
      if (heading) {
        heading.textContent = fieldInput.value.trim() || locale.customSectionFallback;
      }
    });
    return card;
  }

  function renderCustomSectionItemsEditor(customSection) {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-custom-section";

    const description = document.createElement("p");
    description.className = "editor-section__description";
    description.textContent = getCustomLayoutDescription(customSection.layout);
    wrapper.appendChild(description);

    const rows = document.createElement("div");
    rows.className = "editor-custom-section__items";

    const list = customSection.items;
    list.forEach((item, index) => {
      const row = document.createElement("div");
      row.className = "editor-custom-section__item";
      applyEditorTarget(row, {
        sectionKey: `custom:${customSection.id}`,
        itemIndex: index,
        itemKind: customSection.layout,
        focusSelector: "input, textarea"
      });

      const actions = document.createElement("div");
      actions.className = "editor-inline-actions";
      actions.append(
        createDragHandle(),
        createIconButton(locale.moveUp, "is-ghost", index > 0 ? () => moveItem(list, index, index - 1) : null, index === 0),
        createIconButton(locale.moveDown, "is-ghost", index < list.length - 1 ? () => moveItem(list, index, index + 1) : null, index >= list.length - 1),
        createIconButton(locale.remove, "is-danger", () => {
          list.splice(index, 1);
          if (!list.length) {
            list.push({ text: "", title: "", description: "" });
          }
        }, false)
      );

      const fields = document.createElement("div");
      fields.className = "editor-custom-section__fields";
      if (customSection.layout === "certificate-cards") {
        fields.append(
          createInputField(locale.fields.title, item.title || "", (value) => {
            item.title = value;
            schedulePreviewRender();
          }),
          createTextAreaField(locale.fields.description, item.description || "", (value) => {
            item.description = value;
            schedulePreviewRender();
          }, { rows: 3 })
        );
      } else {
        fields.append(
          createInputField(locale.customSectionItemLabel, item.text || "", (value) => {
            item.text = value;
            schedulePreviewRender();
          })
        );
      }

      row.append(fields, actions);
      enableDragReorder(row, list, index);
      rows.appendChild(row);
    });

    const addRow = document.createElement("div");
    addRow.className = "editor-actions";
    addRow.appendChild(createActionButton(locale.addCustomSectionItem, "is-primary", () => {
      commitPendingHistory();
      const historyBefore = createHistorySnapshot();
      list.push({ text: "", title: "", description: "" });
      commitHistorySnapshot(historyBefore);
      refreshAll();
    }));

    wrapper.append(rows, addRow);
    return wrapper;
  }

  function moveSectionEntry(entries, fromIndex, toIndex) {
    commitPendingHistory();
    const historyBefore = createHistorySnapshot();
    moveItem(entries, fromIndex, toIndex);
    applySectionEntryOrder(entries);
    commitHistorySnapshot(historyBefore);
    refreshAll();
  }

  function updateNavButtonLabel(sectionKey, label) {
    document.querySelectorAll(`.editor-nav__button[data-section-key="${sectionKey}"]`).forEach((button) => {
      button.textContent = label;
    });
  }

  function getCustomLayoutDescription(layout) {
    const map = {
      "single-list": locale.customLayoutSingleListHelp,
      "two-column-list": locale.customLayoutTwoColumnListHelp,
      "certificate-cards": locale.customLayoutCertificateCardsHelp
    };
    return map[normalizeCustomSectionLayout(layout)] || map["single-list"];
  }

  function renderCoverLetterEditor() {
    const wrapper = createEditorSection(locale.coverLetterTitle, locale.coverLetterDescription, {
      sectionKey: "coverLetter",
      focusSelector: "textarea, input"
    });
    const selectedPreset = getSelectedPreset();

    if (!selectedPreset) {
      wrapper.appendChild(createAtsNotice(locale.coverLetterUnsavedNotice, "is-warning"));
    } else {
      wrapper.appendChild(
        createAtsNotice(locale.coverLetterVersionNotice.replace("{name}", selectedPreset.name))
      );
    }

    const actions = document.createElement("div");
    actions.className = "editor-actions";
    actions.append(
      createActionButton(locale.coverLetterGenerate, "is-primary", handleGenerateCoverLetterSuggestion, state.coverLetterAssistant.loading),
      createActionButton(locale.coverLetterApply, "", handleApplyCoverLetterSuggestion, !state.coverLetterAssistant.suggestion || state.coverLetterAssistant.loading),
      createActionButton(locale.coverLetterCopy, "", handleCopyCoverLetter),
      createActionButton(locale.coverLetterSavePdf, "", () => handleLivePdfExport("cover-letter"))
    );

    wrapper.append(
      createInputField(locale.fields.recipientName, state.coverLetter.recipientName, (value) => {
        state.coverLetter.recipientName = value;
        schedulePreviewRender();
      }),
      createInputField(locale.fields.company, state.coverLetter.company, (value) => {
        state.coverLetter.company = value;
        schedulePreviewRender();
      }),
      createInputField(locale.fields.targetRole, state.coverLetter.targetRole, (value) => {
        state.coverLetter.targetRole = value;
        schedulePreviewRender();
      }),
      createInputField(locale.fields.hiringManager, state.coverLetter.hiringManager, (value) => {
        state.coverLetter.hiringManager = value;
        schedulePreviewRender();
      }),
      createTextAreaField(locale.fields.coverLetterOpening, state.coverLetter.opening, (value) => {
        state.coverLetter.opening = value;
        schedulePreviewRender();
      }, { rows: 4 }),
      createTextAreaField(locale.fields.coverLetterBody, state.coverLetter.body, (value) => {
        state.coverLetter.body = value;
        schedulePreviewRender();
      }, { rows: 10 }),
      createTextAreaField(locale.fields.coverLetterClosing, state.coverLetter.closing, (value) => {
        state.coverLetter.closing = value;
        schedulePreviewRender();
      }, { rows: 4 }),
      createInputField(locale.fields.signatureName, state.coverLetter.signatureName, (value) => {
        state.coverLetter.signatureName = value;
        schedulePreviewRender();
      }),
      createTextAreaField(locale.fields.coverLetterNotes, state.coverLetter.notes, (value) => {
        state.coverLetter.notes = value;
        schedulePreviewRender();
      }, { rows: 3 }),
      actions
    );

    wrapper.appendChild(createAtsNotice(locale.aiSharedWorkspaceHint));

    if (state.coverLetterAssistant.loading) {
      wrapper.appendChild(createAtsNotice(locale.coverLetterGenerating));
    }

    if (state.coverLetterAssistant.error) {
      wrapper.appendChild(createAtsNotice(state.coverLetterAssistant.error, "is-warning"));
    }

    if (state.coverLetterAssistant.suggestion) {
      wrapper.appendChild(createCoverLetterSuggestionCard(state.coverLetterAssistant.suggestion));
    }

    return wrapper;
  }

  function renderWorkLikeSection({ sectionKey, title, createEmptyItem }) {
    const section = createRepeatableSection({
      sectionKey,
      title,
      description: locale.liveUpdates,
      addLabel: locale.addItem,
      onAdd: () => {
        state.data[sectionKey].push(createEmptyItem());
        refreshAll();
      }
    });

    state.data[sectionKey].forEach((item, index) => {
      section.appendChild(
        createEditorCard({
          heading: `${title} ${index + 1}`,
          targetMeta: {
            sectionKey,
            itemIndex: index,
            itemKind: "timeline-item"
          },
          dragConfig: { list: state.data[sectionKey], index },
          onMoveUp: index > 0 ? () => moveItem(state.data[sectionKey], index, index - 1) : null,
          onMoveDown: index < state.data[sectionKey].length - 1 ? () => moveItem(state.data[sectionKey], index, index + 1) : null,
          onRemove: () => {
            state.data[sectionKey].splice(index, 1);
            refreshAll();
          },
          body: [
            createInputField(locale.fields.date, item.date || "", (value) => {
              item.date = value;
              schedulePreviewRender();
            }),
            createInputField(locale.fields.location, item.location || "", (value) => {
              item.location = value;
              schedulePreviewRender();
            }),
            createInputField(locale.fields.organization, item.organization || "", (value) => {
              item.organization = value;
              schedulePreviewRender();
            }),
            createInputField(locale.fields.role, item.role || "", (value) => {
              item.role = value;
              schedulePreviewRender();
            }),
            createBulletEditor(item.bullets, locale.fields.bullets, {
              sectionKey,
              itemIndex: index
            })
          ]
        })
      );
    });

    return section;
  }

  function renderProjectsEditor() {
    const section = createRepeatableSection({
      sectionKey: "projects",
      title: state.data.labels.projects,
      description: locale.liveUpdates,
      addLabel: locale.addProject,
      onAdd: () => {
        state.data.projects.push({
          date: "",
          title: "",
          linkLabel: "",
          linkHref: "",
          bullets: [""]
        });
        refreshAll();
      }
    });

    state.data.projects.forEach((item, index) => {
      section.appendChild(
        createEditorCard({
          heading: `${state.data.labels.projects} ${index + 1}`,
          targetMeta: {
            sectionKey: "projects",
            itemIndex: index,
            itemKind: "project"
          },
          dragConfig: { list: state.data.projects, index },
          onMoveUp: index > 0 ? () => moveItem(state.data.projects, index, index - 1) : null,
          onMoveDown: index < state.data.projects.length - 1 ? () => moveItem(state.data.projects, index, index + 1) : null,
          onRemove: () => {
            state.data.projects.splice(index, 1);
            refreshAll();
          },
          body: [
            createInputField(locale.fields.date, item.date || "", (value) => {
              item.date = value;
              schedulePreviewRender();
            }),
            createInputField(locale.fields.title, item.title || "", (value) => {
              item.title = value;
              schedulePreviewRender();
            }),
            createInputField(locale.fields.projectLinkLabel, item.linkLabel || "", (value) => {
              item.linkLabel = value;
              schedulePreviewRender();
            }),
            createInputField(locale.fields.projectLinkHref, item.linkHref || "", (value) => {
              item.linkHref = value;
              schedulePreviewRender();
            }),
            createBulletEditor(item.bullets, locale.fields.bullets, {
              sectionKey: "projects",
              itemIndex: index
            })
          ]
        })
      );
    });

    return section;
  }

  function renderEducationEditor() {
    const section = createRepeatableSection({
      sectionKey: "education",
      title: state.data.labels.education,
      description: locale.liveUpdates,
      addLabel: locale.addEducation,
      onAdd: () => {
        state.data.education.push({
          date: "",
          location: "",
          degree: "",
          institution: ""
        });
        refreshAll();
      }
    });

    state.data.education.forEach((item, index) => {
      section.appendChild(
        createEditorCard({
          heading: `${state.data.labels.education} ${index + 1}`,
          targetMeta: {
            sectionKey: "education",
            itemIndex: index,
            itemKind: "education"
          },
          dragConfig: { list: state.data.education, index },
          onMoveUp: index > 0 ? () => moveItem(state.data.education, index, index - 1) : null,
          onMoveDown: index < state.data.education.length - 1 ? () => moveItem(state.data.education, index, index + 1) : null,
          onRemove: () => {
            state.data.education.splice(index, 1);
            refreshAll();
          },
          body: [
            createInputField(locale.fields.date, item.date || "", (value) => {
              item.date = value;
              schedulePreviewRender();
            }),
            createInputField(locale.fields.location, item.location || "", (value) => {
              item.location = value;
              schedulePreviewRender();
            }),
            createInputField(locale.fields.degree, item.degree || "", (value) => {
              item.degree = value;
              schedulePreviewRender();
            }),
            createInputField(locale.fields.institution, item.institution || "", (value) => {
              item.institution = value;
              schedulePreviewRender();
            })
          ]
        })
      );
    });

    return section;
  }

  function renderCertificatesEditor() {
    const section = createRepeatableSection({
      sectionKey: "certificates",
      title: state.data.labels.certificates,
      description: locale.liveUpdates,
      addLabel: locale.addCertificate,
      onAdd: () => {
        state.data.certificates.push({
          title: "",
          description: ""
        });
        refreshAll();
      }
    });

    state.data.certificates.forEach((item, index) => {
      section.appendChild(
        createEditorCard({
          heading: `${state.data.labels.certificates} ${index + 1}`,
          targetMeta: {
            sectionKey: "certificates",
            itemIndex: index,
            itemKind: "certificate"
          },
          dragConfig: { list: state.data.certificates, index },
          onMoveUp: index > 0 ? () => moveItem(state.data.certificates, index, index - 1) : null,
          onMoveDown: index < state.data.certificates.length - 1 ? () => moveItem(state.data.certificates, index, index + 1) : null,
          onRemove: () => {
            state.data.certificates.splice(index, 1);
            refreshAll();
          },
          body: [
            createInputField(locale.fields.title, item.title || "", (value) => {
              item.title = value;
              schedulePreviewRender();
            }),
            createTextAreaField(locale.fields.description, item.description || "", (value) => {
              item.description = value;
              schedulePreviewRender();
            }, { rows: 4 })
          ]
        })
      );
    });

    return section;
  }

  function renderTechnicalSkillsEditor() {
    const section = createRepeatableSection({
      sectionKey: "skills",
      title: state.data.labels.skills,
      description: locale.liveUpdates,
      addLabel: locale.addSkill,
      onAdd: () => {
        state.data.skills.technical.push({
          label: "",
          items: ""
        });
        refreshAll();
      }
    });

    state.data.skills.technical.forEach((item, index) => {
      section.appendChild(
        createEditorCard({
          heading: `${state.data.labels.skills} ${index + 1}`,
          targetMeta: {
            sectionKey: "skills",
            itemIndex: index,
            itemKind: "technical-skill"
          },
          dragConfig: { list: state.data.skills.technical, index },
          onMoveUp: index > 0 ? () => moveItem(state.data.skills.technical, index, index - 1) : null,
          onMoveDown: index < state.data.skills.technical.length - 1 ? () => moveItem(state.data.skills.technical, index, index + 1) : null,
          onRemove: () => {
            state.data.skills.technical.splice(index, 1);
            refreshAll();
          },
          body: [
            createInputField(locale.fields.label, item.label || "", (value) => {
              item.label = value;
              schedulePreviewRender();
            }),
            createTextAreaField(locale.fields.items, item.items || "", (value) => {
              item.items = value;
              schedulePreviewRender();
            }, { rows: 3 })
          ]
        })
      );
    });

    return section;
  }

  function renderSoftSkillsEditor() {
    const section = createRepeatableSection({
      sectionKey: "softSkills",
      title: state.data.labels.softSkills,
      description: locale.liveUpdates,
      addLabel: locale.addSoftSkill,
      onAdd: () => {
        state.data.skills.soft.push("");
        refreshAll();
      }
    });

    state.data.skills.soft.forEach((item, index) => {
      section.appendChild(
        createEditorCard({
          heading: `${state.data.labels.softSkills} ${index + 1}`,
          targetMeta: {
            sectionKey: "softSkills",
            itemIndex: index,
            itemKind: "soft-skill"
          },
          dragConfig: { list: state.data.skills.soft, index },
          onMoveUp: index > 0 ? () => moveItem(state.data.skills.soft, index, index - 1) : null,
          onMoveDown: index < state.data.skills.soft.length - 1 ? () => moveItem(state.data.skills.soft, index, index + 1) : null,
          onRemove: () => {
            state.data.skills.soft.splice(index, 1);
            refreshAll();
          },
          body: [
            createInputField(locale.fields.skill, item || "", (value) => {
              state.data.skills.soft[index] = value;
              schedulePreviewRender();
            })
          ]
        })
      );
    });

    return section;
  }

  function renderAtsEditor() {
    const section = createEditorSection(locale.atsTitle, locale.atsDescription, {
      sectionKey: "ats",
      focusSelector: "textarea"
    });
    const actions = document.createElement("div");
    actions.className = "editor-actions";
    actions.append(
      createActionButton(locale.aiAtsReviewRun, "is-primary", () => triggerAiReview("ats"), state.aiReviews.ats.loading),
      createActionButton(locale.aiReviewClear, "", () => clearAiReview("ats"), !state.aiReviews.ats.result && !state.aiReviews.ats.error && !state.aiReviews.ats.loading)
    );

    atsTextarea = createTextAreaField(
      locale.fields.jobDescription,
      state.ats.jobDescription,
      (value) => {
        state.ats.jobDescription = value;
        persistAtsDraft();
        scheduleAtsAnalysis();
        scheduleQualityAnalysis();
        scheduleDraftSave();
      },
      { rows: 10, placeholder: locale.atsPlaceholder }
    );

    const results = document.createElement("div");
    results.className = "editor-ats";
    atsResultsHost = results;

    section.append(
      createAtsNotice(locale.aiSharedWorkspaceHint),
      actions,
      atsTextarea,
      results
    );
    renderAtsAnalysisPanel();
    return section;
  }

  function renderQualityEditor() {
    const section = createEditorSection(locale.qualityTitle, locale.qualityDescription, {
      sectionKey: "quality"
    });
    const results = document.createElement("div");
    results.className = "editor-quality";
    qualityResultsHost = results;
    const actions = document.createElement("div");
    actions.className = "editor-actions";
    actions.append(
      createActionButton(locale.aiQualityReviewRun, "is-primary", () => triggerAiReview("quality"), state.aiReviews.quality.loading),
      createActionButton(locale.aiReviewClear, "", () => clearAiReview("quality"), !state.aiReviews.quality.result && !state.aiReviews.quality.error && !state.aiReviews.quality.loading)
    );
    section.append(
      createAtsNotice(locale.aiSharedWorkspaceHint),
      actions,
      results
    );
    renderQualityPanel();
    return section;
  }

  function renderAiHrEditor() {
    const section = createEditorSection(locale.aiHrTitle, locale.aiHrDescription, {
      sectionKey: "aiHr",
      focusSelector: "input, textarea, button"
    });

    section.appendChild(createAtsNotice(locale.aiHrUsesCurrentCvNotice));
    section.append(
      createInputField(locale.fields.targetRole, state.targeting.targetRole, (value) => {
        state.targeting.targetRole = value;
        scheduleAtsAnalysis();
        scheduleQualityAnalysis();
        scheduleDraftSave();
      }),
      createTextAreaField(locale.fields.jobDescription, state.ats.jobDescription, (value) => {
        state.ats.jobDescription = value;
        persistAtsDraft();
        scheduleAtsAnalysis();
        scheduleQualityAnalysis();
        scheduleDraftSave();
      }, { rows: 10, placeholder: locale.atsPlaceholder })
    );

    const actions = document.createElement("div");
    actions.className = "editor-actions";
    actions.append(
      createActionButton(locale.aiHrRun, "is-primary", () => triggerAiReview("hr"), state.aiReviews.hr.loading),
      createActionButton(locale.aiReviewClear, "", () => clearAiReview("hr"), !state.aiReviews.hr.result && !state.aiReviews.hr.error && !state.aiReviews.hr.loading)
    );
    section.append(
      createAtsNotice(locale.aiSharedWorkspaceHint),
      actions,
      renderAiReviewPanel(state.aiReviews.hr, "hr")
    );

    return section;
  }

  function renderStyleEditor() {
    const section = createEditorSection(locale.styleTitle, locale.styleDescription, {
      sectionKey: "style"
    });

    section.appendChild(createSelectField(
      locale.stylePresetLabel,
      getActiveStylePreset(),
      stylePresetChoices.map((value) => ({
        value,
        label: value === "refined" ? locale.stylePresetRefinedLabel : locale.stylePresetDefaultLabel
      })),
      (value) => {
        if (!setStylePreset(value)) {
          return;
        }
        renderPreview();
        renderEditor();
        scheduleDraftSave();
      },
      { helpKey: "style.preset" }
    ));

    section.appendChild(createAtsNotice(
      getActiveStylePreset() === "refined" ? locale.stylePresetRefinedHint : locale.stylePresetDefaultHint
    ));
    section.appendChild(createStyleTypographyCard());
    return section;
  }

  function createStyleTypographyCard() {
    const tokens = getStylePresetTokens(documentLanguage, getActiveStylePreset());
    const card = document.createElement("section");
    card.className = "editor-style-summary";

    const title = document.createElement("h3");
    title.className = "editor-card__title";
    title.textContent = locale.styleTypographyTitle;

    const description = document.createElement("p");
    description.className = "editor-section__description";
    description.textContent = locale.styleTypographyDescription;

    const list = document.createElement("div");
    list.className = "editor-style-summary__list";

    [
      [locale.styleTypographyFontLabel, tokens.fontLabel],
      [locale.styleTypographyNameLabel, tokens.nameSize],
      [locale.styleTypographyHeadingsLabel, tokens.headingSize],
      [locale.styleTypographyBodyLabel, tokens.bodySize],
      [locale.styleTypographyContactLabel, tokens.contactSize],
      [locale.styleTypographyLineHeightLabel, tokens.lineHeight]
    ].forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "editor-style-summary__item";
      row.innerHTML = `<strong>${escapeHtml(label)}</strong><span>${escapeHtml(value)}</span>`;
      list.appendChild(row);
    });

    card.append(title, description, list);
    return card;
  }

  function normalizeStylePreset(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return stylePresetChoices.includes(normalized) ? normalized : "default";
  }

  function getActiveStylePreset() {
    return normalizeStylePreset(state.data?.ui?.stylePreset);
  }

  function setStylePreset(value) {
    const nextPreset = normalizeStylePreset(value);
    if (!state.data.ui || typeof state.data.ui !== "object") {
      state.data.ui = {};
    }
    if (normalizeStylePreset(state.data.ui.stylePreset) === nextPreset) {
      return false;
    }
    state.data.ui.stylePreset = nextPreset;
    applyStylePreset();
    return true;
  }

  function getStylePresetTokens(lang, preset = "default") {
    const normalizedPreset = normalizeStylePreset(preset);
    const isArabic = lang === "ar";

    if (normalizedPreset === "refined") {
      return isArabic
        ? {
            fontLabel: "Cairo",
            nameSize: "21 pt",
            headingSize: "12.5 pt",
            bodySize: "11.5 pt",
            contactSize: "10.5 pt",
            lineHeight: "1.15"
          }
        : {
            fontLabel: "Calibri",
            nameSize: "21 pt",
            headingSize: "12 pt",
            bodySize: "11 pt",
            contactSize: "10 pt",
            lineHeight: "1.12"
          };
    }

    return isArabic
      ? {
          fontLabel: "Calibri",
          nameSize: "20 pt",
          headingSize: "12 pt",
          bodySize: "10.5 pt",
          contactSize: "9.8 pt",
          lineHeight: "1.15"
        }
      : {
          fontLabel: "Calibri",
          nameSize: "19 px",
          headingSize: "13 px",
          bodySize: "11.5 px",
          contactSize: "10.2 px",
          lineHeight: "1.31"
        };
  }

  function createRepeatableSection({ sectionKey, title, description, addLabel, onAdd }) {
    const wrapper = createEditorSection(title, description, {
      sectionKey,
      focusSelector: ".editor-card textarea, .editor-card input, .editor-card select, textarea, input, select"
    });
    const titleField = createBuiltInSectionTitleField(sectionKey);
    if (titleField) {
      wrapper.appendChild(titleField);
    }
    const addRow = document.createElement("div");
    addRow.className = "editor-actions";
    addRow.appendChild(createActionButton(addLabel, "is-primary", () => {
      commitPendingHistory();
      const historyBefore = createHistorySnapshot();
      onAdd();
      commitHistorySnapshot(historyBefore);
    }));
    wrapper.appendChild(addRow);
    return wrapper;
  }

  function createEditorSection(title, description, options = {}) {
    const section = document.createElement("section");
    section.className = "editor-section";

    const heading = document.createElement("h2");
    heading.className = "editor-section__title";
    heading.textContent = title;

    const body = document.createElement("p");
    body.className = "editor-section__description";
    body.textContent = description;

    section.append(heading, body);
    if (options.sectionKey) {
      attachHelp(section, { helpKey: `section:${options.sectionKey}`, label: title });
      attachHelp(heading, { helpKey: `section:${options.sectionKey}`, label: title });
      attachHelp(body, { helpKey: `section:${options.sectionKey}`, label: title });
    }
    applyEditorTarget(section, {
      sectionKey: options.sectionKey,
      focusSelector: options.focusSelector || ""
    });
    return section;
  }

  function createBuiltInSectionTitleField(sectionKey) {
    if (![
      "summary",
      "professionalExperience",
      "internships",
      "projects",
      "education",
      "certificates",
      "skills",
      "softSkills"
    ].includes(String(sectionKey || ""))) {
      return null;
    }

    const config = getBuiltInSectionConfig(sectionKey);
    const fallbackTitle = getDefaultBuiltInSectionTitle(sectionKey, state.data.labels, locale);
    return createInputField(locale.sectionTitleField, config?.title || state.data.labels?.[sectionKey] || fallbackTitle, (value) => {
      const nextTitle = String(value || "").trim() || fallbackTitle;
      if (config) {
        config.title = nextTitle;
      }
      state.data.labels[sectionKey] = nextTitle;
      updateNavButtonLabel(sectionKey, nextTitle);
      schedulePreviewRender();
    });
  }

  function createEditorCard({ heading, targetMeta = null, dragConfig, onMoveUp, onMoveDown, onRemove, body }) {
    const card = document.createElement("article");
    card.className = "editor-card";

    const header = document.createElement("div");
    header.className = "editor-card__header";

    const title = document.createElement("h3");
    title.className = "editor-card__title";
    title.textContent = heading;

    const actions = document.createElement("div");
    actions.className = "editor-card__actions";
    if (dragConfig) {
      actions.appendChild(createDragHandle());
    }
    actions.append(
      createIconButton(locale.moveUp, "is-ghost", onMoveUp, !onMoveUp),
      createIconButton(locale.moveDown, "is-ghost", onMoveDown, !onMoveDown),
      createIconButton(locale.remove, "is-danger", onRemove, !onRemove)
    );

    const content = document.createElement("div");
    content.className = "editor-card__body";
    body.forEach((node) => content.appendChild(node));

    header.append(title, actions);
    card.append(header, content);
    if (dragConfig) {
      enableDragReorder(card, dragConfig.list, dragConfig.index, dragConfig.onReorder);
    }
    applyEditorTarget(card, {
      sectionKey: targetMeta?.sectionKey,
      itemIndex: targetMeta?.itemIndex,
      itemKind: targetMeta?.itemKind,
      focusSelector: "textarea, input, select"
    });
    return card;
  }

  function createBulletEditor(items, labelText, options = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-field";

    const label = document.createElement("label");
    label.className = "editor-field__label";
    label.textContent = labelText;

    const rows = document.createElement("div");
    rows.className = "editor-bullets";

    items.forEach((bullet, index) => {
      const row = document.createElement("div");
      row.className = "editor-bullets__row";

      const content = document.createElement("div");
      content.className = "editor-field";

      const area = document.createElement("textarea");
      area.className = "editor-textarea";
      area.rows = 3;
      area.value = bullet || "";
      area.addEventListener("input", (event) => {
        stageHistoryDebounced();
        items[index] = event.target.value;
        schedulePreviewRender();
      });

      content.appendChild(area);

      const actions = document.createElement("div");
      actions.className = "editor-inline-actions";
      actions.append(
        createDragHandle(),
        createIconButton(locale.moveUp, "is-ghost", index > 0 ? () => moveItem(items, index, index - 1) : null, index === 0),
        createIconButton(
          locale.moveDown,
          "is-ghost",
          index < items.length - 1 ? () => moveItem(items, index, index + 1) : null,
          index === items.length - 1
        ),
        createIconButton(locale.remove, "is-danger", () => {
          items.splice(index, 1);
          if (!items.length) {
            items.push("");
          }
          refreshAll();
        })
      );

      row.append(content, actions);
      enableDragReorder(row, items, index);
      rows.appendChild(row);
    });

    const addButtonRow = document.createElement("div");
    addButtonRow.className = "editor-actions";
    addButtonRow.appendChild(
      createActionButton(locale.addBullet, "is-primary", () => {
        commitPendingHistory();
        const historyBefore = createHistorySnapshot();
        items.push("");
        commitHistorySnapshot(historyBefore);
        refreshAll();
      })
    );

    wrapper.append(label, rows, addButtonRow);
    return wrapper;
  }

  function createDragHandle() {
    const handle = document.createElement("span");
    handle.className = "editor-drag-handle";
    handle.textContent = locale.dragLabel;
    handle.setAttribute("aria-hidden", "true");
    attachHelp(handle, { label: locale.dragLabel, fallbackType: "button" });
    return handle;
  }

  function createInputField(labelText, value, onInput, options = {}) {
    const wrapper = document.createElement("label");
    wrapper.className = "editor-field";
    if (options.fieldKey) {
      wrapper.dataset.fieldKey = options.fieldKey;
    }

    const label = document.createElement("span");
    label.className = "editor-field__label";
    label.textContent = labelText;

    const input = document.createElement("input");
    input.className = "editor-input";
    input.type = options.type || "text";
    input.value = value || "";
    input.placeholder = options.placeholder || "";
    if (options.fieldKey) {
      input.dataset.fieldKey = options.fieldKey;
    }
    input.addEventListener("input", (event) => {
      if (options.trackHistory !== false) {
        stageHistoryDebounced();
      }
      onInput(event.target.value);
    });

    attachHelp(wrapper, { helpKey: options.helpKey, text: options.helpText, label: labelText, fallbackType: "field" });
    attachHelp(input, { helpKey: options.helpKey, text: options.helpText, label: labelText, fallbackType: "field" });
    wrapper.append(label, input);
    return wrapper;
  }

  function createSelectField(labelText, value, choices, onInput, options = {}) {
    const wrapper = document.createElement("label");
    wrapper.className = "editor-field";
    if (options.fieldKey) {
      wrapper.dataset.fieldKey = options.fieldKey;
    }

    const label = document.createElement("span");
    label.className = "editor-field__label";
    label.textContent = labelText;

    const select = document.createElement("select");
    select.className = "editor-input editor-select";
    if (options.fieldKey) {
      select.dataset.fieldKey = options.fieldKey;
    }
    choices.forEach((choice) => {
      const option = document.createElement("option");
      option.value = choice.value;
      option.textContent = choice.label;
      if (choice.value === value) {
        option.selected = true;
      }
      select.appendChild(option);
    });
    select.addEventListener("change", (event) => {
      if (options.trackHistory !== false) {
        stageHistoryDebounced();
      }
      onInput(event.target.value);
    });

    attachHelp(wrapper, { helpKey: options.helpKey, text: options.helpText, label: labelText, fallbackType: "field" });
    attachHelp(select, { helpKey: options.helpKey, text: options.helpText, label: labelText, fallbackType: "field" });
    wrapper.append(label, select);
    return wrapper;
  }

  function createTextAreaField(labelText, value, onInput, options = {}) {
    const wrapper = document.createElement("label");
    wrapper.className = "editor-field";
    if (options.fieldKey) {
      wrapper.dataset.fieldKey = options.fieldKey;
    }

    const label = document.createElement("span");
    label.className = "editor-field__label";
    label.textContent = labelText;

    const area = document.createElement("textarea");
    area.className = "editor-textarea";
    area.rows = options.rows || 5;
    area.value = value || "";
    area.placeholder = options.placeholder || "";
    if (options.fieldKey) {
      area.dataset.fieldKey = options.fieldKey;
    }
    area.addEventListener("input", (event) => {
      if (options.trackHistory !== false) {
        stageHistoryDebounced();
      }
      onInput(event.target.value);
    });

    attachHelp(wrapper, { helpKey: options.helpKey, text: options.helpText, label: labelText, fallbackType: "field" });
    attachHelp(area, { helpKey: options.helpKey, text: options.helpText, label: labelText, fallbackType: "field" });
    wrapper.append(label, area);
    return wrapper;
  }

  function createCheckboxField(labelText, checked, onInput, options = {}) {
    const wrapper = document.createElement("label");
    wrapper.className = "editor-checkbox";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(checked);
    input.addEventListener("change", (event) => onInput(event.target.checked));

    const text = document.createElement("span");
    text.textContent = labelText;

    attachHelp(wrapper, { helpKey: options.helpKey, text: options.helpText, label: labelText, fallbackType: "toggle" });
    attachHelp(input, { helpKey: options.helpKey, text: options.helpText, label: labelText, fallbackType: "toggle" });
    wrapper.append(input, text);
    return wrapper;
  }

  function createEditableTextAreaField({
    labelText,
    value,
    onInput,
    rows = 5,
    placeholder = "",
    rewriteConfig = null,
    commandConfig = null
  }) {
    const wrapper = document.createElement("label");
    wrapper.className = "editor-field";

    const label = document.createElement("span");
    label.className = "editor-field__label";
    label.textContent = labelText;

    const area = document.createElement("textarea");
    area.className = "editor-textarea";
    area.rows = rows;
    area.value = value || "";
    area.placeholder = placeholder || "";
    area.addEventListener("input", (event) => {
      stageHistoryDebounced();
      onInput(event.target.value);
    });

    attachHelp(wrapper, { label: labelText, fallbackType: "field" });
    attachHelp(area, { label: labelText, fallbackType: "field" });
    wrapper.append(label, area);

    if (rewriteConfig) {
      wrapper.appendChild(
        createRewriteAssistant({
          ...rewriteConfig,
          getValue: rewriteConfig.getValue || (() => area.value)
        })
      );
    }

    if (commandConfig) {
      wrapper.appendChild(
        createCommandAssistant({
          ...commandConfig,
          getTextArea: () => area
        })
      );
    }

    return wrapper;
  }

  function createCommandAssistant(config) {
    if (documentLanguage !== "en") {
      return document.createDocumentFragment();
    }

    const wrapper = document.createElement("div");
    wrapper.className = "editor-command";

    const entry = state.command.entries[config.key] || {};
    const isOpen = Boolean(entry.open);

    if (!isOpen) {
      wrapper.appendChild(
        createActionButton(locale.commandOpen, "", () => handleOpenCommandAssistant(config), false, { helpKey: "command.open" })
      );
      if (entry.error) {
        wrapper.appendChild(createAtsNotice(entry.error, "is-warning"));
      }
      return wrapper;
    }

    const actions = document.createElement("div");
    actions.className = "editor-actions";
    actions.append(
      createActionButton(locale.commandGeneratePreview, "is-primary", () => handleGenerateCommandPreview(config), entry.loading, { helpKey: "command.preview" }),
      createActionButton(locale.commandApply, "", () => handleApplyCommandPreview(config), !entry.preview || entry.loading, { helpKey: "command.apply" }),
      createActionButton(locale.commandCancel, "", () => closeCommandAssistant(config.key), entry.loading, { helpKey: "command.cancel" })
    );

    wrapper.append(
      createAtsNotice(locale.commandSelectedTextLabel.replace("{text}", entry.selectedText || locale.commandEmptySelection)),
      createSelectField(
        locale.commandScopeLabel,
        entry.scope || "field",
        getCommandScopeChoices(config),
        (value) => {
          const current = state.command.entries[config.key] || {};
          state.command.entries[config.key] = {
            ...current,
            scope: value,
            preview: null,
            error: ""
          };
          renderEditor();
        },
        { trackHistory: false, helpKey: "command.scope" }
      ),
      createTextAreaField(
        locale.commandPromptLabel,
        entry.command || "",
        (value) => {
          const current = state.command.entries[config.key] || {};
          state.command.entries[config.key] = {
            ...current,
            command: value,
            error: ""
          };
        },
        { rows: 3, placeholder: locale.commandPromptPlaceholder, trackHistory: false, helpKey: "command.prompt" }
      ),
      actions
    );

    if (entry.loading) {
      wrapper.appendChild(createAtsNotice(locale.commandLoading));
      return wrapper;
    }

    if (entry.error) {
      wrapper.appendChild(createAtsNotice(entry.error, "is-warning"));
    }

    if (entry.preview) {
      wrapper.appendChild(createCommandPreview(entry.preview));
    }

    return wrapper;
  }

  function createCommandPreview(preview) {
    const card = document.createElement("div");
    card.className = "editor-command__preview";
    card.append(
      createCommandPreviewBlock(locale.commandBeforeLabel, preview.beforeText),
      createCommandPreviewBlock(locale.commandAfterLabel, preview.afterText)
    );

    if (preview.note) {
      card.appendChild(createAtsNotice(preview.note));
    }

    return card;
  }

  function createCommandPreviewBlock(labelText, content) {
    const block = document.createElement("div");
    block.className = "editor-command__preview-block";

    const label = document.createElement("p");
    label.className = "editor-field__label";
    label.textContent = labelText;

    const text = document.createElement("pre");
    text.className = "editor-command__preview-text";
    text.textContent = content || locale.commandEmptySelection;

    block.append(label, text);
    return block;
  }

  function getCommandScopeChoices(config) {
    const choices = [
      { value: "field", label: locale.commandScopeField }
    ];
    if (config.supportsSection !== false) {
      choices.push({ value: "section", label: locale.commandScopeSection });
    }
    if (config.supportsResume) {
      choices.push({ value: "resume", label: locale.commandScopeResume });
    }
    return choices;
  }

  function handleOpenCommandAssistant(config) {
    const selection = getSelectedTextPayload(config.getTextArea?.());
    const canOpenWithoutSelection = config.supportsSection !== false || config.supportsResume;
    if (!selection.text && !canOpenWithoutSelection) {
      state.command.entries[config.key] = {
        open: false,
        error: locale.commandSelectText
      };
      renderEditor();
      return;
    }

    const initialScope = selection.text
      ? "field"
      : (config.supportsSection !== false ? "section" : (config.supportsResume ? "resume" : "field"));

    state.command.entries[config.key] = {
      open: true,
      command: "",
      scope: initialScope,
      loading: false,
      error: "",
      preview: null,
      selectedText: selection.text,
      selectionStart: selection.start,
      selectionEnd: selection.end,
      sourceValue: selection.value,
      sectionContext: cloneData(config.getSectionContext ? config.getSectionContext() : null),
      resumeContext: cloneData(config.getResumeContext ? config.getResumeContext() : null)
    };
    renderEditor();
  }

  function closeCommandAssistant(key) {
    delete state.command.entries[key];
    renderEditor();
  }

  function getSelectedTextPayload(area) {
    if (!(area instanceof HTMLTextAreaElement)) {
      return { text: "", start: 0, end: 0, value: "" };
    }

    const start = Number(area.selectionStart || 0);
    const end = Number(area.selectionEnd || 0);
    const value = String(area.value || "");
    const text = value.slice(start, end).trim();
    return { text, start, end, value };
  }

  async function handleGenerateCommandPreview(config) {
    const entry = state.command.entries[config.key];
    if (!entry?.open) {
      return;
    }

    if (!String(state.ai.apiKey || "").trim()) {
      state.command.entries[config.key] = {
        ...entry,
        error: locale.commandRequiresAi
      };
      renderEditor();
      return;
    }

    if (!String(entry.command || "").trim()) {
      state.command.entries[config.key] = {
        ...entry,
        error: locale.commandPromptEmpty
      };
      renderEditor();
      return;
    }

    if ((entry.scope || "field") === "field" && !String(entry.selectedText || "").trim()) {
      state.command.entries[config.key] = {
        ...entry,
        error: locale.commandSelectText
      };
      renderEditor();
      return;
    }

    state.command.entries[config.key] = {
      ...entry,
      loading: true,
      error: "",
      preview: null
    };
    renderEditor();

    try {
      const payload = await requestAiCommandRewrite({
        command: entry.command,
        scope: entry.scope || "field",
        sectionKey: config.sectionKey,
        text: entry.selectedText,
        context: entry.scope === "resume" ? entry.resumeContext : entry.sectionContext
      });

      const preview = buildCommandPreview(config, entry, payload);
      state.command.entries[config.key] = {
        ...entry,
        loading: false,
        error: "",
        preview
      };
    } catch (error) {
      state.command.entries[config.key] = {
        ...entry,
        loading: false,
        error: error.message || locale.commandFailed,
        preview: null
      };
    }

    renderEditor();
  }

  function buildCommandPreview(config, entry, payload) {
    if ((entry.scope || "field") === "resume") {
      const nextContext = payload?.context;
      return {
        mode: "resume",
        beforeText: formatCommandContextPreview("resume", entry.resumeContext),
        afterText: formatCommandContextPreview("resume", nextContext),
        context: cloneData(nextContext),
        note: String(payload?.note || "")
      };
    }

    if ((entry.scope || "field") === "section") {
      const nextContext = payload?.context;
      return {
        mode: "section",
        beforeText: formatCommandContextPreview(config.sectionKey, entry.sectionContext),
        afterText: formatCommandContextPreview(config.sectionKey, nextContext),
        context: cloneData(nextContext),
        note: String(payload?.note || "")
      };
    }

    return {
      mode: "field",
      beforeText: entry.selectedText,
      afterText: String(payload?.text || ""),
      text: String(payload?.text || ""),
      note: String(payload?.note || "")
    };
  }

  function formatCommandContextPreview(sectionKey, context) {
    if (!context) {
      return "";
    }

    if (sectionKey === "resume") {
      return formatResumeCommandPreview(context);
    }

    if (sectionKey === "summary") {
      return String(context.text || "");
    }

    if (sectionKey === "coverLetter") {
      return [
        context.opening,
        context.body,
        context.closing
      ].filter(Boolean).join("\n\n");
    }

    return [
      context.organization,
      context.role,
      context.title,
      ...(Array.isArray(context.bullets) ? context.bullets : [])
    ].filter(Boolean).join("\n");
  }

  function handleApplyCommandPreview(config) {
    const entry = state.command.entries[config.key];
    if (!entry?.preview) {
      return;
    }

    commitPendingHistory();
    const historyBefore = createHistorySnapshot();
    if (entry.preview.mode === "resume") {
      config.onApplyResume?.(cloneData(entry.preview.context));
    } else if (entry.preview.mode === "section") {
      config.onApplySection?.(cloneData(entry.preview.context));
    } else {
      const nextValue = [
        entry.sourceValue.slice(0, entry.selectionStart),
        entry.preview.text,
        entry.sourceValue.slice(entry.selectionEnd)
      ].join("");
      config.onApplyField?.(nextValue, entry.preview.text);
    }
    delete state.command.entries[config.key];
    commitHistorySnapshot(historyBefore);
    refreshAll();
  }

  function formatResumeCommandPreview(context) {
    const data = normalizeResumeData(context, buildResumeTemplateForLanguage(documentLanguage));
    return [
      data.profile?.name ? `${locale.fields.name}: ${data.profile.name}` : "",
      data.summary ? `${state.data.labels.summary}: ${data.summary}` : "",
      summarizeCommandResumeSection(state.data.labels.professionalExperience, data.professionalExperience, "organization", "role"),
      summarizeCommandResumeSection(state.data.labels.internships, data.internships, "organization", "role"),
      summarizeCommandResumeSection(state.data.labels.projects, data.projects, "title"),
      summarizeCommandResumeSection(state.data.labels.education, data.education, "degree", "institution"),
      summarizeCommandResumeSection(state.data.labels.certificates, data.certificates, "title"),
      summarizeSkillPreview(data.skills)
    ].filter(Boolean).join("\n\n");
  }

  function summarizeCommandResumeSection(label, items, primaryKey, secondaryKey = "") {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      return "";
    }

    const preview = list.slice(0, 3).map((item) => {
      const first = String(item?.[primaryKey] || "").trim();
      const second = secondaryKey ? String(item?.[secondaryKey] || "").trim() : "";
      return [first, second].filter(Boolean).join(" — ");
    }).filter(Boolean);

    const suffix = list.length > preview.length ? ` (+${list.length - preview.length} more)` : "";
    return `${label}: ${preview.join(" | ")}${suffix}`;
  }

  function summarizeSkillPreview(skills) {
    const technical = Array.isArray(skills?.technical)
      ? skills.technical.slice(0, 3).map((item) => [item?.label, item?.items].filter(Boolean).join(": "))
      : [];
    const soft = Array.isArray(skills?.soft) ? skills.soft.slice(0, 4) : [];
    const parts = [];
    if (technical.length) {
      parts.push(`${state.data.labels.skills}: ${technical.join(" | ")}`);
    }
    if (soft.length) {
      parts.push(`${state.data.labels.softSkills}: ${soft.join(" | ")}`);
    }
    return parts.join("\n");
  }

  function buildCommandSectionContext(sectionKey, itemIndex) {
    switch (sectionKey) {
      case "professionalExperience":
      case "internships":
        return cloneData(state.data[sectionKey]?.[itemIndex] || {});
      case "projects":
        return cloneData(state.data.projects?.[itemIndex] || {});
      default:
        return {};
    }
  }

  function applyCommandSectionContext(sectionKey, itemIndex, context) {
    const nextContext = cloneData(context || {});
    if (sectionKey === "professionalExperience" || sectionKey === "internships") {
      state.data[sectionKey][itemIndex] = {
        date: String(nextContext.date || ""),
        location: String(nextContext.location || ""),
        organization: String(nextContext.organization || ""),
        role: String(nextContext.role || ""),
        bullets: Array.isArray(nextContext.bullets) ? nextContext.bullets.map((item) => String(item || "")) : [""]
      };
      return;
    }

    if (sectionKey === "projects") {
      state.data.projects[itemIndex] = {
        date: String(nextContext.date || ""),
        title: String(nextContext.title || ""),
        linkLabel: String(nextContext.linkLabel || ""),
        linkHref: String(nextContext.linkHref || ""),
        bullets: Array.isArray(nextContext.bullets) ? nextContext.bullets.map((item) => String(item || "")) : [""]
      };
    }
  }

  function applyCommandResumeContext(context) {
    state.data = normalizeResumeData(context, buildResumeTemplateForLanguage(documentLanguage));
  }

  function createCommandWorkspaceError(message, code = "COMMAND_WORKSPACE_ERROR") {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function getNormalizedCommandWorkspaceSelection() {
    const valid = new Set(getCommandTargetOptions().map((item) => item.key));
    return (state.command.workspace.selectedSections || []).filter((key) => valid.has(key));
  }

  async function handleGenerateCommandWorkspacePreview() {
    const selectedSections = getNormalizedCommandWorkspaceSelection();
    const command = String(state.command.workspace.command || "").trim();
    const content = String(state.command.workspace.content || "");

    if (!selectedSections.length) {
      state.command.workspace.error = locale.commandsSelectAtLeastOne;
      state.command.workspace.preview = null;
      renderEditor();
      return;
    }

    if (!command) {
      state.command.workspace.error = locale.commandsCommandRequired;
      state.command.workspace.preview = null;
      renderEditor();
      return;
    }

    state.command.workspace.loading = true;
    state.command.workspace.error = "";
    state.command.workspace.preview = null;
    renderEditor();

    try {
      let preview = null;
      try {
        preview = planLocalCommandWorkspaceUpdate(selectedSections, command, content);
      } catch (error) {
        if (error?.code !== "COMMAND_WORKSPACE_UNSUPPORTED") {
          throw error;
        }
        if (!(state.ai.enabled && String(state.ai.apiKey || "").trim())) {
          throw createCommandWorkspaceError(locale.commandsFallbackUnavailable, "COMMAND_WORKSPACE_UNSUPPORTED");
        }
        preview = await requestCommandPlanFallback({
          selectedSections,
          command,
          content
        });
      }

      state.command.workspace.preview = preview;
      state.command.workspace.note = preview.note || "";
    } catch (error) {
      state.command.workspace.error = error.message || locale.commandsPreviewFailed;
      state.command.workspace.preview = null;
    } finally {
      state.command.workspace.loading = false;
      renderEditor();
    }
  }

  function handleApplyCommandWorkspacePreview() {
    const preview = state.command.workspace.preview;
    if (!preview?.operations?.length) {
      return;
    }

    commitPendingHistory();
    const historyBefore = createHistorySnapshot();
    applyCommandWorkspaceOperations(preview.operations);
    state.command.workspace = createCommandWorkspaceState();
    commitHistorySnapshot(historyBefore);
    refreshAll();
  }

  function handleClearCommandWorkspace() {
    state.command.workspace = createCommandWorkspaceState();
    renderEditor();
  }

  function planLocalCommandWorkspaceUpdate(selectedSections, commandText, rawContent) {
    const command = String(commandText || "").trim();
    const content = resolveCommandWorkspaceContent(command, rawContent);
    const renameTitle = extractCommandWorkspaceRenameTitle(command);
    const intent = getCommandWorkspaceIntent(command, renameTitle);
    const selectedSet = new Set(selectedSections);
    const contentBySection = splitCommandWorkspaceContentBySection(content, selectedSections);
    const operations = [];
    const sections = [];

    if ((intent === "replace" || intent === "append") && !content.trim()) {
      throw createCommandWorkspaceError(locale.commandsContentRequired);
    }

    selectedSections.forEach((sectionKey) => {
      const beforeValue = getCommandWorkspaceSectionValue(sectionKey);
      let afterValue = null;
      let note = "";

      if (intent === "rename") {
        if (selectedSections.length !== 1) {
          throw createCommandWorkspaceError(locale.commandsRenameSingleOnly);
        }
        afterValue = renameTitle;
        operations.push({
          type: "rename-section",
          sectionKey,
          title: renameTitle
        });
      } else if (intent === "clear") {
        afterValue = getEmptyCommandWorkspaceSectionValue(sectionKey);
        operations.push({
          type: "replace-section",
          sectionKey,
          value: cloneData(afterValue)
        });
      } else {
        const sectionContent = contentBySection[sectionKey] || (selectedSections.length === 1 ? content.trim() : "");
        if (!sectionContent) {
          throw createCommandWorkspaceError(locale.commandsStructuredMultiSectionRequired);
        }
        afterValue = parseCommandWorkspaceSectionValue(sectionKey, sectionContent, intent, beforeValue, command);
        note = intent === "append" ? locale.commandsAppendPreviewNote : "";
        operations.push({
          type: "replace-section",
          sectionKey,
          value: cloneData(afterValue)
        });
      }

      sections.push({
        key: sectionKey,
        label: getCommandWorkspaceSectionDisplayLabel(sectionKey),
        beforeText: formatCommandWorkspaceSectionValue(sectionKey, beforeValue),
        afterText: formatCommandWorkspaceSectionValue(sectionKey, afterValue, intent === "rename"),
        note
      });
    });

    return {
      source: "local",
      note: selectedSet.size > 1 ? locale.commandsMultiSectionPreviewNote : locale.commandsLocalPreviewNote,
      sections,
      operations
    };
  }

  function resolveCommandWorkspaceContent(command, rawContent) {
    const direct = String(rawContent || "");
    if (direct.trim()) {
      return direct;
    }
    const multiline = String(command || "").split(/\r?\n/);
    if (multiline.length > 1) {
      const trailingContent = multiline.slice(1).join("\n").trim();
      if (trailingContent) {
        return trailingContent;
      }
    }
    const match = String(command || "").match(/:(.+)$/s);
    return match ? String(match[1] || "").trim() : "";
  }

  function extractCommandWorkspaceRenameTitle(command) {
    const match = String(command || "").match(/\brename(?:\s+(?:this|the))?\s+section\s+to\s+(.+)$/i)
      || String(command || "").match(/\brename\s+to\s+(.+)$/i);
    return match ? String(match[1] || "").trim() : "";
  }

  function getCommandWorkspaceIntent(command, renameTitle = "") {
    const normalized = String(command || "").trim().toLowerCase();
    if (renameTitle) {
      return "rename";
    }

    const signals = {
      clear: 0,
      replace: 0,
      append: 0
    };

    if (/\b(clear|remove all|delete all|wipe|empty the section|reset section)\b/.test(normalized)) {
      signals.clear += 3;
    }

    if (/\b(replace|overwrite|swap out|start over|from scratch|fresh start|reset with|use only|keep only|only these|instead of keeping|remove old|remove the old|remove old ones|remove the old ones|remove existing|remove current|delete old|delete existing|clear old|remove previous)\b/.test(normalized)) {
      signals.replace += 3;
    }

    if (/\b(add|append|include|insert|merge)\b/.test(normalized)) {
      signals.append += 2;
    }

    if (/\b(add|include|insert)\b/.test(normalized) && /\b(remove|replace|overwrite|only|instead)\b/.test(normalized)) {
      signals.replace += 2;
    }

    if (/\b(add these|use these|set these|update with these)\b/.test(normalized) && /\b(old|existing|current|previous)\b/.test(normalized)) {
      signals.replace += 2;
    }

    if (signals.clear >= 3 && signals.replace === 0 && signals.append === 0) {
      return "clear";
    }

    if (signals.replace > signals.append) {
      return "replace";
    }

    if (signals.append > 0) {
      return "append";
    }

    throw createCommandWorkspaceError(locale.commandsFallbackNeeded, "COMMAND_WORKSPACE_UNSUPPORTED");
  }

  function splitCommandWorkspaceContentBySection(content, selectedSections) {
    const trimmed = String(content || "").trim();
    if (!trimmed || selectedSections.length <= 1) {
      return {};
    }

    const aliases = {};
    selectedSections.forEach((sectionKey) => {
      const label = getCommandWorkspaceSectionDisplayLabel(sectionKey).toLowerCase();
      aliases[label] = sectionKey;
      aliases[sectionKey.toLowerCase()] = sectionKey;
      if (sectionKey === "professionalExperience") {
        aliases["experience"] = sectionKey;
        aliases["professional experience"] = sectionKey;
      }
      if (sectionKey === "softSkills") {
        aliases["soft skills"] = sectionKey;
      }
    });

    const buckets = {};
    let currentKey = "";
    trimmed.split(/\r?\n/).forEach((line) => {
      const heading = line.replace(/\s*:\s*$/, "").trim().toLowerCase();
      if (aliases[heading]) {
        currentKey = aliases[heading];
        buckets[currentKey] = buckets[currentKey] || [];
        return;
      }
      if (currentKey) {
        buckets[currentKey].push(line);
      }
    });

    return Object.entries(buckets).reduce((accumulator, [key, lines]) => {
      accumulator[key] = lines.join("\n").trim();
      return accumulator;
    }, {});
  }

  function getCommandWorkspaceSectionDisplayLabel(sectionKey) {
    return isCustomSectionKey(sectionKey)
      ? (getCustomSectionById(getCustomSectionIdFromKey(sectionKey))?.title || locale.customSectionFallback)
      : getSectionLabel(sectionKey);
  }

  function getCommandWorkspaceSectionValue(sectionKey) {
    if (isCustomSectionKey(sectionKey)) {
      return cloneData(getCustomSectionById(getCustomSectionIdFromKey(sectionKey)) || {});
    }

    switch (sectionKey) {
      case "profile":
        return cloneData(state.data.profile || {});
      case "summary":
        return String(state.data.summary || "");
      case "professionalExperience":
      case "internships":
      case "projects":
      case "education":
      case "certificates":
        return cloneData(state.data[sectionKey] || []);
      case "skills":
        return cloneData(state.data.skills?.technical || []);
      case "softSkills":
        return cloneData(state.data.skills?.soft || []);
      case "coverLetter":
        return cloneData(normalizeCoverLetter(state.coverLetter, state.data.profile?.name));
      default:
        return null;
    }
  }

  function getEmptyCommandWorkspaceSectionValue(sectionKey) {
    if (isCustomSectionKey(sectionKey)) {
      const section = getCustomSectionById(getCustomSectionIdFromKey(sectionKey));
      return {
        ...cloneData(section || {}),
        items: getDefaultCustomSectionItems(section?.layout)
      };
    }

    switch (sectionKey) {
      case "profile":
        return {
          ...cloneData(state.data.profile || {}),
          name: "",
          photo: "",
          email: "",
          phone: "",
          phoneHref: "",
          location: "",
          linkedinLabel: "",
          linkedinHref: "",
          githubLabel: "",
          githubHref: "",
          portfolioLabel: "",
          portfolioHref: ""
        };
      case "summary":
        return "";
      case "professionalExperience":
      case "internships":
      case "projects":
      case "education":
      case "certificates":
      case "skills":
      case "softSkills":
        return [];
      case "coverLetter":
        return createEmptyCoverLetter(state.data.profile?.name);
      default:
        return null;
    }
  }

  function parseCommandWorkspaceSectionValue(sectionKey, content, intent, currentValue, commandText) {
    if (isCustomSectionKey(sectionKey)) {
      return parseCustomSectionCommandValue(sectionKey, content, intent, currentValue);
    }

    switch (sectionKey) {
      case "profile":
        return parseProfileCommandValue(content, intent, currentValue);
      case "summary":
        return parseSummaryCommandValue(content, intent, currentValue);
      case "professionalExperience":
      case "internships":
        return parseWorkItemsCommandValue(content, intent, currentValue);
      case "projects":
        return parseProjectItemsCommandValue(content, intent, currentValue);
      case "education":
        return parseEducationItemsCommandValue(content, intent, currentValue);
      case "certificates":
        return parseCertificatesCommandValue(content, intent, currentValue);
      case "skills":
        return parseTechnicalSkillsCommandValue(content, intent, currentValue);
      case "softSkills":
        return parseSoftSkillsCommandValue(content, intent, currentValue);
      case "coverLetter":
        return parseCoverLetterCommandValue(content, intent, currentValue);
      default:
        throw createCommandWorkspaceError(locale.commandsFallbackNeeded, "COMMAND_WORKSPACE_UNSUPPORTED");
    }
  }

  function parseProfileCommandValue(content, intent, currentValue) {
    const base = intent === "append" ? cloneData(currentValue || {}) : getEmptyCommandWorkspaceSectionValue("profile");
    String(content || "").split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([^:]+):\s*(.+)\s*$/);
      if (!match) {
        return;
      }
      const key = String(match[1] || "").trim().toLowerCase();
      const value = String(match[2] || "").trim();
      const keyMap = {
        name: "name",
        photo: "photo",
        email: "email",
        phone: "phone",
        "phone href": "phoneHref",
        location: "location",
        linkedin: "linkedinHref",
        "linkedin label": "linkedinLabel",
        "linkedin url": "linkedinHref",
        github: "githubHref",
        "github label": "githubLabel",
        "github url": "githubHref",
        portfolio: "portfolioHref",
        "portfolio label": "portfolioLabel",
        "portfolio url": "portfolioHref"
      };
      const targetKey = keyMap[key];
      if (targetKey) {
        base[targetKey] = value;
      }
    });
    return base;
  }

  function parseSummaryCommandValue(content, intent, currentValue) {
    const trimmed = String(content || "").trim();
    if (!trimmed) {
      throw createCommandWorkspaceError(locale.commandsContentRequired);
    }
    return intent === "append" && currentValue
      ? `${String(currentValue).trim()}\n\n${trimmed}`.trim()
      : trimmed;
  }

  function parseWorkItemsCommandValue(content, intent, currentValue) {
    const parsed = parseStructuredBlocks(content, {
      organization: ["organization", "company"],
      role: ["role", "title"],
      date: ["date"],
      location: ["location"],
      bullets: ["bullets"]
    }).map((item) => ({
      date: String(item.date || ""),
      location: String(item.location || ""),
      organization: String(item.organization || ""),
      role: String(item.role || ""),
      bullets: normalizeBulletList(item.bullets)
    }));
    if (!parsed.length) {
      throw createCommandWorkspaceError(locale.commandsStructuredItemsRequired);
    }
    return intent === "append" ? (Array.isArray(currentValue) ? currentValue.concat(parsed) : parsed) : parsed;
  }

  function parseProjectItemsCommandValue(content, intent, currentValue) {
    const parsed = parseStructuredBlocks(content, {
      title: ["title", "project"],
      date: ["date"],
      linkLabel: ["link label"],
      linkHref: ["link href", "link url", "url"],
      bullets: ["bullets"]
    }).map((item) => ({
      date: String(item.date || ""),
      title: String(item.title || ""),
      linkLabel: String(item.linkLabel || ""),
      linkHref: String(item.linkHref || ""),
      bullets: normalizeBulletList(item.bullets)
    }));
    if (!parsed.length) {
      throw createCommandWorkspaceError(locale.commandsStructuredItemsRequired);
    }
    return intent === "append" ? (Array.isArray(currentValue) ? currentValue.concat(parsed) : parsed) : parsed;
  }

  function parseEducationItemsCommandValue(content, intent, currentValue) {
    const parsed = parseStructuredBlocks(content, {
      degree: ["degree"],
      institution: ["institution", "school", "university"],
      date: ["date"],
      location: ["location"]
    }).map((item) => ({
      date: String(item.date || ""),
      location: String(item.location || ""),
      degree: String(item.degree || ""),
      institution: String(item.institution || "")
    }));
    if (!parsed.length) {
      throw createCommandWorkspaceError(locale.commandsStructuredItemsRequired);
    }
    return intent === "append" ? (Array.isArray(currentValue) ? currentValue.concat(parsed) : parsed) : parsed;
  }

  function parseCertificatesCommandValue(content, intent, currentValue) {
    const parsed = dedupeCommandItems(splitStructuredEntries(content).map((entry) => {
      const parts = entry.split(/\s+[|-]\s+/, 2);
      return {
        title: String(parts[0] || "").trim(),
        description: String(parts[1] || "").trim()
      };
    }).filter((item) => item.title), (item) => item.title.toLowerCase());
    if (!parsed.length) {
      throw createCommandWorkspaceError(locale.commandsStructuredItemsRequired);
    }
    return intent === "append"
      ? dedupeCommandItems((Array.isArray(currentValue) ? currentValue.concat(parsed) : parsed), (item) => String(item.title || "").toLowerCase())
      : parsed;
  }

  function parseTechnicalSkillsCommandValue(content, intent, currentValue) {
    const parsed = dedupeCommandItems(String(content || "").split(/\r?\n/).map((line) => {
      const match = line.match(/^\s*([^:]+):\s*(.+)\s*$/);
      if (!match) {
        return null;
      }
      return {
        label: String(match[1] || "").trim(),
        items: String(match[2] || "").trim()
      };
    }).filter(Boolean), (item) => String(item.label || "").toLowerCase());
    if (!parsed.length) {
      throw createCommandWorkspaceError(locale.commandsSkillsFormatRequired);
    }
    return intent === "append"
      ? dedupeCommandItems((Array.isArray(currentValue) ? currentValue.concat(parsed) : parsed), (item) => String(item.label || "").toLowerCase())
      : parsed;
  }

  function parseSoftSkillsCommandValue(content, intent, currentValue) {
    const parsed = dedupeCommandItems(splitStructuredEntries(content), (item) => String(item || "").toLowerCase());
    if (!parsed.length) {
      throw createCommandWorkspaceError(locale.commandsStructuredItemsRequired);
    }
    return intent === "append"
      ? dedupeCommandItems((Array.isArray(currentValue) ? currentValue.concat(parsed) : parsed), (item) => String(item || "").toLowerCase())
      : parsed;
  }

  function parseCoverLetterCommandValue(content, intent, currentValue) {
    const normalizedCurrent = normalizeCoverLetter(currentValue, state.data.profile?.name);
    const blocks = {};
    let matched = false;
    String(content || "").split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*(opening|body|closing|recipient name|company|target role|hiring manager|signature name|notes)\s*:\s*(.+)$/i);
      if (!match) {
        return;
      }
      matched = true;
      const key = String(match[1] || "").trim().toLowerCase();
      const value = String(match[2] || "").trim();
      const map = {
        opening: "opening",
        body: "body",
        closing: "closing",
        "recipient name": "recipientName",
        company: "company",
        "target role": "targetRole",
        "hiring manager": "hiringManager",
        "signature name": "signatureName",
        notes: "notes"
      };
      blocks[map[key]] = value;
    });

    if (!matched) {
      const paragraphs = splitParagraphs(content);
      if (!paragraphs.length) {
        throw createCommandWorkspaceError(locale.commandsContentRequired);
      }
      if (intent === "append") {
        return normalizeCoverLetter({
          ...normalizedCurrent,
          body: [normalizedCurrent.body, ...paragraphs].filter(Boolean).join("\n\n")
        }, state.data.profile?.name);
      }
      return normalizeCoverLetter({
        ...normalizedCurrent,
        opening: paragraphs[0] || "",
        body: paragraphs.slice(1, -1).join("\n\n") || paragraphs[1] || "",
        closing: paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : normalizedCurrent.closing
      }, state.data.profile?.name);
    }

    return normalizeCoverLetter({
      ...normalizedCurrent,
      ...blocks,
      body: intent === "append" && blocks.body
        ? [normalizedCurrent.body, blocks.body].filter(Boolean).join("\n\n")
        : (blocks.body ?? normalizedCurrent.body)
    }, state.data.profile?.name);
  }

  function parseCustomSectionCommandValue(sectionKey, content, intent, currentValue) {
    const customSection = getCustomSectionById(getCustomSectionIdFromKey(sectionKey));
    if (!customSection) {
      throw createCommandWorkspaceError(locale.commandsFallbackNeeded, "COMMAND_WORKSPACE_UNSUPPORTED");
    }

    const existing = cloneData(currentValue || customSection);
    let items = [];
    if (customSection.layout === "certificate-cards") {
      items = splitStructuredEntries(content).map((entry) => {
        const [title, description] = entry.split(/\s+[|-]\s+/, 2);
        return {
          title: String(title || "").trim(),
          description: String(description || "").trim()
        };
      }).filter((item) => item.title);
    } else {
      items = splitStructuredEntries(content).map((entry) => ({ text: entry }));
    }

    if (!items.length) {
      throw createCommandWorkspaceError(locale.commandsStructuredItemsRequired);
    }

    return {
      ...existing,
      items: intent === "append" ? (Array.isArray(existing.items) ? existing.items.concat(items) : items) : items
    };
  }

  function parseStructuredBlocks(content, schema) {
    return splitBlocks(content).map((block) => {
      const entry = { bullets: [] };
      block.split(/\r?\n/).forEach((line) => {
        const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/);
        if (bulletMatch) {
          entry.bullets.push(String(bulletMatch[1] || "").trim());
          return;
        }
        const match = line.match(/^\s*([^:]+):\s*(.+)\s*$/);
        if (!match) {
          return;
        }
        const rawKey = String(match[1] || "").trim().toLowerCase();
        const value = String(match[2] || "").trim();
        Object.entries(schema).forEach(([field, aliases]) => {
          if (aliases.includes(rawKey)) {
            if (field === "bullets") {
              entry.bullets.push(...splitStructuredEntries(value));
            } else {
              entry[field] = value;
            }
          }
        });
      });
      return entry;
    }).filter((entry) => Object.keys(entry).some((key) => key !== "bullets") || entry.bullets.length);
  }

  function splitBlocks(content) {
    return String(content || "")
      .split(/\n\s*\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function splitStructuredEntries(content) {
    return String(content || "")
      .split(/\r?\n|,/)
      .map((item) => item.replace(/^\s*[-*]\s*/, "").trim())
      .filter(Boolean);
  }

  function dedupeCommandItems(items, keyBuilder) {
    const seen = new Set();
    const list = Array.isArray(items) ? items : [];
    return list.filter((item) => {
      const key = String(keyBuilder(item) || "").trim();
      if (!key) {
        return false;
      }
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  function normalizeBulletList(items) {
    const list = Array.isArray(items) ? items : [];
    return list.length ? list.map((item) => String(item || "").trim()).filter(Boolean) : [""];
  }

  function getDefaultCustomSectionItems(layout) {
    return normalizeCustomSectionLayout(layout) === "certificate-cards"
      ? [{ title: "", description: "" }]
      : [{ text: "" }];
  }

  function formatCommandWorkspaceSectionValue(sectionKey, value, isRename = false) {
    if (isRename) {
      return String(value || "");
    }

    if (isCustomSectionKey(sectionKey)) {
      const section = value || {};
      const items = Array.isArray(section.items) ? section.items : [];
      if (!items.length) {
        return locale.commandsEmptyValue;
      }
      if (normalizeCustomSectionLayout(section.layout) === "certificate-cards") {
        return items.map((item) => [item.title, item.description].filter(Boolean).join(" - ")).join("\n");
      }
      return items.map((item) => item.text || "").filter(Boolean).join("\n");
    }

    switch (sectionKey) {
      case "profile":
        return Object.entries(value || {})
          .filter(([, item]) => String(item || "").trim())
          .map(([key, item]) => `${key}: ${item}`)
          .join("\n") || locale.commandsEmptyValue;
      case "summary":
        return String(value || "").trim() || locale.commandsEmptyValue;
      case "professionalExperience":
      case "internships":
      case "projects":
      case "education":
      case "certificates":
        return formatCommandWorkspaceArrayValue(sectionKey, value);
      case "skills":
        return (Array.isArray(value) ? value : []).map((item) => `${item.label}: ${item.items}`).join("\n") || locale.commandsEmptyValue;
      case "softSkills":
        return (Array.isArray(value) ? value : []).join("\n") || locale.commandsEmptyValue;
      case "coverLetter":
        return [
          value?.opening,
          value?.body,
          value?.closing
        ].filter(Boolean).join("\n\n") || locale.commandsEmptyValue;
      default:
        return String(value || "").trim() || locale.commandsEmptyValue;
    }
  }

  function formatCommandWorkspaceArrayValue(sectionKey, value) {
    const list = Array.isArray(value) ? value : [];
    if (!list.length) {
      return locale.commandsEmptyValue;
    }
    return list.map((item) => {
      if (sectionKey === "certificates") {
        return [item.title, item.description].filter(Boolean).join(" - ");
      }
      if (sectionKey === "education") {
        return [item.degree, item.institution, item.date].filter(Boolean).join(" | ");
      }
      if (sectionKey === "projects") {
        return [item.title, item.date].filter(Boolean).join(" | ");
      }
      return [
        item.organization,
        item.role,
        item.date
      ].filter(Boolean).join(" | ");
    }).join("\n");
  }

  function applyCommandWorkspaceOperations(operations) {
    operations.forEach((operation) => {
      if (operation.type === "rename-section") {
        applyCommandWorkspaceSectionRename(operation.sectionKey, operation.title);
        return;
      }
      if (operation.type === "replace-section") {
        applyCommandWorkspaceSectionValue(operation.sectionKey, operation.value);
      }
    });
  }

  function hasAiWorkspaceConfig() {
    return Boolean(state.ai.enabled && String(state.ai.apiKey || "").trim());
  }

  function createAiHeaders(provider) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.ai.apiKey}`
    };
    if (normalizeAiProvider(provider, state.ai.apiKey) === "openrouter") {
      const origin = !runningLocally && window.location.origin && window.location.origin !== "null"
        ? window.location.origin
        : "https://jao399.github.io";
      headers["HTTP-Referer"] = origin;
      headers["X-Title"] = "Resume Studio";
    }
    return headers;
  }

  async function requestAiCompletionDirect({ messages, requireJson = false }) {
    if (!String(state.ai.apiKey || "").trim()) {
      throw new Error(locale.aiRequiresKey);
    }

    const provider = normalizeAiProvider(state.ai.provider, state.ai.apiKey);
    const model = getResolvedAiModel();
    const endpoint = provider === "openrouter"
      ? "https://openrouter.ai/api/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";

    const payload = {
      model,
      messages,
      temperature: 0.2
    };
    if (requireJson) {
      payload.response_format = { type: "json_object" };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers: createAiHeaders(provider),
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body?.error?.message || body?.error || locale.aiRequestFailed);
    }
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const text = content.map((item) => item?.text || "").filter(Boolean).join("\n").trim();
      if (text) {
        return text;
      }
    }
    throw new Error(locale.aiResponseEmpty);
  }

  function extractAiJsonPayload(text) {
    const raw = String(text || "").trim();
    if (!raw) {
      throw new Error(locale.aiResponseEmpty);
    }
    try {
      return JSON.parse(raw);
    } catch (_error) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        throw new Error(locale.aiResponseInvalidJson);
      }
      return JSON.parse(match[0]);
    }
  }

  async function requestAiJsonDirect(systemPrompt, userPrompt) {
    const content = await requestAiCompletionDirect({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      requireJson: true
    });
    return extractAiJsonPayload(content);
  }

  async function requestApiTask(endpointPath, body, directFallback) {
    const canCallApi = Boolean(pdfHelperOrigin);
    if (canCallApi) {
      try {
        const response = await fetch(`${pdfHelperOrigin}${endpointPath}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload?.success !== false) {
          return payload;
        }
        if (!directFallback) {
          throw new Error(payload?.error || locale.aiRequestFailed);
        }
      } catch (error) {
        if (!directFallback) {
          throw error;
        }
      }
    }
    if (!directFallback) {
      throw new Error(locale.hostedApiMissing);
    }
    return directFallback();
  }

  function buildCurrentResumeTextForAi() {
    const lines = [];
    const profile = state.data.profile || {};
    lines.push(`Name: ${profile.name || ""}`);
    lines.push(`Email: ${profile.email || ""}`);
    lines.push(`Phone: ${profile.phone || ""}`);
    lines.push(`Location: ${profile.location || ""}`);
    if (profile.linkedin) {
      lines.push(`LinkedIn: ${profile.linkedin}`);
    }
    if (profile.github) {
      lines.push(`GitHub: ${profile.github}`);
    }
    if (profile.portfolio) {
      lines.push(`Portfolio: ${profile.portfolio}`);
    }
    lines.push("");
    lines.push(`Professional Summary:\n${String(state.data.summary || "").trim()}`);
    lines.push("");
    [
      ["Professional Experience", state.data.professionalExperience || [], (item) => [`${item.role || ""} | ${item.organization || ""}`, `${item.date || ""} | ${item.location || ""}`, ...(item.bullets || []).map((bullet) => `- ${bullet}`)]],
      ["Internships", state.data.internships || [], (item) => [`${item.role || ""} | ${item.organization || ""}`, `${item.date || ""} | ${item.location || ""}`, ...(item.bullets || []).map((bullet) => `- ${bullet}`)]],
      ["Projects", state.data.projects || [], (item) => [`${item.title || ""} | ${item.date || ""}`, item.linkHref ? `Link: ${item.linkHref}` : "", ...(item.bullets || []).map((bullet) => `- ${bullet}`)]],
      ["Education", state.data.education || [], (item) => [`${item.degree || ""} | ${item.institution || ""}`, `${item.date || ""} | ${item.location || ""}`]],
      ["Certificates", state.data.certificates || [], (item) => [`${item.title || ""}`, item.description || ""]]
    ].forEach(([label, list, formatter]) => {
      if (!Array.isArray(list) || !list.length) {
        return;
      }
      lines.push(label);
      list.forEach((item) => {
        formatter(item).filter(Boolean).forEach((line) => lines.push(line));
        lines.push("");
      });
    });
    if (Array.isArray(state.data.skills?.technical) && state.data.skills.technical.length) {
      lines.push("Technical Skills");
      state.data.skills.technical.forEach((item) => lines.push(`${item.label}: ${item.items}`));
      lines.push("");
    }
    if (Array.isArray(state.data.skills?.soft) && state.data.skills.soft.length) {
      lines.push("Soft Skills");
      state.data.skills.soft.forEach((item) => lines.push(`- ${item}`));
      lines.push("");
    }
    if (Array.isArray(state.data.customSections) && state.data.customSections.length) {
      state.data.customSections.forEach((section) => {
        if (!section?.visible) {
          return;
        }
        lines.push(section.title || "Custom Section");
        (section.items || []).forEach((item) => {
          if (typeof item === "string") {
            lines.push(`- ${item}`);
            return;
          }
          if (item?.text) {
            lines.push(`- ${item.text}`);
            return;
          }
          lines.push(`- ${[item?.title, item?.description].filter(Boolean).join(" | ")}`);
        });
        lines.push("");
      });
    }
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function applyCommandWorkspaceSectionRename(sectionKey, title) {
    const nextTitle = String(title || "").trim();
    if (!nextTitle) {
      return;
    }
    if (isCustomSectionKey(sectionKey)) {
      const customSection = getCustomSectionById(getCustomSectionIdFromKey(sectionKey));
      if (customSection) {
        customSection.title = nextTitle;
      }
      return;
    }
    const config = getBuiltInSectionConfig(sectionKey);
    if (config) {
      config.title = nextTitle;
    }
    if (state.data.labels[sectionKey] !== undefined) {
      state.data.labels[sectionKey] = nextTitle;
    }
  }

  function applyCommandWorkspaceSectionValue(sectionKey, value) {
    if (isCustomSectionKey(sectionKey)) {
      const customSection = getCustomSectionById(getCustomSectionIdFromKey(sectionKey));
      if (customSection) {
        customSection.items = Array.isArray(value?.items) ? cloneData(value.items) : getDefaultCustomSectionItems(customSection.layout);
      }
      return;
    }

    switch (sectionKey) {
      case "profile":
        state.data.profile = {
          ...state.data.profile,
          ...cloneData(value || {})
        };
        break;
      case "summary":
        state.data.summary = String(value || "");
        break;
      case "professionalExperience":
      case "internships":
      case "projects":
      case "education":
      case "certificates":
        state.data[sectionKey] = cloneData(Array.isArray(value) ? value : []);
        break;
      case "skills":
        state.data.skills.technical = cloneData(Array.isArray(value) ? value : []);
        break;
      case "softSkills":
        state.data.skills.soft = cloneData(Array.isArray(value) ? value : []);
        break;
      case "coverLetter":
        state.coverLetter = normalizeCoverLetter(value, state.data.profile?.name);
        break;
      default:
        break;
    }
  }

  async function requestCommandPlanFallback({ selectedSections, command, content }) {
    const currentSections = selectedSections.reduce((accumulator, key) => {
      accumulator[key] = getCommandWorkspaceSectionValue(key);
      return accumulator;
    }, {});
    const payload = await requestApiTask("/command-plan", {
      provider: state.ai.provider,
      apiKey: state.ai.apiKey,
      model: getResolvedAiModel(),
      selectedSections,
      command,
      content,
      currentSections
    }, async () => {
      const structured = await requestAiJsonDirect(
        [
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
        [
          `Selected sections: ${JSON.stringify(selectedSections || [])}`,
          `Command: ${String(command || "")}`,
          `Pasted content: ${String(content || "")}`,
          `Current sections: ${JSON.stringify(currentSections || {})}`,
          "Return only the updates needed for the selected sections."
        ].join("\n")
      );
      return {
        success: true,
        updates: structured?.updates || {},
        sectionTitles: structured?.sectionTitles || {},
        note: String(structured?.note || "")
      };
    }).catch((error) => {
      throw createCommandWorkspaceError(error.message || locale.commandsFallbackFailed);
    });

    const operations = selectedSections.map((sectionKey) => {
      if (payload.sectionTitles && payload.sectionTitles[sectionKey]) {
        return {
          type: "rename-section",
          sectionKey,
          title: payload.sectionTitles[sectionKey]
        };
      }
      return {
        type: "replace-section",
        sectionKey,
        value: payload.updates?.[sectionKey]
      };
    }).filter((item) => item.type !== "replace-section" || item.value !== undefined);

    return {
      source: "fallback",
      note: String(payload.note || ""),
      operations,
      sections: operations.map((operation) => ({
        key: operation.sectionKey,
        label: getCommandWorkspaceSectionDisplayLabel(operation.sectionKey),
        beforeText: formatCommandWorkspaceSectionValue(operation.sectionKey, getCommandWorkspaceSectionValue(operation.sectionKey)),
        afterText: operation.type === "rename-section"
          ? formatCommandWorkspaceSectionValue(operation.sectionKey, operation.title, true)
          : formatCommandWorkspaceSectionValue(operation.sectionKey, operation.value),
        note: ""
      }))
    };
  }

  function createRewriteAssistant({ key, getValue, sectionKey, onApply }) {
    const wrapper = document.createElement("div");
    wrapper.className = "editor-rewrite";

    const entry = state.rewriter.entries[key] || {};
    const actions = document.createElement("div");
    actions.className = "editor-actions";
    actions.append(
      createActionButton(locale.rewriteSuggest, "", () => handleGenerateRewrite({ key, getValue, sectionKey }), entry.loading, { helpKey: "rewrite.suggest" }),
      createActionButton(locale.rewriteApply, "", () => {
        if (!entry.suggestion) {
          return;
        }
        commitPendingHistory();
        const historyBefore = createHistorySnapshot();
        onApply(entry.suggestion);
        delete state.rewriter.entries[key];
        commitHistorySnapshot(historyBefore);
        refreshAll();
      }, !entry.suggestion, { helpKey: "rewrite.apply" }),
      createActionButton(locale.rewriteRegenerate, "", () => handleGenerateRewrite({ key, getValue, sectionKey }), entry.loading, { helpKey: "rewrite.regenerate" })
    );

    wrapper.appendChild(actions);

    if (entry.loading) {
      const loading = document.createElement("p");
      loading.className = "editor-section__description";
      loading.textContent = locale.rewriteLoading;
      wrapper.appendChild(loading);
      return wrapper;
    }

    if (entry.suggestion) {
      wrapper.appendChild(createAtsNotice(`${locale.rewriteSuggestionLabel}: ${entry.suggestion}`));
    }

    if (entry.error) {
      wrapper.appendChild(createAtsNotice(entry.error, "is-warning"));
    }

    return wrapper;
  }

  async function handleGenerateRewrite({ key, getValue, sectionKey }) {
    const original = String(getValue() || "").trim();
    if (!original) {
      state.rewriter.entries[key] = { error: locale.rewriteEmpty };
      renderEditor();
      return;
    }

    state.rewriter.entries[key] = {
      loading: true,
      suggestion: "",
      error: ""
    };
    renderEditor();

    try {
      let suggestion = "";
      let error = "";
      if (state.ai.enabled && state.ai.apiKey) {
        try {
          suggestion = await requestAiRewrite(original, sectionKey);
        } catch (aiError) {
          suggestion = buildLocalRewriteSuggestion(original, sectionKey);
          error = locale.rewriteAiFallback;
        }
      } else {
        suggestion = buildLocalRewriteSuggestion(original, sectionKey);
      }

      state.rewriter.entries[key] = {
        loading: false,
        suggestion,
        error
      };
    } catch (error) {
      state.rewriter.entries[key] = {
        loading: false,
        suggestion: "",
        error: error.message || locale.rewriteFailed
      };
    }

    renderEditor();
  }

  function buildLocalRewriteSuggestion(text, sectionKey) {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim().replace(/\.+$/, "");
    if (!cleaned) {
      return "";
    }

    const replacements = [
      [/^responsible for\s+/i, ""],
      [/^worked on\s+/i, ""],
      [/^helped\s+/i, ""],
      [/^assisted with\s+/i, ""],
      [/^participated in\s+/i, ""],
      [/^provided\s+/i, "Delivered "],
      [/^improved\s+/i, "Improved "],
      [/^supported\s+/i, "Supported "],
      [/^leading\s+/i, "Led "]
    ];

    let rewritten = cleaned;
    replacements.forEach(([pattern, replacement]) => {
      rewritten = rewritten.replace(pattern, replacement);
    });

    if (!/^[A-Z\u0600-\u06FF]/.test(rewritten)) {
      rewritten = rewritten.charAt(0).toUpperCase() + rewritten.slice(1);
    }

    if (!/^(Led|Built|Developed|Improved|Delivered|Optimized|Strengthened|Implemented|Designed|Automated|Secured|Created|Managed|Reduced)\b/i.test(rewritten)) {
      const leadVerb = sectionKey === "summary" ? "Positioned" : "Delivered";
      rewritten = `${leadVerb} ${rewritten.charAt(0).toLowerCase()}${rewritten.slice(1)}`;
    }

    if (!/\b(by|through|to|for)\b/i.test(rewritten)) {
      const outcome = sectionKey === "summary"
        ? "to highlight relevant impact, scope, and fit."
        : "to improve delivery quality, clarity, and measurable impact.";
      rewritten = `${rewritten} ${outcome}`;
    }

    return rewritten.replace(/\s+/g, " ").trim();
  }

  async function requestAiRewrite(text, sectionKey) {
    throw new Error("Legacy rewrite mode was removed.");
  }

  async function requestAiCommandRewrite({ command, scope, sectionKey, text, context }) {
    throw new Error("Legacy AI command mode was removed.");
  }

  async function handleGenerateCoverLetterSuggestion() {
    state.coverLetterAssistant = {
      loading: true,
      suggestion: null,
      error: ""
    };
    renderEditor();

    try {
      const localSuggestion = buildLocalCoverLetterDraft();
      let suggestion = localSuggestion;
      let error = "";

      if (state.ai.enabled && state.ai.apiKey) {
        try {
          suggestion = await requestAiCoverLetterSuggestion(localSuggestion);
        } catch (aiError) {
          error = locale.coverLetterAiFallback;
        }
      }

      state.coverLetterAssistant = {
        loading: false,
        suggestion: normalizeCoverLetter(suggestion, state.data.profile?.name),
        error
      };
    } catch (error) {
      state.coverLetterAssistant = {
        loading: false,
        suggestion: null,
        error: error.message || locale.coverLetterGenerateFailed
      };
    }

    renderEditor();
  }

  function handleApplyCoverLetterSuggestion() {
    if (!state.coverLetterAssistant.suggestion) {
      return;
    }

    commitPendingHistory();
    const historyBefore = createHistorySnapshot();
    state.coverLetter = normalizeCoverLetter(state.coverLetterAssistant.suggestion, state.data.profile?.name);
    state.coverLetterAssistant = {
      loading: false,
      suggestion: null,
      error: ""
    };
    commitHistorySnapshot(historyBefore);
    refreshAll();
  }

  async function handleCopyCoverLetter() {
    const text = createCoverLetterPlainText(normalizeCoverLetter(state.coverLetter, state.data.profile?.name));
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        window.alert(locale.coverLetterCopySuccess);
        return;
      }
    } catch (error) {
      // Fall through to the legacy copy helper.
    }

    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "readonly");
    helper.style.position = "fixed";
    helper.style.left = "-9999px";
    document.body.appendChild(helper);
    helper.select();
    document.execCommand("copy");
    helper.remove();
    window.alert(locale.coverLetterCopySuccess);
  }

  function buildLocalCoverLetterDraft() {
    const current = normalizeCoverLetter(state.coverLetter, state.data.profile?.name);
    const role = current.targetRole || state.targeting.targetRole || locale.coverLetterRoleFallback;
    const company = current.company || state.targeting.company || locale.coverLetterCompanyFallback;
    const resumeSummary = String(state.data.summary || "").replace(/\s+/g, " ").trim();
    const topEvidence = collectCoverLetterEvidence();
    const focusKeywords = tokenizeForCoverLetter(`${state.targeting.focusKeywords || ""} ${state.ats.jobDescription || ""}`).slice(0, 4);
    const keywordLine = focusKeywords.length
      ? (documentLanguage === "ar"
        ? ` وتشمل أولويات هذا الدور ${focusKeywords.join("، ")}`
        : `, with direct alignment to priorities such as ${focusKeywords.join(", ")}`)
      : "";

    const opening = documentLanguage === "ar"
      ? `أتقدم باهتمام إلى وظيفة ${role} لدى ${company}. أقدم خلفية عملية تجمع بين التنفيذ الدقيق والتواصل الواضح والعمل المنظم${keywordLine}.`
      : `I am applying with strong interest for the ${role} role at ${company}. I bring hands-on experience in disciplined delivery, clear communication, and reliable execution${keywordLine}.`;

    const bodyLead = resumeSummary
      ? resumeSummary.replace(/\s+/g, " ").trim()
      : (documentLanguage === "ar"
        ? `تعكس خبرتي العملية قدرة ثابتة على دعم الأولويات التشغيلية وتحويل المتطلبات إلى نتائج واضحة.`
        : `My background reflects a consistent ability to support operational priorities and turn requirements into clear outcomes.`);

    const evidenceSentence = topEvidence.length
      ? (documentLanguage === "ar"
        ? `ومن أبرز ما يمكنني تقديمه: ${topEvidence.join("؛ ")}.`
        : `Highlights I would bring to the role include ${topEvidence.join("; ")}.`)
      : "";

    const body = documentLanguage === "ar"
      ? `${bodyLead}\n\n${evidenceSentence} أسعى إلى تقديم قيمة عملية سريعة من خلال تحمل المسؤولية، الانتباه للتفاصيل، والقدرة على العمل بهدوء تحت الضغط.`
      : `${bodyLead}\n\n${evidenceSentence} I am ready to contribute quickly through ownership, attention to detail, and calm execution under pressure.`;

    const closing = documentLanguage === "ar"
      ? `أرحب بفرصة مناقشة كيف يمكن أن تتوافق خبرتي مع احتياجات ${company}. شكرًا لوقتكم واهتمامكم.`
      : `I would welcome the opportunity to discuss how my background can support ${company}'s needs. Thank you for your time and consideration.`;

    return normalizeCoverLetter({
      recipientName: current.recipientName,
      company,
      targetRole: role,
      hiringManager: current.hiringManager,
      opening,
      body,
      closing,
      signatureName: current.signatureName || state.data.profile?.name || "",
      notes: current.notes,
      generatedAt: Date.now()
    }, state.data.profile?.name);
  }

  function collectCoverLetterEvidence() {
    const candidates = [
      ...state.data.professionalExperience.flatMap((item) => item.bullets || []),
      ...state.data.internships.flatMap((item) => item.bullets || []),
      ...state.data.projects.flatMap((item) => item.bullets || [])
    ];

    return candidates
      .map((item) => String(item || "").replace(/\s+/g, " ").trim().replace(/\.+$/, ""))
      .filter(Boolean)
      .slice(0, 3);
  }

  function tokenizeForCoverLetter(text) {
    const words = String(text || "")
      .toLowerCase()
      .match(documentLanguage === "ar" ? /[\u0600-\u06ff]{3,}/g : /[a-z0-9+#.-]{3,}/g) || [];
    const stopwords = documentLanguage === "ar" ? ARABIC_STOPWORDS : ENGLISH_STOPWORDS;
    return [...new Set(words.filter((word) => !stopwords.has(word)))];
  }

  async function requestAiCoverLetterSuggestion(draft) {
    const response = await requestApiTask("/cover-letter-draft", {
      provider: state.ai.provider,
      apiKey: state.ai.apiKey,
      model: getResolvedAiModel(),
      jobTitle: state.targeting.targetRole || draft?.targetRole || "",
      jobDescription: state.ats.jobDescription || "",
      cvText: buildCurrentResumeTextForAi(),
      draft
    }, async () => {
      const structured = await requestAiJsonDirect(
        [
          "You write recruiter-ready cover letters for the current resume only.",
          "Use the resume facts exactly as provided.",
          "Do not invent achievements, metrics, employers, dates, or tools.",
          "Use the target role and job description when available.",
          "Keep the tone professional, concise, specific, and believable.",
          "Return valid JSON only in this shape:",
          "{\"recipientName\":\"\",\"company\":\"\",\"targetRole\":\"\",\"hiringManager\":\"\",\"opening\":\"\",\"body\":\"\",\"closing\":\"\",\"signatureName\":\"\",\"notes\":\"\"}"
        ].join("\n"),
        [
          `CV:\n${buildCurrentResumeTextForAi()}`,
          `Target Job Title: ${state.targeting.targetRole || draft?.targetRole || ""}`,
          `Target Job Description:\n${state.ats.jobDescription || ""}`,
          `Current Draft: ${JSON.stringify(draft || {})}`,
          "Write a stronger, role-aware cover letter draft for this exact resume."
        ].join("\n\n")
      );
      return { success: true, draft: structured };
    });
    return response.draft || draft;
  }

  function buildAiReviewPayload(reviewType) {
    const quality = state.quality.analysis || analyzeQuality(state.data, state.targeting, state.ats.jobDescription);
    const ats = state.ats.analysis || analyzeJobDescription(state.data, state.ats.jobDescription);
    return {
      reviewType,
      provider: state.ai.provider,
      apiKey: state.ai.apiKey,
      model: getResolvedAiModel(),
      cvText: buildCurrentResumeTextForAi(),
      jobTitle: state.targeting.targetRole || "",
      jobDescription: state.ats.jobDescription || "",
      qualitySummary: {
        scores: quality?.scores || {},
        topProblems: (quality?.topProblems || []).slice(0, 10),
        weakestBullets: (quality?.weakBullets || []).slice(0, 6)
      },
      atsSummary: {
        score: ats?.score || 0,
        summary: ats?.summary || "",
        matchedKeywords: ats?.matchedKeywords || [],
        missingKeywords: ats?.missingKeywords || [],
        weakSections: ats?.weakSections || []
      }
    };
  }

  async function requestAiReview(reviewType) {
    const payload = buildAiReviewPayload(reviewType);
    return requestApiTask("/ai-review", payload, async () => {
      const systemPrompts = {
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
      const userPrompt = [
        `CV:\n${payload.cvText}`,
        `Target Job Title:\n${payload.jobTitle || ""}`,
        `Target Job Description:\n${payload.jobDescription || ""}`,
        `Local Quality Summary:\n${JSON.stringify(payload.qualitySummary)}`,
        `Local ATS Summary:\n${JSON.stringify(payload.atsSummary)}`
      ].join("\n\n");
      const structured = await requestAiJsonDirect(systemPrompts[reviewType], userPrompt);
      return { success: true, review: structured };
    });
  }

  function triggerAiReview(reviewType) {
    if (!hasAiWorkspaceConfig()) {
      setAiReviewState(reviewType, {
        loading: false,
        error: locale.aiRequiresKey,
        result: null
      });
      renderEditor();
      return;
    }

    setAiReviewState(reviewType, {
      loading: true,
      error: "",
      result: null
    });
    renderEditor();

    Promise.resolve()
      .then(() => requestAiReview(reviewType))
      .then((payload) => {
        setAiReviewState(reviewType, {
          loading: false,
          error: "",
          result: payload.review || null
        });
        renderEditor();
      })
      .catch((error) => {
        setAiReviewState(reviewType, {
          loading: false,
          error: error.message || locale.aiRequestFailed,
          result: null
        });
        renderEditor();
      });
  }

  async function handleGenerateArabicReview(existingContext = getLinkedArabicContext(getSelectedPreset())) {
    const sourceVersion = getSelectedPreset();
    if (documentLanguage !== "en" || !sourceVersion) {
      return;
    }

    if (!String(state.ai.apiKey || "").trim()) {
      window.alert(locale.translationRequiresAi);
      return;
    }

    state.translation.loading = true;
    state.translation.error = "";
    state.translation.message = "";
    state.translation.review = null;
    renderEditor();

    try {
      const sourcePayload = buildTranslationSourcePayload();
      const targetVersion = existingContext?.arabicVersion || createArabicDerivedVersionShell(sourceVersion);
      const existingArabicPayload = buildArabicExistingPayload(targetVersion);
      const changedSections = getChangedTranslationSections(sourcePayload.fingerprints, targetVersion.translationSnapshot?.sections);
      const mode = existingContext?.arabicVersion ? "sync" : "initial";
      const requestedSections = mode === "initial" || !changedSections.length ? trackedTranslationSections : changedSections;

      const translated = await requestArabicTranslation({
        sourceVersion,
        sourcePayload,
        targetVersion,
        existingArabicPayload,
        mode,
        requestedSections
      });

      const review = buildArabicReview({
        sourceVersion,
        sourcePayload,
        targetVersion,
        translated,
        requestedSections
      });

      state.translation.review = review;
      state.translation.message = review.items.length
        ? locale.translationReviewReady.replace("{count}", String(review.items.length))
        : locale.translationNoChanges;
    } catch (error) {
      state.translation.error = error.message || locale.translationFailed;
    } finally {
      state.translation.loading = false;
      renderEditor();
    }
  }

  async function requestArabicTranslation({ sourceVersion, sourcePayload, targetVersion, existingArabicPayload, mode, requestedSections }) {
    const payload = await requestApiTask("/translate-version", {
      provider: state.ai.provider,
      apiKey: state.ai.apiKey,
      model: getResolvedAiModel(),
      sourceLanguage: "en",
      targetLanguage: "ar",
      mode,
      sourceVersion: {
        id: sourceVersion?.id || "",
        name: sourceVersion?.name || ""
      },
      requestedSections,
      sections: sourcePayload.sections,
      existingArabic: existingArabicPayload,
      jobDescription: state.ats.jobDescription || ""
    }, async () => {
      const structured = await requestAiJsonDirect(
        [
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
        [
          "Source language: en",
          "Target language: ar",
          `Mode: ${String(mode || "sync")}`,
          `Source version: ${JSON.stringify({ id: sourceVersion?.id || "", name: sourceVersion?.name || "" })}`,
          `Requested sections: ${JSON.stringify(requestedSections || [])}`,
          `Job description: ${String(state.ats.jobDescription || "")}`,
          `English sections: ${JSON.stringify(sourcePayload.sections || {})}`,
          `Existing Arabic context: ${JSON.stringify(existingArabicPayload || {})}`,
          "Localize each requested section into polished Arabic while preserving all facts exactly."
        ].join("\n")
      );
      return {
        success: true,
        sections: structured?.sections || {},
        notes: structured?.notes || {}
      };
    });

    return {
      sections: payload.sections || {},
      notes: payload.notes || {}
    };
  }

  function buildTranslationSourcePayload() {
    const sections = {
      profile: {
        name: state.data.profile?.name || "",
        email: state.data.profile?.email || "",
        phone: state.data.profile?.phone || "",
        phoneHref: state.data.profile?.phoneHref || "",
        location: state.data.profile?.location || "",
        linkedinLabel: state.data.profile?.linkedinLabel || "",
        linkedinHref: state.data.profile?.linkedinHref || "",
        githubLabel: state.data.profile?.githubLabel || "",
        githubHref: state.data.profile?.githubHref || "",
        portfolioLabel: state.data.profile?.portfolioLabel || "",
        portfolioHref: state.data.profile?.portfolioHref || ""
      },
      summary: state.data.summary || "",
      professionalExperience: cloneData(state.data.professionalExperience || []),
      internships: cloneData(state.data.internships || []),
      projects: cloneData(state.data.projects || []),
      education: cloneData(state.data.education || []),
      certificates: cloneData(state.data.certificates || []),
      skills: cloneData(state.data.skills?.technical || []),
      softSkills: cloneData(state.data.skills?.soft || []),
      coverLetter: cloneData(normalizeCoverLetter(state.coverLetter, state.data.profile?.name))
    };

    return {
      sections,
      fingerprints: buildTranslationFingerprints(sections)
    };
  }

  function buildArabicExistingPayload(targetVersion) {
    const data = targetVersion?.data || buildResumeTemplateForLanguage("ar");
    const coverLetter = normalizeCoverLetter(targetVersion?.coverLetter, data.profile?.name);
    return {
      profile: cloneData(data.profile || {}),
      summary: data.summary || "",
      professionalExperience: cloneData(data.professionalExperience || []),
      internships: cloneData(data.internships || []),
      projects: cloneData(data.projects || []),
      education: cloneData(data.education || []),
      certificates: cloneData(data.certificates || []),
      skills: cloneData(data.skills?.technical || []),
      softSkills: cloneData(data.skills?.soft || []),
      coverLetter
    };
  }

  function buildArabicReview({ sourceVersion, sourcePayload, targetVersion, translated, requestedSections }) {
    const currentArabic = buildArabicExistingPayload(targetVersion);
    const items = requestedSections.map((key) => ({
      key,
      label: getTranslationSectionLabel(key),
      sourceExcerpt: buildSectionExcerpt(key, sourcePayload.sections[key]),
      currentExcerpt: buildSectionExcerpt(key, currentArabic[key]),
      proposedExcerpt: buildSectionExcerpt(key, translated.sections[key]),
      proposedValue: cloneData(translated.sections[key]),
      sourceFingerprint: sourcePayload.fingerprints[key],
      apply: true,
      note: [
        targetVersion?.manualOverrides?.[key] ? locale.translationOverrideWarning : "",
        translated.notes?.[key] || ""
      ].filter(Boolean).join(" ")
    }));

    return {
      mode: targetVersion?.id ? "sync" : "initial",
      sourceVersionId: sourceVersion.id,
      sourceVersionName: sourceVersion.name,
      targetVersionId: targetVersion.id,
      targetVersionName: targetVersion.name,
      items,
      translatedSections: translated.sections,
      translatedNotes: translated.notes,
      sourceFingerprints: sourcePayload.fingerprints
    };
  }

  function handleApplyArabicReview() {
    const review = state.translation.review;
    if (!review || !review.items.some((item) => item.apply)) {
      return;
    }

    const englishPreset = getSelectedPreset();
    if (!englishPreset) {
      return;
    }

    const arabicVersions = loadStoredPresetsForLanguage("ar");
    let arabicVersion = getPresetById(arabicVersions, review.targetVersionId);
    if (!arabicVersion) {
      arabicVersion = createArabicDerivedVersionShell(englishPreset);
      arabicVersions.unshift(arabicVersion);
    }

    review.items.forEach((item) => {
      if (!item.apply) {
        return;
      }
      applyTranslatedSectionToVersion(arabicVersion, item.key, item.proposedValue);
      arabicVersion.translationSnapshot.sections[item.key] = item.sourceFingerprint;
      delete arabicVersion.manualOverrides[item.key];
    });

    arabicVersion.sourceLanguage = "en";
    arabicVersion.derivedFromVersionId = englishPreset.id;
    arabicVersion.lastTranslationAt = Date.now();
    arabicVersion.updatedAt = Date.now();
    arabicVersion.translationSnapshot.sourceVersionId = englishPreset.id;
    arabicVersion.translationStatus = getChangedTranslationSections(
      review.sourceFingerprints,
      arabicVersion.translationSnapshot.sections
    ).length ? "needs-sync" : "clean";

    englishPreset.derivedVersionIds = {
      ...normalizeDerivedVersionIds(englishPreset.derivedVersionIds),
      ar: arabicVersion.id
    };
    englishPreset.updatedAt = Date.now();
    englishPreset.targetRole = state.targeting.targetRole;
    englishPreset.company = state.targeting.company;
    englishPreset.jobDescription = state.ats.jobDescription || "";
    englishPreset.focusKeywords = state.targeting.focusKeywords;
    englishPreset.notes = state.targeting.notes;
    englishPreset.data = normalizeResumeData(state.data);
    englishPreset.coverLetter = cloneData(normalizeCoverLetter(state.coverLetter, state.data.profile?.name));
    englishPreset.sourceLanguage = "en";

    persistPresetStore();
    persistPresetStoreForLanguage("ar", arabicVersions);

    state.translation.currentOverrides = normalizeManualOverrides(state.translation.currentOverrides);
    state.translation.review = null;
    state.translation.message = locale.translationApplied.replace("{name}", arabicVersion.name);
    renderEditor();
  }

  function applyTranslatedSectionToVersion(version, key, value) {
    switch (key) {
      case "profile":
        version.data.profile = {
          ...version.data.profile,
          ...cloneData(value || {})
        };
        break;
      case "summary":
        version.data.summary = String(value || "");
        break;
      case "professionalExperience":
      case "internships":
      case "projects":
      case "education":
      case "certificates":
        version.data[key] = cloneData(value || []);
        break;
      case "skills":
        version.data.skills = version.data.skills || {};
        version.data.skills.technical = cloneData(value || []);
        break;
      case "softSkills":
        version.data.skills = version.data.skills || {};
        version.data.skills.soft = cloneData(value || []);
        break;
      case "coverLetter":
        version.coverLetter = normalizeCoverLetter(value, version.data.profile?.name);
        break;
      default:
        break;
    }
  }

  function createArabicDerivedVersionShell(sourceVersion) {
    const template = buildResumeTemplateForLanguage("ar");
    template.ui = {
      ...(template.ui || {}),
      stylePreset: normalizeStylePreset(sourceVersion?.data?.ui?.stylePreset)
    };
    return {
      id: createPresetId(),
      name: `${sourceVersion.name} ${locale.translationArabicSuffix}`,
      targetRole: state.targeting.targetRole,
      company: state.targeting.company,
      jobDescription: state.ats.jobDescription || "",
      focusKeywords: state.targeting.focusKeywords,
      notes: state.targeting.notes,
      updatedAt: Date.now(),
      data: normalizeResumeData(template, template),
      coverLetter: createEmptyCoverLetter(template.profile?.name),
      sourceLanguage: "en",
      derivedFromVersionId: sourceVersion.id,
      derivedVersionIds: {},
      translationStatus: "needs-sync",
      translationSnapshot: {
        sourceVersionId: sourceVersion.id,
        sections: {}
      },
      lastTranslationAt: 0,
      manualOverrides: {}
    };
  }

  function getLinkedArabicContext(sourceVersion) {
    if (!sourceVersion || documentLanguage !== "en") {
      return { arabicVersion: null, status: "clean", changedSections: [] };
    }

    const arabicVersions = loadStoredPresetsForLanguage("ar");
    const linkedId = normalizeDerivedVersionIds(sourceVersion.derivedVersionIds).ar || "";
    const arabicVersion = getPresetById(arabicVersions, linkedId);
    if (!arabicVersion) {
      return { arabicVersion: null, status: "clean", changedSections: trackedTranslationSections };
    }

    const sourcePayload = buildTranslationSourcePayload();
    const changedSections = getChangedTranslationSections(
      sourcePayload.fingerprints,
      arabicVersion.translationSnapshot?.sections
    );

    return {
      arabicVersion,
      status: changedSections.length ? "needs-sync" : "clean",
      changedSections
    };
  }

  function syncLinkedArabicStatusForPreset(sourceVersion) {
    const linkedId = normalizeDerivedVersionIds(sourceVersion?.derivedVersionIds).ar || "";
    if (!linkedId) {
      return;
    }

    const arabicVersions = loadStoredPresetsForLanguage("ar");
    const arabicVersion = getPresetById(arabicVersions, linkedId);
    if (!arabicVersion) {
      return;
    }

    const sourcePayload = buildTranslationSourcePayload();
    const changedSections = getChangedTranslationSections(sourcePayload.fingerprints, arabicVersion.translationSnapshot?.sections);
    arabicVersion.translationStatus = changedSections.length ? "needs-sync" : "clean";
    persistPresetStoreForLanguage("ar", arabicVersions);
  }

  function getArabicSourceContext(selectedPreset) {
    if (!selectedPreset || documentLanguage !== "ar" || selectedPreset.sourceLanguage !== "en" || !selectedPreset.derivedFromVersionId) {
      return { sourceVersion: null, status: "clean" };
    }

    const englishVersions = loadStoredPresetsForLanguage("en");
    const sourceVersion = getPresetById(englishVersions, selectedPreset.derivedFromVersionId);
    if (!sourceVersion) {
      return { sourceVersion: null, status: "needs-sync" };
    }

    const sections = buildTranslationSectionsFromVersion(sourceVersion);
    const fingerprints = buildTranslationFingerprints(sections);
    const changedSections = getChangedTranslationSections(fingerprints, selectedPreset.translationSnapshot?.sections);
    return {
      sourceVersion,
      status: changedSections.length ? "needs-sync" : "clean",
      changedSections
    };
  }

  function openLinkedArabicVersion(sourceVersion) {
    const linkedId = normalizeDerivedVersionIds(sourceVersion?.derivedVersionIds).ar || "";
    const url = new URL("./arabic.html", window.location.href);
    if (linkedId) {
      url.hash = state.documentMode === "cover-letter" ? "coverLetter" : normalizeResumeSection(state.activeSection);
      url.searchParams.set("linkedVersion", linkedId);
    }
    window.open(url.toString(), "_blank", "noopener");
  }

  function openEnglishSourceVersion(selectedPreset) {
    const url = new URL("./index.html", window.location.href);
    if (selectedPreset?.derivedFromVersionId) {
      url.hash = state.documentMode === "cover-letter" ? "coverLetter" : normalizeResumeSection(state.activeSection);
      url.searchParams.set("linkedVersion", selectedPreset.derivedFromVersionId);
    }
    window.open(url.toString(), "_blank", "noopener");
  }

  function createCoverLetterSuggestionCard(letter) {
    const card = document.createElement("article");
    card.className = "editor-cover-letter-suggestion";

    const title = document.createElement("h3");
    title.className = "editor-card__title";
    title.textContent = locale.coverLetterSuggestionTitle;
    card.appendChild(title);

    const preview = document.createElement("pre");
    preview.className = "editor-cover-letter-suggestion__preview";
    preview.textContent = createCoverLetterPlainText(letter);
    card.appendChild(preview);

    return card;
  }

  function createCoverLetterPlainText(letter) {
    const normalized = normalizeCoverLetter(letter, state.data.profile?.name);
    const dateLine = formatCoverLetterDate(normalized.generatedAt || Date.now());
    const lines = [
      state.data.profile?.name || "",
      state.data.profile?.email || "",
      state.data.profile?.phone || "",
      state.data.profile?.location || "",
      "",
      dateLine,
      "",
      normalized.recipientName || normalized.hiringManager || "",
      normalized.company || "",
      normalized.targetRole ? `${locale.coverLetterSubjectLabel}: ${normalized.targetRole}` : "",
      "",
      buildCoverLetterGreeting(normalized),
      "",
      normalized.opening || "",
      "",
      normalized.body || "",
      "",
      normalized.closing || "",
      "",
      normalized.signatureName || state.data.profile?.name || ""
    ];

    return lines.filter((line, index, array) => {
      if (line) {
        return true;
      }
      return array[index - 1] !== "";
    }).join("\n");
  }

  function createActionButton(labelText, extraClass, onClick, disabled = false, helpOptions = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `editor-button ${extraClass}`.trim();
    button.textContent = labelText;
    button.disabled = Boolean(disabled);
    if (onClick) {
      button.addEventListener("click", onClick);
    }
    attachHelp(button, {
      helpKey: helpOptions.helpKey,
      text: helpOptions.helpText,
      label: helpOptions.label || labelText,
      fallbackType: "button"
    });
    return button;
  }

  function createIconButton(labelText, extraClass, onClick, disabled, helpOptions = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `editor-icon-button ${extraClass}`.trim();
    button.textContent = labelText;
    button.disabled = Boolean(disabled);
    if (onClick) {
      button.addEventListener("click", () => {
        commitPendingHistory();
        const historyBefore = createHistorySnapshot();
        onClick();
        commitHistorySnapshot(historyBefore);
        refreshAll();
      });
    }
    attachHelp(button, {
      helpKey: helpOptions.helpKey,
      text: helpOptions.helpText,
      label: helpOptions.label || labelText,
      fallbackType: "button"
    });
    return button;
  }

  function enableDragReorder(node, list, index, onReorder = null) {
    const listId = getArrayIdentity(list);
    node.draggable = true;
    node.dataset.dragListId = listId;
    node.dataset.dragIndex = String(index);
    node.querySelectorAll("input, textarea").forEach((field) => {
      field.draggable = false;
    });

    node.addEventListener("dragstart", (event) => {
      dragState = { listId, index };
      node.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", `${listId}:${index}`);
      }
    });

    node.addEventListener("dragover", (event) => {
      if (!dragState || dragState.listId !== listId) {
        return;
      }
      event.preventDefault();
      if (dragState.index !== index) {
        node.classList.add("is-drop-target");
      }
    });

    node.addEventListener("dragleave", () => {
      node.classList.remove("is-drop-target");
    });

    node.addEventListener("drop", (event) => {
      if (!dragState || dragState.listId !== listId) {
        return;
      }
      event.preventDefault();
      node.classList.remove("is-drop-target");
      if (dragState.index === index) {
        return;
      }
      commitPendingHistory();
      const historyBefore = createHistorySnapshot();
      moveItem(list, dragState.index, index);
      if (onReorder) {
        onReorder(list);
      }
      dragState = null;
      commitHistorySnapshot(historyBefore);
      refreshAll();
    });

    node.addEventListener("dragend", () => {
      dragState = null;
      node.classList.remove("is-dragging");
      document.querySelectorAll(".is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
      document.querySelectorAll(".is-dragging").forEach((item) => item.classList.remove("is-dragging"));
    });
  }

  function getArrayIdentity(list) {
    if (!arrayIds.has(list)) {
      arrayIds.set(list, `list-${nextArrayId++}`);
    }
    return arrayIds.get(list);
  }

  function getSectionEntries() {
    const base = getBaseAvailableSections().map((key) => ({
      key,
      label: getSectionLabel(key)
    }));

    const customEntries = getVisibleCustomSections()
      .map((section) => ({
        key: `custom:${section.id}`,
        label: section.title
      }));

    const insertIndex = base.findIndex((entry) => entry.key === "ats");
    if (insertIndex === -1) {
      return base.concat(customEntries);
    }

    return [
      ...base.slice(0, insertIndex),
      ...customEntries,
      ...base.slice(insertIndex)
    ];
  }

  function getAvailableSections() {
    return getSectionEntries().map((entry) => entry.key);
  }

  function getSectionLabel(key) {
    const labels = {
      profile: state.data.labels.profile || locale.profileSectionTitle,
      summary: state.data.labels.summary,
      sections: locale.sectionsNavLabel,
      style: locale.styleNavLabel,
      commands: locale.commandsNavLabel,
      aiHr: locale.aiHrNavLabel,
      coverLetter: locale.coverLetterNavLabel,
      professionalExperience: state.data.labels.professionalExperience,
      internships: state.data.labels.internships,
      projects: state.data.labels.projects,
      education: state.data.labels.education,
      certificates: state.data.labels.certificates,
      skills: state.data.labels.skills,
      softSkills: state.data.labels.softSkills,
      ats: locale.atsNavLabel,
      quality: locale.qualityNavLabel
    };

    if (isCustomSectionKey(key)) {
      return getCustomSectionById(getCustomSectionIdFromKey(key))?.title || locale.sectionsNavLabel;
    }

    return labels[key] || key;
  }

  function getBuiltInSectionConfig(key) {
    return state.data.sectionConfig?.builtIn?.find((entry) => entry.key === key) || null;
  }

  function isBuiltInSectionVisible(key) {
    return getBuiltInSectionConfig(key)?.visible !== false;
  }

  function getCustomSectionById(id) {
    return (state.data.customSections || []).find((section) => section.id === id) || null;
  }

  function getVisibleCustomSections() {
    return (state.data.customSections || [])
      .filter((section) => section.visible !== false)
      .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
  }

  function getOrderedResumeSections(data = state.data, options = {}) {
    const includeHidden = Boolean(options.includeHidden);
    const builtIn = (data.sectionConfig?.builtIn || [])
      .filter((entry) => includeHidden || entry.visible !== false)
      .map((entry) => ({
        key: entry.key,
        title: entry.title,
        order: entry.order,
        visible: entry.visible !== false,
        type: "built-in"
      }));

    const custom = (data.customSections || [])
      .filter((entry) => includeHidden || entry.visible !== false)
      .map((entry) => ({
        key: `custom:${entry.id}`,
        title: entry.title,
        order: entry.order,
        visible: entry.visible !== false,
        type: "custom",
        layout: entry.layout,
        section: entry
      }));

    return [...builtIn, ...custom]
      .sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
  }

  function isSectionVisibleInData(data, sectionKey) {
    if (isCustomSectionKey(sectionKey)) {
      const customId = getCustomSectionIdFromKey(sectionKey);
      return (data?.customSections || []).find((item) => item.id === customId)?.visible !== false;
    }
    return (data?.sectionConfig?.builtIn || []).find((item) => item.key === sectionKey)?.visible !== false;
  }

  function applySectionEntryOrder(entries) {
    entries.forEach((entry, index) => {
      if (entry.type === "built-in") {
        const target = getBuiltInSectionConfig(entry.key);
        if (target) {
          target.order = index;
        }
      } else if (entry.type === "custom") {
        const target = getCustomSectionById(getCustomSectionIdFromKey(entry.key));
        if (target) {
          target.order = index;
        }
      }
    });
    rebalanceSectionOrders(state.data);
  }

  function moveItem(list, fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) {
      return;
    }
    const [item] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, item);
  }

  function createHistorySnapshot() {
    return {
      data: normalizeResumeData(state.data),
      coverLetter: cloneData(state.coverLetter),
      atsJobDescription: state.ats.jobDescription || "",
      targeting: cloneData(state.targeting),
      selectedPresetId: state.selectedPresetId || "",
      documentMode: state.documentMode,
      lastResumeSection: state.lastResumeSection,
      manualOverrides: cloneData(state.translation.currentOverrides)
    };
  }

  function snapshotsMatch(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function canUndo() {
    return Boolean(state.history.pendingSnapshot) || state.history.undoStack.length > 0;
  }

  function canRedo() {
    return !state.history.pendingSnapshot && state.history.redoStack.length > 0;
  }

  function syncHistoryControls() {
    if (undoButtonHost) {
      undoButtonHost.disabled = !canUndo();
    }

    if (redoButtonHost) {
      redoButtonHost.disabled = !canRedo();
    }
  }

  function stageHistoryDebounced() {
    if (!state.history.pendingSnapshot) {
      state.history.pendingSnapshot = createHistorySnapshot();
      state.history.redoStack = [];
      syncHistoryControls();
    }

    window.clearTimeout(historyTimer);
    historyTimer = window.setTimeout(commitPendingHistory, 360);
  }

  function commitHistorySnapshot(snapshot) {
    const currentSnapshot = createHistorySnapshot();
    if (!snapshot || snapshotsMatch(snapshot, currentSnapshot)) {
      syncHistoryControls();
      return false;
    }

    state.history.undoStack.push(snapshot);
    if (state.history.undoStack.length > 100) {
      state.history.undoStack.shift();
    }
    state.history.redoStack = [];
    syncHistoryControls();
    return true;
  }

  function commitPendingHistory() {
    window.clearTimeout(historyTimer);
    if (!state.history.pendingSnapshot) {
      syncHistoryControls();
      return false;
    }

    const snapshot = state.history.pendingSnapshot;
    state.history.pendingSnapshot = null;
    return commitHistorySnapshot(snapshot);
  }

  function applyHistorySnapshot(snapshot) {
    window.clearTimeout(previewTimer);
    window.clearTimeout(atsTimer);
    window.clearTimeout(qualityTimer);
    state.data = normalizeResumeData(snapshot.data);
    state.coverLetter = normalizeCoverLetter(snapshot.coverLetter, snapshot.data?.profile?.name);
    state.ats.jobDescription = String(snapshot.atsJobDescription || "");
    state.targeting = normalizeTargeting(snapshot.targeting);
    state.selectedPresetId = String(snapshot.selectedPresetId || "");
    state.documentMode = normalizeDocumentMode(snapshot.documentMode, state.activeSection);
    state.lastResumeSection = normalizeResumeSection(snapshot.lastResumeSection || state.lastResumeSection);
    state.translation.currentOverrides = normalizeManualOverrides(snapshot.manualOverrides);
    state.translation.review = null;
    state.command.workspace = createCommandWorkspaceState();
    persistAtsDraft();
    initializeDocument();
    refreshAll();
    syncHistoryControls();
  }

  function handleUndo() {
    commitPendingHistory();
    if (!state.history.undoStack.length) {
      return;
    }

    state.history.redoStack.push(createHistorySnapshot());
    const snapshot = state.history.undoStack.pop();
    applyHistorySnapshot(snapshot);
  }

  function handleRedo() {
    commitPendingHistory();
    if (!state.history.redoStack.length) {
      return;
    }

    state.history.undoStack.push(createHistorySnapshot());
    const snapshot = state.history.redoStack.pop();
    applyHistorySnapshot(snapshot);
  }

  function loadDraftData() {
    try {
      const raw = window.localStorage.getItem(draftStorageKey);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || !parsed.data) {
        return null;
      }

      if (parsed.data.meta?.lang && parsed.data.meta.lang !== documentLanguage) {
        return null;
      }

      return {
        data: parsed.data,
        savedAt: Number(parsed.savedAt) || 0,
        targeting: normalizeTargeting(parsed.targeting),
        atsJobDescription: String(parsed.atsJobDescription || ""),
        selectedPresetId: String(parsed.selectedPresetId || ""),
        documentMode: normalizeDocumentMode(parsed.documentMode, parsed.activeSection),
        lastResumeSection: normalizeResumeSection(parsed.lastResumeSection || parsed.activeSection),
        activeSection: isKnownSectionKey(parsed.activeSection) ? String(parsed.activeSection) : "summary",
        manualOverrides: normalizeManualOverrides(parsed.manualOverrides)
      };
    } catch (error) {
      return null;
    }
  }

  function loadStoredPresets() {
    try {
      return loadStoredPresetsForLanguage(documentLanguage);
    } catch (error) {
      return [];
    }
  }

  function loadStoredPresetsForLanguage(lang) {
    const raw = window.localStorage.getItem(getVersionStorageKey(lang)) || window.localStorage.getItem(getLegacyPresetStorageKey(lang));
    if (!raw) {
      return [];
    }

    return normalizePresets(JSON.parse(raw), lang);
  }

  function normalizePresets(value, lang = documentLanguage) {
    const list = Array.isArray(value?.versions)
      ? value.versions
      : Array.isArray(value?.presets)
        ? value.presets
        : Array.isArray(value)
          ? value
          : [];

    const template = buildResumeTemplateForLanguage(lang);
    return list
      .filter((item) => item && typeof item === "object" && item.data)
      .map((item, index) => ({
        id: String(item.id || `preset-${Date.now()}-${index}`),
        name: String(item.name || `${lang === "ar" ? "\u0646\u0633\u062e\u0629" : "Version"} ${index + 1}`),
        targetRole: String(item.targetRole || ""),
        company: String(item.company || ""),
        jobDescription: String(item.jobDescription || ""),
        focusKeywords: String(item.focusKeywords || ""),
        notes: String(item.notes || ""),
        updatedAt: Number(item.updatedAt) || Date.now(),
        data: normalizeResumeData(item.data, template),
        coverLetter: normalizeCoverLetter(item.coverLetter, item.data?.profile?.name),
        sourceLanguage: String(item.sourceLanguage || lang),
        derivedFromVersionId: String(item.derivedFromVersionId || ""),
        derivedVersionIds: normalizeDerivedVersionIds(item.derivedVersionIds),
        translationStatus: normalizeTranslationStatus(item.translationStatus),
        translationSnapshot: normalizeTranslationSnapshot(item.translationSnapshot),
        lastTranslationAt: Number(item.lastTranslationAt) || 0,
        manualOverrides: normalizeManualOverrides(item.manualOverrides)
      }))
      .filter((item) => !item.data.meta?.lang || item.data.meta.lang === lang);
  }

  function normalizeTargeting(value) {
    return {
      targetRole: String(value?.targetRole || ""),
      company: String(value?.company || ""),
      focusKeywords: String(value?.focusKeywords || ""),
      notes: String(value?.notes || "")
    };
  }

  function loadAtsDraft() {
    try {
      return window.localStorage.getItem(atsStorageKey) || "";
    } catch (error) {
      return "";
    }
  }

  function persistAtsDraft() {
    try {
      window.localStorage.setItem(atsStorageKey, state.ats.jobDescription || "");
    } catch (error) {
      // Ignore storage failures and keep the editor usable.
    }
  }

  function scheduleAtsAnalysis() {
    window.clearTimeout(atsTimer);
    atsTimer = window.setTimeout(updateAtsAnalysis, 140);
  }

  function scheduleQualityAnalysis() {
    window.clearTimeout(qualityTimer);
    qualityTimer = window.setTimeout(updateQualityAnalysis, 160);
  }

  function scheduleDraftSave() {
    state.draft.status = "saving";
    syncPersistenceDisplay();
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(saveDraftNow, 240);
  }

  function saveDraftNow() {
    try {
      const payload = {
        savedAt: Date.now(),
        data: state.data,
        targeting: state.targeting,
        atsJobDescription: state.ats.jobDescription || "",
        selectedPresetId: state.selectedPresetId || "",
        documentMode: state.documentMode,
        lastResumeSection: state.lastResumeSection,
        activeSection: state.activeSection,
        manualOverrides: state.translation.currentOverrides
      };
      window.localStorage.setItem(draftStorageKey, JSON.stringify(payload));
      state.draft.status = "saved";
      state.draft.lastSavedAt = payload.savedAt;
      state.draft.hasLocalDraft = true;
    } catch (error) {
      state.draft.status = "clean";
    }
    syncPersistenceDisplay();
  }

  function clearStoredDraft() {
    try {
      window.localStorage.removeItem(draftStorageKey);
    } catch (error) {
      // Ignore storage failures.
    }
  }

  function persistPresetStore() {
    persistPresetStoreForLanguage(documentLanguage, state.presets);
  }

  function persistPresetStoreForLanguage(lang, versions) {
    try {
      window.localStorage.setItem(getVersionStorageKey(lang), JSON.stringify({
        version: 1,
        lang,
        versions
      }));
    } catch (error) {
      // Ignore storage failures and keep editing available.
    }
  }

  function loadAiConfig() {
    try {
      const raw = window.localStorage.getItem(aiConfigStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      const provider = parsed?.provider || parsed?.apiKey
        ? normalizeAiProvider(parsed?.provider, parsed?.apiKey)
        : "openrouter";
      const mode = normalizeAiMode(parsed?.mode, provider, parsed?.model);
      return {
        enabled: Boolean(parsed?.enabled),
        apiKey: String(parsed?.apiKey || ""),
        provider,
        mode,
        model: String(parsed?.model || getDefaultAiModel(provider, mode))
      };
    } catch (error) {
      return {
        enabled: false,
        apiKey: "",
        provider: "openrouter",
        mode: "auto",
        model: getDefaultAiModel("openrouter", "auto")
      };
    }
  }

  function loadPreviewZoom() {
    try {
      const raw = window.localStorage.getItem(previewZoomStorageKey);
      return normalizePreviewZoom(raw);
    } catch (error) {
      return defaultPreviewZoom;
    }
  }

  function persistPreviewZoom() {
    try {
      window.localStorage.setItem(previewZoomStorageKey, String(state.preview.zoom));
    } catch (error) {
      // Ignore storage failures and keep the preview usable.
    }
  }

  function normalizePreviewZoom(value) {
    if (value === null || value === undefined || String(value).trim() === "") {
      return defaultPreviewZoom;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return defaultPreviewZoom;
    }
    return Math.min(maxPreviewZoom, Math.max(minPreviewZoom, Math.round(numeric)));
  }

  function changePreviewZoom(delta) {
    const nextZoom = normalizePreviewZoom(state.preview.zoom + delta);
    if (nextZoom === state.preview.zoom) {
      syncPreviewZoomControls();
      return;
    }
    state.preview.zoom = nextZoom;
    persistPreviewZoom();
    applyPreviewZoom();
  }

  function resetPreviewZoom() {
    if (state.preview.zoom === defaultPreviewZoom) {
      syncPreviewZoomControls();
      return;
    }
    state.preview.zoom = defaultPreviewZoom;
    persistPreviewZoom();
    applyPreviewZoom();
  }

  function applyPreviewZoom() {
    if (!root) {
      return;
    }

    const zoomPercent = state.preview.zoom;
    root.style.setProperty("--preview-zoom", `${zoomPercent}%`);
    syncPreviewZoomControls();
  }

  function applyStylePreset() {
    const preset = getActiveStylePreset();
    document.body.dataset.stylePreset = preset;
    if (root) {
      root.dataset.stylePreset = preset;
    }
  }

  function syncPreviewZoomControls() {
    if (!zoomOutButton && !zoomResetButton && !zoomInButton) {
      return;
    }

    const zoomPercent = state.preview.zoom;

    if (zoomResetButton) {
      zoomResetButton.textContent = `${zoomPercent}%`;
      zoomResetButton.disabled = zoomPercent === defaultPreviewZoom;
      zoomResetButton.setAttribute("aria-label", `${locale.zoomResetLabel}: ${zoomPercent}%`);
      zoomResetButton.title = zoomResetButton.dataset.helpText || locale.zoomResetTitle;
    }

    if (zoomOutButton) {
      zoomOutButton.disabled = zoomPercent <= minPreviewZoom;
      zoomOutButton.title = zoomOutButton.dataset.helpText || locale.zoomOut;
    }

    if (zoomInButton) {
      zoomInButton.disabled = zoomPercent >= maxPreviewZoom;
      zoomInButton.title = zoomInButton.dataset.helpText || locale.zoomIn;
    }
  }

  function persistAiConfig() {
    try {
      window.localStorage.setItem(aiConfigStorageKey, JSON.stringify({
        enabled: state.ai.enabled,
        provider: state.ai.provider,
        apiKey: state.ai.apiKey,
        mode: state.ai.mode,
        model: state.ai.model
      }));
    } catch (error) {
      // Ignore storage failures and keep editing available.
    }
  }

  function normalizeAiProvider(provider, apiKey = "") {
    const normalized = String(provider || "").trim().toLowerCase();
    if (normalized.startsWith("openrouter")) {
      return "openrouter";
    }
    if (normalized === "openrouter" || normalized === "openai") {
      return normalized;
    }
    return String(apiKey || "").trim().startsWith("sk-or-") ? "openrouter" : "openai";
  }

  function normalizeAiMode(mode, provider = "openrouter", model = "") {
    const normalizedProvider = normalizeAiProvider(provider);
    const normalizedMode = String(mode || "").trim().toLowerCase();
    if (normalizedProvider === "openrouter") {
      if (normalizedMode === "auto" || normalizedMode === "free" || normalizedMode === "manual") {
        return normalizedMode;
      }
      if (String(model || "").trim() === "openrouter/auto") {
        return "auto";
      }
      if (String(model || "").trim() === "openrouter/free") {
        return "free";
      }
      return "manual";
    }
    return "manual";
  }

  function getDefaultAiModel(provider, mode = "manual") {
    const normalizedProvider = normalizeAiProvider(provider);
    const normalizedMode = normalizeAiMode(mode, normalizedProvider);
    if (normalizedProvider === "openrouter") {
      if (normalizedMode === "auto") {
        return "openrouter/auto";
      }
      if (normalizedMode === "free") {
        return "openrouter/free";
      }
      return "openai/gpt-4.1-mini";
    }
    return "gpt-4.1-mini";
  }

  function getResolvedAiModel(config = state.ai) {
    const provider = normalizeAiProvider(config?.provider, config?.apiKey);
    const mode = normalizeAiMode(config?.mode, provider, config?.model);
    const rawModel = String(config?.model || "").trim();
    if (provider === "openrouter" && mode !== "manual") {
      return getDefaultAiModel(provider, mode);
    }
    return rawModel || getDefaultAiModel(provider, mode);
  }

  function getAiApiKeyPlaceholder(provider) {
    return normalizeAiProvider(provider) === "openrouter" ? "sk-or-v1-..." : "sk-...";
  }

  function shouldShowAiModelInput(config = state.ai) {
    return normalizeAiProvider(config?.provider, config?.apiKey) !== "openrouter"
      || normalizeAiMode(config?.mode, config?.provider, config?.model) === "manual";
  }

  function getAiModelPlaceholder(provider, mode = "manual") {
    return getDefaultAiModel(provider, mode);
  }

  function applyAiProviderSelection(value) {
    const [provider, rawMode] = String(value || "").split(":");
    state.ai.provider = normalizeAiProvider(provider || state.ai.provider, state.ai.apiKey);
    state.ai.mode = normalizeAiMode(rawMode, state.ai.provider);
    if (!shouldShowAiModelInput()) {
      state.ai.model = getDefaultAiModel(state.ai.provider, state.ai.mode);
    }
  }

  function createAiReviewState() {
    return {
      loading: false,
      error: "",
      result: null
    };
  }

  function setAiReviewState(type, nextState) {
    if (!state.aiReviews[type]) {
      state.aiReviews[type] = createAiReviewState();
    }
    Object.assign(state.aiReviews[type], {
      loading: false,
      error: "",
      result: null
    }, nextState || {});
  }

  function clearAiReview(type) {
    setAiReviewState(type, createAiReviewState());
    renderEditor();
  }

  function formatAiHint() {
    const provider = normalizeAiProvider(state.ai.provider, state.ai.apiKey);
    const mode = normalizeAiMode(state.ai.mode, provider, state.ai.model);
    if (provider === "openrouter" && mode === "auto") {
      return locale.aiHintOpenRouterAuto;
    }
    if (provider === "openrouter" && mode === "free") {
      return locale.aiHintOpenRouterFree;
    }
    return provider === "openrouter"
      ? locale.aiHintOpenRouter
      : locale.aiHint;
  }

  function getDraftStatusText() {
    const key = state.draft.status || "clean";
    const map = {
      clean: locale.draftStatusClean,
      restored: locale.draftStatusRestored,
      saving: locale.draftStatusSaving,
      saved: locale.draftStatusSaved,
      cleared: locale.draftStatusCleared
    };
    return map[key] || map.clean;
  }

  function syncPersistenceDisplay() {
    if (draftStatusHost) {
      draftStatusHost.textContent = getDraftStatusText();
    }

    if (draftSavedAtHost) {
      draftSavedAtHost.textContent = state.draft.lastSavedAt
        ? `${locale.lastSavedLabel}: ${formatTimestamp(state.draft.lastSavedAt)}`
        : "";
    }
  }

  function formatTimestamp(value) {
    if (!value) {
      return "";
    }
    return new Intl.DateTimeFormat(documentLanguage === "ar" ? "ar" : "en", {
      hour: "numeric",
      minute: "2-digit"
    }).format(new Date(value));
  }

  function getSelectedPreset() {
    return state.presets.find((preset) => preset.id === state.selectedPresetId) || null;
  }

  function getPresetById(presets, id) {
    return (presets || []).find((preset) => preset.id === id) || null;
  }

  function createPresetSnapshot(name) {
    return {
      id: createPresetId(),
      name: String(name || "").trim() || `${locale.versionFallbackName} ${state.presets.length + 1}`,
      targetRole: state.targeting.targetRole,
      company: state.targeting.company,
      jobDescription: state.ats.jobDescription || "",
      focusKeywords: state.targeting.focusKeywords,
      notes: state.targeting.notes,
      updatedAt: Date.now(),
      data: normalizeResumeData(state.data),
      coverLetter: cloneData(normalizeCoverLetter(state.coverLetter, state.data.profile?.name)),
      sourceLanguage: documentLanguage,
      derivedFromVersionId: "",
      derivedVersionIds: {},
      translationStatus: "clean",
      translationSnapshot: { sourceVersionId: "", sections: {} },
      lastTranslationAt: 0,
      manualOverrides: cloneData(state.translation.currentOverrides)
    };
  }

  function ensureDefaultArabicBestVersion() {
    if (documentLanguage !== "ar") {
      return;
    }

    const existing = (state.presets || []).find((preset) => String(preset?.name || "").trim().toLowerCase() === "demo polished");
    if (existing) {
      return;
    }

    const seededPreset = {
      id: createPresetId(),
      name: "demo polished",
      targetRole: "",
      company: "",
      jobDescription: "",
      focusKeywords: "",
      notes: "Public Arabic demo baseline",
      updatedAt: Date.now(),
      data: normalizeResumeData(cloneData(sourceData), sourceData),
      coverLetter: cloneData(normalizeCoverLetter(null, sourceData?.profile?.name)),
      sourceLanguage: "ar",
      derivedFromVersionId: "",
      derivedVersionIds: {},
      translationStatus: "clean",
      translationSnapshot: { sourceVersionId: "", sections: {} },
      lastTranslationAt: 0,
      manualOverrides: {}
    };

    state.presets.unshift(seededPreset);
    if (!state.selectedPresetId) {
      state.selectedPresetId = seededPreset.id;
    }
    persistPresetStore();
  }

  function handleSaveNewPreset() {
    const name = window.prompt(locale.saveNewVersionPrompt, "");
    if (name === null) {
      return;
    }
    const preset = createPresetSnapshot(name);
    state.presets.unshift(preset);
    state.selectedPresetId = preset.id;
    persistPresetStore();
    scheduleDraftSave();
    renderEditor();
  }

  function handleUpdatePreset() {
    const preset = getSelectedPreset();
    if (!preset) {
      return;
    }
    preset.updatedAt = Date.now();
    preset.targetRole = state.targeting.targetRole;
    preset.company = state.targeting.company;
    preset.jobDescription = state.ats.jobDescription || "";
    preset.focusKeywords = state.targeting.focusKeywords;
    preset.notes = state.targeting.notes;
    preset.data = normalizeResumeData(state.data);
    preset.coverLetter = cloneData(normalizeCoverLetter(state.coverLetter, state.data.profile?.name));
    preset.manualOverrides = cloneData(state.translation.currentOverrides);
    if (documentLanguage === "en") {
      preset.sourceLanguage = "en";
      syncLinkedArabicStatusForPreset(preset);
    } else if (!preset.derivedFromVersionId) {
      preset.sourceLanguage = "ar";
    }
    persistPresetStore();
    scheduleDraftSave();
    renderEditor();
  }

  function handleLoadPreset() {
    const preset = getSelectedPreset();
    if (!preset) {
      return;
    }
    commitPendingHistory();
    const historyBefore = createHistorySnapshot();
    state.data = normalizeResumeData(preset.data);
    state.targeting = normalizeTargeting(preset);
    state.ats.jobDescription = preset.jobDescription || "";
    state.coverLetter = normalizeCoverLetter(preset.coverLetter, preset.data?.profile?.name);
    state.translation.currentOverrides = normalizeManualOverrides(preset.manualOverrides);
    state.translation.review = null;
    state.translation.error = "";
    state.translation.message = "";
    state.command.entries = {};
    state.command.workspace = createCommandWorkspaceState();
    persistAtsDraft();
    state.draft.status = "restored";
    initializeDocument();
    commitHistorySnapshot(historyBefore);
    refreshAll();
  }

  function handleRenamePreset() {
    const preset = getSelectedPreset();
    if (!preset) {
      return;
    }
    const name = window.prompt(locale.renameVersionPrompt, preset.name);
    if (name === null) {
      return;
    }
    preset.name = String(name || "").trim() || preset.name;
    persistPresetStore();
    scheduleDraftSave();
    renderEditor();
  }

  function handleDeletePreset() {
    const preset = getSelectedPreset();
    if (!preset) {
      return;
    }
    if (!window.confirm(locale.deleteVersionConfirm.replace("{name}", preset.name))) {
      return;
    }
    state.presets = state.presets.filter((item) => item.id !== preset.id);
    state.selectedPresetId = "";
    persistPresetStore();
    scheduleDraftSave();
    renderEditor();
  }

  function handleExportPresets() {
    const filename = "resume-version-bundle.json";
    const bundle = buildVersionBundle();
    const content = JSON.stringify({
      version: 2,
      primaryLanguage: documentLanguage,
      exportedAt: new Date().toISOString(),
      byLanguage: bundle
    }, null, 2);
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImportPresets(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (parsed.byLanguage) {
        importVersionBundle(parsed.byLanguage);
      } else {
        const importedData = extractImportedResumeDataCandidate(parsed);
        if (importedData?.meta?.lang && importedData.meta.lang !== documentLanguage) {
          throw new Error(locale.importVersionsLanguageMismatch);
        }
        if (parsed.lang && parsed.lang !== documentLanguage) {
          throw new Error(locale.importVersionsLanguageMismatch);
        }

        let imported = normalizePresets(parsed);
        if (!imported.length && importedData) {
          imported = [createPresetFromImportedResumeData(importedData)];
        }
        if (!imported.length) {
          throw new Error(locale.importVersionsInvalid);
        }

        const existingIds = new Set(state.presets.map((preset) => preset.id));
        imported.forEach((preset) => {
          if (existingIds.has(preset.id)) {
            preset.id = createPresetId();
          }
          existingIds.add(preset.id);
        });

        state.presets = [...imported, ...state.presets];
        state.selectedPresetId = imported[0].id;
        persistPresetStore();
      }
      scheduleDraftSave();
      renderEditor();
    } catch (error) {
      window.alert(error.message || locale.importVersionsFailed);
    } finally {
      event.target.value = "";
    }
  }

  function extractImportedResumeDataCandidate(value) {
    const candidate = value?.resumeData && typeof value.resumeData === "object"
      ? value.resumeData
      : value;

    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return null;
    }

    if (
      candidate.meta
      || candidate.profile
      || Object.prototype.hasOwnProperty.call(candidate, "summary")
      || Array.isArray(candidate.professionalExperience)
      || Array.isArray(candidate.projects)
      || Array.isArray(candidate.education)
      || Array.isArray(candidate.certificates)
      || candidate.skills
    ) {
      return candidate;
    }

    return null;
  }

  function createPresetFromImportedResumeData(data) {
    const template = buildResumeTemplateForLanguage(documentLanguage);
    const normalizedData = normalizeResumeData(data, template);
    const profileName = String(normalizedData.profile?.name || "").trim();
    const versionName = profileName
      ? `${profileName} ${locale.versionFallbackName}`
      : `${locale.versionFallbackName} ${state.presets.length + 1}`;

    return {
      id: createPresetId(),
      name: versionName,
      targetRole: "",
      company: "",
      jobDescription: "",
      focusKeywords: "",
      notes: "",
      updatedAt: Date.now(),
      data: normalizedData,
      coverLetter: createEmptyCoverLetter(normalizedData.profile?.name),
      sourceLanguage: documentLanguage,
      derivedFromVersionId: "",
      derivedVersionIds: {},
      translationStatus: "clean",
      translationSnapshot: { sourceVersionId: "", sections: {} },
      lastTranslationAt: 0,
      manualOverrides: {}
    };
  }

  function buildVersionBundle() {
    return linkedLanguages.reduce((accumulator, lang) => {
      accumulator[lang] = {
        lang,
        versions: loadStoredPresetsForLanguage(lang)
      };
      return accumulator;
    }, {});
  }

  function importVersionBundle(bundle) {
    const importedByLanguage = linkedLanguages.reduce((accumulator, lang) => {
      const payload = bundle?.[lang];
      accumulator[lang] = payload ? normalizePresets(payload, lang) : [];
      return accumulator;
    }, {});

    if (!linkedLanguages.some((lang) => importedByLanguage[lang].length)) {
      throw new Error(locale.importVersionsInvalid);
    }

    const existingByLanguage = linkedLanguages.reduce((accumulator, lang) => {
      accumulator[lang] = loadStoredPresetsForLanguage(lang);
      return accumulator;
    }, {});

    const idMap = remapImportedBundleIds(importedByLanguage, existingByLanguage);
    linkedLanguages.forEach((lang) => {
      importedByLanguage[lang].forEach((version) => remapImportedVersionLinks(version, idMap));
      persistPresetStoreForLanguage(lang, [...importedByLanguage[lang], ...existingByLanguage[lang]]);
    });

    state.presets = loadStoredPresetsForLanguage(documentLanguage);
    state.selectedPresetId = importedByLanguage[documentLanguage]?.[0]?.id || state.selectedPresetId;
  }

  function remapImportedBundleIds(importedByLanguage, existingByLanguage) {
    const idMap = linkedLanguages.reduce((accumulator, lang) => {
      accumulator[lang] = {};
      return accumulator;
    }, {});

    linkedLanguages.forEach((lang) => {
      const usedIds = new Set((existingByLanguage[lang] || []).map((version) => version.id));
      (importedByLanguage[lang] || []).forEach((version) => {
        const originalId = version.id;
        let nextId = originalId;
        if (usedIds.has(nextId)) {
          nextId = createPresetId();
          version.id = nextId;
        }
        usedIds.add(nextId);
        idMap[lang][originalId] = nextId;
      });
    });

    return idMap;
  }

  function remapImportedVersionLinks(version, idMap) {
    version.derivedVersionIds = normalizeDerivedVersionIds(version.derivedVersionIds);
    if (version.derivedVersionIds.en && idMap.en[version.derivedVersionIds.en]) {
      version.derivedVersionIds.en = idMap.en[version.derivedVersionIds.en];
    }
    if (version.derivedVersionIds.ar && idMap.ar[version.derivedVersionIds.ar]) {
      version.derivedVersionIds.ar = idMap.ar[version.derivedVersionIds.ar];
    }
    if (version.derivedFromVersionId && idMap.en[version.derivedFromVersionId]) {
      version.derivedFromVersionId = idMap.en[version.derivedFromVersionId];
    }
    if (version.translationSnapshot?.sourceVersionId && idMap.en[version.translationSnapshot.sourceVersionId]) {
      version.translationSnapshot.sourceVersionId = idMap.en[version.translationSnapshot.sourceVersionId];
    }
  }

  function handleResetDraft() {
    commitPendingHistory();
    const historyBefore = createHistorySnapshot();
    state.data = cloneData(sourceData);
    state.targeting = normalizeTargeting(null);
    state.ats.jobDescription = "";
    state.coverLetter = createEmptyCoverLetter(state.data.profile?.name);
    persistAtsDraft();
    state.selectedPresetId = "";
    state.documentMode = forcedDocumentMode === "cover-letter" ? "cover-letter" : "resume";
    state.lastResumeSection = "summary";
    state.activeSection = state.documentMode === "cover-letter" ? "coverLetter" : "summary";
    state.translation.currentOverrides = {};
    state.translation.review = null;
    state.translation.error = "";
    state.translation.message = "";
    state.command.entries = {};
    state.command.workspace = createCommandWorkspaceState();
    state.draft.status = "clean";
    state.draft.lastSavedAt = 0;
    state.draft.hasLocalDraft = false;
    clearStoredDraft();
    initializeDocument();
    commitHistorySnapshot(historyBefore);
    updateAtsAnalysis();
    renderEditor();
    renderPreview();
  }

  function handleClearDraft() {
    clearStoredDraft();
    state.draft.status = "cleared";
    state.draft.hasLocalDraft = false;
    state.draft.lastSavedAt = 0;
    state.command.entries = {};
    state.command.workspace = createCommandWorkspaceState();
    renderEditor();
  }

  function updateAtsAnalysis() {
    state.ats.analysis = analyzeJobDescription(state.data, state.ats.jobDescription);
    renderAtsAnalysisPanel();
  }

  function updateQualityAnalysis() {
    state.quality.analysis = analyzeQuality(state.data, state.targeting, state.ats.jobDescription);
    renderQualityPanel();
  }

  function renderQualityPanel() {
    if (!qualityResultsHost) {
      return;
    }

    const analysis = state.quality.analysis || analyzeQuality(state.data, state.targeting, state.ats.jobDescription);
    qualityResultsHost.innerHTML = "";

    qualityResultsHost.append(
      createAnalysisScoreSection("Overall Scores", analysis.scores, analysis.recruiterImpression?.headline || ""),
      createAnalysisInsightsSection("Top Problems", analysis.topProblems, createAnalysisFindingItem, locale.qualityNoIssues),
      createAnalysisInsightsSection("Strongest Points", analysis.strongestPoints, createAnalysisSimpleItem, "No standout strengths were detected yet."),
      createAnalysisInsightsSection("Weak Bullets", analysis.weakBullets, createWeakBulletInsightItem, "No weak bullets were detected right now."),
      createAnalysisInsightsSection("Generic Wording Issues", analysis.genericWordingIssues, createGenericInsightItem, "No generic wording issues were detected right now."),
      createAnalysisInsightsSection("Duplicate / Redundant Skills", analysis.duplicateSkills, createAnalysisFindingItem, "No duplicate or redundant skills were detected right now."),
      createAnalysisInsightsSection("Missing Metrics", analysis.missingMetrics, createMetricInsightItem, "Metric coverage looks reasonable right now."),
      createAnalysisInsightsSection("ATS Match Review", analysis.atsMatchReview, createAnalysisSimpleObjectItem, "ATS review needs more context."),
      createRecruiterImpressionSection(analysis.recruiterImpression),
      createAnalysisInsightsSection("Rewritten Suggestions", analysis.rewrittenSuggestions, createRewriteSuggestionItem, "No rewritten suggestions are needed right now."),
      renderAiReviewPanel(state.aiReviews.quality, "quality")
    );
  }

  function renderAtsAnalysisPanel() {
    if (!atsResultsHost) {
      return;
    }

    const analysis = state.ats.analysis;
    atsResultsHost.innerHTML = "";

    if (analysis.mismatch) {
      atsResultsHost.appendChild(createAtsNotice(analysis.warning, "is-warning"));
      return;
    }

    const sections = [];

    if (!state.ats.jobDescription.trim()) {
      sections.push(createAtsNotice(locale.atsEmptyState));
    }

    sections.push(createAtsScoreCard(analysis));

    if (analysis.hasJobDescription) {
      sections.push(
        createAtsSignalSection("Job description signals", [
          analysis.summary || "",
          analysis.seniority ? `Detected seniority: ${analysis.seniority}.` : "",
          analysis.domains?.length ? `Detected domain focus: ${analysis.domains.join(", ")}.` : ""
        ]),
        createAtsKeywordSection("Required hard skills", analysis.requiredSkills, ""),
        createAtsKeywordSection("Preferred skills", analysis.preferredSkills, ""),
        createAtsKeywordSection("Soft skills", analysis.softSkills, ""),
        createAtsKeywordSection(locale.atsStrongMatches, analysis.matchedKeywords, "is-match"),
        createAtsKeywordSection("Missing or unsupported terms", analysis.missingKeywords, "is-missing"),
        createAtsSignalSection("Evidence strength", [
          analysis.evidenceBackedMatches?.length
            ? `Evidence-backed matches: ${analysis.evidenceBackedMatches.slice(0, 5).join(", ")}.`
            : "Most matched terms still need stronger proof in experience or projects.",
          analysis.weakEvidenceTerms?.length
            ? `Weakly supported terms: ${analysis.weakEvidenceTerms.slice(0, 4).map((item) => item.term).join(", ")}.`
            : ""
        ])
      );
    } else {
      sections.push(
        createAtsSignalSection("Baseline ATS Review", [
          analysis.summary || "",
          analysis.domains?.length ? `Detected domain focus: ${analysis.domains.join(", ")}.` : "No strong domain focus was detected yet.",
          analysis.seniority ? `Current profile level reads closest to: ${analysis.seniority}.` : ""
        ]),
        createAtsKeywordSection("Detected hard skills", analysis.hardSkills, "is-match")
      );
    }

    sections.push(
      createAtsWeakSections(analysis.weakSections),
      createAtsSuggestions(analysis.suggestions),
      createAtsFocusAreas(analysis.focusAreas)
    );

    sections.push(renderAiReviewPanel(state.aiReviews.ats, "ats"));

    atsResultsHost.append(...sections);
  }

  function renderAiReviewPanel(reviewState, reviewType) {
    const section = document.createElement("section");
    section.className = "editor-ats__section";

    const title = document.createElement("h3");
    title.className = "editor-ats__section-title";
    title.textContent = reviewType === "quality"
      ? locale.aiQualityReviewTitle
      : reviewType === "ats"
        ? locale.aiAtsReviewTitle
        : locale.aiHrResultsTitle;
    section.appendChild(title);

    if (reviewState.loading) {
      section.appendChild(createAtsNotice(locale.aiReviewLoading));
      return section;
    }

    if (reviewState.error) {
      section.appendChild(createAtsNotice(reviewState.error, "is-warning"));
      return section;
    }

    if (!reviewState.result) {
      section.appendChild(createAtsNotice(
        reviewType === "quality"
          ? locale.aiQualityReviewEmpty
          : reviewType === "ats"
            ? locale.aiAtsReviewEmpty
            : locale.aiHrReviewEmpty
      ));
      return section;
    }

    const result = reviewState.result;
    if (result.scores) {
      if (reviewType === "hr") {
        section.appendChild(createCustomScoreSection(locale.aiReviewScoresTitle, [
          { label: "Relevance", value: result.scores?.relevance },
          { label: "Professionalism", value: result.scores?.professionalism },
          { label: "ATS strength", value: result.scores?.atsStrength },
          { label: "Achievement impact", value: result.scores?.achievementImpact },
          { label: "Overall shortlist potential", value: result.scores?.shortlistPotential }
        ], result.summary || ""));
      } else {
        section.appendChild(createAnalysisScoreSection(locale.aiReviewScoresTitle, result.scores, result.summary || ""));
      }
    } else if (result.summary) {
      section.appendChild(createAtsNotice(result.summary));
    }

    if (reviewType === "hr") {
      if (result.firstImpression) {
        section.appendChild(createAtsSignalSection(locale.aiHrFirstImpression, [result.firstImpression]));
      }
      section.appendChild(createAtsSignalSection(locale.aiHrRoleFit, [
        ...(result.roleFit?.strongMatches?.length ? [`Strong matches: ${result.roleFit.strongMatches.join(", ")}`] : []),
        ...(result.roleFit?.weakMatches?.length ? [`Weak matches: ${result.roleFit.weakMatches.join(", ")}`] : [])
      ]));
      section.appendChild(createAtsSignalSection(locale.aiHrShortlistDecision, [
        result.shortlistDecision?.decision ? `Decision: ${result.shortlistDecision.decision}` : "",
        result.shortlistDecision?.reason || ""
      ]));
      section.appendChild(createAnalysisInsightsSection(locale.aiHrHrReviewSection, normalizeAiObjectItems(result.hrReview, "HR note"), createAnalysisSimpleObjectItem, locale.atsNothingToShow));
      section.appendChild(createAnalysisInsightsSection(locale.aiHrAtsReviewSection, normalizeAiObjectItems(result.atsReview, "ATS note"), createAnalysisSimpleObjectItem, locale.atsNothingToShow));
      section.appendChild(createAnalysisInsightsSection(locale.aiHrRedFlagsSection, result.redFlags || [], createAnalysisSimpleItem, locale.atsNothingToShow));
      section.appendChild(createAnalysisInsightsSection(locale.aiHrImprovementsSection, result.improvementRecommendations || [], createAnalysisSimpleItem, locale.atsNothingToShow));
      section.appendChild(createAnalysisInsightsSection(locale.aiHrRewritesSection, normalizeAiRewriteItems(result.rewrittenSuggestions), createRewriteSuggestionItem, locale.atsNothingToShow));
      return section;
    }

    section.appendChild(createAnalysisInsightsSection(locale.aiReviewTopProblemsTitle, result.topProblems || [], createAnalysisSimpleItem, locale.atsNothingToShow));
    section.appendChild(createAnalysisInsightsSection(locale.aiReviewStrongestPointsTitle, result.strongestPoints || [], createAnalysisSimpleItem, locale.atsNothingToShow));
    section.appendChild(createAnalysisInsightsSection(locale.aiReviewRecommendationsTitle, result.recommendations || [], createAnalysisSimpleItem, locale.atsNothingToShow));
    section.appendChild(createAnalysisInsightsSection(locale.aiReviewRewritesTitle, normalizeAiRewriteItems(result.rewrittenSuggestions), createRewriteSuggestionItem, locale.atsNothingToShow));
    return section;
  }

  function createAtsScoreCard(analysis) {
    return createAnalysisScoreSection(
      analysis.hasJobDescription ? locale.atsMatchScore : "Baseline ATS Readiness",
      {
        overall: analysis.score,
        atsMatch: analysis.scores?.atsMatch || analysis.score,
        recruiterImpact: analysis.scores?.recruiterImpact || 0,
        writingStrength: analysis.scores?.writingStrength || 0,
        evidenceMetrics: analysis.scores?.evidenceMetrics || 0,
        roleRelevance: analysis.scores?.roleRelevance || 0
      },
      analysis.hasJobDescription
        ? locale.atsScoreSummary.replace("{matched}", String(analysis.matchedKeywords.length)).replace("{total}", String(analysis.keywordPoolSize))
        : "No job description is loaded, so this score uses baseline resume heuristics."
    );
  }

  function createAtsKeywordSection(titleText, keywords, extraClass = "") {
    const section = document.createElement("section");
    section.className = "editor-ats__section";

    const title = document.createElement("h3");
    title.className = "editor-ats__section-title";
    title.textContent = titleText;

    section.appendChild(title);

    if (!keywords.length) {
      section.appendChild(createAtsNotice(locale.atsNothingToShow));
      return section;
    }

    const list = document.createElement("div");
    list.className = "editor-ats__chips";
    keywords.forEach((keyword) => {
      const chip = document.createElement("span");
      chip.className = `editor-ats__chip ${extraClass}`.trim();
      chip.textContent = keyword;
      list.appendChild(chip);
    });

    section.appendChild(list);
    return section;
  }

  function createAtsWeakSections(items) {
    const section = document.createElement("section");
    section.className = "editor-ats__section";

    const title = document.createElement("h3");
    title.className = "editor-ats__section-title";
    title.textContent = locale.atsWeakSections;

    section.appendChild(title);

    if (!items.length) {
      section.appendChild(createAtsNotice(locale.atsNothingToShow));
      return section;
    }

    const list = document.createElement("div");
    list.className = "editor-ats__list";

    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "editor-ats__list-item";
      row.innerHTML = `
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.summary)}</span>
      `;
      list.appendChild(row);
    });

    section.appendChild(list);
    return section;
  }

  function createAtsSuggestions(items) {
    const section = document.createElement("section");
    section.className = "editor-ats__section";

    const title = document.createElement("h3");
    title.className = "editor-ats__section-title";
    title.textContent = locale.atsSuggestedSections;

    section.appendChild(title);

    if (!items.length) {
      section.appendChild(createAtsNotice(locale.atsNothingToShow));
      return section;
    }

    const list = document.createElement("div");
    list.className = "editor-ats__list";

    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "editor-ats__list-item";

      const copy = document.createElement("div");
      copy.className = "editor-ats__copy";
      copy.innerHTML = `
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.reason)}</span>
      `;

      const jump = createActionButton(locale.atsJumpToSection, "", () => {
        openEditorSection(item.key);
      });

      row.append(copy, jump);
      list.appendChild(row);
    });

    section.appendChild(list);
    return section;
  }

  function createAtsFocusAreas(items) {
    const section = document.createElement("section");
    section.className = "editor-ats__section";

    const title = document.createElement("h3");
    title.className = "editor-ats__section-title";
    title.textContent = locale.atsFocusAreas;

    section.appendChild(title);

    if (!items.length) {
      section.appendChild(createAtsNotice(locale.atsNothingToShow));
      return section;
    }

    const list = document.createElement("ul");
    list.className = "editor-ats__focus-list";

    items.forEach((item) => {
      const row = document.createElement("li");
      row.className = "editor-ats__focus-item";
      row.textContent = item;
      list.appendChild(row);
    });

    section.appendChild(list);
    return section;
  }

  function createAtsNotice(message, extraClass = "") {
    const notice = document.createElement("p");
    notice.className = `editor-ats__notice ${extraClass}`.trim();
    notice.textContent = message;
    return notice;
  }

  function createAnalysisScoreSection(titleText, scores, metaText = "") {
    const section = document.createElement("section");
    section.className = "editor-ats__section";

    const title = document.createElement("h3");
    title.className = "editor-ats__section-title";
    title.textContent = titleText;

    const list = document.createElement("div");
    list.className = "editor-ats__list";

    [
      { label: "Overall Score", value: scores?.overall },
      { label: "ATS Match Score", value: scores?.atsMatch },
      { label: "Recruiter Impact Score", value: scores?.recruiterImpact },
      { label: "Writing Strength Score", value: scores?.writingStrength },
      { label: "Evidence / Metrics Score", value: scores?.evidenceMetrics },
      { label: "Role Relevance Score", value: scores?.roleRelevance }
    ]
      .filter((item) => Number.isFinite(item.value))
      .forEach((item) => {
        const row = document.createElement("div");
        row.className = "editor-ats__list-item";
        row.innerHTML = `<strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(`${item.value}%`)}</span>`;
        list.appendChild(row);
      });

    section.append(title, list);
    if (metaText) {
      section.appendChild(createAtsNotice(metaText));
    }
    return section;
  }

  function createCustomScoreSection(titleText, items, metaText = "") {
    const section = document.createElement("section");
    section.className = "editor-ats__section";

    const title = document.createElement("h3");
    title.className = "editor-ats__section-title";
    title.textContent = titleText;

    const list = document.createElement("div");
    list.className = "editor-ats__list";

    (items || [])
      .filter((item) => Number.isFinite(item?.value))
      .forEach((item) => {
        const row = document.createElement("div");
        row.className = "editor-ats__list-item";
        row.innerHTML = `<strong>${escapeHtml(item.label || "")}</strong><span>${escapeHtml(`${item.value}/10`)}</span>`;
        list.appendChild(row);
      });

    section.append(title, list);
    if (metaText) {
      section.appendChild(createAtsNotice(metaText));
    }
    return section;
  }

  function createAnalysisInsightsSection(titleText, items, renderer, emptyText) {
    const section = document.createElement("section");
    section.className = "editor-ats__section";

    const title = document.createElement("h3");
    title.className = "editor-ats__section-title";
    title.textContent = titleText;
    section.appendChild(title);

    if (!(items || []).length) {
      section.appendChild(createAtsNotice(emptyText || locale.atsNothingToShow));
      return section;
    }

    const list = document.createElement("div");
    list.className = "editor-ats__list";
    items.forEach((item) => list.appendChild(renderer(item)));
    section.appendChild(list);
    return section;
  }

  function normalizeAiObjectItems(items, fallbackTitle = "Note") {
    return (items || []).map((item) => {
      if (typeof item === "string") {
        return {
          title: fallbackTitle,
          message: item,
          severity: "info"
        };
      }
      return {
        title: item?.title || fallbackTitle,
        message: item?.message || item?.summary || "",
        severity: item?.severity || "info"
      };
    });
  }

  function normalizeAiRewriteItems(items) {
    return (items || []).map((item, index) => ({
      title: item?.title || `Rewrite ${index + 1}`,
      before: item?.before || "",
      after: item?.after || item?.replacement || ""
    })).filter((item) => item.before || item.after);
  }

  function createAnalysisFindingItem(item) {
    const row = document.createElement("div");
    row.className = `editor-ats__list-item editor-ats__list-item--${item.severity || "info"}`.trim();

    const copy = document.createElement("div");
    copy.className = "editor-ats__copy";
    copy.innerHTML = `<strong>${escapeHtml(item.title || "Issue")}</strong><span>${escapeHtml(item.message || "")}</span>`;
    row.appendChild(copy);

    if (item.sectionKey) {
      const actionLabel = Number.isInteger(item.itemIndex) || Number.isInteger(item.bulletIndex) || item.focusSelector
        ? locale.qualityOpenItem
        : locale.qualityOpenSection;
      row.appendChild(createActionButton(actionLabel, "", () => openQualityIssue(item)));
    }

    return row;
  }

  function createAnalysisSimpleItem(text) {
    return createAnalysisFindingItem({
      severity: "info",
      title: "Strength",
      message: String(text || "")
    });
  }

  function createAnalysisSimpleObjectItem(item) {
    return createAnalysisFindingItem({
      severity: item.severity || "info",
      title: item.title,
      message: item.message,
      sectionKey: item.sectionKey,
      itemIndex: item.itemIndex,
      bulletIndex: item.bulletIndex,
      itemKind: item.itemKind,
      focusSelector: item.focusSelector
    });
  }

  function createWeakBulletInsightItem(item) {
    return createAnalysisFindingItem({
      severity: "warning",
      title: `${item.itemLabel} (${item.classification})`,
      message: `${item.issues.join(", ")}. Better verb: ${item.betterVerb || "Improve the opening"}. Rewrite: ${item.improvedRewrite || "No rewrite needed."}`,
      sectionKey: item.sectionKey,
      itemIndex: item.itemIndex,
      bulletIndex: item.bulletIndex,
      itemKind: item.itemKind,
      focusSelector: item.focusSelector
    });
  }

  function createGenericInsightItem(item) {
    return createAnalysisFindingItem({
      severity: item.severity || "warning",
      title: item.title,
      message: `${item.message} Suggested replacement: ${item.replacement || "Make the wording more specific."}`,
      sectionKey: item.sectionKey,
      itemIndex: item.itemIndex,
      bulletIndex: item.bulletIndex,
      itemKind: item.itemKind,
      focusSelector: item.focusSelector
    });
  }

  function createMetricInsightItem(item) {
    return createAnalysisFindingItem({
      severity: item.severity || "warning",
      title: item.title,
      message: `${item.message} Suggested metric type: ${item.metricSuggestion || "scope or measurable result"}.`,
      sectionKey: item.sectionKey,
      itemIndex: item.itemIndex,
      itemKind: item.itemKind,
      focusSelector: item.focusSelector
    });
  }

  function createRewriteSuggestionItem(item) {
    return createAnalysisFindingItem({
      severity: "info",
      title: item.title,
      message: `Before: ${item.before || ""} After: ${item.after || ""}`,
      sectionKey: item.sectionKey,
      itemIndex: item.itemIndex,
      bulletIndex: item.bulletIndex,
      itemKind: item.itemKind,
      focusSelector: item.focusSelector
    });
  }

  function createRecruiterImpressionSection(impression) {
    const section = document.createElement("section");
    section.className = "editor-ats__section";

    const title = document.createElement("h3");
    title.className = "editor-ats__section-title";
    title.textContent = "Recruiter Impression";
    section.appendChild(title);

    if (!impression) {
      section.appendChild(createAtsNotice("No recruiter impression is available right now."));
      return section;
    }

    section.appendChild(createAtsNotice(impression.headline || ""));
    section.appendChild(createAtsNotice(impression.body || ""));
    return section;
  }

  function createAtsSignalSection(titleText, lines) {
    const section = document.createElement("section");
    section.className = "editor-ats__section";
    const title = document.createElement("h3");
    title.className = "editor-ats__section-title";
    title.textContent = titleText;
    section.appendChild(title);

    const items = (lines || []).map((line) => String(line || "").trim()).filter(Boolean);
    if (!items.length) {
      section.appendChild(createAtsNotice(locale.atsNothingToShow));
      return section;
    }

    const list = document.createElement("ul");
    list.className = "editor-ats__focus-list";
    items.forEach((line) => {
      const row = document.createElement("li");
      row.className = "editor-ats__focus-item";
      row.textContent = line;
      list.appendChild(row);
    });
    section.appendChild(list);
    return section;
  }

  function parseImportedData(text) {
    const source = String(text || "").trim();
    if (!source) {
      return null;
    }

    try {
      const parsed = JSON.parse(source);
      if (parsed && typeof parsed === "object") {
        return parsed.resumeData && typeof parsed.resumeData === "object"
          ? parsed.resumeData
          : parsed;
      }
    } catch (error) {
      // Fall back to the legacy JS export format below.
    }

    const evaluator = new Function(`
      const window = {};
      ${source}
      return window.resumeData;
    `);
    return evaluator();
  }

  function analyzeQuality(data, targeting, jobDescription) {
    const bulletAnalysis = analyzeBulletStrength(data);
    const genericAnalysis = analyzeGenericWording(data, bulletAnalysis);
    const redundancyAnalysis = analyzeRedundancy(data, bulletAnalysis);
    const metricAnalysis = analyzeMetricCoverage(data, bulletAnalysis);
    const jobMatch = analyzeJobMatch(data, jobDescription);
    const summaryAnalysis = analyzeSummaryStrength(data, jobDescription, jobMatch, bulletAnalysis, genericAnalysis);
    const missingContent = analyzeMissingContent(data, jobDescription, jobMatch, bulletAnalysis, metricAnalysis, summaryAnalysis);
    const scores = buildOverallScoring({
      bulletAnalysis,
      summaryAnalysis,
      metricAnalysis,
      genericAnalysis,
      redundancyAnalysis,
      missingContent,
      jobMatch
    });

    const strongestPoints = buildStrongestPoints(data, bulletAnalysis, summaryAnalysis, jobMatch, missingContent);
    const topProblems = buildTopProblems(bulletAnalysis, summaryAnalysis, metricAnalysis, genericAnalysis, redundancyAnalysis, missingContent, jobMatch);
    const rewrittenSuggestions = buildRewrittenSuggestions(summaryAnalysis, bulletAnalysis);
    const allIssues = collectQualityIssues(topProblems, genericAnalysis, redundancyAnalysis, metricAnalysis, missingContent, summaryAnalysis);

    return {
      scores,
      overallScore: scores.overall,
      counts: countIssueSeverities(allIssues),
      issues: allIssues,
      topProblems,
      strongestPoints,
      weakBullets: bulletAnalysis.bullets.filter((bullet) => bullet.classification === "Weak"),
      genericWordingIssues: genericAnalysis.issues,
      duplicateSkills: redundancyAnalysis.duplicateSkills,
      missingMetrics: metricAnalysis.missingItems,
      atsMatchReview: buildQualityAtsMatchReview(jobMatch),
      recruiterImpression: buildRecruiterImpression(scores, summaryAnalysis, missingContent, jobMatch),
      rewrittenSuggestions
    };
  }

  function countWords(text) {
    return String(text || "").trim().split(/\s+/).filter(Boolean).length;
  }

  function getAnalyzableBulletSections(data) {
    return [
      ["professionalExperience", data.professionalExperience || []],
      ["internships", data.internships || []],
      ["projects", data.projects || []]
    ].filter(([sectionKey]) => isSectionVisibleInData(data, sectionKey));
  }

  function analyzeBulletStrength(data) {
    const bullets = [];
    const noBulletItems = [];
    const openingMap = new Map();

    getAnalyzableBulletSections(data).forEach(([sectionKey, items]) => {
      items.forEach((item, itemIndex) => {
        const itemKind = getPreviewItemKindForSection(sectionKey);
        const bulletsList = Array.isArray(item?.bullets) ? item.bullets : [];
        const itemLabel = getSectionItemLabel(sectionKey, item, itemIndex);

        if (!bulletsList.length) {
          noBulletItems.push({
            severity: "warning",
            title: itemLabel,
            message: "This item has no supporting bullets yet.",
            sectionKey,
            itemIndex,
            itemKind
          });
          return;
        }

        bulletsList.forEach((bullet, bulletIndex) => {
          const analysis = evaluateBulletStrength(String(bullet || ""), {
            sectionKey,
            itemIndex,
            bulletIndex,
            itemKind,
            itemLabel
          });
          bullets.push(analysis);

          const opening = String(analysis.opening || "").toLowerCase();
          if (opening) {
            const entry = openingMap.get(opening) || [];
            entry.push(analysis);
            openingMap.set(opening, entry);
          }
        });
      });
    });

    const repeatedOpenings = Array.from(openingMap.entries())
      .filter(([opening, items]) => opening && items.length >= 3)
      .slice(0, 3)
      .map(([opening, items]) => ({
        severity: "info",
        title: "Repeated bullet opening",
        message: `Several bullets start with "${opening}", which makes the experience read repetitively.`,
        sectionKey: items[0].sectionKey,
        itemIndex: items[0].itemIndex,
        bulletIndex: items[0].bulletIndex,
        itemKind: items[0].itemKind,
        focusSelector: items[0].focusSelector
      }));

    return {
      bullets,
      weakBullets: bullets.filter((item) => item.classification === "Weak"),
      strongBullets: bullets.filter((item) => item.classification === "Strong"),
      noBulletItems,
      repeatedOpenings,
      nearDuplicateBullets: detectNearDuplicateBullets(bullets)
    };
  }

  function evaluateBulletStrength(text, context) {
    const normalized = String(text || "").trim();
    const action = analyzeActionVerb(normalized);
    const clearTask = hasClearTask(normalized);
    const measurableResult = hasMetricEvidence(normalized);
    const impact = hasImpactEvidence(normalized);
    const genericReason = detectGenericBulletReason(normalized);
    const dutyOnly = Boolean(normalized)
      && !measurableResult
      && !impact
      && (action.strength !== "strong" || Boolean(genericReason) || /\b(responsible for|worked on|helped with|involved in|participated in|assisted with)\b/i.test(normalized));

    const score = [
      action.strength === "strong",
      clearTask,
      measurableResult,
      impact
    ].filter(Boolean).length;

    const classification = !normalized || dutyOnly || score <= 1
      ? "Weak"
      : score >= 3
        ? "Strong"
        : "Acceptable";

    const issues = [];
    if (action.strength !== "strong") {
      issues.push("weak opening");
    }
    if (!clearTask) {
      issues.push("task is not specific enough");
    }
    if (!measurableResult) {
      issues.push("no measurable result");
    }
    if (!impact) {
      issues.push("impact is not clear");
    }
    if (dutyOnly) {
      issues.push("reads like a responsibility, not an outcome");
    }

    const betterVerb = action.suggestion || "";
    return {
      ...context,
      text: normalized,
      opening: action.opening,
      classification,
      clearTask,
      measurableResult,
      impact,
      dutyOnly,
      issues,
      genericReason,
      betterVerb,
      improvedRewrite: classification === "Weak"
        ? rewriteWeakBullet(normalized, context.sectionKey, betterVerb || pickSuggestedActionVerb(normalized, "Improved"))
        : "",
      metricSuggestion: !measurableResult ? suggestMetricTypeForBullet(normalized, context.sectionKey) : "",
      focusSelector: `.editor-bullets__row:nth-of-type(${context.bulletIndex + 1}) textarea`
    };
  }

  function analyzeActionVerb(text) {
    const normalized = String(text || "").trim();
    const openingPhrase = normalized.match(/^[A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*)?/);
    const opening = openingPhrase ? openingPhrase[0] : "";
    const firstWord = (normalized.split(/\s+/)[0] || "").toLowerCase();

    if (STRONG_ACTION_VERBS.has(firstWord)) {
      return { opening, strength: "strong", suggestion: "", weakPhrase: "" };
    }

    const weakPatterns = [
      /\bresponsible for\b/i,
      /\bworked on\b/i,
      /\bhelped with\b/i,
      /\bassisted with\b/i,
      /\binvolved in\b/i,
      /\bparticipated in\b/i,
      /\bmade\b/i,
      /\bdid troubleshooting\b/i
    ];
    const matchedWeak = weakPatterns.find((pattern) => pattern.test(normalized));

    if (matchedWeak || /^[a-z]+ing\b/i.test(normalized)) {
      return {
        opening,
        strength: "weak",
        suggestion: pickSuggestedActionVerb(normalized, "Improved"),
        weakPhrase: matchedWeak ? String(matchedWeak) : opening
      };
    }

    return {
      opening,
      strength: "unclear",
      suggestion: pickSuggestedActionVerb(normalized, "Improved"),
      weakPhrase: ""
    };
  }

  function hasClearTask(text) {
    const normalized = String(text || "").trim();
    if (countWords(normalized) < 6) {
      return false;
    }
    if (extractImportantTerms(normalized, documentLanguage).length >= 4) {
      return true;
    }
    return /\b(using|across|for|through|with|to|by|within|including)\b/i.test(normalized);
  }

  function hasImpactEvidence(text) {
    const normalized = String(text || "").toLowerCase();
    return IMPACT_KEYWORDS.some((keyword) => normalized.includes(keyword))
      || /\b(improved|reduced|increased|optimized|secured|streamlined|strengthened|stabilized|accelerated|resolved|delivered|enabled|maintained)\b/i.test(normalized);
  }

  function rewriteWeakBullet(text, sectionKey, betterVerb) {
    const cleaned = stripWeakOpening(text);
    const verb = betterVerb || pickSuggestedActionVerb(cleaned, "Improved");
    const tail = normalizeRewriteTail(cleaned, verb, sectionKey);
    const sentence = `${verb} ${tail}`.replace(/\s+/g, " ").trim();
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }

  function stripWeakOpening(text) {
    const patterns = [
      [/^\s*responsible for\s+/i, ""],
      [/^\s*worked on\s+/i, ""],
      [/^\s*helped with\s+/i, ""],
      [/^\s*assisted with\s+/i, ""],
      [/^\s*involved in\s+/i, ""],
      [/^\s*participated in\s+/i, ""],
      [/^\s*made\s+/i, ""],
      [/^\s*did troubleshooting(?:\s+for|\s+on|\s+of)?\s*/i, ""]
    ];
    let result = String(text || "").trim();
    patterns.forEach(([pattern, replacement]) => {
      result = result.replace(pattern, replacement);
    });
    return result.trim();
  }

  function normalizeRewriteTail(text, verb, sectionKey) {
    let result = String(text || "").trim();
    result = result.replace(/^(working|supporting|troubleshooting|managing|coordinating|developing)\s+/i, "");
    if (/^troubleshooting\b/i.test(text) && /^(Resolved|Diagnosed)$/i.test(verb)) {
      result = String(text || "").replace(/^troubleshooting\s+/i, "");
    }
    if (!result) {
      result = sectionKey === "projects" ? "project work" : "core responsibilities";
    }
    return lowercaseFirstToken(result);
  }

  function lowercaseFirstToken(text) {
    const value = String(text || "");
    if (!value) {
      return "";
    }
    const firstWord = value.split(/\s+/)[0] || "";
    if (/^[A-Z0-9+/#.-]{2,}$/.test(firstWord)) {
      return value;
    }
    return value.charAt(0).toLowerCase() + value.slice(1);
  }

  function suggestMetricTypeForBullet(text, sectionKey) {
    const normalized = String(text || "").toLowerCase();
    if (/\b(ticket|support|troubleshoot|incident|device|endpoint|network|server)\b/.test(normalized)) {
      return "volume handled, systems/devices supported, uptime, or incident reduction";
    }
    if (/\b(api|backend|frontend|app|application|platform|feature|database|firebase|android)\b/.test(normalized)) {
      return "features delivered, users affected, response time, reliability, or performance improvement";
    }
    if (/\b(security|siem|threat|log|alert|honeypot|firewall|vulnerability)\b/.test(normalized)) {
      return "alerts reviewed, incidents reduced, endpoints covered, or response time improvement";
    }
    if (/\b(document|workflow|process|operation)\b/.test(normalized)) {
      return "time saved, handoff speed, or troubleshooting efficiency";
    }
    if (sectionKey === "projects") {
      return "users, testing coverage, evaluation results, or performance gains";
    }
    return "scope, scale, time saved, or measurable outcome";
  }

  function analyzeMetricCoverage(data, bulletAnalysis) {
    const missingItems = [];
    const bulletGroups = new Map();

    bulletAnalysis.bullets.forEach((bullet) => {
      const key = `${bullet.sectionKey}:${bullet.itemIndex}`;
      const group = bulletGroups.get(key) || [];
      group.push(bullet);
      bulletGroups.set(key, group);
    });

    bulletGroups.forEach((group) => {
      if (group.some((bullet) => bullet.measurableResult)) {
        return;
      }
      const first = group[0];
      missingItems.push({
        severity: first.sectionKey === "internships" ? "info" : "warning",
        title: first.itemLabel,
        message: `This item would be stronger with measurable evidence such as ${first.metricSuggestion}.`,
        metricSuggestion: first.metricSuggestion,
        sectionKey: first.sectionKey,
        itemIndex: first.itemIndex,
        itemKind: first.itemKind,
        focusSelector: first.focusSelector
      });
    });

    return {
      metricBullets: bulletAnalysis.bullets.filter((bullet) => bullet.measurableResult),
      missingItems,
      coverageRatio: bulletAnalysis.bullets.length
        ? bulletAnalysis.bullets.filter((bullet) => bullet.measurableResult).length / bulletAnalysis.bullets.length
        : 0
    };
  }

  function analyzeGenericWording(data, bulletAnalysis) {
    const issues = [];
    const summaryText = String(data.summary || "").trim();
    const summaryPhrase = detectGenericSummaryPhrase(summaryText);
    const summaryReplacement = buildSharperSummaryGuidance(summaryText, data);

    if (summaryText && (summaryPhrase || isSummaryTooBroad(summaryText))) {
      issues.push({
        severity: "warning",
        title: "Professional summary",
        message: summaryPhrase
          ? `"${summaryPhrase}" is too generic and does not show a clear role fit.`
          : "The summary is too broad and needs a clearer target role and specialization.",
        replacement: summaryReplacement,
        sectionKey: "summary",
        itemKind: "summary-body",
        focusSelector: "textarea"
      });
    }

    bulletAnalysis.bullets
      .filter((bullet) => bullet.genericReason)
      .slice(0, 8)
      .forEach((bullet) => {
        issues.push({
          severity: "warning",
          title: bullet.itemLabel,
          message: `This bullet uses weak wording around "${bullet.genericReason}".`,
          replacement: bullet.improvedRewrite || rewriteWeakBullet(bullet.text, bullet.sectionKey, bullet.betterVerb),
          sectionKey: bullet.sectionKey,
          itemIndex: bullet.itemIndex,
          bulletIndex: bullet.bulletIndex,
          itemKind: bullet.itemKind,
          focusSelector: bullet.focusSelector
        });
      });

    return { issues };
  }

  function analyzeRedundancy(data, bulletAnalysis) {
    const duplicateSkills = detectDuplicateSkills(data.skills || {}).map((item) => ({
      severity: item.sectionKey === "softSkills" ? "info" : "warning",
      title: "Duplicate skill",
      message: `"${item.display}" appears more than once and could be consolidated.`,
      display: item.display,
      sectionKey: item.sectionKey,
      itemIndex: item.itemIndex,
      itemKind: item.itemKind,
      focusSelector: item.focusSelector
    }));

    return {
      duplicateSkills,
      repeatedOpenings: bulletAnalysis.repeatedOpenings,
      nearDuplicateBullets: bulletAnalysis.nearDuplicateBullets
    };
  }

  function analyzeSummaryStrength(data, jobDescription, jobMatch, bulletAnalysis, genericAnalysis) {
    const summaryText = String(data.summary || "").trim();
    const roleSignals = detectResumeRoleSignals(data, summaryText);
    const domains = detectResumeDomains(data);
    const summaryTerms = extractImportantTerms(summaryText, documentLanguage);
    const evidenceSignals = bulletAnalysis.strongBullets.length + (jobMatch?.evidenceBackedMatches || []).length;
    const issues = [];

    if (!summaryText) {
      issues.push({
        severity: "critical",
        title: "Professional summary",
        message: "The summary is empty.",
        sectionKey: "summary",
        itemKind: "summary-body",
        focusSelector: "textarea"
      });
    } else {
      if (!roleSignals.roleLabel) {
        issues.push({
          severity: "warning",
          title: "Professional summary",
          message: "The summary does not clearly state a target role.",
          sectionKey: "summary",
          itemKind: "summary-body",
          focusSelector: "textarea"
        });
      }
      if (!domains.length) {
        issues.push({
          severity: "info",
          title: "Professional summary",
          message: "The summary could show a clearer specialization or domain focus.",
          sectionKey: "summary",
          itemKind: "summary-body",
          focusSelector: "textarea"
        });
      }
      if (summaryTerms.length < 5 || genericAnalysis.issues.some((item) => item.sectionKey === "summary")) {
        issues.push({
          severity: "warning",
          title: "Professional summary",
          message: "The summary still sounds broad and needs more concrete evidence or keywords.",
          sectionKey: "summary",
          itemKind: "summary-body",
          focusSelector: "textarea"
        });
      }
    }

    const specificity = Math.min(100, Math.round(((summaryTerms.length >= 6 ? 1 : 0) + (domains.length ? 1 : 0) + (roleSignals.roleLabel ? 1 : 0)) / 3 * 100));
    const evidence = Math.min(100, Math.round(((hasMetricEvidence(summaryText) ? 1 : 0) + (evidenceSignals >= 2 ? 1 : 0)) / 2 * 100));

    return {
      summaryText,
      roleLabel: roleSignals.roleLabel,
      domains,
      specificity,
      evidence,
      keywordRelevance: Math.min(100, Math.round(((jobMatch?.scores?.roleRelevance || 0) + (summaryTerms.length >= 6 ? 70 : 35)) / 2)),
      issues,
      rewrittenSummary: issues.length ? rewriteProfessionalSummary(data, jobMatch) : ""
    };
  }

  function analyzeMissingContent(data, jobDescription, jobMatch, bulletAnalysis, metricAnalysis, summaryAnalysis) {
    const warnings = [];
    const hasTechnicalTarget = detectResumeDomains(data).some((domain) => ["web development", "cybersecurity", "it support", "cloud", "data", "devops"].includes(domain));
    const profile = data.profile || {};

    if (!String(profile.linkedinHref || "").trim()) {
      warnings.push({
        severity: "warning",
        title: "LinkedIn link",
        message: "Add a LinkedIn URL so recruiters can verify your background quickly.",
        sectionKey: "profile",
        focusSelector: '[data-field-key="linkedinHref"]'
      });
    }
    if (hasTechnicalTarget && !String(profile.githubHref || "").trim()) {
      warnings.push({
        severity: "info",
        title: "GitHub link",
        message: "A GitHub link would strengthen technical roles if you have relevant code or projects to show.",
        sectionKey: "profile",
        focusSelector: '[data-field-key="githubHref"]'
      });
    }
    if (hasTechnicalTarget && !String(profile.portfolioHref || "").trim()) {
      warnings.push({
        severity: "info",
        title: "Portfolio link",
        message: "A portfolio or project link would make the CV more proof-driven for technical roles.",
        sectionKey: "profile",
        focusSelector: '[data-field-key="portfolioHref"]'
      });
    }
    if (!String(profile.location || "").trim()) {
      warnings.push({
        severity: "info",
        title: "Location",
        message: "Add your location so recruiters can quickly judge role fit and work setup.",
        sectionKey: "profile",
        focusSelector: '[data-field-key="location"]'
      });
    }
    if (/\b(work authorization|authorized to work|sponsorship|visa)\b/i.test(String(jobDescription || "")) && !/\b(authorized|visa|sponsorship)\b/i.test(String(data.summary || ""))) {
      warnings.push({
        severity: "info",
        title: "Work authorization",
        message: "This job description hints at work authorization or sponsorship concerns, so mention that only if it is genuinely helpful.",
        sectionKey: "summary",
        itemKind: "summary-body",
        focusSelector: "textarea"
      });
    }
    if (!(data.projects || []).length) {
      warnings.push({
        severity: "warning",
        title: "Projects",
        message: "Strong projects are missing, which makes the technical evidence thinner.",
        sectionKey: "projects"
      });
    }
    if (!(data.certificates || []).length && hasTechnicalTarget) {
      warnings.push({
        severity: "info",
        title: "Certifications",
        message: "Relevant certifications could help reinforce technical credibility if you already have them.",
        sectionKey: "certificates"
      });
    }
    if (metricAnalysis.missingItems.length >= 2) {
      warnings.push({
        severity: "warning",
        title: "Quantified achievements",
        message: "Most experience bullets still lack measurable evidence.",
        sectionKey: metricAnalysis.missingItems[0].sectionKey,
        itemIndex: metricAnalysis.missingItems[0].itemIndex,
        itemKind: metricAnalysis.missingItems[0].itemKind,
        focusSelector: metricAnalysis.missingItems[0].focusSelector
      });
    }
    if ((data.skills?.technical || []).length <= 1) {
      warnings.push({
        severity: "info",
        title: "Tools and platforms",
        message: "The CV could name more tools, platforms, or technologies used in real work.",
        sectionKey: "skills"
      });
    }
    if (jobMatch?.seniority === "lead" && !bulletAnalysis.bullets.some((bullet) => /\b(led|managed|coordinated|mentored|owned)\b/i.test(bullet.text))) {
      warnings.push({
        severity: "warning",
        title: "Leadership evidence",
        message: "The target seniority suggests you should show leadership examples more clearly.",
        sectionKey: "professionalExperience"
      });
    }
    if ((data.internships || []).length && !bulletAnalysis.bullets.some((bullet) => bullet.sectionKey === "internships" && bullet.classification !== "Weak")) {
      warnings.push({
        severity: "info",
        title: "Internship relevance",
        message: "Internship bullets would be stronger if they emphasized tools, outcomes, or technical relevance.",
        sectionKey: "internships"
      });
    }
    if ((data.professionalExperience || []).length <= 1 && !(data.customSections || []).length) {
      warnings.push({
        severity: "info",
        title: "Volunteer or extracurricular work",
        message: "Volunteer, freelance, or extracurricular technical work could strengthen early-career evidence if you have it.",
        sectionKey: "projects"
      });
    }

    return { warnings };
  }

  function analyzeJobMatch(data, jobDescription) {
    const trimmed = String(jobDescription || "").trim();
    const bulletAnalysis = analyzeBulletStrength(data);
    const summaryText = String(data.summary || "").trim();
    const domains = detectResumeDomains(data);
    const evidenceMap = buildResumeEvidenceMap(data);

    if (!trimmed) {
      const baselineScores = buildBaselineAtsScores(data, bulletAnalysis, domains);
      return {
        hasJobDescription: false,
        mismatch: false,
        warning: "",
        domains,
        seniority: detectResumeSeniority(data),
        hardSkills: getTopResumeTerms(data, "skills", 8),
        preferredSkills: [],
        softSkills: uniqueTextItems((data.skills?.soft || []).slice(0, 6)),
        requiredSkills: [],
        matchedKeywords: getTopResumeTerms(data, "all", 8),
        missingKeywords: [],
        weakSections: buildBaselineWeakSections(data, bulletAnalysis),
        suggestions: buildBaselineAtsSuggestions(data, bulletAnalysis),
        focusAreas: buildBaselineAtsFocusAreas(data, bulletAnalysis),
        evidenceBackedMatches: [],
        weakEvidenceTerms: [],
        keywordPoolSize: 0,
        scores: baselineScores,
        score: baselineScores.atsMatch,
        summary: "Baseline ATS readiness based on role clarity, evidence, and keyword breadth."
      };
    }

    const detectedLanguage = detectDominantLanguage(trimmed);
    const mismatch = detectedLanguage !== "unknown" && detectedLanguage !== documentLanguage;
    if (mismatch) {
      return {
        hasJobDescription: true,
        mismatch: true,
        warning: documentLanguage === "ar" ? locale.atsMismatchArabic : locale.atsMismatchEnglish,
        hardSkills: [],
        preferredSkills: [],
        softSkills: [],
        requiredSkills: [],
        matchedKeywords: [],
        missingKeywords: [],
        weakSections: [],
        suggestions: [],
        focusAreas: [],
        evidenceBackedMatches: [],
        weakEvidenceTerms: [],
        keywordPoolSize: 0,
        scores: { atsMatch: 0, recruiterImpact: 0, writingStrength: 0, evidenceMetrics: 0, roleRelevance: 0 },
        score: 0,
        domains: []
      };
    }

    const parsedJob = parseJobDescriptionInsights(trimmed);
    const matchedKeywords = [];
    const missingKeywords = [];
    const weakEvidenceTerms = [];

    parsedJob.keywordPool.forEach((term) => {
      const evidence = evidenceMap.get(term) || { score: 0, sources: [] };
      if (evidence.score > 0) {
        matchedKeywords.push(term);
        if (evidence.score < 60) {
          weakEvidenceTerms.push({ term, sources: evidence.sources });
        }
      } else {
        missingKeywords.push(term);
      }
    });

    const evidenceBackedMatches = matchedKeywords.filter((term) => (evidenceMap.get(term)?.score || 0) >= 60);
    const scores = buildJobMatchScores(parsedJob, matchedKeywords, missingKeywords, weakEvidenceTerms, bulletAnalysis, summaryText, domains);

    return {
      hasJobDescription: true,
      mismatch: false,
      warning: "",
      domains: parsedJob.domains,
      seniority: parsedJob.seniority,
      hardSkills: parsedJob.hardSkills,
      preferredSkills: parsedJob.preferredSkills,
      softSkills: parsedJob.softSkills,
      requiredSkills: parsedJob.requiredSkills,
      matchedKeywords,
      missingKeywords,
      weakSections: buildJobWeakSections(data, parsedJob.keywordPool),
      suggestions: buildAtsSuggestions(buildResumeSectionCorpus(data, documentLanguage), missingKeywords),
      focusAreas: buildJobMatchFocusAreas(parsedJob, missingKeywords, weakEvidenceTerms, bulletAnalysis, domains),
      evidenceBackedMatches,
      weakEvidenceTerms,
      keywordPoolSize: parsedJob.keywordPool.length,
      scores,
      score: scores.atsMatch,
      summary: parsedJob.summary
    };
  }

  function buildOverallScoring({ bulletAnalysis, summaryAnalysis, metricAnalysis, genericAnalysis, redundancyAnalysis, missingContent, jobMatch }) {
    const writingStrength = clampScore(
      100
      - (bulletAnalysis.weakBullets.length * 6)
      - (genericAnalysis.issues.length * 6)
      - (redundancyAnalysis.repeatedOpenings.length * 5)
    );

    const evidenceMetrics = clampScore(
      Math.round((metricAnalysis.coverageRatio * 70) + Math.min(30, bulletAnalysis.strongBullets.length * 6))
    );

    const recruiterImpact = clampScore(
      Math.round(
        (bulletAnalysis.strongBullets.length * 10)
        + (summaryAnalysis.specificity * 0.25)
        + (summaryAnalysis.evidence * 0.2)
        - (missingContent.warnings.filter((item) => item.severity === "warning").length * 8)
      )
    );

    const roleRelevance = clampScore(jobMatch?.scores?.roleRelevance ?? Math.round((summaryAnalysis.keywordRelevance + summaryAnalysis.specificity) / 2));
    const atsMatch = clampScore(jobMatch?.scores?.atsMatch ?? 0);
    const overall = clampScore(Math.round(
      (atsMatch * 0.24)
      + (recruiterImpact * 0.24)
      + (writingStrength * 0.18)
      + (evidenceMetrics * 0.2)
      + (roleRelevance * 0.14)
    ));

    return { overall, atsMatch, recruiterImpact, writingStrength, evidenceMetrics, roleRelevance };
  }

  function clampScore(value) {
    return Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  }

  function buildStrongestPoints(data, bulletAnalysis, summaryAnalysis, jobMatch, missingContent) {
    const points = [];
    if (bulletAnalysis.strongBullets.length >= 2) {
      points.push("Several bullets already read like accomplishments with clear action and visible impact.");
    }
    if (summaryAnalysis.roleLabel) {
      points.push(`The summary points toward a recognizable target area: ${summaryAnalysis.roleLabel}.`);
    }
    if ((jobMatch?.evidenceBackedMatches || []).length >= 3) {
      points.push(`The CV already backs up important target terms such as ${jobMatch.evidenceBackedMatches.slice(0, 3).join(", ")} with real evidence.`);
    }
    if ((data.certificates || []).length >= 3) {
      points.push("The certifications section adds useful credibility for technical roles.");
    }
    if (!missingContent.warnings.some((item) => item.title === "LinkedIn link")) {
      points.push("Core profile contact details are present, which keeps the CV recruiter-ready.");
    }
    return uniqueTextItems(points).slice(0, 5);
  }

  function buildTopProblems(bulletAnalysis, summaryAnalysis, metricAnalysis, genericAnalysis, redundancyAnalysis, missingContent, jobMatch) {
    const problems = [];
    summaryAnalysis.issues.forEach((issue) => problems.push(issue));
    bulletAnalysis.noBulletItems.forEach((issue) => problems.push(issue));
    bulletAnalysis.weakBullets.slice(0, 5).forEach((bullet) => {
      problems.push({
        severity: bullet.dutyOnly ? "warning" : "info",
        title: bullet.itemLabel,
        message: bullet.dutyOnly
          ? "This bullet reads like a duty description with no visible outcome."
          : `This bullet is classified as ${bullet.classification} because ${bullet.issues.join(", ")}.`,
        sectionKey: bullet.sectionKey,
        itemIndex: bullet.itemIndex,
        bulletIndex: bullet.bulletIndex,
        itemKind: bullet.itemKind,
        focusSelector: bullet.focusSelector
      });
    });
    metricAnalysis.missingItems.slice(0, 4).forEach((item) => problems.push(item));
    genericAnalysis.issues.slice(0, 4).forEach((item) => problems.push(item));
    redundancyAnalysis.duplicateSkills.slice(0, 3).forEach((item) => problems.push(item));
    redundancyAnalysis.nearDuplicateBullets.slice(0, 2).forEach((item) => problems.push(item));
    missingContent.warnings.slice(0, 5).forEach((item) => problems.push(item));

    if ((jobMatch?.missingKeywords || []).length >= 4) {
      problems.push({
        severity: "warning",
        title: "Job-match coverage",
        message: `${jobMatch.missingKeywords.length} important job terms are still missing or unsupported.`,
        sectionKey: jobMatch.suggestions?.[0]?.key || "summary",
        itemKind: jobMatch.suggestions?.[0]?.key === "summary" ? "summary-body" : ""
      });
    }

    return problems.sort(compareIssuePriority).slice(0, 10);
  }

  function compareIssuePriority(left, right) {
    const rank = { critical: 3, warning: 2, info: 1 };
    return (rank[right.severity] || 0) - (rank[left.severity] || 0);
  }

  function collectQualityIssues(topProblems, genericAnalysis, redundancyAnalysis, metricAnalysis, missingContent, summaryAnalysis) {
    return [
      ...topProblems,
      ...genericAnalysis.issues,
      ...redundancyAnalysis.duplicateSkills,
      ...redundancyAnalysis.repeatedOpenings,
      ...redundancyAnalysis.nearDuplicateBullets,
      ...metricAnalysis.missingItems,
      ...missingContent.warnings,
      ...summaryAnalysis.issues
    ].filter(Boolean);
  }

  function countIssueSeverities(items) {
    return (items || []).reduce((counts, item) => {
      const key = item.severity || "info";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, { critical: 0, warning: 0, info: 0 });
  }

  function buildQualityAtsMatchReview(jobMatch) {
    if (!jobMatch?.hasJobDescription) {
      return [
        { title: "Baseline ATS readiness", message: jobMatch.summary || "ATS readiness is estimated from resume structure, role clarity, and evidence strength." },
        { title: "Detected focus", message: (jobMatch.domains || []).length ? `Detected domains: ${jobMatch.domains.join(", ")}.` : "No clear domain focus was detected yet." }
      ];
    }

    return [
      { title: "Required and hard-skill coverage", message: jobMatch.requiredSkills.length ? `Required terms include ${jobMatch.requiredSkills.slice(0, 5).join(", ")}.` : "No explicit required-skill block was detected." },
      { title: "Evidence-backed matches", message: jobMatch.evidenceBackedMatches.length ? `Evidence-backed matches: ${jobMatch.evidenceBackedMatches.slice(0, 5).join(", ")}.` : "Most matched terms are not yet strongly supported by experience or projects." },
      { title: "Missing or weakly supported terms", message: jobMatch.missingKeywords.length ? `${jobMatch.missingKeywords.slice(0, 5).join(", ")} still need clearer coverage.` : "Missing keyword pressure is low for this job description." }
    ];
  }

  function buildRecruiterImpression(scores, summaryAnalysis, missingContent, jobMatch) {
    const domains = summaryAnalysis.domains.length ? summaryAnalysis.domains.join(", ") : "technical work";
    const level = detectResumeSeniority(state.data);
    const pressure = missingContent.warnings.filter((item) => item.severity === "warning").length;
    const headline = scores.overall >= 80
      ? "This reads like a credible, targeted CV."
      : scores.overall >= 65
        ? "This reads as a promising CV, but it still needs sharper proof."
        : "This CV shows potential, but the hiring story is still too weak.";
    const detail = pressure >= 3
      ? `It currently reads as a ${level} profile with exposure to ${domains}, but recruiters will still want clearer outcomes, stronger evidence, and tighter targeting.`
      : `It currently reads as a ${level} profile with useful exposure to ${domains}, and the next gains will come from stronger quantified achievements and more explicit relevance.`;
    const jdLine = jobMatch?.hasJobDescription
      ? `For this job, the biggest gap is ${jobMatch.missingKeywords.length ? "missing or weakly supported job terms" : "turning matched terms into stronger evidence"}.`
      : "Without a pasted job description, the current impression is based on general recruiter expectations rather than role-specific matching.";
    return { headline, body: `${detail} ${jdLine}`.trim() };
  }

  function buildRewrittenSuggestions(summaryAnalysis, bulletAnalysis) {
    const suggestions = [];
    if (summaryAnalysis.rewrittenSummary) {
      suggestions.push({
        title: "Professional summary rewrite",
        before: summaryAnalysis.summaryText,
        after: summaryAnalysis.rewrittenSummary,
        sectionKey: "summary",
        itemKind: "summary-body",
        focusSelector: "textarea"
      });
    }
    bulletAnalysis.weakBullets.filter((bullet) => bullet.improvedRewrite).slice(0, 5).forEach((bullet) => {
      suggestions.push({
        title: bullet.itemLabel,
        before: bullet.text,
        after: bullet.improvedRewrite,
        sectionKey: bullet.sectionKey,
        itemIndex: bullet.itemIndex,
        bulletIndex: bullet.bulletIndex,
        itemKind: bullet.itemKind,
        focusSelector: bullet.focusSelector
      });
    });
    return suggestions;
  }

  function parseJobDescriptionInsights(text) {
    const normalized = String(text || "").trim();
    const structured = extractStructuredJobSections(normalized);
    const hardSkills = extractImportantTerms(normalized, documentLanguage).filter((term) => isLikelyHardSkill(term)).slice(0, 14);
    const requiredText = extractSentencesByHint(normalized, /\b(required|must have|need to|requirements|essential)\b/i);
    const preferredText = extractSentencesByHint(normalized, /\b(preferred|nice to have|bonus|plus)\b/i);
    const requiredSkills = uniqueTextItems([
      ...structured.required,
      ...extractImportantTerms(requiredText, documentLanguage).filter((term) => isLikelyHardSkill(term))
    ]).slice(0, 8);
    const preferredSkills = uniqueTextItems([
      ...structured.preferred,
      ...extractImportantTerms(preferredText, documentLanguage).filter((term) => isLikelyHardSkill(term))
    ]).slice(0, 8);
    const softSkills = uniqueTextItems([
      ...structured.soft,
      ...SOFT_SKILL_PHRASES.filter((phrase) => normalized.toLowerCase().includes(phrase))
    ]).slice(0, 8);
    const requiredTerms = collectJobSkillMatchTerms(requiredSkills, "hard");
    const preferredTerms = collectJobSkillMatchTerms(preferredSkills, "hard");
    const softTerms = collectJobSkillMatchTerms(softSkills, "soft");
    const domains = detectDomainsFromText(normalized);
    const seniority = detectSeniorityFromText(normalized);
    const keywordPool = uniqueTextItems([
      ...requiredTerms,
      ...hardSkills.slice(0, 8),
      ...preferredTerms.slice(0, 4),
      ...softTerms
    ]).slice(0, 16);

    return {
      hardSkills,
      requiredSkills,
      preferredSkills,
      softSkills,
      requiredTerms,
      preferredTerms,
      softTerms,
      domains,
      seniority,
      keywordPool,
      summary: domains.length
        ? `Detected ${domains.join(", ")} focus with ${seniority} expectations.`
        : "Detected a role description with mixed technical expectations."
    };
  }

  function extractStructuredJobSections(text) {
    const sections = {
      required: [],
      preferred: [],
      soft: []
    };

    let activeSection = "";
    const lines = String(text || "").split(/\r?\n/g);

    lines.forEach((rawLine) => {
      const line = String(rawLine || "").replace(/\u2022/g, "-").trim();
      if (!line) {
        return;
      }

      const headingMatch = line.match(/^(required|must have|requirements|essential|preferred|nice to have|bonus|plus|soft skills?|communication skills?)\s*:?\s*(.*)$/i);
      if (headingMatch) {
        activeSection = resolveStructuredJobSection(headingMatch[1]);
        pushStructuredJobLine(sections[activeSection], headingMatch[2]);
        return;
      }

      if (/^[A-Za-z][A-Za-z0-9 /&()+-]{1,40}:\s*$/.test(line)) {
        activeSection = "";
        return;
      }

      if (!activeSection) {
        return;
      }

      pushStructuredJobLine(sections[activeSection], line);
    });

    return {
      required: uniqueTextItems(sections.required).slice(0, 8),
      preferred: uniqueTextItems(sections.preferred).slice(0, 8),
      soft: uniqueTextItems(sections.soft).slice(0, 8)
    };
  }

  function resolveStructuredJobSection(label) {
    const normalized = String(label || "").toLowerCase();
    if (/(soft skill|communication skill)/.test(normalized)) {
      return "soft";
    }
    if (/(preferred|nice to have|bonus|plus)/.test(normalized)) {
      return "preferred";
    }
    return "required";
  }

  function pushStructuredJobLine(list, value) {
    const cleaned = String(value || "")
      .replace(/^[-*]\s*/, "")
      .replace(/[.;]+$/g, "")
      .trim();

    if (!cleaned) {
      return;
    }

    list.push(cleaned);
  }

  function collectJobSkillMatchTerms(entries, mode = "hard") {
    const terms = [];

    (entries || []).forEach((entry) => {
      const cleaned = String(entry || "").trim().toLowerCase();
      if (!cleaned) {
        return;
      }

      if (mode === "soft") {
        if (isLikelySoftSkill(cleaned)) {
          terms.push(cleaned);
        }
      } else if (isLikelyHardSkill(cleaned)) {
        terms.push(cleaned);
      }

      extractImportantTerms(cleaned, documentLanguage).forEach((term) => {
        if (mode === "soft" ? isLikelySoftSkill(term) : isLikelyHardSkill(term)) {
          terms.push(term);
        }
      });
    });

    return uniqueTextItems(terms).slice(0, 12);
  }

  function extractSentencesByHint(text, pattern) {
    return String(text || "").split(/[\n.]+/g).filter((part) => pattern.test(part)).join(" ");
  }

  function isLikelyHardSkill(term) {
    const value = String(term || "").toLowerCase();
    return /[+#./-]/.test(value)
      || ENGLISH_SHORT_KEYWORDS.has(value)
      || ["python", "sql", "java", "javascript", "typescript", "react", "node", "firebase", "azure", "vmware", "virtualbox", "linux", "windows", "splunk", "sentinel", "wireshark", "api", "apis", "rest", "incident response", "log analysis", "network security", "technical documentation", "azure fundamentals", "siem monitoring"].includes(value)
      || DOMAIN_KEYWORDS["web development"].includes(value)
      || DOMAIN_KEYWORDS.cybersecurity.includes(value)
      || DOMAIN_KEYWORDS["it support"].includes(value)
      || DOMAIN_KEYWORDS.cloud.includes(value)
      || DOMAIN_KEYWORDS.data.includes(value)
      || DOMAIN_KEYWORDS.devops.includes(value);
  }

  function isLikelySoftSkill(term) {
    const value = String(term || "").toLowerCase().trim();
    return SOFT_SKILL_PHRASES.some((phrase) => phrase === value || phrase.includes(value) || value.includes(phrase));
  }

  function detectDomainsFromText(text) {
    const normalized = String(text || "").toLowerCase();
    return Object.entries(DOMAIN_KEYWORDS)
      .filter(([, keywords]) => keywords.some((keyword) => normalized.includes(keyword)))
      .map(([domain]) => domain)
      .slice(0, 3);
  }

  function detectResumeDomains(data) {
    const corpus = buildResumeSectionCorpus(data, documentLanguage).map((section) => section.text).join(" ");
    return detectDomainsFromText(corpus);
  }

  function detectSeniorityFromText(text) {
    const normalized = String(text || "").toLowerCase();
    if (/\b(principal|staff|head|director)\b/.test(normalized)) return "senior";
    if (/\b(lead|senior|manager)\b/.test(normalized)) return "lead";
    if (/\b(mid|intermediate)\b/.test(normalized)) return "mid";
    if (/\b(intern|entry|junior|graduate)\b/.test(normalized)) return "junior";
    return "junior";
  }

  function detectResumeSeniority(data) {
    const text = [
      data.profile?.title,
      ...((data.professionalExperience || []).map((item) => item.role)),
      ...((data.internships || []).map((item) => item.role))
    ].join(" ");
    return detectSeniorityFromText(text) === "lead" ? "lead-level" : detectSeniorityFromText(text) === "mid" ? "mid-level" : "early-career";
  }

  function buildResumeEvidenceMap(data) {
    const sections = buildResumeSectionCorpus(data, documentLanguage);
    const weights = {
      professionalExperience: 1,
      internships: 0.8,
      projects: 0.95,
      summary: 0.7,
      skills: 0.45,
      certificates: 0.35,
      education: 0.2
    };
    const map = new Map();

    sections.forEach((section) => {
      section.terms.forEach((term) => {
        const current = map.get(term) || { score: 0, sources: [] };
        current.score += Math.round((weights[section.key] || 0.2) * 100);
        if (!current.sources.includes(section.key)) {
          current.sources.push(section.key);
        }
        map.set(term, current);
      });
    });

    return map;
  }

  function buildJobMatchScores(parsedJob, matchedKeywords, missingKeywords, weakEvidenceTerms, bulletAnalysis, summaryText, resumeDomains) {
    const requiredCoverage = parsedJob.requiredTerms.length
      ? matchedKeywords.filter((term) => parsedJob.requiredTerms.includes(term)).length / parsedJob.requiredTerms.length
      : matchedKeywords.length / Math.max(1, parsedJob.keywordPool.length);
    const preferredCoverage = parsedJob.preferredTerms.length
      ? matchedKeywords.filter((term) => parsedJob.preferredTerms.includes(term)).length / parsedJob.preferredTerms.length
      : 0.5;
    const softCoverage = parsedJob.softTerms.length
      ? parsedJob.softTerms.filter((skill) => String(summaryText).toLowerCase().includes(skill) || (state.data.skills?.soft || []).some((entry) => String(entry).toLowerCase().includes(skill))).length / parsedJob.softTerms.length
      : 0.6;
    const evidenceStrength = matchedKeywords.length ? (matchedKeywords.length - weakEvidenceTerms.length) / matchedKeywords.length : 0;
    const roleRelevance = parsedJob.domains.length ? parsedJob.domains.filter((domain) => resumeDomains.includes(domain)).length / parsedJob.domains.length : 0.6;

    return {
      atsMatch: clampScore((requiredCoverage * 45) + (preferredCoverage * 15) + (softCoverage * 10) + (evidenceStrength * 20) + (roleRelevance * 10)),
      recruiterImpact: clampScore((evidenceStrength * 50) + Math.min(50, bulletAnalysis.strongBullets.length * 8)),
      writingStrength: clampScore(100 - (bulletAnalysis.weakBullets.length * 7)),
      evidenceMetrics: clampScore((evidenceStrength * 60) + Math.min(40, bulletAnalysis.bullets.filter((bullet) => bullet.measurableResult).length * 8)),
      roleRelevance: clampScore(roleRelevance * 100)
    };
  }

  function buildBaselineAtsScores(data, bulletAnalysis, domains) {
    const structural = (!String(data.profile?.linkedinHref || "").trim() ? 10 : 0) + (!String(data.summary || "").trim() ? 15 : 0);
    const atsMatch = clampScore(78 - structural + Math.min(18, domains.length * 6));
    return {
      atsMatch,
      recruiterImpact: clampScore(Math.min(85, bulletAnalysis.strongBullets.length * 10 + 35)),
      writingStrength: clampScore(100 - (bulletAnalysis.weakBullets.length * 7)),
      evidenceMetrics: clampScore(Math.min(85, bulletAnalysis.bullets.filter((bullet) => bullet.measurableResult).length * 12 + 20)),
      roleRelevance: clampScore(domains.length ? 70 + (domains.length * 8) : 45)
    };
  }

  function buildBaselineWeakSections(data, bulletAnalysis) {
    return [
      ["summary", state.data.labels.summary, String(data.summary || "").trim() ? 1 : 0],
      ["professionalExperience", state.data.labels.professionalExperience, bulletAnalysis.strongBullets.filter((bullet) => bullet.sectionKey === "professionalExperience").length],
      ["projects", state.data.labels.projects, bulletAnalysis.strongBullets.filter((bullet) => bullet.sectionKey === "projects").length],
      ["skills", state.data.labels.skills, (data.skills?.technical || []).length]
    ]
      .map(([key, label, strength]) => ({ key, label, summary: strength ? `Current evidence signal: ${strength}` : "Coverage is still thin here." }))
      .slice(0, 4);
  }

  function buildBaselineAtsSuggestions(data, bulletAnalysis) {
    const suggestions = [];
    if (!String(data.summary || "").trim()) {
      suggestions.push({ key: "summary", label: state.data.labels.summary, reason: "Add a short targeted summary so the role fit is clear in the first few lines." });
    }
    if (bulletAnalysis.weakBullets.length >= 2) {
      suggestions.push({ key: "professionalExperience", label: state.data.labels.professionalExperience, reason: "Strengthen experience bullets with clearer outcomes and measurable proof." });
    }
    if ((data.skills?.technical || []).length <= 1) {
      suggestions.push({ key: "skills", label: state.data.labels.skills, reason: "Expand tools and platforms only where you can back them up with real work." });
    }
    return suggestions.slice(0, 3);
  }

  function buildBaselineAtsFocusAreas(data, bulletAnalysis) {
    const focus = [];
    if (bulletAnalysis.bullets.filter((bullet) => bullet.measurableResult).length <= 1) {
      focus.push("Add measurable outcomes so the resume reads as evidence-backed rather than duty-based.");
    }
    if (!detectResumeRoleSignals(data, String(data.summary || "").trim()).roleLabel) {
      focus.push("Clarify the target role in the summary so ATS and recruiters read the profile consistently.");
    }
    if (!(data.projects || []).length) {
      focus.push("Projects would help prove technical depth beyond titles and certifications.");
    }
    return focus.slice(0, 4);
  }

  function buildJobWeakSections(data, keywordPool) {
    return buildResumeSectionCorpus(data, documentLanguage)
      .filter((section) => ["summary", "professionalExperience", "internships", "projects", "skills"].includes(section.key))
      .map((section) => {
        const matchedCount = keywordPool.filter((term) => section.terms.has(term)).length;
        return {
          key: section.key,
          label: section.label,
          matchedCount,
          summary: locale.atsCoverageSummary.replace("{matched}", String(matchedCount)).replace("{total}", String(keywordPool.length || 0))
        };
      })
      .sort((left, right) => left.matchedCount - right.matchedCount || left.label.localeCompare(right.label))
      .slice(0, 4);
  }

  function buildJobMatchFocusAreas(parsedJob, missingKeywords, weakEvidenceTerms, bulletAnalysis, resumeDomains) {
    const areas = [];
    if (parsedJob.domains.length && !parsedJob.domains.some((domain) => resumeDomains.includes(domain))) {
      areas.push(`The job emphasizes ${parsedJob.domains.join(", ")}, but the current CV does not show that focus clearly enough.`);
    }
    if (missingKeywords.length) {
      areas.push(`Add or support missing terms such as ${missingKeywords.slice(0, 4).join(", ")} where they are genuinely true.`);
    }
    if (weakEvidenceTerms.length) {
      areas.push(`Terms like ${weakEvidenceTerms.slice(0, 3).map((item) => item.term).join(", ")} appear weakly supported and would benefit from bullet-level proof.`);
    }
    if (bulletAnalysis.bullets.filter((bullet) => bullet.measurableResult).length <= 1) {
      areas.push("Matched keywords will carry more weight if the bullets also show quantified evidence.");
    }
    return areas.slice(0, 5);
  }

  function getTopResumeTerms(data, mode = "all", limit = 8) {
    const sections = buildResumeSectionCorpus(data, documentLanguage);
    const filtered = mode === "skills" ? sections.filter((section) => section.key === "skills") : sections;
    return uniqueTextItems(filtered.flatMap((section) => Array.from(section.terms))).slice(0, limit);
  }

  function getSectionItemLabel(sectionKey, item, itemIndex) {
    const title = sectionKey === "projects"
      ? item?.title
      : sectionKey === "education"
        ? item?.degree || item?.institution
        : item?.organization || item?.role || item?.title;
    return `${state.data.labels[sectionKey] || sectionKey} ${itemIndex + 1}${title ? `: ${title}` : ""}`;
  }

  function detectResumeRoleSignals(data, summaryText) {
    const text = [data.profile?.title, summaryText].filter(Boolean).join(" ");
    const match = ROLE_HINT_PATTERNS.find((entry) => entry.pattern.test(text));
    return { roleLabel: match ? match.label : "" };
  }

  function isSummaryTooBroad(text) {
    const terms = extractImportantTerms(text, documentLanguage);
    return countWords(text) >= 18 && terms.length < 5;
  }

  function buildSharperSummaryGuidance(summaryText, data) {
    const role = detectResumeRoleSignals(data, summaryText).roleLabel || "your target role";
    const domains = detectResumeDomains(data);
    const tools = getTopResumeTerms(data, "skills", 4);
    return `Make the summary more specific by naming ${role}, ${domains.length ? domains.join(" / ") : "your main domain"}, and concrete strengths such as ${tools.join(", ")}.`;
  }

  function rewriteProfessionalSummary(data, jobMatch) {
    const role = detectResumeRoleSignals(data, String(data.summary || "")).roleLabel || "Technical candidate";
    const domains = detectResumeDomains(data);
    const tools = getTopResumeTerms(data, "skills", 5);
    const topProject = (data.projects || [])[0]?.title || "";
    const topExperience = (data.professionalExperience || [])[0]?.role || "";
    const parts = [];
    parts.push(`${role} with experience across ${domains.length ? domains.join(", ") : "software, systems, and technical problem-solving"}.`);
    if (topExperience || topProject) {
      parts.push(`Built relevant evidence through ${[topExperience, topProject].filter(Boolean).join(" and ")}.`);
    }
    if (tools.length) {
      parts.push(`Strong foundation in ${tools.join(", ")}.`);
    }
    if (jobMatch?.hasJobDescription && jobMatch.domains.length) {
      parts.push(`Aligned with ${jobMatch.domains.join(", ")} work when supported by real project and experience evidence.`);
    }
    return uniqueTextItems(parts).join(" ");
  }

  function detectNearDuplicateBullets(bullets) {
    const duplicates = [];
    for (let leftIndex = 0; leftIndex < bullets.length; leftIndex += 1) {
      const left = bullets[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < bullets.length; rightIndex += 1) {
        const right = bullets[rightIndex];
        if (left.sectionKey !== right.sectionKey) {
          continue;
        }
        const similarity = calculateBulletSimilarity(left.text, right.text);
        if (similarity >= 0.72) {
          duplicates.push({
            severity: "info",
            title: "Similar bullets",
            message: "These bullets appear to repeat the same idea with slightly different wording. Consolidate them if they are describing the same result.",
            sectionKey: left.sectionKey,
            itemIndex: left.itemIndex,
            bulletIndex: left.bulletIndex,
            itemKind: left.itemKind,
            focusSelector: left.focusSelector
          });
          break;
        }
      }
    }
    return duplicates.slice(0, 3);
  }

  function calculateBulletSimilarity(leftText, rightText) {
    const leftTokens = new Set(extractImportantTerms(leftText, documentLanguage));
    const rightTokens = new Set(extractImportantTerms(rightText, documentLanguage));
    const intersection = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
    const union = new Set([...leftTokens, ...rightTokens]).size || 1;
    return intersection / union;
  }

  function analyzeResumeStrengthSignals(data, summaryText, bulletSections) {
    const weakActionBullets = [];
    const genericBullets = [];
    const metriclessItems = [];
    let totalBullets = 0;
    let metricBullets = 0;

    bulletSections.forEach(([sectionKey, items]) => {
      items.forEach((item, itemIndex) => {
        const bullets = Array.isArray(item?.bullets) ? item.bullets : [];
        const itemKind = getPreviewItemKindForSection(sectionKey);
        let itemHasMetric = false;

        bullets.forEach((bullet, bulletIndex) => {
          const text = String(bullet || "").trim();
          if (!text) {
            return;
          }

          totalBullets += 1;

          if (hasMetricEvidence(text)) {
            metricBullets += 1;
            itemHasMetric = true;
          }

          const suggestion = suggestStrongerActionVerb(text);
          if (suggestion) {
            weakActionBullets.push({
              sectionKey,
              itemIndex,
              bulletIndex,
              itemKind,
              suggestion,
              focusSelector: `.editor-bullets__row:nth-of-type(${bulletIndex + 1}) textarea`
            });
          }

          const genericReason = detectGenericBulletReason(text);
          if (genericReason) {
            genericBullets.push({
              sectionKey,
              itemIndex,
              bulletIndex,
              itemKind,
              reason: genericReason,
              focusSelector: `.editor-bullets__row:nth-of-type(${bulletIndex + 1}) textarea`
            });
          }
        });

        if (bullets.length && !itemHasMetric) {
          metriclessItems.push({
            sectionKey,
            itemIndex,
            itemKind,
            focusSelector: ".editor-bullets__row:nth-of-type(1) textarea"
          });
        }
      });
    });

    const summaryGenericPhrase = detectGenericSummaryPhrase(summaryText);
    const summarySpecificTerms = extractImportantTerms(summaryText, documentLanguage);

    return {
      totalBullets,
      metricBullets,
      metriclessItems,
      weakActionBullets,
      genericBullets,
      duplicateSkills: detectDuplicateSkills(data.skills || {}),
      summaryGenericPhrase,
      summaryIsGeneric: Boolean(
        summaryText
        && (
          summaryGenericPhrase
          || (countWords(summaryText) >= 18 && summarySpecificTerms.length < 5)
        )
      )
    };
  }

  function hasMetricEvidence(text) {
    const normalized = String(text || "").toLowerCase();
    return /\b\d+(?:\.\d+)?\s*(?:%|x|k|m|b|ms|sec|secs|seconds?|mins?|minutes?|hours?|days?|weeks?|months?|years?|users?|customers?|clients?|tickets?|requests?|projects?|features?|systems?|servers?|devices?|alerts?|incidents?|dashboards?|apps?|pages?)\b/.test(normalized)
      || /\b(?:dozens?|hundreds?|thousands?)\s+of\b/.test(normalized)
      || /\b(?:reduced|increased|improved|cut|saved|lowered|boosted|grew)\b[^.]{0,30}\b(?:by|from)\b/.test(normalized)
      || /\b(?:cost|budget|latency|load time|throughput|uptime)\b[^.]{0,20}\b(?:improved|reduced|increased|cut|saved)\b/.test(normalized);
  }

  function suggestStrongerActionVerb(text) {
    const normalized = String(text || "").trim();
    if (!normalized) {
      return "";
    }

    const directRule = WEAK_ACTION_VERB_RULES.find((rule) => rule.pattern.test(normalized));
    if (directRule) {
      return pickSuggestedActionVerb(normalized, directRule.suggestion);
    }

    if (/^[a-z]+ing\b/i.test(normalized)) {
      return pickSuggestedActionVerb(normalized, "Built");
    }

    return "";
  }

  function pickSuggestedActionVerb(text, fallback) {
    const normalized = String(text || "").toLowerCase();
    if (/\b(security|incident|threat|log|siem|monitor|honeypot|firewall)\b/.test(normalized)) {
      return "Secured";
    }
    if (/\b(support|troubleshoot|ticket|device|endpoint|network|server)\b/.test(normalized)) {
      return "Resolved";
    }
    if (/\b(document|workflow|process|efficiency)\b/.test(normalized)) {
      return "Streamlined";
    }
    if (/\b(feature|platform|application|app|backend|frontend|api|database|system)\b/.test(normalized)) {
      return "Built";
    }
    if (/\b(analysis|analyzed|report|logs|research|investigation)\b/.test(normalized)) {
      return "Analyzed";
    }
    return fallback;
  }

  function detectGenericSummaryPhrase(text) {
    return findGenericPhrase(text, GENERIC_SUMMARY_PHRASES);
  }

  function detectGenericBulletReason(text) {
    const matchedPhrase = findGenericPhrase(text, GENERIC_BULLET_PHRASES);
    if (matchedPhrase) {
      return matchedPhrase;
    }

    const importantTerms = extractImportantTerms(text, documentLanguage);
    if (!hasMetricEvidence(text) && countWords(text) < 14 && importantTerms.length < 4) {
      return locale.qualityGenericFallback;
    }

    return "";
  }

  function findGenericPhrase(text, phrases) {
    const normalized = String(text || "").toLowerCase();
    return phrases.find((phrase) => normalized.includes(String(phrase || "").toLowerCase())) || "";
  }

  function detectDuplicateSkills(skills) {
    const registry = new Map();
    const duplicates = [];

    const register = (rawValue, meta) => {
      const display = String(rawValue || "").trim();
      const normalized = normalizeSkillToken(display);
      if (!normalized || normalized.length < 2) {
        return;
      }

      const existing = registry.get(normalized);
      if (!existing) {
        registry.set(normalized, {
          display,
          meta
        });
        return;
      }

      if (!duplicates.some((item) => item.key === normalized)) {
        duplicates.push({
          key: normalized,
          display: existing.display || display,
          sectionKey: existing.meta.sectionKey,
          itemIndex: existing.meta.itemIndex,
          itemKind: existing.meta.itemKind,
          focusSelector: existing.meta.focusSelector
        });
      }
    };

    (skills.technical || []).forEach((entry, itemIndex) => {
      splitSkillValues(entry?.items).forEach((value) => {
        register(value, {
          sectionKey: "skills",
          itemIndex,
          itemKind: "technical-skill",
          focusSelector: "textarea"
        });
      });
    });

    (skills.soft || []).forEach((entry, itemIndex) => {
      register(entry, {
        sectionKey: "softSkills",
        itemIndex,
        itemKind: "soft-skill",
        focusSelector: "input"
      });
    });

    return duplicates;
  }

  function splitSkillValues(text) {
    return String(text || "")
      .split(/[\r\n,;|•]+/g)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  function normalizeSkillToken(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/\s+/g, " ")
      .replace(/^[^a-z0-9\u0600-\u06FF+#./-]+|[^a-z0-9\u0600-\u06FF+#./-]+$/gi, "")
      .trim();
  }

  function analyzeJobDescription(data, jobDescription) {
    return analyzeJobMatch(data, jobDescription);
  }

  function buildResumeSectionCorpus(data, language) {
    return [
      { key: "summary", label: state.data.labels.summary, text: isSectionVisibleInData(data, "summary") ? (data.summary || "") : "" },
      {
        key: "professionalExperience",
        label: state.data.labels.professionalExperience,
        text: isSectionVisibleInData(data, "professionalExperience") ? joinWorkSection(data.professionalExperience) : ""
      },
      {
        key: "internships",
        label: state.data.labels.internships,
        text: isSectionVisibleInData(data, "internships") ? joinWorkSection(data.internships) : ""
      },
      {
        key: "projects",
        label: state.data.labels.projects,
        text: isSectionVisibleInData(data, "projects")
          ? (data.projects || [])
          .map((item) => [item.date, item.title, ...(item.bullets || [])].join(" "))
          .join(" ")
          : ""
      },
      {
        key: "education",
        label: state.data.labels.education,
        text: isSectionVisibleInData(data, "education")
          ? (data.education || [])
          .map((item) => [item.date, item.location, item.degree, item.institution].join(" "))
          .join(" ")
          : ""
      },
      {
        key: "certificates",
        label: state.data.labels.certificates,
        text: isSectionVisibleInData(data, "certificates")
          ? (data.certificates || [])
          .map((item) => [item.title, item.description].join(" "))
          .join(" ")
          : ""
      },
      {
        key: "skills",
        label: state.data.labels.skills,
        text: [
          ...(isSectionVisibleInData(data, "skills") ? (data.skills?.technical || []).map((item) => [item.label, item.items].join(" ")) : []),
          ...(isSectionVisibleInData(data, "softSkills") ? (data.skills?.soft || []) : [])
        ].join(" ")
      }
    ].map((section) => ({
      ...section,
      terms: new Set(extractImportantTerms(section.text, language))
    }));
  }

  function joinWorkSection(items) {
    return (items || [])
      .map((item) => [item.date, item.location, item.organization, item.role, ...(item.bullets || [])].join(" "))
      .join(" ");
  }

  function buildAtsSuggestions(sections, missingKeywords) {
    if (!missingKeywords.length) {
      return [];
    }

    const sectionMap = new Map(sections.map((section) => [section.key, section]));
    const suggestions = [];

    const summaryKeywords = missingKeywords.filter((term) => !sectionMap.get("summary")?.terms.has(term)).slice(0, 3);
    if (summaryKeywords.length) {
      suggestions.push({
        key: "summary",
        label: state.data.labels.summary,
        reason: buildSuggestionReason("summary", summaryKeywords)
      });
    }

    const experienceKeywords = missingKeywords
      .filter((term) => !sectionMap.get("professionalExperience")?.terms.has(term))
      .slice(0, 4);
    if (experienceKeywords.length) {
      suggestions.push({
        key: "professionalExperience",
        label: state.data.labels.professionalExperience,
        reason: buildSuggestionReason("professionalExperience", experienceKeywords)
      });
    }

    const skillKeywords = missingKeywords.filter((term) => !sectionMap.get("skills")?.terms.has(term)).slice(0, 4);
    if (skillKeywords.length) {
      suggestions.push({
        key: "skills",
        label: state.data.labels.skills,
        reason: buildSuggestionReason("skills", skillKeywords)
      });
    }

    return suggestions.slice(0, 3);
  }

  function buildAtsFocusAreas(sections, missingKeywords, resumeSignals = {}) {
    if (!missingKeywords.length) {
      const signalOnly = buildAtsSignalFocusAreas(resumeSignals);
      return signalOnly.slice(0, 5);
    }

    const sectionMap = new Map(sections.map((section) => [section.key, section]));
    const focusAreas = [];

    const summaryTerms = missingKeywords.filter((term) => !sectionMap.get("summary")?.terms.has(term)).slice(0, 3);
    if (summaryTerms.length) {
      focusAreas.push(buildFocusMessage("summary", summaryTerms));
    }

    const experienceTerms = missingKeywords
      .filter((term) => !sectionMap.get("professionalExperience")?.terms.has(term))
      .slice(0, 4);
    if (experienceTerms.length) {
      focusAreas.push(buildFocusMessage("professionalExperience", experienceTerms));
    }

    const skillTerms = missingKeywords.filter((term) => !sectionMap.get("skills")?.terms.has(term)).slice(0, 4);
    if (skillTerms.length) {
      focusAreas.push(buildFocusMessage("skills", skillTerms));
    }

    return uniqueTextItems(focusAreas.concat(buildAtsSignalFocusAreas(resumeSignals))).slice(0, 5);
  }

  function buildAtsSignalFocusAreas(resumeSignals = {}) {
    const focusAreas = [];

    if (resumeSignals.summaryIsGeneric) {
      focusAreas.push(locale.atsGenericSummaryFocus);
    }

    if ((resumeSignals.metriclessItems || []).length >= 2 || ((resumeSignals.totalBullets || 0) >= 4 && (resumeSignals.metricBullets || 0) <= 1)) {
      focusAreas.push(locale.atsMetricFocus);
    }

    if ((resumeSignals.weakActionBullets || []).length >= 2) {
      const suggestion = resumeSignals.weakActionBullets[0]?.suggestion || "Led";
      focusAreas.push(locale.atsActionVerbFocus.replace("{suggestion}", suggestion));
    }

    if ((resumeSignals.duplicateSkills || []).length) {
      focusAreas.push(locale.atsDuplicateSkillsFocus.replace("{skill}", resumeSignals.duplicateSkills[0].display || "a repeated skill"));
    }

    if ((resumeSignals.genericBullets || []).length) {
      focusAreas.push(locale.atsGenericBulletsFocus);
    }

    return uniqueTextItems(focusAreas);
  }

  function uniqueTextItems(items) {
    const seen = new Set();
    return (items || []).filter((item) => {
      const normalized = String(item || "").trim();
      if (!normalized || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
  }

  function buildSuggestionReason(sectionKey, keywords) {
    const joined = formatKeywordList(keywords);

    if (documentLanguage === "ar") {
      if (sectionKey === "summary") {
        return `\u0623\u0628\u0631\u0632 ${joined} \u0641\u064a \u0627\u0644\u0645\u0644\u062e\u0635 \u0628\u0634\u0643\u0644 \u0645\u0628\u0627\u0634\u0631 \u062d\u062a\u0649 \u064a\u0638\u0647\u0631 \u0645\u0646 \u0623\u0648\u0644 \u0642\u0631\u0627\u0621\u0629.`;
      }
      if (sectionKey === "professionalExperience") {
        return `\u0623\u0636\u0641 ${joined} \u0625\u0644\u0649 \u0625\u0646\u062c\u0627\u0632\u0627\u062a \u0627\u0644\u062e\u0628\u0631\u0629 \u0628\u0623\u0645\u062b\u0644\u0629 \u0639\u0645\u0644\u064a\u0629.`;
      }
      return `\u0623\u0648\u0636\u062d ${joined} \u0641\u064a \u0642\u0633\u0645 \u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062a \u0625\u0630\u0627 \u0643\u0627\u0646\u062a \u0644\u062f\u064a\u0643 \u062e\u0628\u0631\u0629 \u062d\u0642\u064a\u0642\u064a\u0629 \u0628\u0647\u0627.`;
    }

    if (sectionKey === "summary") {
      return `Mention ${joined} directly in the summary so the fit is clear at first glance.`;
    }
    if (sectionKey === "professionalExperience") {
      return `Surface ${joined} in accomplishment bullets under professional experience.`;
    }
    return `Add ${joined} to the skills section if you can support them with real experience.`;
  }

  function buildFocusMessage(sectionKey, keywords) {
    const joined = formatKeywordList(keywords);

    if (documentLanguage === "ar") {
      if (sectionKey === "summary") {
        return `\u0627\u0644\u0645\u0644\u062e\u0635: \u0627\u0630\u0643\u0631 ${joined} \u0628\u0639\u0628\u0627\u0631\u0629 \u0642\u0635\u064a\u0631\u0629 \u0648\u0648\u0627\u0636\u062d\u0629.`;
      }
      if (sectionKey === "professionalExperience") {
        return `\u0627\u0644\u062e\u0628\u0631\u0629 \u0627\u0644\u0645\u0647\u0646\u064a\u0629: \u062d\u0648\u0644 ${joined} \u0625\u0644\u0649 \u0646\u0642\u0627\u0637 \u0625\u0646\u062c\u0627\u0632 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u0642\u064a\u0627\u0633 \u0639\u0646\u062f \u0625\u0645\u0643\u0627\u0646.`;
      }
      return `\u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062a: \u0623\u0636\u0641 ${joined} \u0625\u0630\u0627 \u0643\u0627\u0646\u062a \u0645\u062f\u0639\u0648\u0645\u0629 \u0628\u062e\u0628\u0631\u0629 \u0641\u0639\u0644\u064a\u0629.`;
    }

    if (sectionKey === "summary") {
      return `Summary: mention ${joined} in a short, direct line.`;
    }
    if (sectionKey === "professionalExperience") {
      return `Professional experience: turn ${joined} into measurable accomplishment bullets where possible.`;
    }
    return `Skills: add ${joined} only if you can back them up in the resume.`;
  }

  function formatKeywordList(keywords) {
    return keywords.join(documentLanguage === "ar" ? "\u060c " : ", ");
  }

  function detectDominantLanguage(text) {
    const arabicCount = (text.match(/[\u0600-\u06FF]/g) || []).length;
    const latinCount = (text.match(/[A-Za-z]/g) || []).length;

    if (arabicCount >= 20 && arabicCount > latinCount * 0.6) {
      return "ar";
    }

    if (latinCount >= 20 && latinCount > arabicCount * 1.2) {
      return "en";
    }

    return "unknown";
  }

  function extractImportantTerms(text, language) {
    const tokens = tokenizeText(text);
    const counts = new Map();

    tokens.forEach((token) => {
      const normalized = normalizeToken(token);
      if (!normalized || !isImportantToken(normalized, language)) {
        return;
      }
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    });

    return [...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([term]) => term);
  }

  function tokenizeText(text) {
    return String(text || "").match(/[A-Za-z][A-Za-z0-9+#./-]*|[\u0600-\u06FF]{2,}/g) || [];
  }

  function normalizeToken(token) {
    return String(token || "")
      .toLowerCase()
      .replace(/^[^a-z0-9\u0600-\u06FF+#]+|[^a-z0-9\u0600-\u06FF+#]+$/gi, "");
  }

  function isImportantToken(token, language) {
    if (!token || /^\d+$/.test(token)) {
      return false;
    }

    if (/[\u0600-\u06FF]/.test(token) || language === "ar") {
      return token.length >= 2 && !ARABIC_STOPWORDS.has(token);
    }

    if (ENGLISH_SHORT_KEYWORDS.has(token)) {
      return true;
    }

    return token.length >= 3 && !ENGLISH_STOPWORDS.has(token);
  }

  function renderPreview() {
    window.clearTimeout(renderTimer);
    applyStylePreset();
    root.innerHTML = "";
    if (getPreviewDocumentType() === "cover-letter") {
      const blocks = buildCoverLetterBlocks();
      paginate(blocks, "sheet--cover-letter");
      syncQualityPreviewHighlight();
      return;
    }

    const blocks = buildBlocks(state.data);
    paginate(blocks);
    fitHeroContactRows();
    syncQualityPreviewHighlight();
  }

  function fitHeroContactRows() {
    if (!root) {
      return;
    }

    root.querySelectorAll(".hero__contact-row").forEach((row) => {
      if (!(row instanceof HTMLElement)) {
        return;
      }

      const isArabicRow = document.documentElement.dir === "rtl";
      if (isArabicRow) {
        fitArabicHeroContactRow(row);
        return;
      }

      const fitClasses = [
        "is-contact-fit-1",
        "is-contact-fit-2",
        "is-contact-fit-3",
        "is-contact-fit-4"
      ];

      fitClasses.forEach((className) => row.classList.remove(className));
      if (row.scrollWidth <= row.clientWidth + 1) {
        return;
      }

      for (const className of fitClasses) {
        row.classList.add(className);
        if (row.scrollWidth <= row.clientWidth + 1) {
          return;
        }
      }
    });
  }

  function fitArabicHeroContactRow(row) {
    const screenClasses = [
      "is-contact-compact-1",
      "is-contact-compact-2",
      "is-contact-wrap",
      "is-contact-safe-1",
      "is-contact-safe-2",
      "is-contact-fit-1",
      "is-contact-fit-2",
      "is-contact-fit-3",
      "is-contact-fit-4"
    ];

    screenClasses.forEach((className) => row.classList.remove(className));

    if (document.body.classList.contains("is-printing")) {
      return;
    }

    if (row.scrollWidth <= row.clientWidth + 1) {
      return;
    }

    row.classList.add("is-contact-compact-1");
    if (row.scrollWidth <= row.clientWidth + 1) {
      return;
    }

    row.classList.add("is-contact-compact-2");
    if (row.scrollWidth <= row.clientWidth + 1) {
      return;
    }

    row.classList.add("is-contact-wrap");
    if (row.scrollWidth <= row.clientWidth + 1 || row.scrollHeight <= row.clientHeight + 28) {
      return;
    }

    row.classList.add("is-contact-safe-1");
    if (row.scrollWidth <= row.clientWidth + 1 || row.scrollHeight <= row.clientHeight + 28) {
      return;
    }

    row.classList.add("is-contact-safe-2");
  }

  function buildBlocks(data) {
    const blocks = [];
    getOrderedResumeSections(data).forEach((entry, sectionOrder) => {
      switch (entry.key) {
        case "profile":
          blocks.push(createHeroBlock(data));
          break;
        case "summary":
          blocks.push(
            createSectionTitle(entry.title, true, { sectionKey: "summary", sectionOrder }),
            applyPreviewTarget(element("p", "summary-text", data.summary), {
              sectionKey: "summary",
              itemKind: "summary-body",
              label: `${entry.title}: ${data.summary || ""}`.trim(),
              focusSelector: "textarea"
            })
          );
          break;
        case "professionalExperience":
          blocks.push(
            createSectionTitle(entry.title, true, { sectionKey: "professionalExperience", sectionOrder }),
            ...data.professionalExperience.map((item, index) => renderWorkItem(item, "professionalExperience", index))
          );
          break;
        case "internships":
          blocks.push(
            createSectionTitle(entry.title, true, { sectionKey: "internships", sectionOrder }),
            ...data.internships.map((item, index) => renderWorkItem(item, "internships", index))
          );
          break;
        case "projects":
          blocks.push(
            createSectionTitle(entry.title, true, { sectionKey: "projects", sectionOrder }),
            ...data.projects.map((item, index) => renderProjectItem(item, index))
          );
          break;
        case "education":
          if ((data.meta?.lang || "").toLowerCase() === "en") {
            blocks.push(createForceBreak());
          }
          blocks.push(
            createSectionTitle(entry.title, true, { sectionKey: "education", sectionOrder }),
            ...data.education.map((item, index) => renderEducationItem(item, index))
          );
          break;
        case "certificates":
          blocks.push(
            createSectionTitle(entry.title, true, { sectionKey: "certificates", sectionOrder }),
            ...createCertificateCards(data.certificates)
          );
          break;
        case "skills":
          blocks.push(
            createSectionTitle(entry.title, true, { sectionKey: "skills", sectionOrder }),
            createTechnicalSkillsBlock(data.skills.technical)
          );
          break;
        case "softSkills":
          blocks.push(
            createSectionTitle(entry.title, true, { sectionKey: "softSkills", sectionOrder }),
            createSoftSkillsBlock(data.skills.soft)
          );
          break;
        default:
          if (isCustomSectionKey(entry.key) && entry.section) {
            blocks.push(
              createSectionTitle(entry.title, true, { sectionKey: entry.key, sectionOrder }),
              createCustomSectionPreviewBlock(entry.section)
            );
          }
          break;
      }
    });
    return blocks;
  }

  function buildCoverLetterBlocks() {
    const letter = normalizeCoverLetter(state.coverLetter, state.data.profile?.name);
    const blocks = [];

    blocks.push(createCoverLetterHeader(letter));
    blocks.push(createCoverLetterRecipient(letter));

    if (letter.targetRole) {
      blocks.push(createCoverLetterSubject(letter.targetRole));
    }

    blocks.push(element("p", "cover-letter-paragraph", buildCoverLetterGreeting(letter)));

    [letter.opening, ...splitParagraphs(letter.body), letter.closing]
      .filter((value) => String(value || "").trim())
      .forEach((paragraph) => blocks.push(element("p", "cover-letter-paragraph", paragraph)));

    blocks.push(createCoverLetterSignature(letter));
    return blocks;
  }

  function paginate(blocks, pageClass = "") {
    let page = appendPage(true, pageClass);

    blocks.forEach((block) => {
      if (block.dataset.forcePageBreak === "true") {
        if (page.body.children.length > 0) {
        page = appendPage(false, pageClass);
        }
        return;
      }

      page.body.appendChild(block);

      if (!overflows(page.body)) {
        return;
      }

      page.body.removeChild(block);
      let carryHeader = null;
      const last = page.body.lastElementChild;

      if (last && last.dataset.keepWithNext === "true") {
        carryHeader = last;
        page.body.removeChild(last);
      }

      page = appendPage(false, pageClass);

      if (carryHeader) {
        page.body.appendChild(carryHeader);
      }

      page.body.appendChild(block);
    });
  }

  function appendPage(isFirstPage, extraClass = "") {
    const flowClass = isFirstPage ? "sheet--first" : "sheet--flow";
    const sheet = createSheet(`${flowClass} ${extraClass}`.trim());
    root.appendChild(sheet);
    return { sheet, body: sheet.querySelector(".sheet__body") };
  }

  function createHeroBlock(data) {
    const hero = document.createElement("header");
    hero.className = "hero";
    const photoMarkup = String(data.profile.photo || "").trim()
      ? `
      <div class="hero__photo-wrap">
        <img class="hero__photo" src="${escapeHtml(data.profile.photo || "")}" alt="${escapeHtml(data.profile.name)}">
      </div>`
      : "";
    const contacts = [
      contactLink("email", `mailto:${data.profile.email}`, data.profile.email),
      contactLink("phone", data.profile.phoneHref || "#", data.profile.phone),
      contactLink("location", "#", data.profile.location, true),
      contactLink("linkedin", data.profile.linkedinHref || "#", data.profile.linkedinLabel),
      contactLink("github", data.profile.githubHref || "#", data.profile.githubLabel),
      contactLink("portfolio", data.profile.portfolioHref || "#", data.profile.portfolioLabel)
    ].filter(Boolean).join("");
    hero.innerHTML = `
      ${photoMarkup}
      <h1 class="hero__name">${escapeHtml(data.profile.name)}</h1>
      <div class="hero__contact-row">
        ${contacts}
      </div>
    `;
    const photoTarget = hero.querySelector(".hero__photo-wrap");
    if (photoTarget) {
      applyPreviewTarget(photoTarget, {
        sectionKey: "profile",
        label: locale.profileSectionTitle,
        focusSelector: "input"
      });
    }
    const nameTarget = hero.querySelector(".hero__name");
    if (nameTarget instanceof HTMLElement) {
      applyPreviewTarget(nameTarget, {
        sectionKey: "profile",
        label: data.profile.name || locale.profileSectionTitle,
        focusSelector: "input"
      });
    }
    return hero;
  }

  function renderWorkItem(item, sectionKey, itemIndex) {
    return createTimelineItem({
      asideTop: item.date,
      asideBottom: item.location,
      title: item.organization,
      subtitle: item.role,
      bullets: item.bullets,
      sectionKey,
      itemIndex,
      itemKind: "timeline-item"
    });
  }

  function renderProjectItem(item, itemIndex) {
    return createTimelineItem({
      asideTop: item.date,
      title: item.title,
      linkLabel: item.linkLabel,
      linkHref: item.linkHref,
      bullets: item.bullets,
      sectionKey: "projects",
      itemIndex,
      itemKind: "project"
    });
  }

  function renderEducationItem(item, itemIndex) {
    return createTimelineItem({
      asideTop: item.date,
      asideBottom: item.location,
      title: item.degree,
      subtitle: item.institution,
      sectionKey: "education",
      itemIndex,
      itemKind: "education"
    });
  }

  function createTimelineItem({ asideTop, asideBottom, title, subtitle, linkLabel, linkHref, bullets, sectionKey = "", itemIndex = null, itemKind = "" }) {
    const item = document.createElement("article");
    item.className = "timeline-item";

    const aside = document.createElement("div");
    aside.className = "timeline-item__meta";
    aside.append(element("div", "timeline-item__date", asideTop || ""));
    if (asideBottom) {
      aside.append(element("div", "timeline-item__location", asideBottom));
    }

    const content = document.createElement("div");
    content.className = "timeline-item__content";
    content.append(element("h3", "timeline-item__title", title || ""));

    if (subtitle) {
      content.append(element("p", "timeline-item__subtitle", subtitle));
    }

    const linkNode = createTimelineLink(linkLabel, linkHref);
    if (linkNode) {
      content.append(linkNode);
    }

    if (bullets && bullets.length) {
      content.append(createBulletList(bullets));
    }

    item.append(aside, content);
    return applyPreviewTarget(item, {
      sectionKey,
      itemIndex,
      itemKind,
      label: [title, subtitle].filter(Boolean).join(" - "),
      reorderList: getPreviewReorderList(sectionKey, itemKind)
    });
  }

  function createTimelineLink(label, href) {
    const safeLabel = String(label || "").trim();
    const safeHref = String(href || "").trim();
    if (!safeLabel && !safeHref) {
      return null;
    }

    const node = document.createElement(safeHref ? "a" : "p");
    node.className = "timeline-item__link";
    node.textContent = safeLabel || safeHref;
    if (safeHref) {
      node.href = safeHref;
      node.target = "_blank";
      node.rel = "noreferrer";
    }
    return node;
  }

  function createCertificateCards(certificates, options = {}) {
    const sectionKey = options.sectionKey || "certificates";
    const itemKind = options.itemKind || "certificate";
    const reorderList = options.reorderList || getPreviewReorderList(sectionKey, itemKind);

    return certificates.map((certificate, index) => {
      const card = document.createElement("article");
      const title = String(certificate.title || "");
      const description = String(certificate.description || "");
      const splitMatch = title.match(/^(.*?)(?:\s*\|\s*(\d{4}))$/);
      const displayTitle = splitMatch ? splitMatch[1].trim() : title.trim();
      const displayDate = splitMatch ? splitMatch[2].trim() : "";
      card.className = `certificate-card${documentLanguage === "ar" ? " certificate-card--stacked" : ""}`;
      if (documentLanguage === "ar") {
        const titleLine = displayDate
          ? `<span class="certificate-card__date">${escapeHtml(displayDate)}</span>`
          : "";
        card.innerHTML = `
          <p class="certificate-card__title" dir="ltr">
            <strong>${escapeHtml(displayTitle)}</strong>
            ${titleLine}
          </p>
          <p class="certificate-card__description">${escapeHtml(description)}</p>
        `;
      } else {
        card.innerHTML = `
          <p class="certificate-card__text">
            <strong>${escapeHtml(title)}</strong>
            <span class="certificate-card__dash"> - </span>
            <span>${escapeHtml(description)}</span>
          </p>
        `;
      }
      return applyPreviewTarget(card, {
        sectionKey,
        itemIndex: index,
        itemKind,
        label: title,
        reorderList
      });
    });
  }

  function createTechnicalSkillsBlock(skills) {
    const list = document.createElement("ul");
    list.className = "skill-list technical-skill-list";

    skills.forEach((skill, index) => {
      const item = document.createElement("li");
      item.className = "skill-list__item";
      item.innerHTML = `<strong>${escapeHtml(skill.label || "")}:</strong> ${escapeHtml(skill.items || "")}`;
      list.appendChild(
        applyPreviewTarget(item, {
          sectionKey: "skills",
          itemIndex: index,
          itemKind: "technical-skill",
          label: `${skill.label || ""}: ${skill.items || ""}`.trim(),
          reorderList: getPreviewReorderList("skills", "technical-skill")
        })
      );
    });

    return list;
  }

  function createSoftSkillsBlock(skills) {
    const panel = document.createElement("section");
    panel.className = "soft-skills-panel";

    const table = document.createElement("table");
    table.className = "soft-skill-table";

    const body = document.createElement("tbody");

    for (let index = 0; index < (skills || []).length; index += 2) {
      const row = document.createElement("tr");
      row.className = "soft-skill-row";

      const leftCell = document.createElement("td");
      leftCell.className = "soft-skill-cell";
      leftCell.appendChild(createSoftSkillList(skills[index] || "", index));

      const rightCell = document.createElement("td");
      rightCell.className = "soft-skill-cell";
      rightCell.appendChild(createSoftSkillList(skills[index + 1] || "", index + 1));

      row.append(leftCell, rightCell);
      body.appendChild(row);
    }

    table.appendChild(body);
    panel.appendChild(table);
    return panel;
  }

  function createCustomSectionPreviewBlock(section) {
    if (section.layout === "certificate-cards") {
      return createCustomCertificateCards(section);
    }

    if (section.layout === "two-column-list") {
      return createCustomTwoColumnList(section);
    }

    return createCustomSingleList(section);
  }

  function createCustomSingleList(section) {
    const list = document.createElement("ul");
    list.className = "skill-list";
    (section.items || []).forEach((item, index) => {
      const node = document.createElement("li");
      node.className = "skill-list__item";
      node.textContent = item.text || "";
      list.appendChild(
        String(item.text || "").trim()
          ? applyPreviewTarget(node, {
              sectionKey: `custom:${section.id}`,
              itemIndex: index,
              itemKind: "single-list",
              label: item.text || "",
              reorderList: getPreviewReorderList(`custom:${section.id}`, "single-list")
            })
          : node
      );
    });
    return list;
  }

  function createCustomTwoColumnList(section) {
    const panel = document.createElement("section");
    panel.className = "soft-skills-panel";
    const table = document.createElement("table");
    table.className = "soft-skill-table";
    const body = document.createElement("tbody");

    for (let index = 0; index < (section.items || []).length; index += 2) {
      const row = document.createElement("tr");
      row.className = "soft-skill-row";

      const leftCell = document.createElement("td");
      leftCell.className = "soft-skill-cell";
      leftCell.appendChild(createCustomTwoColumnListItem(section, section.items[index], index));

      const rightCell = document.createElement("td");
      rightCell.className = "soft-skill-cell";
      rightCell.appendChild(createCustomTwoColumnListItem(section, section.items[index + 1], index + 1));

      row.append(leftCell, rightCell);
      body.appendChild(row);
    }

    table.appendChild(body);
    panel.appendChild(table);
    return panel;
  }

  function createCustomTwoColumnListItem(section, item, index) {
    const list = document.createElement("ul");
    list.className = "soft-skill-list";
    const node = document.createElement("li");
    node.className = "soft-skill-item";
    node.textContent = item?.text || "";
    list.appendChild(
      String(item?.text || "").trim()
        ? applyPreviewTarget(node, {
            sectionKey: `custom:${section.id}`,
            itemIndex: index,
            itemKind: "two-column-list",
            label: item?.text || "",
            reorderList: getPreviewReorderList(`custom:${section.id}`, "two-column-list")
          })
        : node
    );
    return list;
  }

  function createCustomCertificateCards(section) {
    const cards = createCertificateCards(
      (section.items || []).map((item) => ({
        title: item.title || "",
        description: item.description || ""
      })),
      {
        sectionKey: `custom:${section.id}`,
        itemKind: "certificate-cards",
        reorderList: getPreviewReorderList(`custom:${section.id}`, "certificate-cards")
      }
    );

    const wrapper = document.createElement("div");
    wrapper.className = "custom-certificate-list";
    cards.forEach((card) => {
      wrapper.appendChild(card);
    });
    return wrapper;
  }

  function createSoftSkillList(text, index = null) {
    const list = document.createElement("ul");
    list.className = "soft-skill-list";

    const item = document.createElement("li");
    item.className = "soft-skill-item";
    item.textContent = text || "";

    list.appendChild(
      String(text || "").trim()
        ? applyPreviewTarget(item, {
            sectionKey: "softSkills",
            itemIndex: index,
            itemKind: "soft-skill",
            label: text || "",
            reorderList: getPreviewReorderList("softSkills", "soft-skill")
          })
        : item
    );
    return list;
  }

  function createCoverLetterHeader(letter) {
    const header = document.createElement("header");
    header.className = "cover-letter-header";
    header.innerHTML = `
      <div class="cover-letter-header__identity">
        <h1 class="cover-letter-header__name">${escapeHtml(state.data.profile?.name || "")}</h1>
        <p class="cover-letter-header__contact">
          <span>${escapeHtml(state.data.profile?.email || "")}</span>
          <span>${escapeHtml(state.data.profile?.phone || "")}</span>
          <span>${escapeHtml(state.data.profile?.location || "")}</span>
        </p>
      </div>
      <p class="cover-letter-header__date">${escapeHtml(formatCoverLetterDate(letter.generatedAt || Date.now()))}</p>
    `;
    return header;
  }

  function createCoverLetterRecipient(letter) {
    const block = document.createElement("section");
    block.className = "cover-letter-recipient";
    const lines = [
      letter.recipientName || letter.hiringManager || locale.coverLetterRecipientFallback,
      letter.company || state.targeting.company || ""
    ].filter(Boolean);

    lines.forEach((line) => block.appendChild(element("p", "cover-letter-recipient__line", line)));
    return block;
  }

  function createCoverLetterSubject(subject) {
    const node = document.createElement("p");
    node.className = "cover-letter-subject";
    node.textContent = `${locale.coverLetterSubjectLabel}: ${subject}`;
    return node;
  }

  function createCoverLetterSignature(letter) {
    const signature = document.createElement("section");
    signature.className = "cover-letter-signature";
    signature.append(
      element("p", "cover-letter-paragraph", locale.coverLetterSignoff),
      element("p", "cover-letter-signature__name", letter.signatureName || state.data.profile?.name || "")
    );
    return signature;
  }

  function createSectionTitle(title, keepWithNext = false, options = {}) {
    const heading = document.createElement("h2");
    heading.className = "section-title";
    heading.textContent = title || "";
    if (keepWithNext) {
      heading.dataset.keepWithNext = "true";
    }
    return applyPreviewTarget(heading, {
      sectionKey: options.sectionKey,
      label: title || "",
      focusSelector: options.focusSelector || "",
      sectionOrder: Number.isInteger(options.sectionOrder) ? options.sectionOrder : null
    });
  }

  function createForceBreak() {
    const marker = document.createElement("div");
    marker.dataset.forcePageBreak = "true";
    return marker;
  }

  function createBulletList(items) {
    const list = document.createElement("ul");
    list.className = "bullet-list";
    items
      .filter((item) => item && item.trim())
      .forEach((item) => list.appendChild(element("li", "bullet-list__item", item)));
    return list;
  }

  function createSheet(extraClass = "") {
    const sheet = document.createElement("section");
    sheet.className = `sheet ${extraClass}`.trim();
    sheet.innerHTML = `<div class="sheet__body"></div>`;
    return sheet;
  }

  function overflows(container) {
    return container.scrollHeight - container.clientHeight > 1;
  }

  function contactLink(type, href, label, isStatic = false) {
    if (!String(label || "").trim()) {
      return "";
    }
    const tag = isStatic ? "span" : "a";
    const target = ["linkedin", "github", "portfolio"].includes(type) ? "_blank" : "_self";
    const hrefAttr = isStatic ? "" : ` href="${escapeHtml(href || "#")}" target="${target}" rel="noreferrer"`;
    const iconMarkup = icon(type);
    const directionAttr = ["email", "phone", "linkedin", "github", "portfolio"].includes(type) ? ' dir="ltr"' : "";
    return `
      <${tag} class="contact-item contact-item--${escapeHtml(type)}"${hrefAttr}>
        ${iconMarkup ? `<span class="contact-item__icon" aria-hidden="true">${iconMarkup}</span>` : ""}
        <span class="contact-item__label contact-item__label--${escapeHtml(type)}"${directionAttr}>${escapeHtml(label || "")}</span>
      </${tag}>
    `;
  }

  function icon(type) {
    const icons = {
      email:
        '<svg viewBox="0 0 24 24"><path d="M3 6.75A1.75 1.75 0 0 1 4.75 5h14.5C20.22 5 21 5.78 21 6.75v10.5A1.75 1.75 0 0 1 19.25 19H4.75A1.75 1.75 0 0 1 3 17.25V6.75Zm1.9-.25L12 11.72l7.1-5.22H4.9Zm14.6 11V8.38l-7.06 5.2a.75.75 0 0 1-.88 0L4.5 8.38v9.12h15Z"/></svg>',
      phone:
        '<svg viewBox="0 0 24 24"><path d="M7.12 3.25c.4 0 .77.23.94.6l1.34 2.98a1.5 1.5 0 0 1-.22 1.56L7.94 9.86a14.8 14.8 0 0 0 6.2 6.2l1.47-1.24a1.5 1.5 0 0 1 1.56-.22l2.98 1.34c.37.17.6.54.6.94v2.13c0 .83-.67 1.5-1.5 1.5C9.72 20.5 3.5 14.28 3.5 6.88c0-.83.67-1.5 1.5-1.5h2.12Z"/></svg>',
      location:
        '<svg viewBox="0 0 24 24"><path d="M12 21c-.24 0-.47-.1-.64-.28C10.5 19.86 5 14.05 5 9.5a7 7 0 1 1 14 0c0 4.55-5.5 10.36-6.36 11.22A.9.9 0 0 1 12 21Zm0-16.5A5.5 5.5 0 0 0 6.5 9.5c0 3.2 3.61 7.63 5.5 9.6 1.89-1.97 5.5-6.4 5.5-9.6A5.5 5.5 0 0 0 12 4.5Zm0 7.25a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5Z"/></svg>',
      github:
        '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.59 2 12.25c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.88-2.78.62-3.37-1.2-3.37-1.2-.45-1.2-1.11-1.52-1.11-1.52-.9-.64.07-.63.07-.63 1 .08 1.53 1.05 1.53 1.05.88 1.56 2.3 1.11 2.86.85.09-.66.34-1.11.62-1.36-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.74 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.84a9.3 9.3 0 0 1 2.5.35c1.9-1.33 2.74-1.05 2.74-1.05.56 1.43.21 2.48.11 2.74.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.95.68 1.92 0 1.39-.01 2.5-.01 2.84 0 .27.18.6.69.49A10.2 10.2 0 0 0 22 12.25C22 6.59 17.52 2 12 2Z"/></svg>',
      linkedin:
        '<svg viewBox="0 0 24 24"><path d="M6.45 8.5a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6ZM4.9 19V9.8H8V19H4.9Zm5.08 0V9.8h2.97v1.25h.04c.41-.78 1.42-1.6 2.92-1.6 3.12 0 3.7 2.05 3.7 4.71V19h-3.1v-4.3c0-1.02-.02-2.34-1.42-2.34-1.42 0-1.64 1.1-1.64 2.27V19H9.98Z"/></svg>',
      portfolio:
        '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm6.92 8h-3.01a14.3 14.3 0 0 0-1.25-4.27A7.53 7.53 0 0 1 18.92 11Zm-6.17-5.38c.78.92 1.58 2.8 1.88 5.38h-5.26c.3-2.58 1.1-4.46 1.88-5.38.24-.28.48-.45.75-.45s.51.17.75.45ZM9.34 6.73A14.3 14.3 0 0 0 8.09 11H5.08a7.53 7.53 0 0 1 4.26-4.27ZM4.58 13h3.31c.08 1.56.42 3.02.94 4.27A7.53 7.53 0 0 1 4.58 13Zm4.79 0h5.26c-.3 2.58-1.1 4.46-1.88 5.38-.24.28-.48.45-.75.45s-.51-.17-.75-.45c-.78-.92-1.58-2.8-1.88-5.38Zm6.8 4.27c.52-1.25.86-2.71.94-4.27h3.31a7.53 7.53 0 0 1-4.25 4.27Z"/></svg>'
    };
    return icons[type];
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    node.textContent = text || "";
    return node;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function cloneData(value) {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value));
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeResumeData(value, template = sourceData) {
    const merged = mergeWithTemplate(template, value);
    const lang = merged.meta?.lang || template.meta?.lang || documentLanguage;
    const localeForLang = applyLocaleDefaults(buildLocale(lang), lang);
    merged.ui = isPlainObject(merged.ui) ? merged.ui : {};
    merged.ui.stylePreset = normalizeStylePreset(merged.ui.stylePreset);
    if (lang === "ar") {
      applyArabicContentNormalization(merged);
    }
    merged.labels = normalizeResumeLabels(merged.labels, localeForLang, lang);
    merged.sectionConfig = normalizeSectionConfig(merged.sectionConfig, merged.labels, localeForLang);
    merged.customSections = normalizeCustomSections(merged.customSections);
    rebalanceSectionOrders(merged);
    syncBuiltInSectionTitles(merged);
    return merged;
  }

  function applyArabicContentNormalization(data) {
    if (!data || typeof data !== "object") {
      return;
    }

    if (Array.isArray(data.certificates)) {
      data.certificates = data.certificates.map((certificate) => {
        const next = { ...(certificate || {}) };
        const rawTitle = String(next.title || "").trim();
        const rawDescription = String(next.description || "").trim();
        const normalizedTitleMap = {
          "Rocheston - Certified AI Engineer | 2025": "Rocheston Certified AI Engineer | 2025",
          "Microsoft - AI-900: Microsoft Azure AI Fundamentals | 2025": "Microsoft Azure AI Fundamentals (AI-900) | 2025",
          "JPMorgan Chase & Co. (Forage) - Software Engineering Job Simulation | 2025": "JPMorgan Chase & Co. (Forage) Software Engineering Job Simulation | 2025",
          "Harvard University - Introduction to Computer Science | 2025": "Harvard University Introduction to Computer Science | 2025",
          "IBM - Cybersecurity Analyst Professional Certificate | 2024": "IBM Cybersecurity Analyst Professional Certificate | 2024",
          "Google Cloud - Digital Transformation with Google Cloud | 2021": "Digital Transformation with Google Cloud | 2021"
        };
        const normalizedDescriptionMap = {
          "مفاهيم الذكاء الاصطناعي، وأساليب تعلم الآلة، وتصميم حلول ذكاء اصطناعي تطبيقية.": "مفاهيم الذكاء الاصطناعي، وأساليب تعلم الآلة، وتصميم حلول تطبيقية للذكاء الاصطناعي."
        };
        next.title = normalizedTitleMap[rawTitle] || rawTitle;
        next.description = normalizedDescriptionMap[rawDescription] || rawDescription;
        return next;
      });
    }

    if (Array.isArray(data.professionalExperience)) {
      data.professionalExperience = data.professionalExperience.map((item) => {
        const next = { ...(item || {}) };
        if (Array.isArray(next.bullets)) {
          next.bullets = next.bullets.map((bullet) => String(bullet || "").replace(/Run Cloud Google/g, "Google Cloud Run"));
        }
        return next;
      });
    }

    if (data.skills && Array.isArray(data.skills.technical)) {
      data.skills.technical = data.skills.technical.map((skill) => {
        const next = { ...(skill || {}) };
        const items = String(next.items || "")
          .replace(/Stack-Full/g, "Full-Stack")
          .replace(/IP\/TCP/g, "TCP/IP")
          .replace(/Run Cloud Google/g, "Google Cloud Run");
        next.items = items;
        return next;
      });
    }
  }

  function normalizeResumeLabels(labels, localeForLang, lang) {
    const current = isPlainObject(labels) ? labels : {};
    return {
      ...current,
      profile: String(current.profile || localeForLang.profileSectionTitle),
      summary: String(current.summary || localeForLang.summarySectionTitle),
      professionalExperience: String(current.professionalExperience || (lang === "ar" ? "الخبرات المهنية" : "Professional Experience")),
      internships: String(current.internships || (lang === "ar" ? "التدريب" : "Internships")),
      projects: String(current.projects || (lang === "ar" ? "المشاريع" : "Projects")),
      education: String(current.education || (lang === "ar" ? "التعليم" : "Education")),
      certificates: String(current.certificates || (lang === "ar" ? "الشهادات" : "Certificates")),
      skills: String(current.skills || (lang === "ar" ? "المهارات" : "Skills")),
      softSkills: String(current.softSkills || (lang === "ar" ? "المهارات الشخصية" : "Soft Skills"))
    };
  }

  function normalizeSectionConfig(value, labels, localeForLang) {
    const list = Array.isArray(value?.builtIn)
      ? value.builtIn
      : Array.isArray(value)
        ? value
        : [];
    const entries = builtInResumeSectionKeys.map((key, index) => {
      const existing = list.find((item) => item?.key === key) || {};
      return {
        key,
        title: String(existing.title || labels?.[key] || getDefaultBuiltInSectionTitle(key, labels, localeForLang)),
        visible: existing.visible !== false,
        order: Number.isFinite(Number(existing.order)) ? Number(existing.order) : index
      };
    });
    entries.sort((left, right) => left.order - right.order || builtInResumeSectionKeys.indexOf(left.key) - builtInResumeSectionKeys.indexOf(right.key));
    return { builtIn: entries };
  }

  function getDefaultBuiltInSectionTitle(key, labels, localeForLang) {
    if (key === "profile") {
      return localeForLang.profileSectionTitle;
    }
    return String(labels?.[key] || key);
  }

  function normalizeCustomSections(value) {
    const list = Array.isArray(value) ? value : [];
    return list
      .filter((item) => item && typeof item === "object")
      .map((item, index) => ({
        id: String(item.id || createCustomSectionId(index)),
        title: String(item.title || `Custom Section ${index + 1}`),
        visible: item.visible !== false,
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : builtInResumeSectionKeys.length + index,
        layout: normalizeCustomSectionLayout(item.layout),
        items: normalizeCustomSectionItems(item.items)
      }));
  }

  function normalizeCustomSectionLayout(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return customSectionLayouts.includes(normalized) ? normalized : "single-list";
  }

  function normalizeCustomSectionItems(items) {
    const list = Array.isArray(items) ? items : [];
    return list.map((item) => ({
      text: String(item?.text || ""),
      title: String(item?.title || ""),
      description: String(item?.description || "")
    }));
  }

  function rebalanceSectionOrders(data) {
    if (!data?.sectionConfig?.builtIn || !Array.isArray(data.customSections)) {
      return;
    }

    const combined = [
      ...data.sectionConfig.builtIn.map((entry, index) => ({
        key: entry.key,
        order: Number(entry.order),
        fallback: index,
        ref: entry
      })),
      ...data.customSections.map((entry, index) => ({
        key: `custom:${entry.id}`,
        order: Number(entry.order),
        fallback: builtInResumeSectionKeys.length + index,
        ref: entry
      }))
    ];

    combined
      .sort((left, right) => {
        const leftOrder = Number.isFinite(left.order) ? left.order : left.fallback;
        const rightOrder = Number.isFinite(right.order) ? right.order : right.fallback;
        return leftOrder - rightOrder || left.fallback - right.fallback || left.key.localeCompare(right.key);
      })
      .forEach((entry, index) => {
        entry.ref.order = index;
      });

    data.sectionConfig.builtIn.sort((left, right) => left.order - right.order);
    data.customSections.sort((left, right) => left.order - right.order);
  }

  function syncBuiltInSectionTitles(data) {
    if (!data?.labels || !data?.sectionConfig?.builtIn) {
      return;
    }

    data.sectionConfig.builtIn.forEach((entry) => {
      data.labels[entry.key] = String(entry.title || data.labels[entry.key] || entry.key);
    });
  }

  function mergeWithTemplate(template, value) {
    if (Array.isArray(template)) {
      if (!Array.isArray(value)) {
        return cloneData(template);
      }

      if (!template.length) {
        return cloneData(value);
      }

      return value.map((item) => mergeWithTemplate(template[0], item));
    }

    if (isPlainObject(template)) {
      const input = isPlainObject(value) ? value : {};
      const result = {};

      Object.keys(template).forEach((key) => {
        result[key] = mergeWithTemplate(template[key], input[key]);
      });

      Object.keys(input).forEach((key) => {
        if (!(key in result)) {
          result[key] = cloneData(input[key]);
        }
      });

      return result;
    }

    return value === undefined || value === null ? template : value;
  }

  function buildResumeTemplateForLanguage(lang) {
    const localeForLang = applyLocaleDefaults(buildLocale(lang), lang);
    const template = normalizeResumeData(sourceData, sourceData);

    template.meta = {
      ...(template.meta || {}),
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      documentTitle: lang === "ar" ? "السيرة الذاتية" : "Resume"
    };

    template.ui = {
      ...(template.ui || {}),
      printButton: localeForLang.printButton,
      printHint: localeForLang.printHint,
      switchEnglish: localeForLang.switchEnglish,
      switchArabic: localeForLang.switchArabic,
      stylePreset: normalizeStylePreset(template.ui?.stylePreset)
    };

    template.labels = {
      ...(template.labels || {}),
      profile: localeForLang.profileSectionTitle,
      summary: localeForLang.summarySectionTitle,
      professionalExperience: lang === "ar" ? "الخبرات المهنية" : "Professional Experience",
      internships: lang === "ar" ? "التدريب" : "Internships",
      projects: lang === "ar" ? "المشاريع" : "Projects",
      education: lang === "ar" ? "التعليم" : "Education",
      certificates: lang === "ar" ? "الشهادات" : "Certificates",
      skills: lang === "ar" ? "المهارات" : "Skills",
      softSkills: lang === "ar" ? "المهارات الشخصية" : "Soft Skills"
    };

    template.sectionConfig = normalizeSectionConfig(template.sectionConfig, template.labels, localeForLang);
    template.customSections = normalizeCustomSections(template.customSections);
    rebalanceSectionOrders(template);
    syncBuiltInSectionTitles(template);
    return template;
  }

  function normalizeDerivedVersionIds(value) {
    return {
      en: String(value?.en || ""),
      ar: String(value?.ar || "")
    };
  }

  function normalizeTranslationStatus(value) {
    return value === "needs-sync" ? "needs-sync" : "clean";
  }

  function normalizeTranslationSnapshot(value) {
    const sections = {};
    trackedTranslationSections.forEach((key) => {
      if (value?.sections?.[key]) {
        sections[key] = String(value.sections[key]);
      }
    });
    return {
      sourceVersionId: String(value?.sourceVersionId || ""),
      sections
    };
  }

  function normalizeManualOverrides(value) {
    const result = {};
    Object.entries(value || {}).forEach(([key, stamp]) => {
      if (trackedTranslationSections.includes(key) && Number(stamp)) {
        result[key] = Number(stamp);
      }
    });
    return result;
  }

  function getTrackedSectionFromActiveSection(sectionKey) {
    if (!trackedTranslationSections.includes(sectionKey)) {
      return "";
    }
    return sectionKey;
  }

  function buildTranslationSectionsFromVersion(version) {
    return {
      profile: cloneData(version.data?.profile || {}),
      summary: version.data?.summary || "",
      professionalExperience: cloneData(version.data?.professionalExperience || []),
      internships: cloneData(version.data?.internships || []),
      projects: cloneData(version.data?.projects || []),
      education: cloneData(version.data?.education || []),
      certificates: cloneData(version.data?.certificates || []),
      skills: cloneData(version.data?.skills?.technical || []),
      softSkills: cloneData(version.data?.skills?.soft || []),
      coverLetter: cloneData(normalizeCoverLetter(version.coverLetter, version.data?.profile?.name))
    };
  }

  function buildTranslationFingerprints(sections) {
    const fingerprints = {};
    trackedTranslationSections.forEach((key) => {
      fingerprints[key] = hashString(JSON.stringify(sections[key] ?? ""));
    });
    return fingerprints;
  }

  function getChangedTranslationSections(current, previous) {
    return trackedTranslationSections.filter((key) => String(current?.[key] || "") !== String(previous?.[key] || ""));
  }

  function hashString(value) {
    const input = String(value || "");
    let hash = 0;
    for (let index = 0; index < input.length; index += 1) {
      hash = ((hash << 5) - hash) + input.charCodeAt(index);
      hash |= 0;
    }
    return `h${Math.abs(hash)}`;
  }

  function buildSectionExcerpt(key, value) {
    const raw = (() => {
      switch (key) {
        case "profile":
          return [value?.name, value?.location, value?.linkedinLabel].filter(Boolean).join(" · ");
        case "summary":
          return value || "";
        case "professionalExperience":
        case "internships":
        case "projects":
        case "education":
        case "certificates":
        case "skills":
        case "softSkills":
          return JSON.stringify(value || []);
        case "coverLetter":
          return createCoverLetterPlainText(value || {});
        default:
          return "";
      }
    })();

    const text = String(raw || "").replace(/\s+/g, " ").trim();
    if (!text) {
      return "";
    }
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
  }

  function getTranslationSectionLabel(key) {
    const labels = {
      profile: locale.profileSectionTitle,
      summary: state.data.labels.summary,
      professionalExperience: state.data.labels.professionalExperience,
      internships: state.data.labels.internships,
      projects: state.data.labels.projects,
      education: state.data.labels.education,
      certificates: state.data.labels.certificates,
      skills: state.data.labels.skills,
      softSkills: state.data.labels.softSkills,
      coverLetter: locale.coverLetterTitle
    };
    return labels[key] || key;
  }

  function createEmptyCoverLetter(signatureName = "") {
    return {
      recipientName: "",
      company: "",
      targetRole: "",
      hiringManager: "",
      opening: "",
      body: "",
      closing: "",
      signatureName: signatureName || "",
      notes: "",
      generatedAt: 0
    };
  }

  function normalizeCoverLetter(value, signatureName = "") {
    return {
      ...createEmptyCoverLetter(signatureName),
      ...(value && typeof value === "object" ? value : {}),
      recipientName: String(value?.recipientName || ""),
      company: String(value?.company || ""),
      targetRole: String(value?.targetRole || ""),
      hiringManager: String(value?.hiringManager || ""),
      opening: String(value?.opening || ""),
      body: String(value?.body || ""),
      closing: String(value?.closing || ""),
      signatureName: String(value?.signatureName || signatureName || ""),
      notes: String(value?.notes || ""),
      generatedAt: Number(value?.generatedAt) || 0
    };
  }

  function splitParagraphs(text) {
    return String(text || "")
      .split(/\n\s*\n/g)
      .map((part) => part.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  function buildCoverLetterGreeting(letter) {
    if (documentLanguage === "ar") {
      const recipient = letter.hiringManager || letter.recipientName || locale.coverLetterRecipientFallback;
      return `${locale.coverLetterGreetingPrefix} ${recipient}،`;
    }
    const recipient = letter.hiringManager || letter.recipientName || locale.coverLetterRecipientFallback;
    return `${locale.coverLetterGreetingPrefix} ${recipient},`;
  }

  function formatCoverLetterDate(value) {
    const localeCode = documentLanguage === "ar" ? "ar" : "en";
    return new Intl.DateTimeFormat(localeCode, {
      year: "numeric",
      month: "long",
      day: "numeric"
    }).format(new Date(value || Date.now()));
  }

  function debounce(fn, delay) {
    let timeoutId = 0;
    return () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(fn, delay);
    };
  }

  function applyLocaleDefaults(baseLocale, lang) {
    const isArabic = lang === "ar";
    return {
      ...baseLocale,
      atsNavLabel: baseLocale.atsNavLabel || "ATS Helper",
      atsTitle: baseLocale.atsTitle || "ATS Helper",
      atsDescription: baseLocale.atsDescription || (
        isArabic
          ? "\u0623\u0644\u0635\u0642 \u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u064a \u0647\u0646\u0627 \u0648\u0634\u0627\u0647\u062f \u0645\u062f\u0649 \u062a\u0637\u0627\u0628\u0642 \u0627\u0644\u0633\u064a\u0631\u0629 \u0645\u0639\u0647 \u0641\u0648\u0631\u0627\u064b."
          : "Paste a job description here and compare it against the live resume instantly."
      ),
      atsPlaceholder: baseLocale.atsPlaceholder || (
        isArabic
          ? "\u0627\u0644\u0635\u0642 \u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u064a \u0647\u0646\u0627..."
          : "Paste the job description here..."
      ),
      atsEmptyState: baseLocale.atsEmptyState || (
        isArabic
          ? "\u0623\u0636\u0641 \u0648\u0635\u0641\u064b\u0627 \u0648\u0638\u064a\u0641\u064a\u064b\u0627 \u0644\u064a\u0638\u0647\u0631 \u062a\u062d\u0644\u064a\u0644 ATS \u0647\u0646\u0627."
          : "Paste a job description to see ATS keyword matching and suggestions."
      ),
      atsMatchScore: baseLocale.atsMatchScore || (isArabic ? "\u0646\u0633\u0628\u0629 \u0627\u0644\u062a\u0637\u0627\u0628\u0642" : "Match score"),
      atsScoreSummary: baseLocale.atsScoreSummary || (
        isArabic
          ? "\u062a\u0645 \u0631\u0635\u062f {matched} \u0645\u0646 \u0623\u0635\u0644 {total} \u0645\u0646 \u0627\u0644\u0643\u0644\u0645\u0627\u062a \u0627\u0644\u0623\u0647\u0645."
          : "Matched {matched} of {total} key terms from the job description."
      ),
      atsMissingKeywords: baseLocale.atsMissingKeywords || (isArabic ? "\u0643\u0644\u0645\u0627\u062a \u0645\u0641\u0642\u0648\u062f\u0629" : "Missing keywords"),
      atsStrongMatches: baseLocale.atsStrongMatches || (isArabic ? "\u062a\u0637\u0627\u0628\u0642\u0627\u062a \u0642\u0648\u064a\u0629" : "Strong matches"),
      atsWeakSections: baseLocale.atsWeakSections || (isArabic ? "\u0623\u0642\u0633\u0627\u0645 \u0623\u0636\u0639\u0641" : "Weak coverage by section"),
      atsSuggestedSections: baseLocale.atsSuggestedSections || (
        isArabic ? "\u0623\u0642\u0633\u0627\u0645 \u064a\u0633\u062a\u062d\u0633\u0646 \u062a\u0639\u062f\u064a\u0644\u0647\u0627" : "Suggested sections to improve"
      ),
      atsFocusAreas: baseLocale.atsFocusAreas || (
        isArabic ? "\u0646\u0642\u0627\u0637 \u062a\u062d\u0633\u064a\u0646 \u0633\u0631\u064a\u0639\u0629" : "Suggested bullet and summary focus"
      ),
      atsJumpToSection: baseLocale.atsJumpToSection || (isArabic ? "\u0627\u0641\u062a\u062d \u0627\u0644\u0642\u0633\u0645" : "Open section"),
      atsNothingToShow: baseLocale.atsNothingToShow || (
        isArabic ? "\u0644\u0627 \u064a\u0648\u062c\u062f \u0634\u064a\u0621 \u0625\u0636\u0627\u0641\u064a \u0644\u0639\u0631\u0636\u0647 \u0647\u0646\u0627." : "Nothing extra to show here yet."
      ),
      atsMismatchArabic: baseLocale.atsMismatchArabic || (
        "\u0647\u0630\u0627 \u0627\u0644\u0648\u0635\u0641 \u064a\u0628\u062f\u0648 \u0628\u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629\u060c \u0641\u0627\u0633\u062a\u062e\u062f\u0645 \u0635\u0641\u062d\u0629 \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629 \u0644\u062a\u062d\u0644\u064a\u0644 \u0623\u062f\u0642."
      ),
      atsMismatchEnglish: baseLocale.atsMismatchEnglish || (
        "\u0647\u0630\u0627 \u0627\u0644\u0648\u0635\u0641 \u064a\u0628\u062f\u0648 \u0628\u0627\u0644\u0639\u0631\u0628\u064a\u0629\u060c \u0627\u0633\u062a\u062e\u062f\u0645 \u0635\u0641\u062d\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u0644\u062a\u062d\u0644\u064a\u0644 \u0623\u062f\u0642."
      ),
      atsCoverageSummary: baseLocale.atsCoverageSummary || (isArabic ? "\u062a\u0637\u0627\u0628\u0642 {matched} \u0645\u0646 {total}" : "Matched {matched} of {total}"),
      atsMetricFocus: baseLocale.atsMetricFocus || "Add measurable outcomes in experience bullets so the match looks credible, not just keyword-heavy.",
      atsActionVerbFocus: baseLocale.atsActionVerbFocus || "Strengthen weak bullet openings with action verbs such as {suggestion}.",
      atsDuplicateSkillsFocus: baseLocale.atsDuplicateSkillsFocus || "Trim duplicated skills like {skill} so the skills section stays sharp and ATS-friendly.",
      atsGenericSummaryFocus: baseLocale.atsGenericSummaryFocus || "Make the summary more specific by naming your target role, domain, and concrete tools or strengths.",
      atsGenericBulletsFocus: baseLocale.atsGenericBulletsFocus || "Replace generic bullets with tool, scope, and outcome details so recruiters can see real evidence.",
      persistenceTitle: baseLocale.persistenceTitle || (isArabic ? "\u0627\u0644\u0645\u0633\u0648\u062f\u0627\u062a \u0648\u0627\u0644\u0646\u0633\u062e" : "Drafts and versions"),
      languageEnglish: baseLocale.languageEnglish || "English",
      languageArabic: baseLocale.languageArabic || (isArabic ? "\u0627\u0644\u0639\u0631\u0628\u064a\u0629" : "Arabic"),
      draftStatusClean: baseLocale.draftStatusClean || (isArabic ? "\u0628\u062f\u0648\u0646 \u0645\u0633\u0648\u062f\u0629 \u0645\u062d\u0644\u064a\u0629" : "No local draft"),
      draftStatusRestored: baseLocale.draftStatusRestored || (isArabic ? "\u062a\u0645 \u0627\u0633\u062a\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u0633\u0648\u062f\u0629" : "Draft restored"),
      draftStatusSaving: baseLocale.draftStatusSaving || (isArabic ? "\u062c\u0627\u0631\u064a \u062d\u0641\u0638 \u0627\u0644\u0645\u0633\u0648\u062f\u0629" : "Saving draft"),
      draftStatusSaved: baseLocale.draftStatusSaved || (isArabic ? "\u062a\u0645 \u062d\u0641\u0638 \u0627\u0644\u0645\u0633\u0648\u062f\u0629" : "Draft saved"),
      draftStatusCleared: baseLocale.draftStatusCleared || (isArabic ? "\u062a\u0645 \u0645\u0633\u062d \u0627\u0644\u0645\u0633\u0648\u062f\u0629 \u0627\u0644\u0645\u062d\u0644\u064a\u0629" : "Local draft cleared"),
      lastSavedLabel: baseLocale.lastSavedLabel || (isArabic ? "\u0622\u062e\u0631 \u062d\u0641\u0638" : "Last saved"),
      presetTitle: baseLocale.presetTitle || (isArabic ? "\u0627\u0644\u0642\u0627\u0644\u0628\u0627\u062a" : "Presets"),
      presetPlaceholder: baseLocale.presetPlaceholder || (isArabic ? "\u0627\u062e\u062a\u0631 \u0642\u0627\u0644\u0628\u064b\u0627" : "Choose a preset"),
      presetFallbackName: baseLocale.presetFallbackName || (isArabic ? "\u0642\u0627\u0644\u0628" : "Preset"),
      saveNewPreset: baseLocale.saveNewPreset || (isArabic ? "\u062d\u0641\u0638 \u0643\u0642\u0627\u0644\u0628 \u062c\u062f\u064a\u062f" : "Save as new"),
      updatePreset: baseLocale.updatePreset || (isArabic ? "\u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0642\u0627\u0644\u0628" : "Update preset"),
      loadPreset: baseLocale.loadPreset || (isArabic ? "\u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0642\u0627\u0644\u0628" : "Load preset"),
      renamePreset: baseLocale.renamePreset || (isArabic ? "\u0625\u0639\u0627\u062f\u0629 \u062a\u0633\u0645\u064a\u0629" : "Rename"),
      deletePreset: baseLocale.deletePreset || (isArabic ? "\u062d\u0630\u0641 \u0627\u0644\u0642\u0627\u0644\u0628" : "Delete"),
      exportPresets: baseLocale.exportPresets || (isArabic ? "\u062a\u0635\u062f\u064a\u0631 \u0627\u0644\u0642\u0627\u0644\u0628\u0627\u062a" : "Export presets"),
      importPresets: baseLocale.importPresets || (isArabic ? "\u0627\u0633\u062a\u064a\u0631\u0627\u062f \u0627\u0644\u0642\u0627\u0644\u0628\u0627\u062a" : "Import presets"),
      resetDraft: baseLocale.resetDraft || (isArabic ? "\u0625\u0639\u0627\u062f\u0629 \u0644\u0645\u0644\u0641 \u0627\u0644\u0623\u0635\u0644" : "Reset to file"),
      clearLocalDraft: baseLocale.clearLocalDraft || (isArabic ? "\u0645\u0633\u062d \u0627\u0644\u0645\u0633\u0648\u062f\u0629" : "Clear local draft"),
      zoomOut: baseLocale.zoomOut || (isArabic ? "\u062a\u0635\u063a\u064a\u0631 \u0627\u0644\u0645\u0639\u0627\u064a\u0646\u0629" : "Zoom out"),
      zoomIn: baseLocale.zoomIn || (isArabic ? "\u062a\u0643\u0628\u064a\u0631 \u0627\u0644\u0645\u0639\u0627\u064a\u0646\u0629" : "Zoom in"),
      zoomResetLabel: baseLocale.zoomResetLabel || (isArabic ? "\u0625\u0639\u0627\u062f\u0629 \u062d\u062c\u0645 \u0627\u0644\u0645\u0639\u0627\u064a\u0646\u0629" : "Reset preview zoom"),
      zoomResetTitle: baseLocale.zoomResetTitle || (isArabic ? "\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u0639\u0627\u064a\u0646\u0629 \u0625\u0644\u0649 100%" : "Reset preview to 100%"),
      contextualHelpEyebrow: baseLocale.contextualHelpEyebrow || (isArabic ? "\u0627\u0644\u0645\u0633\u0627\u0639\u062f\u0629" : "Quick help"),
      contextualHelpTitle: baseLocale.contextualHelpTitle || (isArabic ? "\u0627\u0644\u062a\u0648\u0636\u064a\u062d" : "What this does"),
      contextualHelpFallback: baseLocale.contextualHelpFallback || (isArabic ? "\u062d\u0631\u0643 \u0627\u0644\u0645\u0624\u0634\u0631 \u0641\u0648\u0642 \u0623\u064a \u0639\u0646\u0635\u0631 \u0644\u0644\u0638\u0647\u0648\u0631 \u0648\u0635\u0641 \u0633\u0631\u064a\u0639." : "Hover or focus a control to see a quick explanation here."),
      contextualHelpZoomLabel: baseLocale.contextualHelpZoomLabel || (isArabic ? "\u062a\u0643\u0628\u064a\u0631 \u0627\u0644\u0645\u0639\u0627\u064a\u0646\u0629" : "Preview zoom"),
      helpToolbarGeneral: baseLocale.helpToolbarGeneral || (isArabic ? "" : "Use these top controls for editor visibility, data import/export, PDF actions, and preview zoom without changing the actual CV content."),
      helpToolbarResumeMode: baseLocale.helpToolbarResumeMode || (isArabic ? "" : "Switch the live preview and editor back to the resume layout."),
      helpToolbarCoverLetterMode: baseLocale.helpToolbarCoverLetterMode || (isArabic ? "" : "Switch the live preview and editor to the cover letter that belongs to the current version."),
      helpToggleEditor: baseLocale.helpToggleEditor || (isArabic ? "" : "Show or hide the editor sidebar on smaller screens so you can focus on either editing or previewing."),
      helpImportData: baseLocale.helpImportData || (isArabic ? "" : "Load a saved resume data file into the current editor session."),
      helpExportData: baseLocale.helpExportData || (isArabic ? "" : "Export the current resume data so you can keep a backup or move it to another machine."),
      helpSavePdfNow: baseLocale.helpSavePdfNow || (isArabic ? "" : "Export the current live preview to PDF using the local helper, including unsaved on-screen edits."),
      helpPrintPdf: baseLocale.helpPrintPdf || (isArabic ? "" : "Open the browser print dialog for PDF saving or printer output with the current resume layout."),
      helpZoomOut: baseLocale.helpZoomOut || (isArabic ? "" : "Make only the preview smaller so you can see more of the page without shrinking the editor."),
      helpZoomReset: baseLocale.helpZoomReset || (isArabic ? "" : "Reset the preview back to normal 100% zoom."),
      helpZoomIn: baseLocale.helpZoomIn || (isArabic ? "" : "Make only the preview larger for easier reading while keeping the editor and toolbar unchanged."),
      helpVersionSelect: baseLocale.helpVersionSelect || (isArabic ? "" : "Choose which saved version to load, update, rename, or export."),
      helpSaveNewVersion: baseLocale.helpSaveNewVersion || (isArabic ? "" : "Save the current resume, ATS text, and cover letter as a brand-new version without overwriting another one."),
      helpUpdateVersion: baseLocale.helpUpdateVersion || (isArabic ? "" : "Overwrite the selected version with the current editor state when you want to keep the same saved slot."),
      helpLoadVersion: baseLocale.helpLoadVersion || (isArabic ? "" : "Replace the current working state with the selected saved version."),
      helpRenameVersion: baseLocale.helpRenameVersion || (isArabic ? "" : "Change the name of the selected version without changing its content."),
      helpDeleteVersion: baseLocale.helpDeleteVersion || (isArabic ? "" : "Remove the selected saved version from local storage."),
      helpExportVersions: baseLocale.helpExportVersions || (isArabic ? "" : "Export all locally saved versions into one JSON bundle for backup or transfer."),
      helpImportVersions: baseLocale.helpImportVersions || (isArabic ? "" : "Import a previously exported versions bundle into this editor."),
      helpResetDraft: baseLocale.helpResetDraft || (isArabic ? "" : "Discard the current working draft and restore the original file-backed resume data."),
      helpClearLocalDraft: baseLocale.helpClearLocalDraft || (isArabic ? "" : "Delete the browser's local draft copy so the page stops restoring it on reload."),
      helpBilingualSync: baseLocale.helpBilingualSync || (isArabic ? "" : "Create and maintain a linked Arabic version from the current English source version."),
      helpGenerateArabic: baseLocale.helpGenerateArabic || (isArabic ? "" : "Generate a linked Arabic version from the selected English version using the current AI settings."),
      helpSyncArabic: baseLocale.helpSyncArabic || (isArabic ? "" : "Review only the English changes that need updating in the linked Arabic version."),
      helpOpenArabic: baseLocale.helpOpenArabic || (isArabic ? "" : "Open the Arabic page with the linked version selected."),
      helpOpenEnglish: baseLocale.helpOpenEnglish || (isArabic ? "" : "Open the English source version that this Arabic version is linked to."),
      helpTranslationReview: baseLocale.helpTranslationReview || (isArabic ? "" : "Review proposed Arabic updates section by section before applying them."),
      helpSelectAllTranslation: baseLocale.helpSelectAllTranslation || (isArabic ? "" : "Select every translated section in this review list."),
      helpSelectNoneTranslation: baseLocale.helpSelectNoneTranslation || (isArabic ? "" : "Clear all selections so nothing is applied by accident."),
      helpApplySelectedTranslation: baseLocale.helpApplySelectedTranslation || (isArabic ? "" : "Apply only the checked Arabic updates to the linked version."),
      helpPdfImport: baseLocale.helpPdfImport || (isArabic ? "" : "Upload a CV PDF, review the extracted sections, then apply only the parts you want into the live editor."),
      helpPdfUpload: baseLocale.helpPdfUpload || (isArabic ? "" : "Choose a PDF file from your computer and start the autofill review flow."),
      helpPdfDropzone: baseLocale.helpPdfDropzone || (isArabic ? "" : "Drag and drop an English CV PDF here to extract its content into a review panel before applying it."),
      helpAiSettings: baseLocale.helpAiSettings || (isArabic ? "" : "Control the optional AI fallback used only by the Commands tab."),
      helpAiToggle: baseLocale.helpAiToggle || (isArabic ? "" : "Turn the Commands tab AI fallback on or off without affecting the rest of the editor."),
      helpAiProvider: baseLocale.helpAiProvider || (isArabic ? "" : "Choose which provider the optional Commands fallback should use."),
      helpAiApiKey: baseLocale.helpAiApiKey || (isArabic ? "" : "Enter your API key for the selected AI provider. It stays local to this browser."),
      helpAiModel: baseLocale.helpAiModel || (isArabic ? "" : "Set the model slug used for the optional Commands fallback."),
      helpProfileSection: baseLocale.helpProfileSection || (isArabic ? "" : "Edit your name, title, contact links, and photo. These details shape the top of the CV and update live."),
      helpSummarySection: baseLocale.helpSummarySection || (isArabic ? "" : "Write a short targeted summary that explains what role you fit and why."),
      helpSectionsManager: baseLocale.helpSectionsManager || (isArabic ? "" : "Rename, hide, reorder, and add custom sections without changing the built-in section designs."),
      helpStyleSection: baseLocale.helpStyleSection || (isArabic ? "" : "Switch this version between the current exact typography and a refined preset for the current language."),
      helpCommandsSection: baseLocale.helpCommandsSection || (isArabic ? "" : "Run bulk section commands here, preview the result, and apply only when the changes look right."),
      helpStylePreset: baseLocale.helpStylePreset || (isArabic ? "" : "Choose whether this version should keep the current look or use the refined typography preset."),
      helpCommandsTargets: baseLocale.helpCommandsTargets || (isArabic ? "" : "Choose which sections this command should change before generating a preview."),
      helpCommandsPrompt: baseLocale.helpCommandsPrompt || (isArabic ? "" : "Describe the change you want, such as replacing skills, clearing a section, or renaming a section title."),
      helpCommandsContent: baseLocale.helpCommandsContent || (isArabic ? "" : "Paste the replacement content here when the command needs new text or structured section items."),
      helpCommandsPreview: baseLocale.helpCommandsPreview || (isArabic ? "" : "Generate a preview of the selected section changes without modifying the live resume yet."),
      helpCommandsApply: baseLocale.helpCommandsApply || (isArabic ? "" : "Apply the current command preview to the selected sections."),
      helpCommandsClear: baseLocale.helpCommandsClear || (isArabic ? "" : "Clear the current command, pasted content, and preview without changing the resume."),
      helpCommandsFallback: baseLocale.helpCommandsFallback || (isArabic ? "" : "Optional AI fallback for commands that are too subjective or ambiguous for the local parser."),
      helpCommandsFallbackEnabled: baseLocale.helpCommandsFallbackEnabled || (isArabic ? "" : "Allow the Commands tab to use AI only when a command cannot be handled locally."),
      helpExperienceSection: baseLocale.helpExperienceSection || (isArabic ? "" : "Edit your main work experience, role titles, dates, and achievement bullets. Changes update live in the preview."),
      helpInternshipsSection: baseLocale.helpInternshipsSection || (isArabic ? "" : "Manage internship entries, titles, dates, and support bullets for early-career roles."),
      helpProjectsSection: baseLocale.helpProjectsSection || (isArabic ? "" : "Show the strongest projects with stack details, links, and bullets that prove your work."),
      helpEducationSection: baseLocale.helpEducationSection || (isArabic ? "" : "Keep degrees, institutions, dates, and locations clear and easy for recruiters to scan."),
      helpCertificatesSection: baseLocale.helpCertificatesSection || (isArabic ? "" : "List the certifications you want recruiters and ATS systems to notice first."),
      helpSkillsSection: baseLocale.helpSkillsSection || (isArabic ? "" : "Group technical skills by area so keywords stay focused and readable."),
      helpSoftSkillsSection: baseLocale.helpSoftSkillsSection || (isArabic ? "" : "Keep only the most useful soft skills that support your target role."),
      helpCustomSection: baseLocale.helpCustomSection || (isArabic ? "" : "Edit this custom section and its items. The current layout is {layout}."),
      helpCoverLetterGenerate: baseLocale.helpCoverLetterGenerate || (isArabic ? "" : "Create a fresh cover-letter draft from the current version, ATS text, and AI settings."),
      helpCoverLetterApply: baseLocale.helpCoverLetterApply || (isArabic ? "" : "Apply the current suggested cover-letter draft into the editable fields."),
      helpCoverLetterRegenerate: baseLocale.helpCoverLetterRegenerate || (isArabic ? "" : "Generate another cover-letter suggestion if you want a different wording approach."),
      helpCoverLetterCopy: baseLocale.helpCoverLetterCopy || (isArabic ? "" : "Copy the current cover letter as plain text for forms, email, or external editing."),
      helpCoverLetterSavePdf: baseLocale.helpCoverLetterSavePdf || (isArabic ? "" : "Export the live cover-letter preview to PDF using the local helper."),
      helpRewriteSuggest: baseLocale.helpRewriteSuggest || (isArabic ? "" : "Generate a stronger rewrite suggestion for the current text without changing it yet."),
      helpRewriteApply: baseLocale.helpRewriteApply || (isArabic ? "" : "Replace the current text with the suggested rewrite."),
      helpRewriteRegenerate: baseLocale.helpRewriteRegenerate || (isArabic ? "" : "Ask for a different rewrite suggestion for the same text."),
      helpCommandOpen: baseLocale.helpCommandOpen || (isArabic ? "" : "Open the AI command box so you can tell the model exactly what change you want."),
      helpCommandPreview: baseLocale.helpCommandPreview || (isArabic ? "" : "Generate a preview of your AI command before applying anything."),
      helpCommandApply: baseLocale.helpCommandApply || (isArabic ? "" : "Apply the current AI command preview to the selected text, section, or whole CV."),
      helpCommandCancel: baseLocale.helpCommandCancel || (isArabic ? "" : "Close the current AI command panel without applying its preview."),
      helpCommandScope: baseLocale.helpCommandScope || (isArabic ? "" : "Choose whether the AI command should affect only the selected text, the current section, or the whole CV."),
      helpCommandPrompt: baseLocale.helpCommandPrompt || (isArabic ? "" : "Describe the exact wording change you want, like replacing one phrase or strengthening the tone."),
      helpAddItem: baseLocale.helpAddItem || (isArabic ? "" : "Add a new entry to this section, such as another experience, project, education item, or certificate."),
      helpAddBullet: baseLocale.helpAddBullet || (isArabic ? "" : "Add another bullet point under the current item."),
      helpAddCustomSection: baseLocale.helpAddCustomSection || (isArabic ? "" : "Create a custom section with a fixed layout such as a single list, two-column list, or certificate cards."),
      helpAddCustomSectionItem: baseLocale.helpAddCustomSectionItem || (isArabic ? "" : "Add another item inside this custom section."),
      helpMoveUp: baseLocale.helpMoveUp || (isArabic ? "" : "Move this item one position upward."),
      helpMoveDown: baseLocale.helpMoveDown || (isArabic ? "" : "Move this item one position downward."),
      helpRemove: baseLocale.helpRemove || (isArabic ? "" : "Remove this item from the current section."),
      helpDrag: baseLocale.helpDrag || (isArabic ? "" : "Drag this handle to reorder items quickly."),
      helpUndo: baseLocale.helpUndo || (isArabic ? "" : "Undo the last editor change."),
      helpRedo: baseLocale.helpRedo || (isArabic ? "" : "Redo the last undone change."),
      helpQualityOpenSection: baseLocale.helpQualityOpenSection || (isArabic ? "" : "Jump straight to the section that needs attention."),
      helpQualityOpenItem: baseLocale.helpQualityOpenItem || (isArabic ? "" : "Jump to the exact item behind this finding and flash it in the live CV preview."),
      helpAtsOpenSection: baseLocale.helpAtsOpenSection || (isArabic ? "" : "Open the section that can best improve the ATS match."),
      helpSectionNav: baseLocale.helpSectionNav || (isArabic ? "" : "Open this editor section and work on it directly."),
      helpFieldFallback: baseLocale.helpFieldFallback || (isArabic ? "" : "Update {field} here. Changes are reflected live in the resume preview."),
      helpButtonFallback: baseLocale.helpButtonFallback || (isArabic ? "" : "Use {action} for the current section or selection."),
      helpToggleFallback: baseLocale.helpToggleFallback || (isArabic ? "" : "Turn {action} on or off for this editor feature."),
      saveNewPresetPrompt: baseLocale.saveNewPresetPrompt || (isArabic ? "\u0627\u0633\u0645 \u0627\u0644\u0642\u0627\u0644\u0628 \u0627\u0644\u062c\u062f\u064a\u062f" : "Name the new preset"),
      renamePresetPrompt: baseLocale.renamePresetPrompt || (isArabic ? "\u0627\u0633\u0645 \u0627\u0644\u0642\u0627\u0644\u0628 \u0627\u0644\u062c\u062f\u064a\u062f" : "Rename this preset"),
      deletePresetConfirm: baseLocale.deletePresetConfirm || (isArabic ? "\u0647\u0644 \u062a\u0631\u064a\u062f \u062d\u0630\u0641 \u0627\u0644\u0642\u0627\u0644\u0628 \"{name}\"\u061f" : "Delete preset \"{name}\"?"),
      importPresetsInvalid: baseLocale.importPresetsInvalid || (isArabic ? "\u0645\u0644\u0641 \u0627\u0644\u0642\u0627\u0644\u0628\u0627\u062a \u063a\u064a\u0631 \u0635\u0627\u0644\u062d." : "The selected preset file is not valid."),
      importPresetsFailed: baseLocale.importPresetsFailed || (isArabic ? "\u062a\u0639\u0630\u0631 \u0627\u0633\u062a\u064a\u0631\u0627\u062f \u0627\u0644\u0642\u0627\u0644\u0628\u0627\u062a." : "Could not import the preset file."),
      importPresetsLanguageMismatch: baseLocale.importPresetsLanguageMismatch || (isArabic ? "\u0647\u0630\u0627 \u0627\u0644\u0645\u0644\u0641 \u0644\u0644\u063a\u0629 \u0645\u062e\u062a\u0644\u0641\u0629." : "This preset file belongs to the other language page."),
      versionTitle: baseLocale.versionTitle || (isArabic ? "\u0627\u0644\u0646\u0633\u062e" : "Versions"),
      versionPlaceholder: baseLocale.versionPlaceholder || (isArabic ? "\u0627\u062e\u062a\u0631 \u0646\u0633\u062e\u0629" : "Choose a version"),
      versionFallbackName: baseLocale.versionFallbackName || (isArabic ? "\u0646\u0633\u062e\u0629" : "Version"),
      versionAtsHint: baseLocale.versionAtsHint || (isArabic ? "\u064a\u062a\u0645 \u062d\u0641\u0638 \u0648\u0635\u0641 ATS \u0645\u0646 \u062a\u0628\u0648\u064a\u0628 ATS \u0645\u0639 \u0643\u0644 \u0646\u0633\u062e\u0629." : "The ATS job description from the ATS tab is saved with each version."),
      translationTitle: baseLocale.translationTitle || (isArabic ? "\u0627\u0644\u0631\u0628\u0637 \u0627\u0644\u062b\u0646\u0627\u0626\u064a" : "Bilingual Sync"),
      translationSelectVersion: baseLocale.translationSelectVersion || (isArabic ? "\u0627\u062e\u062a\u0631 \u0646\u0633\u062e\u0629 \u0623\u0648\u0644\u0627\u064b \u0644\u0625\u0646\u0634\u0627\u0621 \u0631\u0628\u0637 \u0627\u0644\u062a\u0631\u062c\u0645\u0629." : "Choose a version first to create or sync a linked Arabic version."),
      translationGenerateArabic: baseLocale.translationGenerateArabic || (isArabic ? "\u0625\u0646\u0634\u0627\u0621 \u0646\u0633\u062e\u0629 \u0639\u0631\u0628\u064a\u0629" : "Generate Arabic From English"),
      translationSyncArabic: baseLocale.translationSyncArabic || (isArabic ? "\u0645\u0632\u0627\u0645\u0646\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629" : "Sync Arabic Changes"),
      translationOpenArabic: baseLocale.translationOpenArabic || (isArabic ? "\u0627\u0641\u062a\u062d \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629" : "Open Arabic"),
      translationOpenEnglish: baseLocale.translationOpenEnglish || (isArabic ? "\u0627\u0641\u062a\u062d \u0627\u0644\u0645\u0635\u062f\u0631 \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a" : "Open English"),
      translationGenerating: baseLocale.translationGenerating || (isArabic ? "\u062c\u0627\u0631\u064a \u0625\u0639\u062f\u0627\u062f \u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u062a\u0639\u0631\u064a\u0628..." : "Generating Arabic localization review..."),
      translationRequiresAi: baseLocale.translationRequiresAi || (isArabic ? "\u0623\u062f\u062e\u0644 \u0645\u0641\u062a\u0627\u062d API \u0627\u0644\u0645\u062d\u0644\u064a \u0644\u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u062a\u0639\u0631\u064a\u0628 \u0627\u0644\u0630\u0643\u064a." : "Add your local AI API key first to generate Arabic versions."),
      translationFailed: baseLocale.translationFailed || (isArabic ? "\u062a\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629." : "Could not generate the Arabic review."),
      translationReviewReady: baseLocale.translationReviewReady || (isArabic ? "\u062a\u0645 \u0625\u0639\u062f\u0627\u062f {count} \u0642\u0633\u0645\u064b\u0627 \u0644\u0644\u0645\u0631\u0627\u062c\u0639\u0629." : "Prepared {count} translated sections for review."),
      translationNoChanges: baseLocale.translationNoChanges || (isArabic ? "\u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u063a\u064a\u064a\u0631\u0627\u062a \u0645\u0647\u0645\u0629 \u062a\u062d\u062a\u0627\u062c \u0645\u0632\u0627\u0645\u0646\u0629 \u062d\u0627\u0644\u064a\u064b\u0627." : "No meaningful English changes need syncing right now."),
      translationReviewHint: baseLocale.translationReviewHint || (isArabic ? "\u0631\u0627\u062c\u0639 {count} \u0642\u0633\u0645\u064b\u0627 \u062b\u0645 \u0627\u062e\u062a\u0631 \u0645\u0627 \u064a\u062c\u0628 \u062a\u0637\u0628\u064a\u0642\u0647." : "Review {count} sections and keep only the Arabic updates you want to apply."),
      translationSelectAll: baseLocale.translationSelectAll || (isArabic ? "\u062a\u062d\u062f\u064a\u062f \u0627\u0644\u0643\u0644" : "Select all"),
      translationSelectNone: baseLocale.translationSelectNone || (isArabic ? "\u0625\u0644\u063a\u0627\u0621 \u0627\u0644\u062a\u062d\u062f\u064a\u062f" : "Select none"),
      translationApplySelected: baseLocale.translationApplySelected || (isArabic ? "\u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0645\u062d\u062f\u062f" : "Apply selected"),
      translationSourceLabel: baseLocale.translationSourceLabel || (isArabic ? "\u0627\u0644\u0645\u0635\u062f\u0631 \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a" : "English source"),
      translationCurrentArabicLabel: baseLocale.translationCurrentArabicLabel || (isArabic ? "\u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629" : "Current Arabic"),
      translationProposedArabicLabel: baseLocale.translationProposedArabicLabel || (isArabic ? "\u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u0627\u0644\u0645\u0642\u062a\u0631\u062d\u0629" : "Proposed Arabic"),
      translationEmptyExcerpt: baseLocale.translationEmptyExcerpt || (isArabic ? "\u0644\u0627 \u064a\u0648\u062c\u062f \u0645\u062d\u062a\u0648\u0649." : "No content."),
      translationApplied: baseLocale.translationApplied || (isArabic ? "\u062a\u0645 \u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629: {name}" : "Updated linked Arabic version: {name}"),
      translationNoLinkedArabic: baseLocale.translationNoLinkedArabic || (isArabic ? "\u0644\u0627 \u062a\u0648\u062c\u062f \u0646\u0633\u062e\u0629 \u0639\u0631\u0628\u064a\u0629 \u0645\u0631\u062a\u0628\u0637\u0629 \u0628\u0639\u062f." : "No linked Arabic version exists yet."),
      translationLinkedStatus: baseLocale.translationLinkedStatus || (isArabic ? "\u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u0627\u0644\u0645\u0631\u062a\u0628\u0637\u0629: {name} \u00b7 \u0627\u0644\u062d\u0627\u0644\u0629: {status}" : "Linked Arabic version: {name} · Status: {status}"),
      translationDerivedStatus: baseLocale.translationDerivedStatus || (isArabic ? "\u0647\u0630\u0647 \u0627\u0644\u0646\u0633\u062e\u0629 \u0645\u0634\u062a\u0642\u0629 \u0645\u0646: {name} \u00b7 \u0627\u0644\u062d\u0627\u0644\u0629: {status}" : "Derived from English version: {name} · Status: {status}"),
      translationNeedsSync: baseLocale.translationNeedsSync || (isArabic ? "\u062a\u062d\u062a\u0627\u062c \u0645\u0632\u0627\u0645\u0646\u0629" : "Needs sync"),
      translationUpToDate: baseLocale.translationUpToDate || (isArabic ? "\u0645\u062d\u062f\u062b\u0629" : "Up to date"),
      translationLastSynced: baseLocale.translationLastSynced || (isArabic ? "\u0622\u062e\u0631 \u0645\u0632\u0627\u0645\u0646\u0629" : "Last synced"),
      translationArabicStandalone: baseLocale.translationArabicStandalone || (isArabic ? "\u0647\u0630\u0647 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629 \u0645\u0633\u062a\u0642\u0644\u0629 \u0648\u0644\u064a\u0633\u062a \u0645\u0631\u062a\u0628\u0637\u0629 \u0628\u0645\u0635\u062f\u0631 \u0625\u0646\u062c\u0644\u064a\u0632\u064a." : "This Arabic version is standalone and not linked to an English source."),
      translationOverridesNotice: baseLocale.translationOverridesNotice || (isArabic ? "\u0647\u0646\u0627\u0643 {count} \u0642\u0633\u0645\u064b\u0627 \u0639\u0631\u0628\u064a\u064b\u0627 \u062a\u0645 \u062a\u0639\u062f\u064a\u0644\u0647 \u064a\u062f\u0648\u064a\u064b\u0627." : "{count} Arabic sections have local manual edits."),
      translationOverrideWarning: baseLocale.translationOverrideWarning || (isArabic ? "\u0647\u0630\u0627 \u0627\u0644\u0642\u0633\u0645 \u062a\u0645 \u062a\u0639\u062f\u064a\u0644\u0647 \u064a\u062f\u0648\u064a\u064b\u0627 \u0628\u0627\u0644\u0639\u0631\u0628\u064a\u0629\u060c \u0631\u0627\u062c\u0639 \u0627\u0644\u0628\u062f\u064a\u0644 \u0628\u0639\u0646\u0627\u064a\u0629 \u0642\u0628\u0644 \u062a\u0637\u0628\u064a\u0642\u0647." : "This Arabic section was edited manually. Review the replacement carefully before applying it."),
      translationArabicSuffix: baseLocale.translationArabicSuffix || (isArabic ? "(\u0639\u0631\u0628\u064a)" : "(Arabic)"),
      coverLetterNavLabel: baseLocale.coverLetterNavLabel || (isArabic ? "\u0627\u0644\u062e\u0637\u0627\u0628" : "Cover letter"),
      coverLetterTitle: baseLocale.coverLetterTitle || (isArabic ? "\u062e\u0637\u0627\u0628 \u0627\u0644\u062a\u0639\u0631\u064a\u0641" : "Cover Letter"),
      coverLetterDescription: baseLocale.coverLetterDescription || (
        isArabic
          ? "\u062d\u0631\u0631 \u0627\u0644\u062e\u0637\u0627\u0628 \u0645\u0628\u0627\u0634\u0631\u0629 \u0648\u062d\u0627\u0641\u0638 \u0639\u0644\u0649 \u0631\u0628\u0637\u0647 \u0645\u0639 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629."
          : "Edit the letter directly and keep it linked to the current version."
      ),
      coverLetterUnsavedNotice: baseLocale.coverLetterUnsavedNotice || (
        isArabic
          ? "\u062a\u0628\u0642\u0649 \u062a\u0639\u062f\u064a\u0644\u0627\u062a \u0627\u0644\u062e\u0637\u0627\u0628 \u0641\u064a \u0627\u0644\u0630\u0627\u0643\u0631\u0629 \u062d\u062a\u0649 \u062d\u0641\u0638\u0647\u0627 \u0645\u0639 \u0646\u0633\u062e\u0629."
          : "Cover letter edits stay in memory until you save or update a version."
      ),
      coverLetterVersionNotice: baseLocale.coverLetterVersionNotice || (
        isArabic
          ? "\u0647\u0630\u0627 \u0627\u0644\u062e\u0637\u0627\u0628 \u0645\u0631\u062a\u0628\u0637 \u0628\u0627\u0644\u0646\u0633\u062e\u0629: {name}. \u062d\u062f\u062b \u0627\u0644\u0646\u0633\u062e\u0629 \u0644\u0644\u062d\u0641\u0627\u0638 \u0639\u0644\u0649 \u0627\u0644\u062a\u063a\u064a\u064a\u0631\u0627\u062a."
          : "This letter is linked to version: {name}. Update the version to keep any edits."
      ),
      coverLetterGenerate: baseLocale.coverLetterGenerate || (isArabic ? "\u0623\u0646\u0634\u0626 \u0645\u0633\u0648\u062f\u0629" : "Generate draft"),
      coverLetterApply: baseLocale.coverLetterApply || (isArabic ? "\u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0627\u0642\u062a\u0631\u0627\u062d" : "Apply suggestion"),
      coverLetterRegenerate: baseLocale.coverLetterRegenerate || (isArabic ? "\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u062a\u0648\u0644\u064a\u062f" : "Regenerate"),
      coverLetterCopy: baseLocale.coverLetterCopy || (isArabic ? "\u0646\u0633\u062e \u0646\u0635 \u0639\u0627\u062f\u064a" : "Copy plain text"),
      coverLetterSavePdf: baseLocale.coverLetterSavePdf || (isArabic ? "\u062d\u0641\u0638 PDF \u0644\u0644\u062e\u0637\u0627\u0628" : "Save PDF Now"),
      coverLetterGenerating: baseLocale.coverLetterGenerating || (isArabic ? "\u062c\u0627\u0631\u064a \u0625\u0639\u062f\u0627\u062f \u0645\u0633\u0648\u062f\u0629 \u0627\u0644\u062e\u0637\u0627\u0628..." : "Generating cover letter draft..."),
      coverLetterSuggestionTitle: baseLocale.coverLetterSuggestionTitle || (isArabic ? "\u0627\u0644\u0645\u0633\u0648\u062f\u0629 \u0627\u0644\u0645\u0642\u062a\u0631\u062d\u0629" : "Suggested draft"),
      coverLetterCopySuccess: baseLocale.coverLetterCopySuccess || (isArabic ? "\u062a\u0645 \u0646\u0633\u062e \u0627\u0644\u062e\u0637\u0627\u0628." : "Cover letter copied."),
      coverLetterGenerateFailed: baseLocale.coverLetterGenerateFailed || (isArabic ? "\u062a\u0639\u0630\u0631 \u0625\u0639\u062f\u0627\u062f \u0645\u0633\u0648\u062f\u0629 \u0627\u0644\u062e\u0637\u0627\u0628." : "Could not generate the cover letter draft."),
      coverLetterAiFallback: baseLocale.coverLetterAiFallback || (isArabic ? "\u062a\u0639\u0630\u0631 \u062a\u062d\u0633\u064a\u0646 AI\u060c \u0641\u062a\u0645 \u0627\u0644\u0627\u0639\u062a\u0645\u0627\u062f \u0639\u0644\u0649 \u0645\u0633\u0648\u062f\u0629 \u0645\u062d\u0644\u064a\u0629." : "AI refinement was unavailable, so the local draft was kept."),
      coverLetterGreetingPrefix: baseLocale.coverLetterGreetingPrefix || (isArabic ? "\u0627\u0644\u0633\u0627\u062f\u0629" : "Dear"),
      coverLetterRecipientFallback: baseLocale.coverLetterRecipientFallback || (isArabic ? "\u0641\u0631\u064a\u0642 \u0627\u0644\u062a\u0648\u0638\u064a\u0641" : "Hiring Team"),
      coverLetterRoleFallback: baseLocale.coverLetterRoleFallback || (isArabic ? "\u0627\u0644\u0648\u0638\u064a\u0641\u0629 \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641\u0629" : "target role"),
      coverLetterCompanyFallback: baseLocale.coverLetterCompanyFallback || (isArabic ? "\u0627\u0644\u0634\u0631\u0643\u0629" : "your company"),
      coverLetterSubjectLabel: baseLocale.coverLetterSubjectLabel || (isArabic ? "\u0627\u0644\u0645\u0648\u0636\u0648\u0639" : "Subject"),
      coverLetterSignoff: baseLocale.coverLetterSignoff || (isArabic ? "\u0645\u0639 \u062e\u0627\u0644\u0635 \u0627\u0644\u062a\u0642\u062f\u064a\u0631\u060c" : "Sincerely,"),
      saveNewVersion: baseLocale.saveNewVersion || (isArabic ? "\u062d\u0641\u0638 \u0643\u0646\u0633\u062e\u0629" : "Save as version"),
      updateVersion: baseLocale.updateVersion || (isArabic ? "\u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0646\u0633\u062e\u0629" : "Update version"),
      loadVersion: baseLocale.loadVersion || (isArabic ? "\u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0646\u0633\u062e\u0629" : "Load version"),
      renameVersion: baseLocale.renameVersion || (isArabic ? "\u0625\u0639\u0627\u062f\u0629 \u062a\u0633\u0645\u064a\u0629" : "Rename"),
      deleteVersion: baseLocale.deleteVersion || (isArabic ? "\u062d\u0630\u0641 \u0627\u0644\u0646\u0633\u062e\u0629" : "Delete"),
      exportVersions: baseLocale.exportVersions || (isArabic ? "\u062a\u0635\u062f\u064a\u0631 \u0627\u0644\u0646\u0633\u062e" : "Export versions"),
      importVersions: baseLocale.importVersions || (isArabic ? "\u0627\u0633\u062a\u064a\u0631\u0627\u062f \u0627\u0644\u0646\u0633\u062e" : "Import versions"),
      saveNewVersionPrompt: baseLocale.saveNewVersionPrompt || (isArabic ? "\u0627\u0633\u0645 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u062c\u062f\u064a\u062f\u0629" : "Name the new version"),
      renameVersionPrompt: baseLocale.renameVersionPrompt || (isArabic ? "\u0627\u0633\u0645 \u0627\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u062c\u062f\u064a\u062f" : "Rename this version"),
      deleteVersionConfirm: baseLocale.deleteVersionConfirm || (isArabic ? "\u0647\u0644 \u062a\u0631\u064a\u062f \u062d\u0630\u0641 \u0627\u0644\u0646\u0633\u062e\u0629 \"{name}\"\u061f" : "Delete version \"{name}\"?"),
      importVersionsInvalid: baseLocale.importVersionsInvalid || (isArabic ? "\u0645\u0644\u0641 \u0627\u0644\u0646\u0633\u062e \u063a\u064a\u0631 \u0635\u0627\u0644\u062d." : "The selected versions file is not valid."),
      importVersionsFailed: baseLocale.importVersionsFailed || (isArabic ? "\u062a\u0639\u0630\u0631 \u0627\u0633\u062a\u064a\u0631\u0627\u062f \u0627\u0644\u0646\u0633\u062e." : "Could not import the versions file."),
      importVersionsLanguageMismatch: baseLocale.importVersionsLanguageMismatch || (isArabic ? "\u0647\u0630\u0627 \u0627\u0644\u0645\u0644\u0641 \u0644\u0644\u063a\u0629 \u0645\u062e\u062a\u0644\u0641\u0629." : "This versions file belongs to the other language page."),
      savePdfNow: baseLocale.savePdfNow || (isArabic ? "\u062d\u0641\u0638 PDF \u0645\u0628\u0627\u0634\u0631\u0629" : "Save PDF Now"),
      documentModeResume: baseLocale.documentModeResume || "CV",
      documentModeCoverLetter: baseLocale.documentModeCoverLetter || (isArabic ? "\u0627\u0644\u062e\u0637\u0627\u0628" : "Cover Letter"),
      pdfHelperReady: baseLocale.pdfHelperReady || (isArabic ? "\u0645\u0633\u0627\u0639\u062f PDF \u062c\u0627\u0647\u0632" : "Live PDF helper ready"),
      pdfHelperOffline: baseLocale.pdfHelperOffline || (isArabic ? "\u0645\u0633\u0627\u0639\u062f PDF \u063a\u064a\u0631 \u0645\u062a\u0635\u0644" : "Live PDF helper offline"),
      pdfHelperChecking: baseLocale.pdfHelperChecking || (isArabic ? "\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0645\u0633\u0627\u0639\u062f PDF" : "Checking live PDF helper"),
      pdfHelperOfflineMessage: baseLocale.pdfHelperOfflineMessage || (isArabic ? "\u0645\u0634\u063a\u0644 \u0627\u0644\u0645\u0633\u0627\u0639\u062f \u0627\u0644\u0645\u062d\u0644\u064a \u063a\u064a\u0631 \u0645\u062a\u0627\u062d. \u0634\u063a\u0644 tools/start-pdf-helper.cmd \u062b\u0645 \u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649." : "The local PDF helper is not running. Start `tools/start-pdf-helper.cmd` and try again."),
      hostedApiReady: baseLocale.hostedApiReady || (isArabic ? "\u0627\u0644\u062e\u062f\u0645\u0627\u062a \u0627\u0644\u0645\u0633\u062a\u0636\u0627\u0641\u0629 \u062c\u0627\u0647\u0632\u0629" : "Hosted assistant API ready"),
      hostedApiOffline: baseLocale.hostedApiOffline || (isArabic ? "\u0627\u0644\u062e\u062f\u0645\u0627\u062a \u0627\u0644\u0645\u0633\u062a\u0636\u0627\u0641\u0629 \u063a\u064a\u0631 \u0645\u062a\u0627\u062d\u0629" : "Hosted assistant API unavailable"),
      hostedPrintReady: baseLocale.hostedPrintReady || (isArabic ? "\u0627\u0644\u0637\u0628\u0627\u0639\u0629 \u0627\u0644\u0645\u0633\u062a\u0636\u0627\u0641\u0629 \u062c\u0627\u0647\u0632\u0629" : "Hosted browser print is ready"),
      hostedApiMissing: baseLocale.hostedApiMissing || (isArabic ? "\u0644\u0645 \u064a\u062a\u0645 \u0625\u0639\u062f\u0627\u062f API \u0644\u0644\u0645\u0648\u0642\u0639 \u0627\u0644\u0645\u0633\u062a\u0636\u0627\u0641" : "Hosted API is not configured for this site"),
      hostedApiOfflineMessage: baseLocale.hostedApiOfflineMessage || (isArabic ? "\u062a\u0639\u0630\u0631 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 API \u0627\u0644\u0645\u0633\u062a\u0636\u0627\u0641. \u062a\u062d\u0642\u0642 \u0645\u0646 runtime-config.js \u0648\u0627\u0644\u062e\u062f\u0645\u0629 \u0627\u0644\u062e\u0644\u0641\u064a\u0629." : "Could not reach the hosted API. Check `runtime-config.js` and the deployed backend."),
      pdfPrintPreferredMessage: baseLocale.pdfPrintPreferredMessage || (isArabic ? "\u0641\u064a \u0627\u0644\u0645\u0648\u0642\u0639 \u0627\u0644\u0645\u0633\u062a\u0636\u0627\u0641\u060c \u064a\u062a\u0645 \u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0637\u0628\u0627\u0639\u0629 \u0627\u0644\u0645\u062a\u0635\u0641\u062d \u0644\u062d\u0641\u0638 PDF." : "On the hosted site, use the browser print dialog to save PDF."),
      pdfExportSaving: baseLocale.pdfExportSaving || (isArabic ? "\u062c\u0627\u0631\u064a \u062d\u0641\u0638 PDF" : "Saving PDF..."),
      pdfExportSuccess: baseLocale.pdfExportSuccess || (isArabic ? "\u062a\u0645 \u062d\u0641\u0638 PDF: {path}" : "Saved PDF: {path}"),
      pdfExportFailed: baseLocale.pdfExportFailed || (isArabic ? "\u062a\u0639\u0630\u0631 \u062d\u0641\u0638 PDF \u0627\u0644\u0645\u0628\u0627\u0634\u0631." : "Could not save the live PDF."),
      aiTitle: baseLocale.aiTitle || (isArabic ? "\u0625\u0639\u062f\u0627\u062f\u0627\u062a AI" : "AI Rewrite Settings"),
      aiUseWhenAvailable: baseLocale.aiUseWhenAvailable || (isArabic ? "\u0627\u0633\u062a\u062e\u062f\u0645 AI \u0639\u0646\u062f \u0627\u0644\u062a\u0648\u0641\u0631" : "Use AI when available"),
      aiProvider: baseLocale.aiProvider || (isArabic ? "\u0645\u0632\u0648\u062f AI" : "AI provider"),
      aiProviderOpenAi: baseLocale.aiProviderOpenAi || "OpenAI",
      aiProviderOpenRouter: baseLocale.aiProviderOpenRouter || "OpenRouter",
      aiProviderOpenRouterAuto: baseLocale.aiProviderOpenRouterAuto || "OpenRouter Auto",
      aiProviderOpenRouterFree: baseLocale.aiProviderOpenRouterFree || "OpenRouter Free",
      aiProviderOpenRouterManual: baseLocale.aiProviderOpenRouterManual || "OpenRouter Manual",
      aiApiKey: baseLocale.aiApiKey || (isArabic ? "\u0645\u0641\u062a\u0627\u062d API" : "API key"),
      aiApiKeyPlaceholder: baseLocale.aiApiKeyPlaceholder || "sk-...",
      aiModel: baseLocale.aiModel || (isArabic ? "\u0627\u0644\u0646\u0645\u0648\u0630\u062c" : "Model"),
      aiModelPlaceholder: baseLocale.aiModelPlaceholder || "gpt-4o-mini",
      aiHint: baseLocale.aiHint || (isArabic ? "\u064a\u0628\u0642\u0649 \u0627\u0644\u062f\u0639\u0645 \u0627\u0644\u0630\u0643\u064a \u0627\u062e\u062a\u064a\u0627\u0631\u064a\u064b\u0627 \u0648\u064a\u0628\u0642\u0649 \u0627\u0644\u0645\u0641\u062a\u0627\u062d \u0645\u062d\u0644\u064a\u064b\u0627 \u0641\u0642\u0637." : "AI fallback is optional and the key stays local to this browser."),
      aiHintOpenRouter: baseLocale.aiHintOpenRouter || (isArabic ? "\u0627\u0633\u062a\u062e\u062f\u0645 \u0645\u0641\u062a\u0627\u062d OpenRouter \u0645\u0639 \u0646\u0645\u0648\u0630\u062c \u0645\u062b\u0644 openai/gpt-4.1-mini\u060c \u0648\u064a\u0628\u0642\u0649 \u0627\u0644\u0645\u0641\u062a\u0627\u062d \u0645\u062d\u0644\u064a\u064b\u0627 \u0641\u0642\u0637." : "Use your OpenRouter key with a model slug like openai/gpt-4.1-mini. The key stays local to this browser."),
      aiHintOpenRouterAuto: baseLocale.aiHintOpenRouterAuto || (isArabic ? "\u064a\u0633\u062a\u062e\u062f\u0645 OpenRouter Auto \u0646\u0645\u0648\u0630\u062c openrouter/auto \u0644\u0627\u062e\u062a\u064a\u0627\u0631 \u0623\u0641\u0636\u0644 \u0646\u0645\u0648\u0630\u062c \u062a\u0644\u0642\u0627\u0626\u064a\u064b\u0627." : "OpenRouter Auto uses `openrouter/auto` so OpenRouter chooses the model for you."),
      aiHintOpenRouterFree: baseLocale.aiHintOpenRouterFree || (isArabic ? "\u064a\u0633\u062a\u062e\u062f\u0645 OpenRouter Free \u0646\u0645\u0648\u0630\u062c openrouter/free \u0644\u0644\u0645\u062f\u0649 \u0627\u0644\u0645\u062c\u0627\u0646\u064a." : "OpenRouter Free uses `openrouter/free` to route to currently available free models."),
      aiWorkspaceTitle: baseLocale.aiWorkspaceTitle || (isArabic ? "\u0625\u0639\u062f\u0627\u062f\u0627\u062a AI" : "AI Workspace Settings"),
      aiWorkspaceDescription: baseLocale.aiWorkspaceDescription || (isArabic ? "\u062a\u0633\u062a\u062e\u062f\u0645 \u0647\u0630\u0647 \u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0644\u0644\u0623\u0648\u0627\u0645\u0631 \u0648\u0627\u0644\u062c\u0648\u062f\u0629 \u0648ATS \u0648AI HR Review \u0648\u0627\u0644\u062e\u0637\u0627\u0628 \u0648\u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629." : "These AI settings are shared by Commands, Quality, ATS, AI HR Review, cover letter, and Arabic sync."),
      aiSharedWorkspaceHint: baseLocale.aiSharedWorkspaceHint || (isArabic ? "\u062a\u0639\u062a\u0645\u062f \u0647\u0630\u0647 \u0627\u0644\u0645\u064a\u0632\u0629 \u0639\u0644\u0649 \u0646\u0641\u0633 \u0625\u0639\u062f\u0627\u062f\u0627\u062a AI \u0641\u064a \u062a\u0628\u0648\u064a\u0628 Commands." : "This uses the same AI settings configured in the Commands tab."),
      aiRequiresKey: baseLocale.aiRequiresKey || (isArabic ? "\u0623\u062f\u062e\u0644 \u0645\u0641\u062a\u0627\u062d API \u0648\u0641\u0639\u0651\u0644 AI \u0623\u0648\u0644\u064b\u0627." : "Enable AI and add an API key first."),
      aiRequestFailed: baseLocale.aiRequestFailed || (isArabic ? "\u062a\u0639\u0630\u0631 \u0625\u0643\u0645\u0627\u0644 \u0637\u0644\u0628 AI." : "The AI request could not be completed."),
      aiResponseEmpty: baseLocale.aiResponseEmpty || (isArabic ? "\u0631\u062f AI \u0643\u0627\u0646 \u0641\u0627\u0631\u063a\u064b\u0627." : "The AI response was empty."),
      aiResponseInvalidJson: baseLocale.aiResponseInvalidJson || (isArabic ? "\u0631\u062f AI \u0644\u0645 \u064a\u0643\u0646 JSON \u0635\u0627\u0644\u062d\u064b\u0627." : "The AI response was not valid JSON."),
      aiReviewLoading: baseLocale.aiReviewLoading || (isArabic ? "\u062c\u0627\u0631\u064a \u0625\u0639\u062f\u0627\u062f \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629 \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a..." : "Running AI review..."),
      aiReviewClear: baseLocale.aiReviewClear || (isArabic ? "\u0645\u0633\u062d \u0646\u062a\u064a\u062c\u0629 AI" : "Clear AI result"),
      aiReviewScoresTitle: baseLocale.aiReviewScoresTitle || (isArabic ? "\u0646\u062a\u0627\u0626\u062c AI" : "AI Scores"),
      aiReviewTopProblemsTitle: baseLocale.aiReviewTopProblemsTitle || (isArabic ? "\u0623\u0647\u0645 \u0627\u0644\u0645\u0634\u0627\u0643\u0644" : "Top Problems"),
      aiReviewStrongestPointsTitle: baseLocale.aiReviewStrongestPointsTitle || (isArabic ? "\u0623\u0642\u0648\u0649 \u0627\u0644\u0646\u0642\u0627\u0637" : "Strongest Points"),
      aiReviewRecommendationsTitle: baseLocale.aiReviewRecommendationsTitle || (isArabic ? "\u0627\u0644\u062a\u0648\u0635\u064a\u0627\u062a" : "Recommendations"),
      aiReviewRewritesTitle: baseLocale.aiReviewRewritesTitle || (isArabic ? "\u0625\u0639\u0627\u062f\u0627\u062a \u0635\u064a\u0627\u063a\u0629" : "Rewritten Suggestions"),
      aiQualityReviewRun: baseLocale.aiQualityReviewRun || (isArabic ? "\u0645\u0631\u0627\u062c\u0639\u0629 AI \u0644\u0644\u062c\u0648\u062f\u0629" : "Run AI Quality Review"),
      aiQualityReviewTitle: baseLocale.aiQualityReviewTitle || (isArabic ? "\u0645\u0631\u0627\u062c\u0639\u0629 AI \u0644\u0644\u062c\u0648\u062f\u0629" : "AI Quality Review"),
      aiQualityReviewEmpty: baseLocale.aiQualityReviewEmpty || (isArabic ? "\u0634\u063a\u0651\u0644 \u0645\u0631\u0627\u062c\u0639\u0629 AI \u0644\u0631\u0624\u064a\u0629 \u0642\u0631\u0627\u0621\u0629 \u0623\u0630\u0643\u0649 \u0644\u0647\u0630\u0647 \u0627\u0644\u0633\u064a\u0631\u0629." : "Run the AI quality review to get a stricter recruiter-style read of this CV."),
      aiAtsReviewRun: baseLocale.aiAtsReviewRun || (isArabic ? "\u0645\u0631\u0627\u062c\u0639\u0629 AI \u0644ATS" : "Run AI ATS Review"),
      aiAtsReviewTitle: baseLocale.aiAtsReviewTitle || (isArabic ? "\u0645\u0631\u0627\u062c\u0639\u0629 AI \u0644ATS" : "AI ATS Review"),
      aiAtsReviewEmpty: baseLocale.aiAtsReviewEmpty || (isArabic ? "\u0634\u063a\u0651\u0644 \u0645\u0631\u0627\u062c\u0639\u0629 AI \u0644ATS \u0644\u0631\u0624\u064a\u0629 \u0642\u0631\u0627\u0621\u0629 \u0630\u0643\u064a\u0629 \u0644\u0644\u062a\u0637\u0627\u0628\u0642." : "Run the AI ATS review to get a sharper match analysis for this CV."),
      aiHrNavLabel: baseLocale.aiHrNavLabel || (isArabic ? "AI HR" : "AI HR Review"),
      aiHrTitle: baseLocale.aiHrTitle || (isArabic ? "AI HR Review" : "AI HR Review"),
      aiHrDescription: baseLocale.aiHrDescription || (isArabic ? "\u0645\u0631\u0627\u062c\u0639\u0629 \u062d\u0627\u0632\u0645\u0629 \u062a\u062d\u0627\u0643\u064a \u0642\u0631\u0627\u0631 \u0645\u0648\u0638\u0641 HR \u0648\u0645\u062f\u064a\u0631 \u062a\u0648\u0638\u064a\u0641." : "A stricter recruiter and hiring-manager review for real shortlist decisions."),
      aiHrUsesCurrentCvNotice: baseLocale.aiHrUsesCurrentCvNotice || (isArabic ? "\u062a\u0633\u062a\u062e\u062f\u0645 \u0647\u0630\u0647 \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0633\u064a\u0631\u0629 \u0627\u0644\u062d\u0627\u0644\u064a\u0629 \u0648\u0627\u0644\u0645\u0633\u0645\u0649 \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641 \u0648\u0648\u0635\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u0629." : "This review uses the current CV, target job title, and ATS job description."),
      aiHrRun: baseLocale.aiHrRun || (isArabic ? "\u062a\u0634\u063a\u064a\u0644 AI HR Review" : "Run AI HR Review"),
      aiHrResultsTitle: baseLocale.aiHrResultsTitle || (isArabic ? "\u0646\u062a\u064a\u062c\u0629 AI HR Review" : "AI HR Review"),
      aiHrReviewEmpty: baseLocale.aiHrReviewEmpty || (isArabic ? "\u0634\u063a\u0651\u0644 AI HR Review \u0644\u0631\u0624\u064a\u0629 \u062a\u0642\u064a\u064a\u0645 HR \u0635\u0631\u064a\u062d." : "Run AI HR Review to see a stricter hiring decision review."),
      aiHrFirstImpression: baseLocale.aiHrFirstImpression || (isArabic ? "\u0627\u0644\u0627\u0646\u0637\u0628\u0627\u0639 \u0627\u0644\u0623\u0648\u0644" : "Overall First Impression"),
      aiHrRoleFit: baseLocale.aiHrRoleFit || (isArabic ? "\u0645\u0644\u0627\u0621\u0645\u0629 \u0627\u0644\u062f\u0648\u0631" : "Role Fit"),
      aiHrShortlistDecision: baseLocale.aiHrShortlistDecision || (isArabic ? "\u0642\u0631\u0627\u0631 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0642\u0635\u064a\u0631\u0629" : "Shortlist Decision"),
      aiHrHrReviewSection: baseLocale.aiHrHrReviewSection || (isArabic ? "\u0645\u0631\u0627\u062c\u0639\u0629 HR" : "HR Review"),
      aiHrAtsReviewSection: baseLocale.aiHrAtsReviewSection || (isArabic ? "\u0645\u0631\u0627\u062c\u0639\u0629 ATS" : "ATS Review"),
      aiHrRedFlagsSection: baseLocale.aiHrRedFlagsSection || (isArabic ? "\u0627\u0644\u0639\u0644\u0627\u0645\u0627\u062a \u0627\u0644\u062d\u0645\u0631\u0627\u0621" : "Red Flags"),
      aiHrImprovementsSection: baseLocale.aiHrImprovementsSection || (isArabic ? "\u0623\u0648\u0644\u0648\u064a\u0627\u062a \u0627\u0644\u062a\u062d\u0633\u064a\u0646" : "Improvement Recommendations"),
      aiHrRewritesSection: baseLocale.aiHrRewritesSection || (isArabic ? "\u0627\u0644\u0635\u064a\u0627\u063a\u0627\u062a \u0627\u0644\u0645\u0642\u062a\u0631\u062d\u0629" : "Rewritten Suggestions"),
      rewriteSuggest: baseLocale.rewriteSuggest || (isArabic ? "\u0627\u0642\u062a\u0631\u062d \u0635\u064a\u0627\u063a\u0629" : "Suggest rewrite"),
      rewriteApply: baseLocale.rewriteApply || (isArabic ? "\u062a\u0637\u0628\u064a\u0642" : "Apply"),
      rewriteRegenerate: baseLocale.rewriteRegenerate || (isArabic ? "\u0625\u0639\u0627\u062f\u0629 \u062a\u0648\u0644\u064a\u062f" : "Regenerate"),
      rewriteLoading: baseLocale.rewriteLoading || (isArabic ? "\u062c\u0627\u0631\u064a \u0625\u0639\u062f\u0627\u062f \u0627\u0642\u062a\u0631\u0627\u062d..." : "Generating rewrite suggestion..."),
      rewriteSuggestionLabel: baseLocale.rewriteSuggestionLabel || (isArabic ? "\u0627\u0644\u0627\u0642\u062a\u0631\u0627\u062d" : "Suggestion"),
      rewriteEmpty: baseLocale.rewriteEmpty || (isArabic ? "\u0627\u0643\u062a\u0628 \u0646\u0635\u064b\u0627 \u0623\u0648\u0644\u064b\u0627 \u0644\u0625\u0639\u0627\u062f\u0629 \u0635\u064a\u0627\u063a\u062a\u0647." : "Write some text first before asking for a rewrite."),
      rewriteAiFallback: baseLocale.rewriteAiFallback || (isArabic ? "\u062a\u0639\u0630\u0631 AI\u060c \u062a\u0645 \u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0627\u0642\u062a\u0631\u0627\u062d \u0645\u062d\u0644\u064a." : "AI was unavailable, so a local rewrite suggestion was used."),
      rewriteFailed: baseLocale.rewriteFailed || (isArabic ? "\u062a\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u0627\u0642\u062a\u0631\u0627\u062d \u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0635\u064a\u0627\u063a\u0629." : "Could not create a rewrite suggestion."),
      commandOpen: baseLocale.commandOpen || (isArabic ? "\u0623\u0645\u0631 AI" : "AI Command"),
      commandGeneratePreview: baseLocale.commandGeneratePreview || (isArabic ? "\u0625\u0646\u0634\u0627\u0621 \u0645\u0639\u0627\u064a\u0646\u0629" : "Generate preview"),
      commandApply: baseLocale.commandApply || (isArabic ? "\u062a\u0637\u0628\u064a\u0642" : "Apply"),
      commandCancel: baseLocale.commandCancel || (isArabic ? "\u0625\u0644\u063a\u0627\u0621" : "Cancel"),
      commandScopeLabel: baseLocale.commandScopeLabel || (isArabic ? "\u0627\u0644\u0646\u0637\u0627\u0642" : "Scope"),
      commandScopeField: baseLocale.commandScopeField || (isArabic ? "\u0627\u0644\u062d\u0642\u0644 \u0627\u0644\u0645\u062d\u062f\u062f" : "Selected text"),
      commandScopeSection: baseLocale.commandScopeSection || (isArabic ? "\u0627\u0644\u0642\u0633\u0645 \u0627\u0644\u062d\u0627\u0644\u064a" : "Current section"),
      commandScopeResume: baseLocale.commandScopeResume || (isArabic ? "\u0643\u0627\u0645\u0644 \u0627\u0644\u0633\u064a\u0631\u0629" : "Whole CV"),
      commandPromptLabel: baseLocale.commandPromptLabel || (isArabic ? "\u0627\u0644\u0623\u0645\u0631" : "Command"),
      commandPromptPlaceholder: baseLocale.commandPromptPlaceholder || (isArabic ? "\u0645\u062b\u0627\u0644: \u063a\u064a\u0631 change Delivered technical support to Provided technical support" : "Example: change Delivered technical support to Provided technical support"),
      commandSelectedTextLabel: baseLocale.commandSelectedTextLabel || (isArabic ? "\u0627\u0644\u0646\u0635 \u0627\u0644\u0645\u062d\u062f\u062f: {text}" : "Selected text: {text}"),
      commandBeforeLabel: baseLocale.commandBeforeLabel || (isArabic ? "\u0642\u0628\u0644" : "Before"),
      commandAfterLabel: baseLocale.commandAfterLabel || (isArabic ? "\u0628\u0639\u062f" : "After"),
      commandEmptySelection: baseLocale.commandEmptySelection || (isArabic ? "\u0644\u0627 \u064a\u0648\u062c\u062f \u0646\u0635." : "No text."),
      commandSelectText: baseLocale.commandSelectText || (isArabic ? "\u062d\u062f\u062f \u0646\u0635\u064b\u0627 \u0623\u0648\u0644\u064b\u0627 \u062b\u0645 \u0627\u0641\u062a\u062d \u0623\u0645\u0631 AI." : "Select some text first, then open AI Command."),
      commandRequiresAi: baseLocale.commandRequiresAi || (isArabic ? "\u0623\u062f\u062e\u0644 \u0645\u0641\u062a\u0627\u062d API \u0644\u0627\u0633\u062a\u062e\u062f\u0627\u0645 AI Command." : "Add your AI API key first to use AI Command."),
      commandPromptEmpty: baseLocale.commandPromptEmpty || (isArabic ? "\u0627\u0643\u062a\u0628 \u0623\u0645\u0631\u064b\u0627 \u0623\u0648\u0644\u064b\u0627." : "Write a command first."),
      commandLoading: baseLocale.commandLoading || (isArabic ? "\u062c\u0627\u0631\u064a \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0645\u0639\u0627\u064a\u0646\u0629..." : "Generating command preview..."),
      commandFailed: baseLocale.commandFailed || (isArabic ? "\u062a\u0639\u0630\u0631 \u062a\u0646\u0641\u064a\u0630 \u0623\u0645\u0631 AI." : "Could not run the AI command."),
      commandsNavLabel: baseLocale.commandsNavLabel || (isArabic ? "\u0627\u0644\u0623\u0648\u0627\u0645\u0631" : "Commands"),
      commandsTitle: baseLocale.commandsTitle || (isArabic ? "\u0627\u0644\u0623\u0648\u0627\u0645\u0631" : "Commands"),
      commandsDescription: baseLocale.commandsDescription || (isArabic ? "\u062d\u062f\u062f \u0627\u0644\u0623\u0642\u0633\u0627\u0645\u060c \u0627\u0643\u062a\u0628 \u0623\u0645\u0631\u064b\u0627\u060c \u062b\u0645 \u0631\u0627\u062c\u0639 \u0627\u0644\u0646\u062a\u064a\u062c\u0629 \u0642\u0628\u0644 \u062a\u0637\u0628\u064a\u0642\u0647\u0627." : "Choose sections, write a command, preview the result, then apply only the changes you want."),
      commandsEnglishOnly: baseLocale.commandsEnglishOnly || (isArabic ? "\u0647\u0630\u0627 \u0627\u0644\u062a\u0628\u0648\u064a\u0628 \u0645\u062e\u0635\u0635 \u0644\u0644\u0635\u0641\u062d\u0629 \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629." : "The Commands tab is available on the English page only."),
      commandsWorkflowHint: baseLocale.commandsWorkflowHint || (isArabic ? "\u0627\u0628\u062f\u0623 \u0628\u0627\u062e\u062a\u064a\u0627\u0631 \u0642\u0633\u0645 \u0648\u0627\u062d\u062f \u0623\u0648 \u0623\u0643\u062b\u0631\u060c \u062b\u0645 \u0627\u0643\u062a\u0628 \u0623\u0645\u0631\u064b\u0627 \u0648\u0623\u0644\u0635\u0642 \u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u0625\u0630\u0627 \u0644\u0632\u0645." : "Choose one or more sections, write a command, and paste replacement content when needed."),
      commandsTargetsLabel: baseLocale.commandsTargetsLabel || (isArabic ? "\u0627\u0644\u0623\u0642\u0633\u0627\u0645 \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641\u0629" : "Target sections"),
      commandsPromptLabel: baseLocale.commandsPromptLabel || (isArabic ? "\u0627\u0644\u0623\u0645\u0631" : "Command"),
      commandsPromptPlaceholder: baseLocale.commandsPromptPlaceholder || (isArabic ? "\u0645\u062b\u0627\u0644: add these in skills and remove the old ones" : "Example: add these in skills and remove the old ones"),
      commandsContentLabel: baseLocale.commandsContentLabel || (isArabic ? "\u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u0623\u0645\u0631" : "Bulk content"),
      commandsContentPlaceholder: baseLocale.commandsContentPlaceholder || (isArabic ? "\u0623\u0644\u0635\u0642 \u0647\u0646\u0627 \u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u0630\u064a \u064a\u062c\u0628 \u0627\u0633\u062a\u0628\u062f\u0627\u0644\u0647 \u0623\u0648 \u0625\u0636\u0627\u0641\u062a\u0647." : "Paste the structured content that should replace or extend the selected sections."),
      commandsGeneratePreview: baseLocale.commandsGeneratePreview || (isArabic ? "\u0625\u0646\u0634\u0627\u0621 \u0645\u0639\u0627\u064a\u0646\u0629" : "Generate preview"),
      commandsApply: baseLocale.commandsApply || (isArabic ? "\u062a\u0637\u0628\u064a\u0642" : "Apply"),
      commandsClear: baseLocale.commandsClear || (isArabic ? "\u0645\u0633\u062d" : "Clear"),
      commandsFallbackTitle: baseLocale.commandsFallbackTitle || (isArabic ? "\u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0627\u0644\u062f\u0639\u0645 \u0627\u0644\u0630\u0643\u064a" : "Command fallback settings"),
      commandsFallbackEnabled: baseLocale.commandsFallbackEnabled || (isArabic ? "\u0627\u0633\u062a\u062e\u062f\u0627\u0645 AI \u0639\u0646\u062f \u0627\u0644\u062d\u0627\u062c\u0629" : "Use AI fallback when needed"),
      commandsSelectAtLeastOne: baseLocale.commandsSelectAtLeastOne || (isArabic ? "\u0627\u062e\u062a\u0631 \u0642\u0633\u0645\u064b\u0627 \u0648\u0627\u062d\u062f\u064b\u0627 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644." : "Select at least one target section."),
      commandsCommandRequired: baseLocale.commandsCommandRequired || (isArabic ? "\u0627\u0643\u062a\u0628 \u0623\u0645\u0631\u064b\u0627 \u0623\u0648\u0644\u064b\u0627." : "Write a command first."),
      commandsContentRequired: baseLocale.commandsContentRequired || (isArabic ? "\u0623\u0636\u0641 \u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u0645\u0631\u0627\u062f \u062a\u0637\u0628\u064a\u0642\u0647." : "Paste the content that should be applied."),
      commandsLoading: baseLocale.commandsLoading || (isArabic ? "\u062c\u0627\u0631\u064a \u0625\u0639\u062f\u0627\u062f \u0645\u0639\u0627\u064a\u0646\u0629 \u0627\u0644\u0623\u0645\u0631..." : "Generating command preview..."),
      commandsPreviewFailed: baseLocale.commandsPreviewFailed || (isArabic ? "\u062a\u0639\u0630\u0631 \u0625\u0639\u062f\u0627\u062f \u0645\u0639\u0627\u064a\u0646\u0629 \u0627\u0644\u0623\u0645\u0631." : "Could not build the command preview."),
      commandsFallbackUnavailable: baseLocale.commandsFallbackUnavailable || (isArabic ? "\u0644\u0627 \u064a\u0648\u062c\u062f AI \u0645\u0641\u0639\u0644 \u0644\u0645\u0639\u0627\u0644\u062c\u0629 \u0647\u0630\u0627 \u0627\u0644\u0623\u0645\u0631." : "This command needs the optional AI fallback, but fallback is not configured."),
      commandsFallbackFailed: baseLocale.commandsFallbackFailed || (isArabic ? "\u062a\u0639\u0630\u0631 \u062a\u062e\u0637\u064a\u0637 \u0627\u0644\u0623\u0645\u0631 \u0628\u0627\u0644\u062f\u0639\u0645 \u0627\u0644\u0630\u0643\u064a." : "Could not plan the command with AI fallback."),
      commandsFallbackNeeded: baseLocale.commandsFallbackNeeded || (isArabic ? "\u0647\u0630\u0627 \u0627\u0644\u0623\u0645\u0631 \u064a\u062d\u062a\u0627\u062c \u062f\u0639\u0645\u064b\u0627 \u0623\u0630\u0643\u0649 \u0645\u0646 \u0627\u0644\u0645\u062d\u0644\u064a." : "This command needs either more structure or the optional AI fallback."),
      commandsBeforeLabel: baseLocale.commandsBeforeLabel || (isArabic ? "\u0642\u0628\u0644" : "Before"),
      commandsAfterLabel: baseLocale.commandsAfterLabel || (isArabic ? "\u0628\u0639\u062f" : "After"),
      commandsEmptyValue: baseLocale.commandsEmptyValue || (isArabic ? "\u0644\u0627 \u064a\u0648\u062c\u062f \u0645\u062d\u062a\u0648\u0649." : "No content."),
      commandsLocalPreviewReady: baseLocale.commandsLocalPreviewReady || (isArabic ? "\u062a\u0645 \u0625\u0639\u062f\u0627\u062f \u0645\u0639\u0627\u064a\u0646\u0629 \u0645\u062d\u0644\u064a\u0629 \u0642\u0628\u0644 \u0627\u0644\u062a\u0637\u0628\u064a\u0642." : "Local command preview is ready."),
      commandsFallbackPreviewReady: baseLocale.commandsFallbackPreviewReady || (isArabic ? "\u062a\u0645 \u0625\u0639\u062f\u0627\u062f \u0645\u0639\u0627\u064a\u0646\u0629 \u0628\u0627\u0644\u062f\u0639\u0645 \u0627\u0644\u0630\u0643\u064a." : "Fallback command preview is ready."),
      commandsLocalPreviewNote: baseLocale.commandsLocalPreviewNote || (isArabic ? "\u062a\u0645 \u062a\u062d\u0644\u064a\u0644 \u0627\u0644\u0623\u0645\u0631 \u0645\u062d\u0644\u064a\u064b\u0627." : "This preview was planned locally."),
      commandsMultiSectionPreviewNote: baseLocale.commandsMultiSectionPreviewNote || (isArabic ? "\u062a\u0645 \u0625\u0639\u062f\u0627\u062f \u0645\u0639\u0627\u064a\u0646\u0629 \u0644\u0639\u062f\u0629 \u0623\u0642\u0633\u0627\u0645." : "Preview prepared for multiple sections."),
      commandsAppendPreviewNote: baseLocale.commandsAppendPreviewNote || (isArabic ? "\u0633\u064a\u062a\u0645 \u0625\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u062f\u0648\u0646 \u0625\u0632\u0627\u0644\u0629 \u0627\u0644\u0645\u0648\u062c\u0648\u062f." : "This content will be added after the existing section content."),
      commandsRenameSingleOnly: baseLocale.commandsRenameSingleOnly || (isArabic ? "\u0625\u0639\u0627\u062f\u0629 \u062a\u0633\u0645\u064a\u0629 \u0627\u0644\u0642\u0633\u0645 \u062a\u0639\u0645\u0644 \u0644\u0642\u0633\u0645 \u0648\u0627\u062d\u062f \u0641\u0642\u0637." : "Section renaming works with one selected section at a time."),
      commandsStructuredMultiSectionRequired: baseLocale.commandsStructuredMultiSectionRequired || (isArabic ? "\u0639\u0646\u062f \u0627\u062e\u062a\u064a\u0627\u0631 \u0623\u0643\u062b\u0631 \u0645\u0646 \u0642\u0633\u0645\u060c \u0646\u0638\u0645 \u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u062a\u062d\u062a \u0639\u0646\u0627\u0648\u064a\u0646 \u0627\u0644\u0623\u0642\u0633\u0627\u0645." : "When multiple sections are selected, organize the pasted content under matching section headings."),
      commandsStructuredItemsRequired: baseLocale.commandsStructuredItemsRequired || (isArabic ? "\u0644\u0645 \u064a\u062a\u0645 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u0649 \u0639\u0646\u0627\u0635\u0631 \u0635\u0627\u0644\u062d\u0629 \u0641\u064a \u0627\u0644\u0645\u062d\u062a\u0648\u0649." : "No valid items were found in the pasted content."),
      commandsSkillsFormatRequired: baseLocale.commandsSkillsFormatRequired || (isArabic ? "\u0627\u0643\u062a\u0628 \u0627\u0644\u0645\u0647\u0627\u0631\u0627\u062a \u0628\u0635\u064a\u063a\u0629 Label: items." : "Write skills in the format Label: items."),
      pdfImportTitle: baseLocale.pdfImportTitle || (isArabic ? "\u0627\u0633\u062a\u064a\u0631\u0627\u062f CV \u0645\u0646 PDF" : "Autofill From PDF"),
      pdfImportDescription: baseLocale.pdfImportDescription || (isArabic ? "\u0627\u0631\u0641\u0639 \u0645\u0644\u0641 PDF \u0644\u0644\u0633\u064a\u0631\u0629 \u0644\u0627\u0633\u062a\u062e\u0631\u0627\u062c \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0648\u0645\u0631\u0627\u062c\u0639\u062a\u0647\u0627 \u0642\u0628\u0644 \u0627\u0644\u062a\u0637\u0628\u064a\u0642." : "Upload a CV PDF, review the extracted fields, then apply them into the editor."),
      pdfImportUpload: baseLocale.pdfImportUpload || (isArabic ? "\u0631\u0641\u0639 CV PDF" : "Upload CV PDF"),
      pdfImportDropzone: baseLocale.pdfImportDropzone || (isArabic ? "\u0627\u0633\u062d\u0628 \u0645\u0644\u0641 PDF \u0644\u0644\u0633\u064a\u0631\u0629 \u0648\u0623\u0641\u0644\u062a\u0647 \u0647\u0646\u0627" : "Drag and drop a CV PDF here"),
      pdfImportLoading: baseLocale.pdfImportLoading || (isArabic ? "\u062c\u0627\u0631\u064a \u0627\u0633\u062a\u062e\u0631\u0627\u062c \u0628\u064a\u0627\u0646\u0627\u062a PDF..." : "Extracting PDF content..."),
      pdfImportLanguageNotice: baseLocale.pdfImportLanguageNotice || (isArabic ? "\u0627\u0644\u0627\u0633\u062a\u064a\u0631\u0627\u062f \u0645\u0646 PDF \u0645\u062a\u0627\u062d \u062d\u0627\u0644\u064a\u064b\u0627 \u0644\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629 \u0641\u0642\u0637." : "PDF autofill is currently available on the English page only."),
      pdfImportFailed: baseLocale.pdfImportFailed || (isArabic ? "\u062a\u0639\u0630\u0631 \u0627\u0633\u062a\u064a\u0631\u0627\u062f \u0627\u0644\u0633\u064a\u0631\u0629 \u0645\u0646 PDF." : "Could not import resume data from the PDF."),
      pdfImportFileRequired: baseLocale.pdfImportFileRequired || (isArabic ? "\u0627\u062e\u062a\u0631 \u0645\u0644\u0641 PDF \u0635\u0627\u0644\u062d." : "Choose a valid PDF file."),
      pdfImportHostedUnavailable: baseLocale.pdfImportHostedUnavailable || (isArabic ? "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0645\u0643\u062a\u0628\u0629 \u0642\u0631\u0627\u0621\u0629 PDF \u0644\u0644\u0646\u0633\u062e\u0629 \u0627\u0644\u0645\u0633\u062a\u0636\u0627\u0641\u0629." : "Could not load the browser PDF parser for the hosted site."),
      pdfImportLowTextWarning: baseLocale.pdfImportLowTextWarning || (isArabic ? "\u062a\u0645 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u0649 \u0642\u0644\u064a\u0644 \u0645\u0646 \u0627\u0644\u0646\u0635 \u0627\u0644\u0642\u0627\u0628\u0644 \u0644\u0644\u0627\u0633\u062a\u062e\u0631\u0627\u062c \u0641\u064a \u0647\u0630\u0627 PDF." : "Very little extractable text was found in this PDF."),
      pdfImportHeaderWarning: baseLocale.pdfImportHeaderWarning || (isArabic ? "\u0628\u0639\u0636 \u0623\u0633\u0637\u0631 \u0627\u0644\u0639\u0646\u0648\u0627\u0646 \u0644\u0645 \u064a\u062a\u0645 \u062a\u0648\u0632\u064a\u0639\u0647\u0627 \u0628\u0634\u0643\u0644 \u062f\u0642\u064a\u0642 \u0648\u0642\u062f \u062a\u062d\u062a\u0627\u062c \u0645\u0631\u0627\u062c\u0639\u0629." : "Some header lines could not be mapped exactly and may need review."),
      pdfImportNoSectionContent: baseLocale.pdfImportNoSectionContent || (isArabic ? "\u0644\u0645 \u064a\u062a\u0645 \u062a\u062d\u062f\u064a\u062f \u0645\u062d\u062a\u0648\u0649 \u0648\u0627\u0636\u062d \u0644\u0647\u0630\u0627 \u0627\u0644\u0642\u0633\u0645." : "No content was confidently mapped for this section."),
      pdfImportReviewTitle: baseLocale.pdfImportReviewTitle || (isArabic ? "\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a \u0627\u0644\u0645\u0633\u062a\u062e\u0631\u062c\u0629" : "Review Extracted Content"),
      pdfImportReviewMeta: baseLocale.pdfImportReviewMeta || (isArabic ? "\u0646\u0648\u0639 \u0627\u0644\u0627\u0633\u062a\u062e\u0631\u0627\u062c: {source}" : "Extraction source: {source}"),
      pdfImportReviewMetaAi: baseLocale.pdfImportReviewMetaAi || (isArabic ? "\u0646\u0648\u0639 \u0627\u0644\u0627\u0633\u062a\u062e\u0631\u0627\u062c: {source} \u00b7 \u062a\u0645 \u062a\u062d\u0633\u064a\u0646 \u0627\u0644\u062a\u0639\u064a\u064a\u0646 \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a" : "Extraction source: {source} \u00b7 AI-assisted mapping was used"),
      pdfImportSourceText: baseLocale.pdfImportSourceText || (isArabic ? "PDF \u0646\u0635\u064a" : "Text PDF"),
      pdfImportSourceOcr: baseLocale.pdfImportSourceOcr || (isArabic ? "PDF \u0645\u0645\u0633\u0648\u062d/\u0635\u0648\u0631" : "Scanned / image PDF"),
      pdfImportApply: baseLocale.pdfImportApply || (isArabic ? "\u062a\u0637\u0628\u064a\u0642 \u0627\u0644\u0627\u0633\u062a\u064a\u0631\u0627\u062f" : "Apply import"),
      pdfImportCancel: baseLocale.pdfImportCancel || (isArabic ? "\u0625\u0644\u063a\u0627\u0621" : "Cancel"),
      pdfImportIncludeSection: baseLocale.pdfImportIncludeSection || (isArabic ? "\u062a\u0636\u0645\u064a\u0646 \u0627\u0644\u0642\u0633\u0645" : "Include section"),
      pdfImportConfidence: baseLocale.pdfImportConfidence || (isArabic ? "\u0627\u0644\u062b\u0642\u0629: {level}" : "Confidence: {level}"),
      qualityNavLabel: baseLocale.qualityNavLabel || (isArabic ? "\u0627\u0644\u062c\u0648\u062f\u0629" : "Quality"),
      qualityTitle: baseLocale.qualityTitle || (isArabic ? "\u0641\u062d\u0635 \u0627\u0644\u062c\u0648\u062f\u0629" : "Quality Checks"),
      qualityDescription: baseLocale.qualityDescription || (isArabic ? "\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0633\u062a\u0634\u0627\u0631\u064a\u0629 \u0644\u0642\u0648\u0629 \u0627\u0644\u0633\u064a\u0631\u0629 \u0648\u0648\u0636\u0648\u062d\u0647\u0627." : "Advisory checks for clarity, targeting, and export readiness."),
      qualityScoreLabel: baseLocale.qualityScoreLabel || (isArabic ? "\u0646\u062a\u064a\u062c\u0629 \u0627\u0644\u062c\u0648\u062f\u0629" : "Quality score"),
      qualitySummary: baseLocale.qualitySummary || (isArabic ? "\u062d\u0631\u062c: {critical} \u00b7 \u062a\u062d\u0630\u064a\u0631: {warning} \u00b7 \u0645\u0644\u0627\u062d\u0638\u0627\u062a: {info}" : "Critical: {critical} \u00b7 Warnings: {warning} \u00b7 Notes: {info}"),
      qualityNoIssues: baseLocale.qualityNoIssues || (isArabic ? "\u0644\u0627 \u062a\u0648\u062c\u062f \u0645\u0634\u0643\u0644\u0627\u062a \u0648\u0627\u0636\u062d\u0629 \u062d\u0627\u0644\u064a\u064b\u0627." : "No obvious quality issues were found right now."),
      qualityIssuesTitle: baseLocale.qualityIssuesTitle || (isArabic ? "\u0627\u0644\u0645\u0644\u0627\u062d\u0638\u0627\u062a" : "Current findings"),
      qualityOpenItem: baseLocale.qualityOpenItem || (isArabic ? "\u0627\u0641\u062a\u062d \u0627\u0644\u0639\u0646\u0635\u0631" : "Open exact item"),
      qualityOpenSection: baseLocale.qualityOpenSection || (isArabic ? "\u0627\u0641\u062a\u062d \u0627\u0644\u0642\u0633\u0645" : "Open section"),
      qualityMissingProfileTitle: baseLocale.qualityMissingProfileTitle || (isArabic ? "\u0628\u064a\u0627\u0646\u0627\u062a \u0645\u0644\u0641 \u0646\u0627\u0642\u0635\u0629" : "Missing profile info"),
      qualityMissingProfileField: baseLocale.qualityMissingProfileField || (isArabic ? "\u0627\u0644\u062d\u0642\u0644 \"{field}\" \u0641\u0627\u0631\u063a." : "The \"{field}\" field is empty."),
      qualityLinksTitle: baseLocale.qualityLinksTitle || (isArabic ? "\u0627\u0644\u0631\u0648\u0627\u0628\u0637" : "Link quality"),
      qualityLinkedinInvalid: baseLocale.qualityLinkedinInvalid || (isArabic ? "\u0631\u0627\u0628\u0637 LinkedIn \u0645\u0641\u0642\u0648\u062f \u0623\u0648 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d." : "LinkedIn URL is missing or not valid."),
      qualityGithubInvalid: baseLocale.qualityGithubInvalid || (isArabic ? "\u0631\u0627\u0628\u0637 GitHub \u063a\u064a\u0631 \u0635\u0627\u0644\u062d." : "GitHub URL is not valid."),
      qualityPortfolioInvalid: baseLocale.qualityPortfolioInvalid || (isArabic ? "\u0631\u0627\u0628\u0637 \u0627\u0644\u0623\u0639\u0645\u0627\u0644 \u063a\u064a\u0631 \u0635\u0627\u0644\u062d." : "Portfolio URL is not valid."),
      qualityPhoneLinkMissing: baseLocale.qualityPhoneLinkMissing || (isArabic ? "\u0631\u0627\u0628\u0637 \u0627\u0644\u0647\u0627\u062a\u0641 \u0644\u0627 \u064a\u0633\u062a\u062e\u062f\u0645 tel:." : "Phone link should use the tel: format."),
      qualitySummaryTitle: baseLocale.qualitySummaryTitle || (isArabic ? "\u0627\u0644\u0645\u0644\u062e\u0635" : "Summary quality"),
      qualitySummaryWeak: baseLocale.qualitySummaryWeak || (isArabic ? "\u0627\u0644\u0645\u0644\u062e\u0635 \u064a\u062d\u062a\u0627\u062c \u0635\u064a\u0627\u063a\u0629 \u0623\u0642\u0648\u0649 \u0648\u0627\u0633\u062a\u0647\u062f\u0627\u0641\u064b\u0627 \u0623\u0648\u0636\u062d." : "The summary could be stronger and more targeted."),
      qualityBulletsTitle: baseLocale.qualityBulletsTitle || (isArabic ? "\u0646\u0642\u0627\u0637 \u0627\u0644\u0625\u0646\u062c\u0627\u0632" : "Achievement bullets"),
      qualityNoBullets: baseLocale.qualityNoBullets || (isArabic ? "\u0627\u0644\u0639\u0646\u0635\u0631 {item} \u064a\u062d\u062a\u0627\u062c \u0646\u0642\u0627\u0637 \u062f\u0627\u0639\u0645\u0629." : "Item {item} should include supporting bullets."),
      qualityEmptyBullet: baseLocale.qualityEmptyBullet || (isArabic ? "\u0627\u0644\u0639\u0646\u0635\u0631 {item}\u060c \u0627\u0644\u0646\u0642\u0637\u0629 {bullet} \u0641\u0627\u0631\u063a\u0629 \u0623\u0648 \u063a\u064a\u0631 \u062c\u0627\u0647\u0632\u0629." : "Item {item}, bullet {bullet} is empty or placeholder text."),
      qualityLongBullet: baseLocale.qualityLongBullet || (isArabic ? "\u0627\u0644\u0639\u0646\u0635\u0631 {item} \u064a\u062d\u062a\u0648\u064a \u0639\u0644\u0649 \u0646\u0642\u0637\u0629 \u0637\u0648\u064a\u0644\u0629 \u0642\u062f \u062a\u0636\u0639\u0641 \u0627\u0644\u0648\u0636\u0648\u062d." : "Item {item} has a long bullet that may reduce clarity."),
      qualityWeakBulletOpening: baseLocale.qualityWeakBulletOpening || (isArabic ? "\u0627\u0644\u0639\u0646\u0635\u0631 {item} \u064a\u0645\u0643\u0646 \u0623\u0646 \u064a\u0628\u062f\u0623 \u0628\u0641\u0639\u0644 \u0623\u0642\u0648\u0649." : "Item {item} could start with a stronger action verb."),
      qualityRepeatedOpenings: baseLocale.qualityRepeatedOpenings || (isArabic ? "\u062a\u0643\u0631\u0631 \u0627\u0644\u0628\u062f\u0621 \u0628\u0640 \"{word}\" \u0623\u0643\u062b\u0631 \u0645\u0646 \u0627\u0644\u0644\u0627\u0632\u0645." : "Several bullets begin with \"{word}\", which weakens variety."),
      qualityPunctuationTitle: baseLocale.qualityPunctuationTitle || (isArabic ? "\u0639\u0644\u0627\u0645\u0627\u062a \u0627\u0644\u062a\u0631\u0642\u064a\u0645" : "Bullet punctuation"),
      qualityPunctuationMixed: baseLocale.qualityPunctuationMixed || (isArabic ? "\u0646\u0647\u0627\u064a\u0627\u062a \u0627\u0644\u0646\u0642\u0627\u0637 \u063a\u064a\u0631 \u0645\u062a\u0633\u0642\u0629." : "Bullet ending punctuation is inconsistent."),
      qualityLengthTitle: baseLocale.qualityLengthTitle || (isArabic ? "\u0637\u0648\u0644 \u0627\u0644\u0633\u064a\u0631\u0629" : "Length risk"),
      qualityLengthRisk: baseLocale.qualityLengthRisk || (isArabic ? "\u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u064a\u0642\u062a\u0631\u0628 \u0645\u0646 \u062d\u062f \u0627\u0644\u0627\u0645\u062a\u062f\u0627\u062f \u0639\u0644\u0649 A4 \u0648\u064a\u062d\u062a\u0627\u062c \u0627\u062e\u062a\u0635\u0627\u0631\u064b\u0627." : "Content is approaching A4 overflow risk and may need trimming."),
      qualityAtsTitle: baseLocale.qualityAtsTitle || (isArabic ? "\u0627\u0644\u0627\u0633\u062a\u0647\u062f\u0627\u0641 ATS" : "Targeting gap"),
      qualityAtsGap: baseLocale.qualityAtsGap || (isArabic ? "\u0644\u0627 \u062a\u0632\u0627\u0644 \u0647\u0646\u0627\u0643 {count} \u0645\u0646 \u0627\u0644\u0645\u0635\u0637\u0644\u062d\u0627\u062a \u0627\u0644\u0645\u0647\u0645\u0629 \u063a\u064a\u0631 \u0645\u063a\u0637\u0627\u0629." : "{count} important targeting terms are still missing."),
      qualityMetricsTitle: baseLocale.qualityMetricsTitle || "Measurable impact",
      qualityMissingMetrics: baseLocale.qualityMissingMetrics || "Item {item} would be stronger with a measurable result such as scale, volume, time saved, or percentage change.",
      qualitySummaryGeneric: baseLocale.qualitySummaryGeneric || "The summary still reads too generically around \"{phrase}\". Add target role, domain, and concrete tools or strengths.",
      qualityWeakBulletOpeningSuggested: baseLocale.qualityWeakBulletOpeningSuggested || "Item {item} could start with a stronger action verb such as {suggestion}.",
      qualityGenericBullet: baseLocale.qualityGenericBullet || "Item {item} still sounds generic around \"{phrase}\". Name the tool, scope, or outcome more directly.",
      qualityDuplicateSkillsTitle: baseLocale.qualityDuplicateSkillsTitle || "Duplicate skills",
      qualityDuplicateSkill: baseLocale.qualityDuplicateSkill || "The skill \"{skill}\" appears more than once. Merge duplicates and keep the strongest phrasing.",
      qualityGenericFallback: baseLocale.qualityGenericFallback || "generic wording",
      styleNavLabel: baseLocale.styleNavLabel || (isArabic ? "\u0627\u0644\u0646\u0645\u0637" : "Style"),
      styleTitle: baseLocale.styleTitle || (isArabic ? "\u0646\u0645\u0637 \u0627\u0644\u0633\u064a\u0631\u0629" : "Style"),
      styleDescription: baseLocale.styleDescription || (isArabic ? "\u0627\u062d\u0641\u0638 \u0627\u0644\u0634\u0643\u0644 \u0627\u0644\u062d\u0627\u0644\u064a \u0623\u0648 \u0628\u062f\u0651\u0644 \u0647\u0630\u0647 \u0627\u0644\u0646\u0633\u062e\u0629 \u0625\u0644\u0649 \u0646\u0645\u0637 \u0645\u062d\u0633\u0651\u0646 \u0644\u0644\u0637\u0628\u0627\u0639\u0629 \u0648\u0627\u0644\u0645\u0639\u0627\u064a\u0646\u0629." : "Keep the current exact look or switch this version to a refined typography preset."),
      stylePresetLabel: baseLocale.stylePresetLabel || (isArabic ? "\u0627\u0644\u0646\u0645\u0637" : "Preset"),
      stylePresetDefaultLabel: baseLocale.stylePresetDefaultLabel || (isArabic ? "\u0627\u0641\u062a\u0631\u0627\u0636\u064a" : "Default"),
      stylePresetRefinedLabel: baseLocale.stylePresetRefinedLabel || (isArabic ? "\u0645\u062d\u0633\u0651\u0646" : "Refined"),
      stylePresetDefaultHint: baseLocale.stylePresetDefaultHint || (isArabic ? "\u0647\u0630\u0627 \u0627\u0644\u062e\u064a\u0627\u0631 \u064a\u062d\u0627\u0641\u0638 \u0639\u0644\u0649 \u0627\u0644\u062a\u0635\u0645\u064a\u0645 \u0627\u0644\u062d\u0627\u0644\u064a \u0643\u0645\u0627 \u0647\u0648 \u0628\u062f\u0648\u0646 \u0623\u064a \u062a\u063a\u064a\u064a\u0631." : "Default keeps the current design and typography exactly as it is today."),
      stylePresetRefinedHint: baseLocale.stylePresetRefinedHint || (isArabic ? "\u0627\u0644\u0646\u0645\u0637 \u0627\u0644\u0645\u062d\u0633\u0651\u0646 \u064a\u0637\u0628\u0651\u0642 \u0645\u0642\u0627\u0633\u0627\u062a \u0648\u062e\u0637\u0648\u0637 \u0645\u062e\u0635\u0635\u0629 \u0644\u0647\u0630\u0647 \u0627\u0644\u0644\u063a\u0629." : "Refined applies the language-specific typography settings for this version."),
      styleTypographyTitle: baseLocale.styleTypographyTitle || (isArabic ? "\u0645\u0644\u062e\u0635 \u0627\u0644\u0637\u0628\u0627\u0639\u0629" : "Typography summary"),
      styleTypographyDescription: baseLocale.styleTypographyDescription || (isArabic ? "\u0647\u0630\u0647 \u0627\u0644\u0642\u064a\u0645 \u062a\u0637\u0628\u0642 \u0639\u0644\u0649 \u0627\u0644\u0645\u0639\u0627\u064a\u0646\u0629 \u0648\u0627\u0644\u0637\u0628\u0627\u0639\u0629 \u0644\u0646\u0641\u0633 \u0627\u0644\u0646\u0633\u062e\u0629." : "These values apply to both the live preview and print/PDF for this version."),
      styleTypographyFontLabel: baseLocale.styleTypographyFontLabel || (isArabic ? "\u0627\u0644\u062e\u0637" : "Font"),
      styleTypographyNameLabel: baseLocale.styleTypographyNameLabel || (isArabic ? "\u0627\u0644\u0627\u0633\u0645" : "Name"),
      styleTypographyHeadingsLabel: baseLocale.styleTypographyHeadingsLabel || (isArabic ? "\u0627\u0644\u0639\u0646\u0627\u0648\u064a\u0646" : "Headings"),
      styleTypographyBodyLabel: baseLocale.styleTypographyBodyLabel || (isArabic ? "\u0646\u0635 \u0627\u0644\u0645\u062a\u0646" : "Body"),
      styleTypographyContactLabel: baseLocale.styleTypographyContactLabel || (isArabic ? "\u0633\u0637\u0631 \u0627\u0644\u062a\u0648\u0627\u0635\u0644" : "Contact line"),
      styleTypographyLineHeightLabel: baseLocale.styleTypographyLineHeightLabel || (isArabic ? "\u062a\u0628\u0627\u0639\u062f \u0627\u0644\u0623\u0633\u0637\u0631" : "Line spacing"),
      undo: baseLocale.undo || (isArabic ? "\u062a\u0631\u0627\u062c\u0639" : "Undo"),
      redo: baseLocale.redo || (isArabic ? "\u0625\u0639\u0627\u062f\u0629" : "Redo"),
      dragLabel: baseLocale.dragLabel || (isArabic ? "\u0633\u062d\u0628" : "Drag"),
      sectionsTitle: baseLocale.sectionsTitle || (isArabic ? "\u0625\u062f\u0627\u0631\u0629 \u0627\u0644\u0623\u0642\u0633\u0627\u0645" : "Sections"),
      sectionsDescription: baseLocale.sectionsDescription || (isArabic ? "\u0623\u0639\u062f \u062a\u0633\u0645\u064a\u0629 \u0627\u0644\u0623\u0642\u0633\u0627\u0645 \u0648\u0627\u062e\u0641\u0647\u0627 \u0623\u0648 \u0623\u0636\u0641 \u0623\u0642\u0633\u0627\u0645\u064b\u0627 \u0645\u062e\u0635\u0635\u0629." : "Rename, hide, reorder, or add custom resume sections."),
      sectionsNavLabel: baseLocale.sectionsNavLabel || (isArabic ? "\u0627\u0644\u0623\u0642\u0633\u0627\u0645" : "Sections"),
      addCustomSection: baseLocale.addCustomSection || (isArabic ? "\u0625\u0636\u0627\u0641\u0629 \u0642\u0633\u0645 \u0645\u062e\u0635\u0635" : "Add custom section"),
      customSectionFallback: baseLocale.customSectionFallback || (isArabic ? "\u0642\u0633\u0645 \u0645\u062e\u0635\u0635" : "Custom Section"),
      customSectionLayoutLabel: baseLocale.customSectionLayoutLabel || (isArabic ? "\u0627\u0644\u062a\u0635\u0645\u064a\u0645" : "Layout"),
      customLayoutSingleList: baseLocale.customLayoutSingleList || (isArabic ? "\u0642\u0627\u0626\u0645\u0629 \u0628\u0639\u0645\u0648\u062f \u0648\u0627\u062d\u062f" : "Single-column list"),
      customLayoutTwoColumnList: baseLocale.customLayoutTwoColumnList || (isArabic ? "\u0642\u0627\u0626\u0645\u0629 \u0628\u0639\u0645\u0648\u062f\u064a\u0646" : "Two-column list"),
      customLayoutCertificateCards: baseLocale.customLayoutCertificateCards || (isArabic ? "\u0628\u0637\u0627\u0642\u0627\u062a \u0634\u0647\u0627\u062f\u0627\u062a" : "Certificate cards"),
      customLayoutSingleListHelp: baseLocale.customLayoutSingleListHelp || (isArabic ? "\u064a\u0639\u0631\u0636 \u0639\u0646\u0627\u0635\u0631 \u0628\u0633\u064a\u0637\u0629 \u0641\u064a \u0642\u0627\u0626\u0645\u0629 \u0648\u0627\u062d\u062f\u0629." : "Renders each item as a simple one-column list entry."),
      customLayoutTwoColumnListHelp: baseLocale.customLayoutTwoColumnListHelp || (isArabic ? "\u064a\u0648\u0632\u0639 \u0627\u0644\u0639\u0646\u0627\u0635\u0631 \u0639\u0644\u0649 \u0639\u0645\u0648\u062f\u064a\u0646 \u0645\u0636\u063a\u0648\u0637\u064a\u0646." : "Renders items in a compact print-safe two-column list."),
      customLayoutCertificateCardsHelp: baseLocale.customLayoutCertificateCardsHelp || (isArabic ? "\u064a\u0639\u0631\u0636 \u0643\u0644 \u0639\u0646\u0635\u0631 \u0643\u0628\u0637\u0627\u0642\u0629 \u0628\u0639\u0646\u0648\u0627\u0646 \u0648\u0648\u0635\u0641." : "Renders each item as a certificate-style card with a title and description."),
      addCustomSectionItem: baseLocale.addCustomSectionItem || (isArabic ? "\u0625\u0636\u0627\u0641\u0629 \u0639\u0646\u0635\u0631 \u0644\u0644\u0642\u0633\u0645" : "Add section item"),
      customSectionItemLabel: baseLocale.customSectionItemLabel || (isArabic ? "\u0646\u0635 \u0627\u0644\u0639\u0646\u0635\u0631" : "Item text"),
      sectionTitleField: baseLocale.sectionTitleField || (isArabic ? "\u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0642\u0633\u0645" : "Section title"),
      sectionVisibleField: baseLocale.sectionVisibleField || (isArabic ? "\u0625\u0638\u0647\u0627\u0631 \u0647\u0630\u0627 \u0627\u0644\u0642\u0633\u0645" : "Show this section"),
      sectionBuiltInNotice: baseLocale.sectionBuiltInNotice || (isArabic ? "\u064a\u0645\u0643\u0646 \u0625\u062e\u0641\u0627\u0621 \u0627\u0644\u0623\u0642\u0633\u0627\u0645 \u0627\u0644\u0623\u0633\u0627\u0633\u064a\u0629 \u0641\u0642\u0637. \u062a\u0635\u0645\u064a\u0645\u0647\u0627 \u064a\u0628\u0642\u0649 \u062b\u0627\u0628\u062a\u064b\u0627." : "Built-in sections can be renamed or hidden, but their design stays fixed."),
      fields: {
        ...baseLocale.fields,
        jobDescription: baseLocale.fields?.jobDescription || (isArabic ? "\u0627\u0644\u0648\u0635\u0641 \u0627\u0644\u0648\u0638\u064a\u0641\u064a" : "Job description"),
        targetRole: baseLocale.fields?.targetRole || (isArabic ? "\u0627\u0644\u0645\u0633\u0645\u0649 \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641" : "Target role"),
        company: baseLocale.fields?.company || (isArabic ? "\u0627\u0644\u0634\u0631\u0643\u0629" : "Company"),
        focusKeywords: baseLocale.fields?.focusKeywords || (isArabic ? "\u0627\u0644\u0643\u0644\u0645\u0627\u062a \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641\u0629" : "Focus keywords"),
        versionNotes: baseLocale.fields?.versionNotes || (isArabic ? "\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0627\u0644\u0646\u0633\u062e\u0629" : "Version notes"),
        recipientName: baseLocale.fields?.recipientName || (isArabic ? "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062a\u0644\u0645" : "Recipient name"),
        hiringManager: baseLocale.fields?.hiringManager || (isArabic ? "\u0627\u0633\u0645 \u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u062a\u0648\u0638\u064a\u0641" : "Hiring manager"),
        coverLetterOpening: baseLocale.fields?.coverLetterOpening || (isArabic ? "\u0627\u0644\u0627\u0641\u062a\u062a\u0627\u062d\u064a\u0629" : "Opening paragraph"),
        coverLetterBody: baseLocale.fields?.coverLetterBody || (isArabic ? "\u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u062e\u0637\u0627\u0628" : "Body paragraphs"),
        coverLetterClosing: baseLocale.fields?.coverLetterClosing || (isArabic ? "\u0627\u0644\u062e\u0627\u062a\u0645\u0629" : "Closing paragraph"),
        signatureName: baseLocale.fields?.signatureName || (isArabic ? "\u0627\u0633\u0645 \u0627\u0644\u062a\u0648\u0642\u064a\u0639" : "Signature name"),
        coverLetterNotes: baseLocale.fields?.coverLetterNotes || (isArabic ? "\u0645\u0644\u0627\u062d\u0638\u0627\u062a \u0627\u0644\u062e\u0637\u0627\u0628" : "Cover letter notes")
      }
    };
  }

  function buildLocale(lang) {
    if (lang === "ar") {
      return {
        editorTitle: "محرر مباشر",
        editorDescription: "حرر المحتوى هنا وشاهد النتيجة فوراً في المعاينة.",
        editorNav: "أقسام المحرر",
        printButton: "طباعة / حفظ PDF",
        printHint: "A4، بمقياس 100%، مع الخلفيات، بدون رؤوس وتذييلات",
        switchEnglish: "English",
        switchArabic: "العربية",
        importData: "استيراد البيانات",
        exportData: "تصدير البيانات",
        showEditor: "إظهار المحرر",
        showPreview: "إظهار المعاينة",
        profileSectionTitle: "الملف الشخصي",
        profileSectionDescription: "عدل الاسم وبيانات التواصل ومسار الصورة.",
        summarySectionTitle: "الملخص المهني",
        summarySectionDescription: "أي تعديل هنا يظهر مباشرة في المعاينة.",
        liveUpdates: "كل تغيير يظهر مباشرة في السيرة على اليمين.",
        addItem: "إضافة عنصر",
        addProject: "إضافة مشروع",
        addEducation: "إضافة تعليم",
        addCertificate: "إضافة شهادة",
        addSkill: "إضافة مهارة",
        addSoftSkill: "إضافة مهارة شخصية",
        addBullet: "إضافة نقطة",
        moveUp: "أعلى",
        moveDown: "أسفل",
        remove: "حذف",
        importInvalid: "ملف البيانات غير صالح.",
        importFailed: "تعذر استيراد الملف.",
        importLanguageMismatch: "هذا الملف يخص لغة مختلفة عن الصفحة الحالية.",
        fields: {
          name: "الاسم",
          photo: "مسار الصورة",
          email: "البريد الإلكتروني",
          phone: "رقم الهاتف",
          phoneHref: "رابط الهاتف",
        location: "الموقع",
        linkedinLabel: "نص لينكدإن",
        linkedinHref: "رابط لينكدإن",
        githubLabel: "نص GitHub",
        githubHref: "رابط GitHub",
        portfolioLabel: "نص رابط الأعمال",
        portfolioHref: "رابط الأعمال",
        projectLinkLabel: "نص رابط المشروع",
        projectLinkHref: "رابط المشروع",
        summary: "النص",
          date: "التاريخ",
          organization: "الجهة",
          role: "المسمى الوظيفي",
          title: "العنوان",
          institution: "المؤسسة",
          degree: "الدرجة العلمية",
          description: "الوصف",
          bullets: "النقاط",
          label: "العنوان",
          items: "التفاصيل",
          skill: "المهارة"
        }
      };
    }

    return {
      editorTitle: "Live Editor",
      editorDescription: "Edit the content here and the preview updates instantly.",
      editorNav: "Editor sections",
      printButton: "Print / Save PDF",
      printHint: "A4, scale 100%, background on, headers off",
      switchEnglish: "English",
      switchArabic: "العربية",
      importData: "Import data",
      exportData: "Export data",
      showEditor: "Show editor",
      showPreview: "Show preview",
      profileSectionTitle: "Profile",
      profileSectionDescription: "Update your name, contact details, and photo path.",
      summarySectionTitle: "Professional summary",
      summarySectionDescription: "Edits here appear in the preview immediately.",
      liveUpdates: "Changes are reflected live in the resume preview.",
      addItem: "Add item",
      addProject: "Add project",
      addEducation: "Add education",
      addCertificate: "Add certificate",
      addSkill: "Add skill",
      addSoftSkill: "Add soft skill",
      addBullet: "Add bullet",
      moveUp: "Up",
      moveDown: "Down",
      remove: "Remove",
      importInvalid: "The selected file is not a valid resume data file.",
      importFailed: "Could not import the selected file.",
      importLanguageMismatch: "This file belongs to a different language page.",
      fields: {
        name: "Name",
        photo: "Photo path",
        email: "Email",
        phone: "Phone",
        phoneHref: "Phone link",
        location: "Location",
        linkedinLabel: "LinkedIn label",
        linkedinHref: "LinkedIn URL",
        githubLabel: "GitHub label",
        githubHref: "GitHub URL",
        portfolioLabel: "Portfolio label",
        portfolioHref: "Portfolio URL",
        projectLinkLabel: "Project link label",
        projectLinkHref: "Project link URL",
        summary: "Summary text",
        date: "Date",
        organization: "Organization",
        role: "Role",
        title: "Title",
        institution: "Institution",
        degree: "Degree",
        description: "Description",
        bullets: "Bullet points",
        label: "Label",
        items: "Items",
        skill: "Skill"
      }
    };
  }
})();
