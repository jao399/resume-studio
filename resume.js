(function () {
  const data = window.resumeData;
  const root = document.getElementById("resume");

  render();
  window.addEventListener("resize", debounce(render, 120));

  function render() {
    root.innerHTML = "";
    const blocks = buildBlocks();
    paginate(blocks);
  }

  function buildBlocks() {
    return [
      createHeroBlock(data),
      createSectionTitle("Professional summary", true),
      element("p", "summary-text", data.summary),
      createSectionTitle("Work history", true),
      ...data.workHistory.map(renderWorkItem),
      createSectionTitle("Projects", true),
      ...data.projects.map(renderProjectItem),
      createSectionTitle("Education", true),
      ...data.education.map(renderEducationItem),
      createForceBreak(),
      createSectionTitle("Certificates", true),
      ...createCertificateCards(data.certificates),
      createSectionTitle("Skills", true),
      createSkillsBlock(data.skills)
    ];
  }

  function paginate(blocks) {
    let page = appendPage(true);

    blocks.forEach((block) => {
      if (block.dataset.forcePageBreak === "true") {
        if (page.body.children.length > 0) {
          page = appendPage(false);
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

      page = appendPage(false);

      if (carryHeader) {
        page.body.appendChild(carryHeader);
      }

      page.body.appendChild(block);
    });
  }

  function appendPage(isFirstPage) {
    const sheet = createSheet(isFirstPage ? "sheet--first" : "sheet--flow");
    root.appendChild(sheet);
    return { sheet, body: sheet.querySelector(".sheet__body") };
  }

  function createHeroBlock(resume) {
    const hero = document.createElement("header");
    hero.className = "hero";
    hero.innerHTML = `
      <div class="hero__photo-wrap">
        <img class="hero__photo" src="${resume.profile.photo}" alt="${resume.profile.name}">
      </div>
      <h1 class="hero__name">${escapeHtml(resume.profile.name)}</h1>
      <div class="hero__contact-row">
        ${contactLink("email", `mailto:${resume.profile.email}`, resume.profile.email)}
        ${contactLink("phone", resume.profile.phoneHref, resume.profile.phone)}
        ${contactLink("location", "#", resume.profile.location, true)}
        ${contactLink("linkedin", resume.profile.linkedinHref, resume.profile.linkedinLabel)}
      </div>
    `;
    return hero;
  }

  function renderWorkItem(item) {
    return createTimelineItem({
      asideTop: item.date,
      asideBottom: item.location,
      title: item.organization,
      subtitle: item.role,
      bullets: item.bullets
    });
  }

  function renderProjectItem(item) {
    return createTimelineItem({
      asideTop: item.date,
      title: item.title,
      bullets: item.bullets
    });
  }

  function renderEducationItem(item) {
    return createTimelineItem({
      asideTop: item.date,
      asideBottom: item.location,
      title: item.degree,
      subtitle: item.institution
    });
  }

  function createTimelineItem({ asideTop, asideBottom, title, subtitle, bullets }) {
    const item = document.createElement("article");
    item.className = "timeline-item";

    const aside = document.createElement("div");
    aside.className = "timeline-item__meta";
    aside.append(element("div", "timeline-item__date", asideTop));
    if (asideBottom) {
      aside.append(element("div", "timeline-item__location", asideBottom));
    }

    const content = document.createElement("div");
    content.className = "timeline-item__content";
    content.append(element("h3", "timeline-item__title", title));

    if (subtitle) {
      content.append(element("p", "timeline-item__subtitle", subtitle));
    }

    if (bullets && bullets.length) {
      content.append(createBulletList(bullets));
    }

    item.append(aside, content);
    return item;
  }

  function createCertificateCards(certificates) {
    const height = getSharedCertificateHeight(certificates);

    return certificates.map((certificate) => {
      const card = document.createElement("article");
      card.className = "certificate-card";
      card.style.minHeight = `${height}px`;
      card.innerHTML = `
        <p class="certificate-card__text">
          <strong>${escapeHtml(certificate.title)}</strong>
          <span class="certificate-card__dash"> - </span>
          <span>${escapeHtml(certificate.description)}</span>
        </p>
      `;
      return card;
    });
  }

  function createSkillsBlock(skills) {
    const panel = document.createElement("section");
    panel.className = "skills-panel";

    const technical = document.createElement("div");
    technical.className = "skills-panel__column";
    technical.append(element("h3", "skills-panel__heading", "Technical Skills"));

    const technicalList = document.createElement("ul");
    technicalList.className = "skill-list";
    skills.technical.forEach((skill) => {
      const item = document.createElement("li");
      item.className = "skill-list__item";
      item.innerHTML = `<strong>${escapeHtml(skill.label)}:</strong> ${escapeHtml(skill.items)}`;
      technicalList.appendChild(item);
    });
    technical.appendChild(technicalList);

    const soft = document.createElement("div");
    soft.className = "skills-panel__column";
    soft.append(element("h3", "skills-panel__heading", "Soft Skills"));

    const softList = document.createElement("ul");
    softList.className = "skill-list";
    skills.soft.forEach((skill) => {
      softList.appendChild(element("li", "skill-list__item", skill));
    });
    soft.appendChild(softList);

    panel.append(technical, soft);
    return panel;
  }

  function createSectionTitle(title, keepWithNext = false) {
    const heading = document.createElement("h2");
    heading.className = "section-title";
    heading.textContent = title;
    if (keepWithNext) {
      heading.dataset.keepWithNext = "true";
    }
    return heading;
  }

  function createForceBreak() {
    const marker = document.createElement("div");
    marker.dataset.forcePageBreak = "true";
    return marker;
  }

  function createBulletList(items) {
    const list = document.createElement("ul");
    list.className = "bullet-list";
    items.forEach((item) => list.appendChild(element("li", "bullet-list__item", item)));
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

  function getSharedCertificateHeight(certificates) {
    const probe = document.createElement("div");
    probe.className = "certificate-probe";
    document.body.appendChild(probe);

    let height = 0;
    certificates.forEach((certificate) => {
      const card = document.createElement("article");
      card.className = "certificate-card certificate-card--measure";
      card.innerHTML = `
        <p class="certificate-card__text">
          <strong>${escapeHtml(certificate.title)}</strong>
          <span class="certificate-card__dash"> - </span>
          <span>${escapeHtml(certificate.description)}</span>
        </p>
      `;
      probe.appendChild(card);
      height = Math.max(height, Math.ceil(card.getBoundingClientRect().height));
    });

    probe.remove();
    return Math.max(height, 76);
  }

  function contactLink(type, href, label, isStatic = false) {
    const tag = isStatic ? "span" : "a";
    const hrefAttr = isStatic ? "" : ` href="${href}" target="${type === "linkedin" ? "_blank" : "_self"}" rel="noreferrer"`;
    return `
      <${tag} class="contact-item"${hrefAttr}>
        <span class="contact-item__icon" aria-hidden="true">${icon(type)}</span>
        <span>${escapeHtml(label)}</span>
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
      linkedin:
        '<svg viewBox="0 0 24 24"><path d="M6.45 8.5a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6ZM4.9 19V9.8H8V19H4.9Zm5.08 0V9.8h2.97v1.25h.04c.41-.78 1.42-1.6 2.92-1.6 3.12 0 3.7 2.05 3.7 4.71V19h-3.1v-4.3c0-1.02-.02-2.34-1.42-2.34-1.42 0-1.64 1.1-1.64 2.27V19H9.98Z"/></svg>'
    };
    return icons[type];
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (typeof text === "string") {
      node.textContent = text;
    }
    return node;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function debounce(fn, delay) {
    let timeoutId = 0;
    return () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(fn, delay);
    };
  }
})();
