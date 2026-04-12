export const SECTION_KEYS = [
  "summary",
  "experience",
  "internships",
  "projects",
  "education",
  "certificates",
  "skills",
  "softSkills"
];

export const UI_AREAS = [
  "content",
  "layout",
  "style",
  "analysis",
  "aiTools",
  "sync",
  "versions"
];

export const AI_PROVIDER_OPTIONS = [
  { value: "openrouter-auto", label: "OpenRouter Auto" },
  { value: "openrouter-free", label: "OpenRouter Free" },
  { value: "openrouter-manual", label: "OpenRouter Manual" },
  { value: "openai", label: "OpenAI" }
];

export const DEFAULT_STYLE_TOKENS = {
  en: {
    fontFamily: "Calibri, Arial, Helvetica, sans-serif",
    nameSize: "21pt",
    headingSize: "12pt",
    bodySize: "10.8pt",
    contactSize: "10pt",
    lineHeight: 1.12
  },
  ar: {
    fontFamily: "Calibri, Arial, Helvetica, sans-serif",
    nameSize: "21pt",
    headingSize: "12pt",
    bodySize: "10.8pt",
    contactSize: "10pt",
    lineHeight: 1.12
  }
};

export const REFINED_STYLE_TOKENS = {
  en: {
    fontFamily: "Calibri, Arial, Helvetica, sans-serif",
    nameSize: "21pt",
    headingSize: "12pt",
    bodySize: "11pt",
    contactSize: "10pt",
    lineHeight: 1.12
  },
  ar: {
    fontFamily: "\"Cairo\", Arial, Helvetica, sans-serif",
    nameSize: "21pt",
    headingSize: "12.5pt",
    bodySize: "11.5pt",
    contactSize: "10.5pt",
    lineHeight: 1.15
  }
};

export const COPY = {
  en: {
    appTitle: "Resume Studio",
    tagline: "Bilingual resume editor with analysis, sync, and AI tools.",
    navGroups: {
      app: "App",
      settings: "Settings"
    },
    topAreas: {
      dashboard: "Dashboard",
      resumes: "Resumes",
      jobSearch: "Job Search",
      profile: "Profile",
      preferences: "Preferences",
      authentication: "Authentication",
      apiKeys: "API Keys",
      artificialIntelligence: "Artificial Intelligence",
      jobSearchApi: "Job Search API",
      dangerZone: "Danger Zone"
    },
    areas: {
      content: "Content",
      layout: "Layout",
      style: "Style",
      analysis: "Analysis",
      aiTools: "AI Tools",
      sync: "Sync",
      versions: "Versions"
    },
    modes: {
      editEnglish: "Edit English",
      editArabic: "Edit Arabic",
      compare: "Compare"
    },
    languages: {
      en: "English",
      ar: "Arabic"
    },
    previewTitle: "Live Preview",
    previewCentered: "Preview centered",
    sharedFields: "Shared profile and layout",
    profile: "Profile",
    summary: "Professional Summary",
    experience: "Professional Experience",
    internships: "Internships",
    projects: "Projects",
    education: "Education",
    certificates: "Certifications",
    skills: "Core Skills",
    softSkills: "Soft Skills",
    coverLetter: "Cover Letter",
    layoutDescription: "Layout controls stay shared across languages so one bilingual resume prints consistently.",
    styleDescription: "Style preset is saved per version and applies to screen and print.",
    syncDescription: "Preview selected sections before applying language sync.",
    versionsDescription: "Versions save the full bilingual resume state.",
    dashboardDescription: "Run the resume workspace, AI review, sharing, and version control from one shell.",
    importData: "Import data",
    exportData: "Export data",
    importVersions: "Import versions",
    exportVersions: "Export versions",
    saveVersion: "Save new version",
    updateVersion: "Update version",
    renameVersion: "Rename",
    deleteVersion: "Delete",
    printPdf: "Print / Save PDF",
    exportJson: "Export JSON",
    copyUrl: "Copy URL",
    centerView: "Center view",
    undo: "Undo",
    redo: "Redo",
    contentLanguage: "Content language",
    previewLanguage: "Preview language",
    uiLanguage: "App language",
    theme: "Theme",
    zoom: "Zoom",
    view: "View",
    editorArea: "Workspace",
    fieldLabels: {
      fullName: "Full name",
      location: "Location",
      email: "Email",
      phone: "Phone",
      linkedinLabel: "LinkedIn label",
      linkedinHref: "LinkedIn URL",
      githubLabel: "GitHub label",
      githubHref: "GitHub URL",
      portfolioLabel: "Portfolio label",
      portfolioHref: "Portfolio URL",
      sectionTitle: "Section title",
      targetRole: "Target job title",
      company: "Target company",
      jobDescription: "Target job description",
      focusKeywords: "Focus keywords",
      notes: "Notes",
      recipientName: "Recipient name",
      hiringManager: "Hiring manager",
      opening: "Opening",
      body: "Body",
      closing: "Closing",
      signatureName: "Signature name"
    },
    actions: {
      addItem: "Add item",
      addSkillGroup: "Add skill group",
      addSoftSkill: "Add soft skill",
      addCertificate: "Add certificate",
      addEducation: "Add education",
      addExperience: "Add experience",
      addProject: "Add project",
      generatePreview: "Generate preview",
      applyChanges: "Apply",
      clear: "Clear",
      runQuality: "Refresh local review",
      runAts: "Refresh ATS review",
      runAiReview: "Run AI HR Review",
      generateCoverLetter: "Generate cover letter",
      copyCoverLetter: "Copy plain text"
    },
    sync: {
      sourceLanguage: "Source language",
      targetLanguage: "Target language",
      selectedSections: "Selected sections",
      noPreview: "No sync preview yet.",
      generated: "Preview ready. Review the differences before applying.",
      requiresAi: "Narrative sections need an API key for AI translation."
    },
    commands: {
      title: "Commands",
      description: "Run structured section edits against the active content language.",
      command: "Command",
      content: "Pasted content",
      selectedSections: "Target sections",
      noPreview: "No command preview yet."
    },
    analysis: {
      quality: "Quality",
      ats: "ATS Helper",
      hr: "AI HR Review",
      noJobDescription: "Paste a job description for a targeted ATS review."
    },
    style: {
      default: "Default",
      refined: "Refined",
      summaryTitle: "Typography summary",
      fontFamily: "Font family",
      nameSize: "Name size",
      headingSize: "Headings",
      bodySize: "Body text",
      contactSize: "Contact line",
      lineHeight: "Line spacing"
    },
    themeOptions: {
      system: "System",
      light: "Light",
      dark: "Dark"
    },
    viewOptions: {
      hideBranding: "Hide Resume Studio label",
      collapseSidebar: "Collapse sidebar",
      focusPreview: "Focus preview"
    },
    versionPlaceholder: "Choose a version",
    newVersionName: "New bilingual version",
    demoVersionName: "Demo bilingual baseline",
    importInvalid: "The selected file is not valid for this app.",
    deleteConfirm: "Delete this version?",
    shareCopied: "A link to your resume has been copied to clipboard.",
    shareFailed: "Copying the resume link failed.",
    shareLoaded: "Shared resume loaded from URL.",
    nothingToUndo: "Nothing to undo.",
    nothingToRedo: "Nothing to redo.",
    dashboard: {
      heroTitle: "Build, review, and share bilingual resumes from one workspace.",
      heroBody: "Resume Studio keeps content, AI review, ATS matching, sync, export, and version history in a single production shell.",
      primaryCta: "Open resume workspace",
      secondaryCta: "Open AI settings",
      cards: {
        resumes: "Resume workspace",
        resumesBody: "Edit English and Arabic content, style, layout, and versions.",
        ai: "AI control center",
        aiBody: "Manage providers, prompts, HR review, ATS review, and tailored cover letters.",
        sharing: "Sharing and export",
        sharingBody: "Generate shareable links, export JSON, and print polished A4 PDFs.",
        jobSearch: "Job Search",
        jobSearchBody: "Planned workspace for saved roles, search APIs, and application pipelines."
      },
      futureBadge: "Future project"
    },
    footer: {
      projectBy: "A project by Amjad Alzomi.",
      licensed: "Licensed under MIT."
    },
    ai: {
      provider: "AI provider",
      model: "Model override",
      apiKey: "API key",
      save: "Save AI settings",
      ready: "AI settings are ready.",
      missing: "Add your API key to use AI review, cover letter generation, and bilingual sync."
    }
  },
  ar: {
    appTitle: "Resume Studio",
    tagline: "محرر سيرة ذاتية ثنائي اللغة مع التحليل والمزامنة وأدوات الذكاء الاصطناعي.",
    navGroups: {
      app: "التطبيق",
      settings: "الإعدادات"
    },
    topAreas: {
      dashboard: "لوحة التحكم",
      resumes: "السير الذاتية",
      jobSearch: "البحث عن وظائف",
      profile: "الملف الشخصي",
      preferences: "التفضيلات",
      authentication: "المصادقة",
      apiKeys: "مفاتيح API",
      artificialIntelligence: "الذكاء الاصطناعي",
      jobSearchApi: "واجهة وظائف API",
      dangerZone: "المنطقة الخطرة"
    },
    areas: {
      content: "المحتوى",
      layout: "التخطيط",
      style: "النمط",
      analysis: "التحليل",
      aiTools: "أدوات الذكاء",
      sync: "المزامنة",
      versions: "النسخ"
    },
    modes: {
      editEnglish: "تحرير الإنجليزية",
      editArabic: "تحرير العربية",
      compare: "مقارنة"
    },
    languages: {
      en: "English",
      ar: "العربية"
    },
    previewTitle: "المعاينة الحية",
    previewCentered: "تم توسيط المعاينة",
    sharedFields: "الملف الشخصي والتخطيط المشتركان",
    profile: "الملف الشخصي",
    summary: "الملخص المهني",
    experience: "الخبرة المهنية",
    internships: "التدريب العملي",
    projects: "المشاريع",
    education: "التعليم",
    certificates: "الشهادات",
    skills: "المهارات التقنية",
    softSkills: "المهارات الشخصية",
    coverLetter: "خطاب التعريف",
    layoutDescription: "إعدادات التخطيط مشتركة بين اللغتين حتى تبقى الطباعة متسقة.",
    styleDescription: "النمط يُحفَظ داخل النسخة ويطبّق على الشاشة والطباعة.",
    syncDescription: "راجع معاينة الأقسام المحددة قبل تطبيق المزامنة.",
    versionsDescription: "النسخ تحفظ الحالة الكاملة للسيرة ثنائية اللغة.",
    dashboardDescription: "شغّل مساحة السيرة، والمراجعة الذكية، والمشاركة، وإدارة النسخ من واجهة واحدة.",
    importData: "استيراد البيانات",
    exportData: "تصدير البيانات",
    importVersions: "استيراد النسخ",
    exportVersions: "تصدير النسخ",
    saveVersion: "حفظ نسخة جديدة",
    updateVersion: "تحديث النسخة",
    renameVersion: "إعادة تسمية",
    deleteVersion: "حذف",
    printPdf: "طباعة / حفظ PDF",
    exportJson: "تنزيل JSON",
    copyUrl: "نسخ الرابط",
    centerView: "عرض المعاينة",
    undo: "تراجع",
    redo: "إعادة",
    contentLanguage: "لغة المحتوى",
    previewLanguage: "لغة المعاينة",
    uiLanguage: "لغة الواجهة",
    theme: "السمة",
    zoom: "التقريب",
    view: "العرض",
    editorArea: "منطقة العمل",
    fieldLabels: {
      fullName: "الاسم الكامل",
      location: "الموقع",
      email: "البريد الإلكتروني",
      phone: "الجوال",
      linkedinLabel: "عنوان لينكدإن",
      linkedinHref: "رابط لينكدإن",
      githubLabel: "عنوان GitHub",
      githubHref: "رابط GitHub",
      portfolioLabel: "عنوان الموقع",
      portfolioHref: "رابط الموقع",
      sectionTitle: "عنوان القسم",
      targetRole: "المسمى المستهدف",
      company: "الشركة المستهدفة",
      jobDescription: "الوصف الوظيفي",
      focusKeywords: "الكلمات المفتاحية",
      notes: "ملاحظات",
      recipientName: "اسم المستلم",
      hiringManager: "مدير التوظيف",
      opening: "الافتتاحية",
      body: "المتن",
      closing: "الخاتمة",
      signatureName: "اسم التوقيع"
    },
    actions: {
      addItem: "إضافة عنصر",
      addSkillGroup: "إضافة مجموعة مهارات",
      addSoftSkill: "إضافة مهارة شخصية",
      addCertificate: "إضافة شهادة",
      addEducation: "إضافة تعليم",
      addExperience: "إضافة خبرة",
      addProject: "إضافة مشروع",
      generatePreview: "إنشاء معاينة",
      applyChanges: "تطبيق",
      clear: "مسح",
      runQuality: "تحديث المراجعة المحلية",
      runAts: "تحديث مراجعة ATS",
      runAiReview: "تشغيل مراجعة HR",
      generateCoverLetter: "إنشاء خطاب",
      copyCoverLetter: "نسخ كنص"
    },
    sync: {
      sourceLanguage: "لغة المصدر",
      targetLanguage: "لغة الهدف",
      selectedSections: "الأقسام المحددة",
      noPreview: "لا توجد معاينة للمزامنة بعد.",
      generated: "المعاينة جاهزة. راجع الفروقات قبل التطبيق.",
      requiresAi: "الأقسام السردية تحتاج إلى مفتاح API للترجمة الذكية."
    },
    commands: {
      title: "الأوامر",
      description: "نفّذ تعديلات منظمة على لغة المحتوى الحالية.",
      command: "الأمر",
      content: "المحتوى الملصق",
      selectedSections: "الأقسام المستهدفة",
      noPreview: "لا توجد معاينة للأوامر بعد."
    },
    analysis: {
      quality: "الجودة",
      ats: "مساعد ATS",
      hr: "مراجعة HR الذكية",
      noJobDescription: "ألصق وصفًا وظيفيًا للحصول على مراجعة ATS موجهة."
    },
    style: {
      default: "الافتراضي",
      refined: "المحسن",
      summaryTitle: "ملخص الطباعة",
      fontFamily: "الخط",
      nameSize: "حجم الاسم",
      headingSize: "العناوين",
      bodySize: "المتن",
      contactSize: "سطر التواصل",
      lineHeight: "تباعد الأسطر"
    },
    themeOptions: {
      system: "النظام",
      light: "فاتح",
      dark: "داكن"
    },
    viewOptions: {
      hideBranding: "إخفاء اسم Resume Studio",
      collapseSidebar: "طي الشريط الجانبي",
      focusPreview: "تكبير المعاينة"
    },
    versionPlaceholder: "اختر نسخة",
    newVersionName: "نسخة ثنائية اللغة",
    demoVersionName: "النسخة الثنائية التجريبية",
    importInvalid: "الملف المختار غير صالح لهذا التطبيق.",
    deleteConfirm: "هل تريد حذف هذه النسخة؟",
    shareCopied: "تم نسخ رابط السيرة الذاتية إلى الحافظة.",
    shareFailed: "تعذر نسخ رابط السيرة الذاتية.",
    shareLoaded: "تم تحميل سيرة ذاتية مشتركة من الرابط.",
    nothingToUndo: "لا يوجد ما يمكن التراجع عنه.",
    nothingToRedo: "لا يوجد ما يمكن إعادته.",
    dashboard: {
      heroTitle: "أنشئ وراجع وشارك سيرة ثنائية اللغة من مساحة عمل واحدة.",
      heroBody: "يجمع Resume Studio بين التحرير، والمراجعة الذكية، وATS، والمزامنة، والتصدير، وإدارة النسخ في واجهة إنتاجية واحدة.",
      primaryCta: "فتح مساحة السيرة",
      secondaryCta: "فتح إعدادات الذكاء",
      cards: {
        resumes: "مساحة السيرة الذاتية",
        resumesBody: "حرّر المحتوى الإنجليزي والعربي، والتخطيط، والنمط، والنسخ.",
        ai: "مركز الذكاء الاصطناعي",
        aiBody: "أدر المزودات والمراجعات الذكية وكتابة الخطابات والمساعدة الموجهة.",
        sharing: "المشاركة والتصدير",
        sharingBody: "أنشئ روابط قابلة للمشاركة، ونزّل JSON، واطبع ملفات PDF منسقة.",
        jobSearch: "البحث عن وظائف",
        jobSearchBody: "مساحة مستقبلية لحفظ الوظائف، وربط واجهات البحث، ومتابعة التقديم."
      },
      futureBadge: "ميزة مستقبلية"
    },
    footer: {
      projectBy: "مشروع من أمجد الزومي.",
      licensed: "مرخّص تحت MIT."
    },
    ai: {
      provider: "مزود الذكاء",
      model: "تخصيص النموذج",
      apiKey: "مفتاح API",
      save: "حفظ إعدادات الذكاء",
      ready: "إعدادات الذكاء جاهزة.",
      missing: "أدخل مفتاح API لاستخدام المراجعة الذكية وخطاب التعريف والمزامنة."
    }
  }
};

const shared = {
  photo: "./assets/profile-demo.svg",
  email: "sara.najjar@example.com",
  phone: "(+971) 555 018 204",
  phoneHref: "tel:+971555018204",
  linkedinHref: "https://www.linkedin.com/in/sara-al-najjar-demo",
  githubHref: "https://github.com/saranajjar-demo",
  portfolioHref: "https://saranajjar.dev",
  stylePreset: "default",
  sectionOrder: [...SECTION_KEYS],
  targeting: {
    jobTitle: "",
    company: "",
    jobDescription: "",
    focusKeywords: "",
    notes: ""
  }
};

export function createEmptyCoverLetter(name = "") {
  return {
    recipientName: "",
    company: "",
    targetRole: "",
    hiringManager: "",
    opening: "",
    body: "",
    closing: "",
    signatureName: name,
    notes: ""
  };
}

export function createDemoResume() {
  return {
    id: `resume-${Date.now()}`,
    shared: structuredClone(shared),
    languages: {
      en: {
        meta: { lang: "en", dir: "ltr" },
        labels: {
          summary: "Professional Summary",
          experience: "Professional Experience",
          internships: "Internships",
          projects: "Projects",
          education: "Education",
          certificates: "Certifications",
          skills: "Core Skills",
          softSkills: "Soft Skills"
        },
        profile: {
          name: "Sara Al-Najjar",
          location: "Dubai, United Arab Emirates",
          linkedinLabel: "linkedin.com/in/sara-al-najjar-demo",
          githubLabel: "github.com/saranajjar-demo",
          portfolioLabel: "saranajjar.dev"
        },
        summary:
          "Product-minded software and cloud engineer with experience building internal web platforms, automating operational workflows, and supporting secure delivery for distributed teams. Combines frontend and backend implementation, API integration, cloud deployment, and technical documentation to turn manual processes into reliable systems.",
        sections: {
          experience: [
            {
              date: "Mar 2024 - Present",
              location: "Dubai, United Arab Emirates",
              organization: "Northstar Logistics Cloud Services",
              role: "Software & Platform Engineer",
              bullets: [
                "Built an internal operations platform used by 6 fulfillment teams, replacing spreadsheet-based handoffs with role-based workflows and reducing manual status updates by 40%.",
                "Developed Node.js and React services for shipment intake, exception handling, and partner integrations across 18 REST endpoints and 4 internal admin modules.",
                "Automated release and environment checks with GitHub Actions and Google Cloud Run, cutting deployment validation time from 45 minutes to under 15 minutes."
              ]
            },
            {
              date: "Jan 2022 - Feb 2024",
              location: "Amman, Jordan",
              organization: "CedarGate Managed Technology",
              role: "IT Operations Analyst",
              bullets: [
                "Supported endpoint, network, and identity issues for more than 120 employees across hybrid offices, maintaining steady day-to-day service continuity.",
                "Diagnosed recurring VPN, printer, and device-enrollment incidents, documenting fixes that lowered repeated tickets by 28% over two quarters.",
                "Coordinated asset tracking, patch windows, and escalation handoffs across Windows, Microsoft 365, and virtualization environments."
              ]
            }
          ],
          internships: [
            {
              date: "Jun 2021 - Sep 2021",
              location: "Remote",
              organization: "BluePeak Security Lab",
              role: "Cloud Security Intern",
              bullets: [
                "Reviewed IAM and logging configurations in sandbox cloud labs and wrote remediation notes for common storage and access risks.",
                "Built simple Python checks for log parsing and alert triage, helping analysts review suspicious events faster during lab exercises."
              ]
            }
          ],
          projects: [
            {
              date: "Aug 2023 - Jan 2024",
              title: "IncidentHub - Security Operations Dashboard",
              linkLabel: "GitHub",
              linkHref: "https://github.com/saranajjar-demo/incidenthub",
              bullets: [
                "Built a security dashboard with React, FastAPI, and PostgreSQL to track alerts, playbooks, and investigation notes across simulated incidents.",
                "Added analyst filters, severity scoring, and audit logs so users could triage noisy events and review response history in one place.",
                "Containerized the stack with Docker and shipped a demo deployment with CI checks for linting, tests, and seeded demo data."
              ]
            }
          ],
          education: [
            {
              date: "2022 - 2023",
              location: "Leeds, United Kingdom",
              degree: "MSc Cybersecurity and Cloud Systems",
              institution: "University of Leeds"
            },
            {
              date: "2017 - 2021",
              location: "Amman, Jordan",
              degree: "BSc Software Engineering",
              institution: "Princess Sumaya University for Technology"
            }
          ],
          certificates: [
            {
              title: "Microsoft Azure Administrator Associate | 2024",
              description: "Administering identities, compute, storage, networking, and governance controls in Azure environments."
            },
            {
              title: "HashiCorp Terraform Associate | 2024",
              description: "Infrastructure-as-code concepts, Terraform workflows, state handling, and reusable provisioning practices."
            },
            {
              title: "Google Cybersecurity Certificate | 2023",
              description: "Security operations, risk assessment, log analysis, and incident response foundations."
            }
          ],
          skills: [
            {
              label: "Platform & Web",
              items: "React, Node.js, Express.js, FastAPI, REST APIs, admin dashboards, role-based workflows"
            },
            {
              label: "Programming & Data",
              items: "JavaScript, TypeScript, Python, SQL, PostgreSQL, data modeling, automation scripts"
            },
            {
              label: "Cloud & DevOps",
              items: "Google Cloud Run, Azure fundamentals, GitHub Actions, Docker, CI/CD pipelines, environment monitoring"
            }
          ],
          softSkills: [
            "Analytical thinking",
            "Structured troubleshooting",
            "Clear technical writing",
            "Cross-functional collaboration",
            "Prioritization",
            "Ownership"
          ]
        },
        coverLetter: createEmptyCoverLetter("Sara Al-Najjar")
      },
      ar: {
        meta: { lang: "ar", dir: "rtl" },
        labels: {
          summary: "الملخص المهني",
          experience: "الخبرة المهنية",
          internships: "التدريب العملي",
          projects: "المشاريع",
          education: "التعليم",
          certificates: "الشهادات",
          skills: "المهارات التقنية",
          softSkills: "المهارات الشخصية"
        },
        profile: {
          name: "سارة النجار",
          location: "دبي، الإمارات العربية المتحدة",
          linkedinLabel: "linkedin.com/in/sara-al-najjar-demo",
          githubLabel: "github.com/saranajjar-demo",
          portfolioLabel: "saranajjar.dev"
        },
        summary:
          "مهندسة برمجيات وسحابة تركز على بناء منصات داخلية موثوقة، وأتمتة العمليات، ودعم فرق التشغيل عبر واجهات واضحة وتكاملات عملية. تمتلك خبرة في تطوير الواجهة الأمامية والخلفية، وتصميم واجهات الإدارة، وتحسين مسارات النشر والمتابعة، مع اهتمام واضح بالأمن والتوثيق وإنتاجية الفرق.",
        sections: {
          experience: [
            {
              date: "مارس 2024 - حتى الآن",
              location: "دبي، الإمارات العربية المتحدة",
              organization: "Northstar Logistics Cloud Services",
              role: "مهندسة برمجيات ومنصات",
              bullets: [
                "بنت منصة تشغيل داخلية تستخدمها 6 فرق تنفيذ، واستبدلت عمليات التسليم اليدوية المعتمدة على الجداول بمسارات عمل قائمة على الأدوار، مما خفّض تحديثات الحالة اليدوية بنسبة 40%.",
                "طوّرت خدمات Node.js وReact لمعالجة الشحنات والاستثناءات وتكاملات الشركاء عبر 18 واجهة REST و4 وحدات إدارية داخلية.",
                "أتقنت أتمتة فحوصات الإصدارات والبيئات باستخدام GitHub Actions وGoogle Cloud Run، ما خفّض زمن التحقق من النشر من 45 دقيقة إلى أقل من 15 دقيقة."
              ]
            }
          ],
          internships: [
            {
              date: "يونيو 2021 - سبتمبر 2021",
              location: "عن بُعد",
              organization: "BluePeak Security Lab",
              role: "متدربة أمن سحابي",
              bullets: [
                "راجعت إعدادات IAM والتسجيل في مختبرات سحابية تدريبية، وأعدّت ملاحظات معالجة للمخاطر الشائعة المرتبطة بالتخزين والوصول.",
                "بنت أدوات Python بسيطة لتحليل السجلات وفرز التنبيهات، مما ساعد المحللين على مراجعة الأحداث المشبوهة بسرعة أكبر أثناء التمارين."
              ]
            }
          ],
          projects: [
            {
              date: "أغسطس 2023 - يناير 2024",
              title: "IncidentHub - Security Operations Dashboard",
              linkLabel: "GitHub",
              linkHref: "https://github.com/saranajjar-demo/incidenthub",
              bullets: [
                "بنت لوحة متابعة أمنية باستخدام React وFastAPI وPostgreSQL لتتبع التنبيهات وخطط الاستجابة وملاحظات التحقيق عبر حوادث محاكاة.",
                "أضافت عوامل تصفية للمحللين وتقييمًا للشدة وسجلات تدقيق، ما مكّن المستخدمين من فرز الضوضاء ومراجعة تاريخ الاستجابة من مكان واحد.",
                "غلّفت المنظومة باستخدام Docker وأطلقت نسخة تجريبية مع فحوصات CI للتنسيق والاختبارات وبيانات العرض."
              ]
            }
          ],
          education: [
            {
              date: "2022 - 2023",
              location: "ليدز، المملكة المتحدة",
              degree: "ماجستير الأمن السيبراني والأنظمة السحابية",
              institution: "University of Leeds"
            },
            {
              date: "2017 - 2021",
              location: "عمّان، الأردن",
              degree: "بكالوريوس هندسة البرمجيات",
              institution: "Princess Sumaya University for Technology"
            }
          ],
          certificates: [
            {
              title: "Microsoft Azure Administrator Associate | 2024",
              description: "إدارة الهويات والحوسبة والتخزين والشبكات وضوابط الحوكمة داخل بيئات Azure."
            },
            {
              title: "HashiCorp Terraform Associate | 2024",
              description: "مفاهيم البنية التحتية ككود، وسير عمل Terraform، وإدارة الحالة، وأنماط التهيئة القابلة لإعادة الاستخدام."
            },
            {
              title: "Google Cybersecurity Certificate | 2023",
              description: "أساسيات العمليات الأمنية، وتقييم المخاطر، وتحليل السجلات، والاستجابة للحوادث."
            }
          ],
          skills: [
            {
              label: "المنصات والويب",
              items: "React، Node.js، Express.js، FastAPI، REST APIs، لوحات الإدارة، مسارات العمل المعتمدة على الأدوار"
            },
            {
              label: "البرمجة والبيانات",
              items: "JavaScript، TypeScript، Python، SQL، PostgreSQL، نمذجة البيانات، سكربتات الأتمتة"
            },
            {
              label: "السحابة وDevOps",
              items: "Google Cloud Run، أساسيات Azure، GitHub Actions، Docker، خطوط CI/CD، مراقبة البيئات"
            }
          ],
          softSkills: [
            "التفكير التحليلي",
            "الاستكشاف المنهجي للأعطال",
            "الكتابة التقنية الواضحة",
            "التعاون متعدد التخصصات",
            "إدارة الأولويات",
            "تحمل المسؤولية"
          ]
        },
        coverLetter: createEmptyCoverLetter("سارة النجار")
      }
    }
  };
}
