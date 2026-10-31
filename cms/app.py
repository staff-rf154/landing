import json
import os
import re
import secrets
import time
import uuid
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import SessionMiddleware

DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
SITE_DIR = Path(os.environ.get("SITE_DIR", "/srv/site"))
CONTENT_FILE = DATA_DIR / "content.json"
UPLOAD_DIR = DATA_DIR / "uploads"
BACKUP_DIR = DATA_DIR / "backups"

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
SECRET_KEY = os.environ.get("SECRET_KEY", "")
INDEXNOW_KEY = "e93abb77d7c6937715c3c6b4c515e556"
MAX_UPLOAD = 12 * 1024 * 1024
MAX_CONTENT = 3 * 1024 * 1024
ALLOWED_ORIGINS: set[str] = set()

if not ADMIN_PASSWORD or not SECRET_KEY:
    raise RuntimeError("ADMIN_PASSWORD и SECRET_KEY должны быть заданы")

for d in (DATA_DIR, UPLOAD_DIR, BACKUP_DIR):
    d.mkdir(parents=True, exist_ok=True)


def f(key, label, kind="text", **extra):
    item = {"key": key, "label": label, "type": kind}
    item.update(extra)
    return item


def lst(key, label, item):
    return {"key": key, "label": label, "type": "list", "item": item}


IMAGE_FIELDS = [f("src", "Изображение", "image"), f("alt", "Alt-текст"), f("label", "Подпись на карточке"), f("caption", "Подпись в просмотре")]

BLOCK_SCHEMA: dict[str, dict[str, Any]] = {
    "hero": {
        "label": "Первый экран",
        "fields": [
            f("eyebrow", "Надзаголовок"),
            f("title", "Заголовок"),
            f("accent", "Цветная часть заголовка"),
            f("lead", "Описание", "textarea"),
            lst("buttons", "Кнопки", [f("label", "Текст"), f("href", "Ссылка"), f("style", "Стиль", "select", options=["primary", "outline"])]),
            lst("facts", "Факты под кнопками", [f("value", "Значение"), f("label", "Подпись")]),
        ],
    },
    "product": {
        "label": "Продукт",
        "fields": [
            f("anchor", "Якорь (id)"),
            f("eyebrow", "Надзаголовок"),
            f("title", "Заголовок"),
            f("lead", "Описание", "textarea"),
            f("chips", "Технологии (чипы)", "strings"),
            lst("actions", "Кнопки", [f("label", "Текст"), f("href", "Ссылка"), f("style", "Стиль", "select", options=["primary", "outline"])]),
            f("hint", "Примечание под кнопками (можно HTML)", "textarea"),
            lst("features", "Преимущества", [f("icon", "Иконка (текст/символ)"), f("title", "Заголовок"), f("text", "Текст (можно HTML)", "textarea")]),
            {"key": "gallery", "label": "Галерея", "type": "group", "fields": [
                f("title", "Заголовок галереи"),
                f("note", "Описание галереи"),
                f("columns", "Колонок", "select", options=["2", "3", "4"]),
                lst("images", "Изображения", IMAGE_FIELDS),
            ]},
            lst("deploy", "Плашки внизу", [f("k", "Заголовок"), f("v", "Текст")]),
            f("alt", "Светлый фон секции", "bool"),
        ],
    },
    "monitoring": {
        "label": "Мониторинг / карточки",
        "fields": [
            f("anchor", "Якорь (id)"),
            f("eyebrow", "Надзаголовок"),
            f("title", "Заголовок"),
            f("lead", "Описание", "textarea"),
            lst("cards", "Карточки", [
                f("title", "Заголовок"),
                lst("endpoints", "Строки", [f("code", "Код"), f("text", "Текст (можно HTML)")]),
                f("note", "Примечание", "textarea"),
            ]),
            lst("pillars", "Тёмные карточки", [f("title", "Заголовок"), f("text", "Текст (можно HTML)", "textarea")]),
            f("alt", "Светлый фон секции", "bool"),
        ],
    },
    "text": {
        "label": "Текст",
        "fields": [
            f("anchor", "Якорь (id)"),
            f("eyebrow", "Надзаголовок"),
            f("title", "Заголовок"),
            f("lead", "Описание", "textarea"),
            f("body", "Дополнительный HTML", "textarea"),
            f("alt", "Светлый фон секции", "bool"),
        ],
    },
    "gallery": {
        "label": "Галерея",
        "fields": [
            f("anchor", "Якорь (id)"),
            f("title", "Заголовок"),
            f("note", "Описание"),
            f("columns", "Колонок", "select", options=["2", "3", "4"]),
            lst("images", "Изображения", IMAGE_FIELDS),
            f("alt", "Светлый фон секции", "bool"),
        ],
    },
    "cta": {
        "label": "Призыв к действию",
        "fields": [
            f("anchor", "Якорь (id)"),
            f("title", "Заголовок"),
            f("text", "Описание", "textarea"),
            lst("contacts", "Контакты", [f("icon", "Иконка"), f("label", "Текст"), f("href", "Ссылка")]),
            lst("buttons", "Кнопки", [f("label", "Текст"), f("href", "Ссылка"), f("style", "Стиль", "select", options=["primary", "outline"])]),
        ],
    },
    "html": {
        "label": "Свободный HTML",
        "fields": [
            f("anchor", "Якорь (id)"),
            f("html", "HTML-код", "textarea"),
        ],
    },
}

COMMON_FIELDS = [
    f("enabled", "Блок включён", "bool"),
    f("bg_color", "Цвет фона", "color"),
    f("bg_image", "Фоновое изображение", "image"),
]

SETTINGS_SCHEMA = [
    f("site_title", "Title сайта"),
    f("site_description", "Description", "textarea"),
    f("canonical", "Canonical URL"),
    f("brand", "Бренд"),
    f("brand_mark", "Знак бренда (2 буквы)"),
    f("accent", "Основной цвет", "color"),
    f("accent2", "Дополнительный цвет", "color"),
    f("bg", "Тёмный фон", "color"),
    f("og_image", "OG-изображение", "image"),
    lst("nav", "Меню", [f("label", "Текст"), f("href", "Ссылка")]),
    f("footer_name", "Подвал: название"),
    f("footer_note", "Подвал: описание"),
    lst("footer_links", "Подвал: ссылки", [f("label", "Текст"), f("href", "Ссылка")]),
    lst("footer_contacts", "Подвал: контакты", [f("label", "Текст"), f("href", "Ссылка")]),
    f("footer_copyright", "Подвал: копирайт"),
    f("custom_css", "Дополнительный CSS", "textarea"),
]

DEFAULTS: dict[str, dict[str, Any]] = {
    "hero": {"eyebrow": "Новый блок", "title": "Заголовок", "accent": "", "lead": "", "buttons": [], "facts": []},
    "product": {"eyebrow": "Продукт", "title": "Новый продукт", "lead": "", "chips": [], "actions": [{"label": "Обсудить внедрение", "href": "#contacts", "style": "primary"}], "hint": "", "features": [], "gallery": {"title": "Интерфейсы системы", "note": "", "columns": "3", "images": []}, "deploy": [], "alt": False},
    "monitoring": {"eyebrow": "Наблюдаемость", "title": "Заголовок", "lead": "", "cards": [], "pillars": [], "alt": True},
    "text": {"eyebrow": "", "title": "Заголовок", "lead": "", "body": "", "alt": False},
    "gallery": {"title": "Галерея", "note": "", "columns": "3", "images": [], "alt": False},
    "cta": {"title": "Обсудим внедрение", "text": "", "contacts": [], "buttons": []},
    "html": {"html": ""},
}

templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


class SecureSessionCookieMiddleware:
    """Добавляет Secure к cookie сессии только при HTTPS.

    За обратным прокси схема приходит в X-Forwarded-Proto, при прямом
    обращении по HTTP cookie остаётся рабочей, но не помечается Secure.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        is_https = scope.get("scheme") == "https"
        if not is_https:
            for name, value in scope.get("headers", []):
                if name.lower() == b"x-forwarded-proto":
                    if value.split(b",")[0].strip().lower() == b"https":
                        is_https = True
                    break

        async def send_wrapper(message):
            if is_https and message["type"] == "http.response.start":
                headers = []
                for name, value in message.get("headers", []):
                    if name.lower() == b"set-cookie" and b"sr_cms=" in value and b"; secure" not in value.lower():
                        value += b"; secure"
                    headers.append((name, value))
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_wrapper)


app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    session_cookie="sr_cms",
    max_age=7 * 24 * 3600,
    same_site="lax",
    https_only=False,
)
app.add_middleware(SecureSessionCookieMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1024)

_content_cache: dict[str, Any] = {"mtime": 0.0, "data": None}
_attempts: dict[str, list[float]] = {}


@app.middleware("http")
async def security_headers(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        host = request.headers.get("host", "")
        own_origins = {"https://" + host, "http://" + host}
        if origin and origin not in own_origins and origin not in ALLOWED_ORIGINS:
            return JSONResponse({"detail": "Запрос с недопустимого источника"}, status_code=403)
    response = await call_next(request)
    path = request.url.path
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Content-Language", "ru")
    if path.startswith("/assets/") or path.startswith("/uploads/"):
        response.headers.setdefault("Cache-Control", "public, max-age=2592000")
    elif path in {"/robots.txt", "/sitemap.xml"}:
        response.headers.setdefault("Cache-Control", "public, max-age=3600")
    elif path == "/":
        response.headers.setdefault("Cache-Control", "no-cache")
    elif path.startswith("/admin") or path.startswith("/preview"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


def load_content() -> dict[str, Any]:
    st = CONTENT_FILE.stat()
    if _content_cache["data"] is None or st.st_mtime != _content_cache["mtime"]:
        with CONTENT_FILE.open(encoding="utf-8") as fh:
            _content_cache["data"] = json.load(fh)
        _content_cache["mtime"] = st.st_mtime
    return _content_cache["data"]


def save_content(data: Any) -> None:
    if not isinstance(data, dict) or not isinstance(data.get("blocks"), list):
        raise HTTPException(400, "Некорректная структура контента")
    if len(data["blocks"]) > 100:
        raise HTTPException(400, "Слишком много блоков")
    used = set()
    for block in data["blocks"]:
        if not isinstance(block, dict) or block.get("type") not in BLOCK_SCHEMA:
            raise HTTPException(400, "Неизвестный тип блока")
        raw_id = re.sub(r"[^a-zA-Z0-9_-]", "", str(block.get("id") or ""))[:40]
        block_id = raw_id or uuid.uuid4().hex[:10]
        while block_id in used:
            block_id = f"{block_id}-{uuid.uuid4().hex[:3]}"
        used.add(block_id)
        block["id"] = block_id
        block["enabled"] = bool(block.get("enabled", True))
    if CONTENT_FILE.exists():
        try:
            with CONTENT_FILE.open(encoding="utf-8") as fh:
                old = json.load(fh)
            name = time.strftime("content-%Y%m%d-%H%M%S.json")
            (BACKUP_DIR / name).write_text(json.dumps(old, ensure_ascii=False, indent=2), encoding="utf-8")
            backups = sorted(BACKUP_DIR.glob("content-*.json"))
            for extra in backups[:-20]:
                extra.unlink(missing_ok=True)
        except (OSError, json.JSONDecodeError):
            pass
    tmp = CONTENT_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, CONTENT_FILE)
    _content_cache["mtime"] = 0.0
    _content_cache["data"] = None


def is_admin(request: Request) -> bool:
    return request.session.get("user") == "admin"


def require_api_admin(request: Request) -> None:
    if not is_admin(request):
        raise HTTPException(401, "Требуется вход")


def site_base(request: Request) -> str:
    settings = load_content().get("settings", {})
    return (settings.get("canonical") or str(request.base_url)).rstrip("/")


SITE_URL_RE = re.compile(r"https?://(?:srv\.staff-rf\.ru|staff-rf\.ru)(?=[/\"'\s<]|$)")


def render_site_text(text: str, request: Request) -> str:
    """Подставляет адрес сайта в шаблоны robots.txt и sitemap.xml.

    Меняются только ссылки на домены проекта и строка Host, служебные
    namespace-URL (sitemaps.org, schema.org) остаются нетронутыми.
    """
    base = site_base(request)
    host = urlsplit(base).netloc or request.headers.get("host", "")
    text = SITE_URL_RE.sub(base, text)
    text = re.sub(r"(?m)^Host:\s*\S+\s*$", "Host: " + host, text)
    return text


def site_context(request: Request) -> dict[str, Any]:
    content = load_content()
    settings = content.get("settings", {})
    blocks = [b for b in content.get("blocks", []) if b.get("enabled", True)]
    canonical = site_base(request) + "/"
    og_image = settings.get("og_image") or "/assets/og-cover.png"
    if og_image.startswith("/"):
        og_image = canonical.rstrip("/") + og_image
    css_vars = ":root{--accent:%s;--accent-2:%s;--bg:%s}" % (
        settings.get("accent") or "#2563eb",
        settings.get("accent2") or "#06b6d4",
        settings.get("bg") or "#0b1020",
    )
    return {
        "request": request,
        "s": settings,
        "blocks": blocks,
        "canonical": canonical,
        "og_image": og_image,
        "css_vars": css_vars,
        "custom_css": settings.get("custom_css") or "",
        "year": time.strftime("%Y"),
    }


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    response = templates.TemplateResponse("site.html", site_context(request))
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/index.html")
async def legacy_index():
    return RedirectResponse("/", status_code=301)


@app.get("/preview", response_class=HTMLResponse)
async def preview(request: Request):
    response = templates.TemplateResponse("site.html", site_context(request))
    response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/health")
async def health():
    try:
        load_content()
    except Exception:
        return JSONResponse({"status": "error"}, status_code=500)
    return {"status": "ok"}


@app.get("/admin/login", response_class=HTMLResponse)
async def login_page(request: Request):
    if is_admin(request):
        return RedirectResponse("/admin", status_code=303)
    return templates.TemplateResponse("login.html", {"request": request, "error": None})


@app.post("/admin/login")
async def login(request: Request, username: str = Form(...), password: str = Form(...)):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    attempts = [t for t in _attempts.get(ip, []) if now - t < 300]
    if len(attempts) >= 10:
        return templates.TemplateResponse("login.html", {"request": request, "error": "Слишком много попыток. Подождите 5 минут."}, status_code=429)
    ok_user = secrets.compare_digest(username, "admin")
    ok_pass = secrets.compare_digest(password, ADMIN_PASSWORD)
    if not (ok_user and ok_pass):
        attempts.append(now)
        _attempts[ip] = attempts
        return templates.TemplateResponse("login.html", {"request": request, "error": "Неверный логин или пароль"}, status_code=401)
    _attempts.pop(ip, None)
    request.session.clear()
    request.session["user"] = "admin"
    return RedirectResponse("/admin", status_code=303)


@app.post("/admin/logout")
async def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/admin/login", status_code=303)


@app.get("/admin", response_class=HTMLResponse)
async def admin_page(request: Request):
    if not is_admin(request):
        return RedirectResponse("/admin/login", status_code=303)
    return templates.TemplateResponse("admin.html", {
        "request": request,
        "blocks_schema": json.dumps(BLOCK_SCHEMA, ensure_ascii=False),
        "settings_schema": json.dumps(SETTINGS_SCHEMA, ensure_ascii=False),
        "defaults": json.dumps(DEFAULTS, ensure_ascii=False),
    })


@app.get("/admin/api/content")
async def api_content(request: Request):
    require_api_admin(request)
    return JSONResponse(load_content())


@app.put("/admin/api/content")
async def api_save_content(request: Request):
    require_api_admin(request)
    length = int(request.headers.get("content-length") or 0)
    if length > MAX_CONTENT:
        raise HTTPException(413, "Слишком большой объём контента")
    try:
        data = json.loads(await request.body())
    except json.JSONDecodeError:
        raise HTTPException(400, "Некорректный JSON")
    save_content(data)
    return {"status": "saved"}


@app.post("/admin/api/upload")
async def api_upload(request: Request, name: str = ""):
    require_api_admin(request)
    length = int(request.headers.get("content-length") or 0)
    if length > MAX_UPLOAD:
        raise HTTPException(413, "Файл больше 12 МБ")
    data = await request.body()
    if not data or len(data) > MAX_UPLOAD:
        raise HTTPException(400, "Пустой или слишком большой файл")
    kind = None
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        kind = ".png"
    elif data.startswith(b"\xff\xd8\xff"):
        kind = ".jpg"
    elif data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        kind = ".gif"
    elif data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        kind = ".webp"
    if not kind:
        raise HTTPException(400, "Поддерживаются PNG, JPEG, GIF и WebP")
    filename = uuid.uuid4().hex + kind
    target = UPLOAD_DIR / filename
    target.write_bytes(data)
    return {"url": "/uploads/" + filename}


@app.get("/styles.css")
async def styles():
    return FileResponse(SITE_DIR / "styles.css", media_type="text/css")


@app.get("/app.js")
async def app_js():
    return FileResponse(SITE_DIR / "app.js", media_type="application/javascript")


@app.get("/robots.txt")
async def robots(request: Request):
    text = (SITE_DIR / "robots.txt").read_text(encoding="utf-8")
    return PlainTextResponse(render_site_text(text, request))


@app.get("/sitemap.xml")
async def sitemap(request: Request):
    text = (SITE_DIR / "sitemap.xml").read_text(encoding="utf-8")
    return PlainTextResponse(render_site_text(text, request), media_type="application/xml")


@app.get("/" + INDEXNOW_KEY + ".txt")
async def indexnow():
    return FileResponse(SITE_DIR / (INDEXNOW_KEY + ".txt"), media_type="text/plain")


@app.get("/favicon.ico")
async def favicon():
    return FileResponse(SITE_DIR / "assets" / "favicon.png", media_type="image/png")


app.mount("/assets", StaticFiles(directory=str(SITE_DIR / "assets")), name="assets")
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
app.mount("/admin/static", StaticFiles(directory=str(Path(__file__).parent / "static")), name="admin-static")
