from __future__ import annotations

import asyncio
import base64
import io
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

import fitz

try:
    import websockets
except ImportError:  # pragma: no cover - optional runtime dependency
    websockets = None


ROOT = Path(__file__).resolve().parent.parent
RUNTIME_DIR = ROOT / ".local-trash" / "runtime"
HOST = "127.0.0.1"
PORT = 8767
BROWSER_CANDIDATES = [
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
]

SECTION_KEYS = [
    "profile",
    "summary",
    "professionalExperience",
    "internships",
    "projects",
    "education",
    "certificates",
    "skills",
    "softSkills",
]
SECTION_HEADINGS = {
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
    "soft skills": "softSkills",
}
DATE_PATTERN = re.compile(
    r"^(?:(?:\d{2}|\d{1,2})/\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4})\s*-\s*(?:Present|Current|(?:\d{2}|\d{1,2})/\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4})$",
    re.IGNORECASE,
)
EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w.-]+\.\w+")
PHONE_PATTERN = re.compile(r"\+?\d[\d\s()\-]{7,}")
URL_PATTERN = re.compile(r"(https?://\S+|(?:linkedin|github)\.com/\S+)", re.IGNORECASE)


def choose_browser() -> Path:
    for candidate in BROWSER_CANDIDATES:
        if candidate.exists():
            return candidate
    raise RuntimeError("Edge or Chrome was not found.")


def get_available_pdf_path(preferred: Path) -> Path:
    preferred.parent.mkdir(parents=True, exist_ok=True)
    try:
        with preferred.open("a+b"):
            return preferred
    except OSError:
        stamp = subprocess.check_output(
            ["powershell", "-NoProfile", "-Command", "Get-Date -Format yyyyMMdd-HHmmss"],
            text=True,
        ).strip()
        return preferred.with_name(f"{preferred.stem}-{stamp}{preferred.suffix}")


def write_override_script(lang: str, resume_data: dict, document_type: str = "resume", cover_letter_data: dict | None = None) -> Path:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    override_file = RUNTIME_DIR / f"live-export-{lang}.js"
    parts = [
        "window.resumeData = " + json.dumps(resume_data, ensure_ascii=False, indent=2) + ";\n",
        "window.resumeDocumentMode = " + json.dumps(document_type, ensure_ascii=False) + ";\n",
    ]
    if cover_letter_data is not None:
        parts.append("window.resumeCoverLetterData = " + json.dumps(cover_letter_data, ensure_ascii=False, indent=2) + ";\n")
    override_file.write_text("".join(parts), encoding="utf-8")
    return override_file


def choose_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((HOST, 0))
        return int(sock.getsockname()[1])


def fetch_debug_pages(port: int) -> list[dict]:
    with urlopen(f"http://{HOST}:{port}/json/list", timeout=2) as response:
        return json.loads(response.read().decode("utf-8"))


async def render_pdf_via_cdp(browser: Path, page_url: str, pdf_path: Path) -> bool:
    if websockets is None:
        return False

    debug_port = choose_free_port()
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    profile_dir = Path(tempfile.mkdtemp(prefix="resume-pdf-profile-", dir=RUNTIME_DIR))
    process = subprocess.Popen(
        [
            str(browser),
            "--headless",
            "--disable-gpu",
            f"--remote-debugging-port={debug_port}",
            f"--user-data-dir={profile_dir}",
            "--no-first-run",
            "--no-default-browser-check",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
    )

    try:
        pages: list[dict] | None = None
        for _ in range(60):
            if process.poll() is not None:
                break
            try:
                pages = fetch_debug_pages(debug_port)
                if pages:
                    break
            except Exception:
                time.sleep(0.2)
        if not pages:
            return False

        page = pages[0]
        websocket_url = page.get("webSocketDebuggerUrl")
        if not websocket_url:
            return False

        async with websockets.connect(websocket_url, max_size=2**24) as sock:
            message_id = 0

            async def send(method: str, params: dict | None = None) -> dict:
                nonlocal message_id
                message_id += 1
                await sock.send(json.dumps({
                    "id": message_id,
                    "method": method,
                    "params": params or {},
                }))
                while True:
                    payload = json.loads(await sock.recv())
                    if payload.get("id") == message_id:
                        return payload

            await send("Page.enable")
            await send("Runtime.enable")
            await send("Page.navigate", {"url": page_url})

            deadline = time.time() + 15
            while time.time() < deadline:
                payload = json.loads(await sock.recv())
                if payload.get("method") == "Page.loadEventFired":
                    break

            await send(
                "Runtime.evaluate",
                {
                    "expression": """
                        Promise.all([
                          document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(),
                          typeof window.__resumePrepareForPrint === 'function'
                            ? Promise.resolve(window.__resumePrepareForPrint())
                            : Promise.resolve(true),
                          new Promise((resolve) => setTimeout(resolve, 500))
                        ]).then(() => true)
                    """,
                    "awaitPromise": True,
                    "returnByValue": True,
                },
            )

            pdf_response = await send(
                "Page.printToPDF",
                {
                    "printBackground": True,
                    "displayHeaderFooter": False,
                    "preferCSSPageSize": True,
                    "paperWidth": 8.2677165,
                    "paperHeight": 11.692913,
                    "marginTop": 0,
                    "marginBottom": 0,
                    "marginLeft": 0,
                    "marginRight": 0,
                },
            )
            encoded_pdf = pdf_response.get("result", {}).get("data")
            if not encoded_pdf:
                return False

            pdf_path.write_bytes(base64.b64decode(encoded_pdf))
            return True
    finally:
        try:
            process.terminate()
            process.wait(timeout=5)
        except Exception:
            try:
                process.kill()
            except Exception:
                pass
        try:
            for item in sorted(profile_dir.glob("**/*"), reverse=True):
                if item.is_file():
                    item.unlink(missing_ok=True)
                else:
                    item.rmdir()
            profile_dir.rmdir()
        except Exception:
            pass


def render_pdf_via_cli(browser: Path, page_url: str, pdf_path: Path) -> None:
    completed = subprocess.run(
        [
            str(browser),
            "--headless",
            "--disable-gpu",
            "--no-pdf-header-footer",
            f"--print-to-pdf={pdf_path}",
            page_url,
        ],
        capture_output=True,
        text=True,
        timeout=90,
        check=False,
    )

    if completed.returncode != 0:
        raise RuntimeError((completed.stderr or completed.stdout or "PDF export failed.").strip())


def export_pdf(page: str, output_name: str, lang: str, resume_data: dict, document_type: str = "resume", cover_letter_data: dict | None = None) -> Path:
    if page not in {"index.html", "arabic.html", "cover-letter.html", "cover-letter-ar.html"}:
        raise RuntimeError("Unsupported page requested.")

    browser = choose_browser()
    override_file = write_override_script(lang, resume_data, document_type=document_type, cover_letter_data=cover_letter_data)
    override_rel = override_file.relative_to(ROOT).as_posix()
    pdf_path = get_available_pdf_path(ROOT / output_name)
    page_url = f"http://{HOST}:{PORT}/{page}?override={quote(override_rel)}&print=1"
    rendered_with_cdp = False
    try:
        rendered_with_cdp = asyncio.run(render_pdf_via_cdp(browser, page_url, pdf_path))
    except Exception:
        rendered_with_cdp = False

    if not rendered_with_cdp:
        render_pdf_via_cli(browser, page_url, pdf_path)

    try:
        os.startfile(str(pdf_path))
    except OSError:
        pass

    return pdf_path


def extract_pdf_content(pdf_bytes: bytes) -> dict:
    if not pdf_bytes:
        raise RuntimeError("The uploaded PDF file was empty.")

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_texts: list[str] = []
    image_pages = 0
    total_images = 0
    rendered_pages: list[str] = []

    for index, page in enumerate(doc):
        text = page.get_text("text") or ""
        page_texts.append(text.strip())
        images = page.get_images(full=True)
        total_images += len(images)
        if len(text.strip()) < 80 and images:
            image_pages += 1
        if index < 2:
            pix = page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6), alpha=False)
            rendered_pages.append(base64.b64encode(pix.tobytes("png")).decode("ascii"))

    full_text = "\n".join(part for part in page_texts if part).strip()
    source_type = "ocr" if (len(full_text) < 400 and image_pages) or (image_pages and image_pages >= max(1, len(page_texts) // 2)) else "text"
    warnings: list[str] = []
    if source_type == "ocr":
        warnings.append("This PDF looks image-based or scanned, so extracted fields may need closer review.")
    if len(full_text) < 80:
        warnings.append("Very little extractable text was found in the PDF.")

    return {
        "text": full_text,
        "page_texts": page_texts,
        "page_images": rendered_pages,
        "source_type": source_type,
        "warnings": warnings,
        "page_count": len(page_texts),
        "image_pages": image_pages,
        "total_images": total_images,
    }


def create_empty_resume_payload() -> dict:
    return {
        "meta": {"lang": "en", "dir": "ltr"},
        "profile": {
            "name": "",
            "photo": "",
            "email": "",
            "phone": "",
            "phoneHref": "",
            "location": "",
            "linkedinLabel": "",
            "linkedinHref": "",
            "githubLabel": "",
            "githubHref": "",
            "portfolioLabel": "",
            "portfolioHref": "",
        },
        "summary": "",
        "professionalExperience": [],
        "internships": [],
        "projects": [],
        "education": [],
        "certificates": [],
        "skills": {
            "technical": [],
            "soft": [],
        },
    }


def split_lines(text: str) -> list[str]:
    return [line.strip() for line in text.replace("\r", "\n").split("\n") if line.strip()]


def normalize_heading(line: str) -> str:
    return re.sub(r"\s+", " ", str(line or "").strip().lower())


def split_sections_from_text(text: str) -> tuple[list[str], dict]:
    profile_lines: list[str] = []
    sections = {key: [] for key in SECTION_KEYS if key != "profile"}
    current_key: str | None = None

    for line in split_lines(text):
        heading_key = SECTION_HEADINGS.get(normalize_heading(line))
        if heading_key:
            current_key = heading_key
            continue
        if current_key:
            sections[current_key].append(line)
        else:
            profile_lines.append(line)
    return profile_lines, sections


def parse_profile_lines(lines: list[str]) -> tuple[dict, list[str]]:
    profile = create_empty_resume_payload()["profile"]
    leftovers: list[str] = []
    if lines:
        profile["name"] = lines[0]

    for line in lines[1:]:
        email = EMAIL_PATTERN.search(line)
        url_match = URL_PATTERN.search(line)
        if email and not profile["email"]:
            profile["email"] = email.group(0)
            continue
        if PHONE_PATTERN.search(line) and not profile["phone"]:
            phone = line.strip()
            profile["phone"] = phone
            digits = re.sub(r"[^\d+]", "", phone)
            if digits:
                profile["phoneHref"] = f"tel:{digits}"
            continue
        if url_match:
            url = url_match.group(0)
            normalized = url if url.lower().startswith("http") else f"https://{url}"
            if "linkedin.com" in normalized.lower() and not profile["linkedinHref"]:
                profile["linkedinHref"] = normalized
                profile["linkedinLabel"] = url
                continue
            if "github.com" in normalized.lower() and not profile["githubHref"]:
                profile["githubHref"] = normalized
                profile["githubLabel"] = url
                continue
        if not profile["location"]:
            profile["location"] = line
        else:
            leftovers.append(line)

    return profile, leftovers


def consume_work_items(lines: list[str], include_role: bool = True, include_location: bool = True) -> list[dict]:
    items: list[dict] = []
    index = 0
    while index < len(lines):
        if not DATE_PATTERN.match(lines[index]):
            index += 1
            continue
        item = {
            "date": lines[index],
            "location": "",
            "organization": "",
            "role": "",
            "bullets": [],
        }
        index += 1
        if include_location and index < len(lines):
            item["location"] = lines[index]
            index += 1
        if index < len(lines):
            item["organization"] = lines[index]
            index += 1
        if include_role and index < len(lines):
            item["role"] = lines[index]
            index += 1
        while index < len(lines) and not DATE_PATTERN.match(lines[index]):
            item["bullets"].append(lines[index])
            index += 1
        item["bullets"] = [bullet for bullet in item["bullets"] if bullet]
        items.append(item)
    return items


def consume_project_items(lines: list[str]) -> list[dict]:
    items: list[dict] = []
    index = 0
    while index < len(lines):
        if not DATE_PATTERN.match(lines[index]):
            index += 1
            continue
        item = {
            "date": lines[index],
            "title": "",
            "linkLabel": "",
            "linkHref": "",
            "bullets": [],
        }
        index += 1
        if index < len(lines):
            item["title"] = lines[index]
            index += 1
        while index < len(lines) and not DATE_PATTERN.match(lines[index]):
            line = lines[index]
            url_match = URL_PATTERN.search(line)
            if url_match and not item["linkHref"]:
                url = url_match.group(0)
                item["linkHref"] = url if url.lower().startswith("http") else f"https://{url}"
                item["linkLabel"] = url
            else:
                item["bullets"].append(line)
            index += 1
        items.append(item)
    return items


def consume_education_items(lines: list[str]) -> list[dict]:
    items: list[dict] = []
    index = 0
    while index < len(lines):
        if not DATE_PATTERN.match(lines[index]):
            index += 1
            continue
        item = {
            "date": lines[index],
            "location": "",
            "degree": "",
            "institution": "",
        }
        index += 1
        if index < len(lines):
            item["location"] = lines[index]
            index += 1
        if index < len(lines):
            item["degree"] = lines[index]
            index += 1
        if index < len(lines):
            item["institution"] = lines[index]
            index += 1
        items.append(item)
    return items


def consume_certificate_items(lines: list[str]) -> list[dict]:
    if not lines:
        return []
    paragraphs: list[str] = []
    current: list[str] = []
    for line in lines:
        current.append(line)
        if line.endswith("."):
            paragraphs.append(" ".join(current))
            current = []
    if current:
        paragraphs.append(" ".join(current))

    items: list[dict] = []
    for paragraph in paragraphs:
        parts = [part.strip() for part in paragraph.split(" - ") if part.strip()]
        if len(parts) >= 2:
            title = " - ".join(parts[:2]) if len(parts) > 2 else parts[0]
            description = " - ".join(parts[2:]) if len(parts) > 2 else parts[1]
        else:
            title = paragraph
            description = ""
        items.append({"title": title, "description": description})
    return items


def consume_skill_sections(lines: list[str]) -> tuple[list[dict], list[str]]:
    technical: list[dict] = []
    soft: list[str] = []
    current_label = ""
    current_text = ""

    def flush_current() -> None:
        nonlocal current_label, current_text
        if current_label:
            technical.append({"label": current_label, "items": current_text.strip(" ,")})
            current_label = ""
            current_text = ""

    for line in lines:
        if ":" in line:
            flush_current()
            label, items = line.split(":", 1)
            current_label = label.strip()
            current_text = items.strip()
        elif current_label:
            current_text = f"{current_text} {line}".strip()
        else:
            soft.append(line)

    flush_current()
    return technical, soft


def parse_resume_text_locally(text: str) -> dict:
    profile_lines, sections = split_sections_from_text(text)
    profile, profile_leftovers = parse_profile_lines(profile_lines)
    data = create_empty_resume_payload()
    data["profile"] = profile
    data["summary"] = " ".join(sections["summary"]).strip()
    data["professionalExperience"] = consume_work_items(sections["professionalExperience"])
    data["internships"] = consume_work_items(sections["internships"])
    data["projects"] = consume_project_items(sections["projects"])
    data["education"] = consume_education_items(sections["education"])
    data["certificates"] = consume_certificate_items(sections["certificates"])
    technical, soft = consume_skill_sections(sections["skills"])
    data["skills"]["technical"] = technical
    data["skills"]["soft"] = soft or [line for line in sections["softSkills"] if line]
    if sections["softSkills"] and not data["skills"]["soft"]:
        data["skills"]["soft"] = [line for line in sections["softSkills"] if line]
    warnings: list[str] = []
    if profile_leftovers:
        warnings.append("Some header lines could not be mapped exactly and may need manual cleanup.")
    return {"resumeData": data, "warnings": warnings}


def make_section_meta(data: dict, source_type: str) -> dict:
    low = "low" if source_type == "ocr" else "medium"

    def meta_for(value, warning: str = "") -> dict:
        if isinstance(value, str):
            present = bool(value.strip())
        elif isinstance(value, list):
            present = bool(value)
        elif isinstance(value, dict):
            present = any(str(item).strip() for item in value.values() if item is not None)
        else:
            present = bool(value)
        return {
            "confidence": "high" if present and source_type == "text" else (low if present else "low"),
            "warning": warning if present else "No content was confidently mapped for this section.",
        }

    return {
        "profile": meta_for(data.get("profile", {})),
        "summary": meta_for(data.get("summary", "")),
        "professionalExperience": meta_for(data.get("professionalExperience", [])),
        "internships": meta_for(data.get("internships", [])),
        "projects": meta_for(data.get("projects", [])),
        "education": meta_for(data.get("education", [])),
        "certificates": meta_for(data.get("certificates", [])),
        "skills": meta_for(data.get("skills", {}).get("technical", [])),
        "softSkills": meta_for(data.get("skills", {}).get("soft", [])),
    }


def improve_resume_import_with_ai(provider: str, api_key: str, model: str, extracted: dict, local_candidate: dict) -> dict:
    raw_text = extracted.get("text") or ""
    page_images = extracted.get("page_images") or []
    if not api_key.strip():
        raise RuntimeError("AI is not configured for PDF import.")

    user_content: list[dict] = [
        {
            "type": "text",
            "text": (
                "Map this English CV PDF into structured JSON for this resume editor.\n"
                "Return valid JSON only in this shape:\n"
                "{\"resumeData\": {\"profile\": {...}, \"summary\": \"\", \"professionalExperience\": [], "
                "\"internships\": [], \"projects\": [], \"education\": [], \"certificates\": [], "
                "\"skills\": {\"technical\": [], \"soft\": []}}, \"sectionMeta\": {...}, \"warnings\": []}\n"
                "Rules:\n"
                "- Optimize for truthful extraction, not rewriting.\n"
                "- Preserve names, email, phone, URLs, dates, titles, and organizations exactly.\n"
                "- Keep unknown or ambiguous content conservative.\n"
                "- For technical skills use objects with label/items.\n"
                "- For soft skills use a simple array of strings.\n"
                f"- Source type: {extracted.get('source_type')}\n"
                f"- Local parser candidate: {json.dumps(local_candidate, ensure_ascii=False)}\n"
                f"- Extracted text: {raw_text[:22000]}\n"
            ),
        }
    ]

    for image_b64 in page_images[:2]:
        user_content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{image_b64}"},
            }
        )

    suggestion = request_chat_completion(
        provider=provider,
        api_key=api_key,
        model=model,
        require_json=True,
        messages=[
            {
                "role": "system",
                "content": "You extract structured resume data from English CV PDFs. Return JSON only.",
            },
            {
                "role": "user",
                "content": user_content,
            },
        ],
    )

    structured = extract_json_payload(suggestion)
    resume_data = structured.get("resumeData") or {}
    section_meta = structured.get("sectionMeta") or {}
    warnings = structured.get("warnings") or []
    if not isinstance(resume_data, dict):
        raise RuntimeError("AI PDF import did not return a valid resumeData object.")
    return {
        "resumeData": resume_data,
        "sectionMeta": section_meta,
        "warnings": [str(item) for item in warnings if str(item).strip()],
    }


def import_pdf_resume(pdf_base64: str, lang: str) -> dict:
    if lang != "en":
        raise RuntimeError("PDF autofill currently supports English only.")

    try:
        pdf_bytes = base64.b64decode(pdf_base64.encode("utf-8"), validate=True)
    except Exception as error:  # noqa: BLE001
        raise RuntimeError("The uploaded PDF could not be decoded.") from error

    extracted = extract_pdf_content(pdf_bytes)
    local_result = parse_resume_text_locally(extracted["text"])
    resume_data = local_result["resumeData"]
    section_meta = make_section_meta(resume_data, extracted["source_type"])
    warnings = list(extracted["warnings"]) + list(local_result["warnings"])

    return {
        "resumeData": resume_data,
        "sectionMeta": section_meta,
        "warnings": warnings,
        "sourceType": extracted["source_type"],
        "aiAssisted": False,
    }


def normalize_provider(provider: str, api_key: str) -> str:
    normalized = (provider or "").strip().lower()
    if normalized in {"openai", "openrouter"}:
        return normalized
    return "openrouter" if api_key.strip().startswith("sk-or-") else "openai"


def default_model_for_provider(provider: str) -> str:
    return "openai/gpt-4.1-mini" if provider == "openrouter" else "gpt-4.1-mini"


def extract_chat_text(payload: dict) -> str:
    choices = payload.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts).strip()
    return ""


def request_chat_completion(provider: str, api_key: str, model: str, messages: list[dict], require_json: bool = False) -> str:
    if not api_key.strip():
        raise RuntimeError("API key is required for AI requests.")

    normalized_provider = normalize_provider(provider, api_key)
    endpoint = (
        "https://openrouter.ai/api/v1/chat/completions"
        if normalized_provider == "openrouter"
        else "https://api.openai.com/v1/chat/completions"
    )
    selected_model = model or default_model_for_provider(normalized_provider)
    body = json.dumps(
        {
            "model": selected_model,
            "messages": messages,
            "temperature": 0.2,
        }
    ).encode("utf-8")
    payload = json.loads(body.decode("utf-8"))
    if require_json:
        payload["response_format"] = {"type": "json_object"}
        body = json.dumps(payload).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    if normalized_provider == "openrouter":
        headers["HTTP-Referer"] = "http://localhost"
        headers["X-Title"] = "Resume Editor"

    request = Request(
        endpoint,
        data=body,
        headers=headers,
        method="POST",
    )

    with urlopen(request, timeout=90) as response:
        payload = json.loads(response.read().decode("utf-8"))

    suggestion = extract_chat_text(payload)
    if not suggestion:
        raise RuntimeError("The AI response was empty.")
    return suggestion


def rewrite_text(provider: str, api_key: str, model: str, section_key: str, text: str) -> str:
    return request_chat_completion(
        provider=provider,
        api_key=api_key,
        model=model,
        messages=[
            {
                "role": "system",
                "content": "You rewrite resume lines. Keep them concise, ATS-friendly, truthful, and professional. Return only the rewritten text.",
            },
            {
                "role": "user",
                "content": f"Section: {section_key}\nRewrite this resume text with stronger action-result phrasing while staying accurate:\n{text}",
            },
        ],
    )


def command_rewrite(provider: str, api_key: str, model: str, section_key: str, scope: str, command: str, text: str, context: dict | None) -> dict:
    if not api_key.strip():
        raise RuntimeError("API key is required for AI commands.")

    normalized_scope = "resume" if scope == "resume" else ("section" if scope == "section" else "field")
    if normalized_scope == "field" and not str(text).strip():
        raise RuntimeError("Selected text is required for field-level commands.")
    if normalized_scope in {"section", "resume"} and not isinstance(context, dict):
        raise RuntimeError("Context is required for section and whole-CV commands.")
    if not str(command).strip():
        raise RuntimeError("A command is required.")

    prompt = (
        "You are editing resume content in English.\n"
        "Follow the user's command exactly when it is safe and factual.\n"
        "Do not invent facts, metrics, technologies, or achievements.\n"
        "Keep the tone professional and ATS-friendly.\n"
        "Return valid JSON only.\n"
        "If scope is field, return {\"text\": \"...\", \"note\": \"...\"}.\n"
        "If scope is section, return {\"context\": {...}, \"note\": \"...\"} using the same shape you received.\n"
        "If scope is resume, return {\"context\": {...}, \"note\": \"...\"} using the same resume JSON shape you received.\n"
        "Only change what is needed to satisfy the command."
    )

    suggestion = request_chat_completion(
        provider=provider,
        api_key=api_key,
        model=model,
        require_json=True,
        messages=[
            {
                "role": "system",
                "content": prompt,
            },
            {
                "role": "user",
                "content": (
                    f"Section key: {section_key}\n"
                    f"Scope: {normalized_scope}\n"
                    f"Command: {command}\n"
                    f"Selected text: {text}\n"
                    f"Current section context: {json.dumps(context or {}, ensure_ascii=False)}"
                ),
            },
        ],
    )

    structured = extract_json_payload(suggestion)
    note = str(structured.get("note") or "")
    if normalized_scope in {"section", "resume"}:
        next_context = structured.get("context")
        if not isinstance(next_context, dict):
            raise RuntimeError("The AI command response did not include a valid context.")
        return {"context": next_context, "note": note}

    next_text = str(structured.get("text") or "").strip()
    if not next_text:
        raise RuntimeError("The AI command response did not include replacement text.")
    return {"text": next_text, "note": note}


def extract_json_payload(text: str) -> dict:
    text = text.strip()
    if not text:
        raise RuntimeError("The AI cover letter response was empty.")

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise RuntimeError("The AI cover letter response was not valid JSON.")
        return json.loads(match.group(0))


def rewrite_cover_letter(provider: str, api_key: str, model: str, lang: str, draft: dict, resume_data: dict, targeting: dict, job_description: str) -> dict:
    if not api_key.strip():
        raise RuntimeError("API key is required for AI cover letter mode.")

    suggestion = request_chat_completion(
        provider=provider,
        api_key=api_key,
        model=model,
        require_json=True,
        messages=[
            {
                "role": "system",
                "content": (
                    "You improve resume cover letters. Keep them concise, truthful, ATS-friendly, and professional. "
                    "Return valid JSON only with these keys: opening, body, closing."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Language: {lang}\n"
                    f"Targeting: {json.dumps(targeting or {}, ensure_ascii=False)}\n"
                    f"Job description: {job_description or ''}\n"
                    f"Resume summary: {resume_data.get('summary', '')}\n"
                    f"Current draft: {json.dumps(draft or {}, ensure_ascii=False)}\n"
                    "Improve the opening, body, and closing only. Keep the tone professional and realistic."
                ),
            },
        ],
    )
    structured = extract_json_payload(suggestion)
    return {
        "opening": str(structured.get("opening") or draft.get("opening") or ""),
        "body": str(structured.get("body") or draft.get("body") or ""),
        "closing": str(structured.get("closing") or draft.get("closing") or ""),
    }


def translate_version(
    provider: str,
    api_key: str,
    model: str,
    source_language: str,
    target_language: str,
    mode: str,
    source_version: dict,
    requested_sections: list[str],
    sections: dict,
    existing_arabic: dict,
    job_description: str,
) -> dict:
    if not api_key.strip():
        raise RuntimeError("API key is required for bilingual generation.")

    requested = [str(section) for section in requested_sections if section]
    if not requested:
        raise RuntimeError("No sections were requested for translation.")

    prompt = (
        "You localize resumes from English into strong, native, ATS-friendly Arabic.\n"
        "Rules:\n"
        "1. Never invent facts.\n"
        "2. Preserve names, dates, email, phone, phoneHref, linkedinHref, and URLs exactly unless the field is clearly display-only.\n"
        "3. Keep certification titles, product names, and technical terms in English when a literal Arabic rendering would sound weak or unnatural.\n"
        "4. Rewrite naturally in Arabic rather than translating literally.\n"
        "5. Return valid JSON only.\n"
        "6. Only include the requested section keys in the sections object.\n"
        "7. For profile, preserve email/phone/link URLs exactly and localize display text professionally.\n"
        "8. For coverLetter, return a structured object with recipientName, company, targetRole, hiringManager, opening, body, closing, signatureName, notes, generatedAt.\n"
        "Return JSON in this shape: {\"sections\": {...}, \"notes\": {...}}"
    )

    suggestion = request_chat_completion(
        provider=provider,
        api_key=api_key,
        model=model,
        require_json=True,
        messages=[
            {
                "role": "system",
                "content": prompt,
            },
            {
                "role": "user",
                "content": (
                    f"Source language: {source_language}\n"
                    f"Target language: {target_language}\n"
                    f"Mode: {mode}\n"
                    f"Source version: {json.dumps(source_version or {}, ensure_ascii=False)}\n"
                    f"Requested sections: {json.dumps(requested, ensure_ascii=False)}\n"
                    f"Job description: {job_description or ''}\n"
                    f"English sections: {json.dumps(sections or {}, ensure_ascii=False)}\n"
                    f"Existing Arabic context: {json.dumps(existing_arabic or {}, ensure_ascii=False)}\n"
                    "Localize each requested section into polished Arabic while preserving all facts exactly."
                ),
            },
        ],
    )
    structured = extract_json_payload(suggestion)
    sections_payload = structured.get("sections")
    if not isinstance(sections_payload, dict):
        raise RuntimeError("The translation response did not include structured sections.")

    notes_payload = structured.get("notes")
    if not isinstance(notes_payload, dict):
        notes_payload = {}

    return {
        "sections": sections_payload,
        "notes": notes_payload,
    }


def command_plan(
    provider: str,
    api_key: str,
    model: str,
    selected_sections: list[str],
    command: str,
    content: str,
    current_sections: dict,
) -> dict:
    if not api_key.strip():
        raise RuntimeError("API key is required for command fallback.")

    if not selected_sections:
        raise RuntimeError("At least one section must be selected.")

    prompt = (
        "You plan structured resume editor updates in English.\n"
        "Return valid JSON only.\n"
        "Do not invent facts, metrics, dates, links, or employers.\n"
        "Use the user's pasted content and current section data only.\n"
        "When the command is a section rename, return it in sectionTitles.\n"
        "Otherwise return structured replacements in updates.\n"
        "Only include the selected section keys.\n"
        "JSON shape:\n"
        "{\"updates\": {\"sectionKey\": ...}, \"sectionTitles\": {\"sectionKey\": \"New title\"}, \"note\": \"...\"}\n"
        "Section data rules:\n"
        "- profile: object with profile fields only.\n"
        "- summary: plain string.\n"
        "- professionalExperience/internships: array of {date, location, organization, role, bullets}.\n"
        "- projects: array of {date, title, linkLabel, linkHref, bullets}.\n"
        "- education: array of {date, location, degree, institution}.\n"
        "- certificates: array of {title, description}.\n"
        "- skills: array of {label, items}.\n"
        "- softSkills: array of strings.\n"
        "- coverLetter: object with recipientName, company, targetRole, hiringManager, opening, body, closing, signatureName, notes.\n"
        "- custom sections: preserve the current layout shape and return the updated section object.\n"
    )

    suggestion = request_chat_completion(
        provider=provider,
        api_key=api_key,
        model=model,
        require_json=True,
        messages=[
            {
                "role": "system",
                "content": prompt,
            },
            {
                "role": "user",
                "content": (
                    f"Selected sections: {json.dumps(selected_sections, ensure_ascii=False)}\n"
                    f"Command: {command}\n"
                    f"Pasted content: {content}\n"
                    f"Current sections: {json.dumps(current_sections or {}, ensure_ascii=False)}\n"
                    "Return only the updates needed for the selected sections."
                ),
            },
        ],
    )

    structured = extract_json_payload(suggestion)
    updates = structured.get("updates")
    section_titles = structured.get("sectionTitles")
    note = str(structured.get("note") or "")

    if not isinstance(updates, dict):
        updates = {}
    if not isinstance(section_titles, dict):
        section_titles = {}

    return {
        "updates": updates,
        "sectionTitles": section_titles,
        "note": note,
    }


class ResumeHelperHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        super().end_headers()

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.respond_json({"success": True, "status": "ok"})
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path not in {"/export", "/command-plan", "/import-pdf", "/translate-version"}:
            self.respond_json({"success": False, "error": "Unknown endpoint."}, status=HTTPStatus.NOT_FOUND)
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(content_length)
            payload = json.loads(raw.decode("utf-8"))
            if parsed.path == "/export":
                pdf_path = export_pdf(
                    page=str(payload.get("page") or "index.html"),
                    output_name=str(payload.get("outputName") or "resume-studio-demo-cv.pdf"),
                    lang=str(payload.get("lang") or "en"),
                    resume_data=payload.get("resumeData") or {},
                    document_type=str(payload.get("documentType") or "resume"),
                    cover_letter_data=payload.get("coverLetterData") or None,
                )
                self.respond_json({"success": True, "pdfPath": str(pdf_path)})
                return

            if parsed.path == "/command-plan":
                result = command_plan(
                    provider=str(payload.get("provider") or ""),
                    api_key=str(payload.get("apiKey") or ""),
                    model=str(payload.get("model") or default_model_for_provider(normalize_provider(str(payload.get("provider") or ""), str(payload.get("apiKey") or "")))),
                    selected_sections=[str(item) for item in (payload.get("selectedSections") or []) if str(item).strip()],
                    command=str(payload.get("command") or ""),
                    content=str(payload.get("content") or ""),
                    current_sections=payload.get("currentSections") or {},
                )
                self.respond_json({"success": True, **result})
                return

            if parsed.path == "/translate-version":
                result = translate_version(
                    provider=str(payload.get("provider") or ""),
                    api_key=str(payload.get("apiKey") or ""),
                    model=str(payload.get("model") or default_model_for_provider(normalize_provider(str(payload.get("provider") or ""), str(payload.get("apiKey") or "")))),
                    source_language=str(payload.get("sourceLanguage") or "en"),
                    target_language=str(payload.get("targetLanguage") or "ar"),
                    mode=str(payload.get("mode") or "sync"),
                    source_version=payload.get("sourceVersion") or {},
                    requested_sections=[str(item) for item in (payload.get("requestedSections") or []) if str(item).strip()],
                    sections=payload.get("sections") or {},
                    existing_arabic=payload.get("existingArabic") or {},
                    job_description=str(payload.get("jobDescription") or ""),
                )
                self.respond_json({"success": True, **result})
                return

            if parsed.path == "/import-pdf":
                result = import_pdf_resume(
                    pdf_base64=str(payload.get("pdfBase64") or ""),
                    lang=str(payload.get("lang") or "en"),
                )
                self.respond_json({"success": True, **result})
                return
        except Exception as error:  # noqa: BLE001
            self.respond_json({"success": False, "error": str(error)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        message = format % args
        sys.stdout.write(message + "\n")

    def respond_json(self, payload: dict, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    server = ThreadingHTTPServer((HOST, PORT), ResumeHelperHandler)
    print(f"Resume PDF helper listening on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
