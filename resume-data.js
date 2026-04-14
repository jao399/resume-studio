window.resumeData = {
  meta: {
    lang: "en",
    dir: "ltr",
    documentTitle: "Sara Al-Najjar Demo Resume"
  },
  ui: {
    printButton: "Print / Save PDF",
    printHint: "A4, scale 100%, background on, headers off",
    switchEnglish: "English",
    switchArabic: "العربية"
  },
  labels: {
    summary: "Professional Summary",
    professionalExperience: "Professional Experience",
    internships: "Internships",
    projects: "Projects",
    education: "Education",
    certificates: "Certifications",
    skills: "Core Skills",
    softSkills: "Soft Skills"
  },
  profile: {
    name: "Sara Al-Najjar",
    photo: "./assets/profile-demo.svg",
    email: "sara.najjar@example.com",
    phone: "(+971) 555 018 204",
    phoneHref: "tel:+971555018204",
    location: "Dubai, United Arab Emirates",
    linkedinLabel: "linkedin.com/in/sara-al-najjar-demo",
    linkedinHref: "https://www.linkedin.com/in/sara-al-najjar-demo",
    githubLabel: "github.com/saranajjar-demo",
    githubHref: "https://github.com/saranajjar-demo",
    portfolioLabel: "saranajjar.dev",
    portfolioHref: "https://saranajjar.dev"
  },
  summary:
    "Product-minded software and cloud engineer with experience building internal web platforms, automating operational workflows, and supporting secure delivery for distributed teams. Combines frontend and backend implementation, API integration, cloud deployment, and technical documentation to turn manual processes into reliable systems. Strong fit for platform, cloud, and security-adjacent roles that value clear execution, measurable improvement, and cross-functional collaboration.",
  professionalExperience: [
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
    },
    {
      date: "Jan 2021 - May 2021",
      location: "Amman, Jordan",
      organization: "Amman Digital Innovation Hub",
      role: "Software Engineering Intern",
      bullets: [
        "Prototyped frontend components and API integrations for a citizen-services portal, improving response handling and form reliability.",
        "Helped test releases, reproduce defects, and update technical documentation for cross-functional delivery teams."
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
    },
    {
      date: "Feb 2023 - Jul 2023",
      title: "RoutePulse - Fleet Delivery Analytics Portal",
      linkLabel: "Live Demo",
      linkHref: "https://example.dev/routepulse",
      bullets: [
        "Designed a logistics analytics portal that visualized on-time delivery, failed-drop patterns, and driver workload across weekly operations.",
        "Modeled ETL-ready data structures and lightweight reporting views, enabling faster review of route trends and service exceptions.",
        "Implemented responsive UI patterns and export-ready reporting screens for operations managers."
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
    },
    {
      title: "AWS Certified Cloud Practitioner | 2023",
      description: "Cloud service models, shared-responsibility concepts, and practical cost and architecture fundamentals."
    },
    {
      title: "Splunk Core Certified User | 2023",
      description: "Searching, reporting, dashboards, and log-driven operational analysis."
    }
  ],
  skills: {
    technical: [
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
      },
      {
        label: "Security & IT Ops",
        items: "IAM basics, SIEM workflows, log analysis, endpoint support, Microsoft 365, virtualization, incident documentation"
      },
      {
        label: "Tools & Collaboration",
        items: "Git, Jira, Postman, Figma, technical documentation, stakeholder communication"
      }
    ],
    soft: [
      "Analytical thinking",
      "Structured troubleshooting",
      "Clear technical writing",
      "Cross-functional collaboration",
      "Prioritization",
      "Ownership"
    ]
  }
};
