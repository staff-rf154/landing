# Лендинг Staff RF + визуальная CMS

Репозиторий содержит корпоративный лендинг Staff RF и встроенную CMS с визуальной
админ-панелью. Сайт и админка обслуживаются одним процессом FastAPI: контент хранится
в JSON, шаблоны рендерятся на сервере, статические файлы (стили, скрипты, картинки)
отдаются тем же приложением.

Сайт и админка работают в одном контейнере `landing` (FastAPI + Uvicorn). Отдельный
nginx-контейнер для статической версии больше не нужен: статика входит в образ, а
контент, загрузки и бэкапы лежат в смонтированном каталоге `content/`.

Админка не привязана к конкретному домену или IP: проверка Origin выполняется по
`Host` текущего запроса, а canonical, sitemap и robots подставляют адрес из настроек.

## Продукты на лендинге

Лендинг представляет четыре платформы и общий мониторинг. Содержимое блоков
редактируется в CMS (`content/content.json`), якоря используются в меню.

| Продукт | Якорь | Блок | Позиционирование |
|---------|-------|------|------------------|
| LLM V3 | `#llm-v3` | `llm-v3-block` | Enterprise RAG: LLM-судья, автообучение, мультитенантность |
| llm-doc | `#llm` | `llm-block` | Лёгкий RAG на CPU без GPU |
| Табель | `#tabel` | `tabel-block` | QR-учёт времени, отчёты Т-13, 1С |
| Табель Гибрид | `#tabel-hybrid` | `tabel-hybrid-block` | Самоотметки, офлайн-очередь, интеграция с 1С |
| MKT Monitoring | `#mkt` | `mkt-block` | Наблюдаемость MikroTik, серверов и контейнеров |

Дополнительные блоки: `compare-block` (`#compare`) — сравнение платформ,
`monitoring-block` (`#monitoring`) — health-эндпоинты и метрики,
`roadmap-block` (`#roadmap`) — рекомендуемая последовательность внедрения.

### Скриншоты

Реальные скриншоты лежат в `assets/screens/` и подключены в галереях
`llm-block`, `tabel-block` и `mkt-block`. Для LLM V3 и «Табель Гибрид» подготовлены
SVG-заглушки (`llm-v3-*.svg`, `tabel-hybrid-*.svg`): их достаточно заменить
файлами с теми же именами или загрузить новые изображения через админку и
обновить пути в CMS. Заглушки не являются скриншотами интерфейса и помечены
подписью «Скриншот будет добавлен».

## Возможности

- Редактирование всех секций сайта без правки кода: тексты, кнопки, списки, картинки.
- Перестановка блоков мышью (drag-and-drop) или кнопками ↑ / ↓.
- Добавление, удаление, включение и отключение блоков.
- Фон каждого блока: цвет и/или изображение с затемнением под контраст текста.
- Настройки сайта: title, description, canonical, бренд, цвета, OG-изображение,
  меню, подвал, произвольный CSS.
- Живой предпросмотр в iframe с режимами «Десктоп / Планшет / Телефон».
- Загрузка изображений (PNG, JPEG, GIF, WebP) прямо из админки.
- Автоматические бэкапы контента при каждом сохранении (хранятся последние 20).
- Адаптивная вёрстка сайта и адаптивная админка (включая мобильные экраны).
- Готовые блоки сравнения платформ, дорожной карты внедрения и health-эндпоинтов.
- SEO: canonical, Open Graph, Twitter Card, JSON-LD, sitemap.xml, robots.txt, IndexNow.

## Архитектура

```
Интернет
   │
   ▼
Edge nginx (TLS, домены, ACME)   (необязателен)
   │  proxy_pass http://landing:8000
   ▼
landing (FastAPI + Jinja2, Uvicorn) — один контейнер
   ├── /                 → отрендеренный сайт из content/content.json
   ├── /admin, /preview  → админка и предпросмотр
   ├── /admin/api/*      → JSON API (сессионная авторизация)
   ├── /assets/*         → статика сайта (скриншоты, favicon, OG)
   └── /uploads/*        → загруженные через админку изображения
```

Контейнер публикует порт `8080` на всех интерфейсах хоста (меняется переменной
`LANDING_PORT`). Внутри сети Docker у него есть алиасы `landing-cms` и
`landing-web-1`, поэтому старые конфиги edge-nginx продолжают работать.
Прямой доступ по HTTP и доступ через HTTPS-прокси поддерживаются одновременно.

## Состав репозитория

```
.
├── app.js                      # JS сайта: меню, лайтбокс, анимации
├── styles.css                  # стили сайта
├── index.html                  # архив прежней статической версии (не используется)
├── nginx.conf                  # архив конфига прежнего nginx-контейнера (не используется)
├── robots.txt / sitemap.xml    # шаблоны, хост подставляется из canonical
├── e93abb...txt                # ключ IndexNow (публичный)
├── assets/                     # favicon, OG, скриншоты продуктов и SVG-заглушки
├── cms/
│   ├── app.py                  # всё приложение: рендер, API, авторизация
│   ├── Dockerfile              # собирает единый образ landing
│   ├── requirements.txt
│   ├── templates/
│   │   ├── site.html           # каркас сайта
│   │   ├── login.html          # страница входа
│   │   ├── admin.html          # каркас админки
│   │   ├── _macros.html        # общие макросы (фон, поля и т.п.)
│   │   └── blocks/*.html       # партиалы блоков: hero, product, ...
│   └── static/
│       ├── admin.css           # стили админки
│       └── admin.js            # логика админки (без сборки и зависимостей)
├── content/
│   ├── content.json            # ЕДИНСТВЕННЫЙ источник контента сайта
│   ├── uploads/                # загрузки из админки (не в git)
│   └── backups/                # автобэкапы контента (не в git)
├── cms.env                     # секреты (не в git, см. .gitignore)
├── .dockerignore               # исключения при сборке единого образа
└── docker-compose.yml          # один сервис landing
```

## Быстрый старт

Требования: Docker и Docker Compose, внешняя сеть `tabel_tabel` (сервисы ходят в
неё для доступа к инфраструктуре; при необходимости уберите это из compose).

1. Создайте `cms.env` рядом с `docker-compose.yml`:

```env
ADMIN_PASSWORD=change-me-strong-password
SECRET_KEY=change-me-random-64-chars
```

`SECRET_KEY` можно сгенерировать так:

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(48))'
```

2. Убедитесь, что внешняя сеть существует:

```bash
docker network create tabel_tabel 2>/dev/null || true
```

3. Запустите:

```bash
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:8080/health
```

4. Откройте `http://<адрес-сервера>:8080/` (или домен через edge-nginx) и войдите
   в `/admin/login` с логином `admin` и паролем из `cms.env`.

Порт хоста задаётся переменной `LANDING_PORT` (по умолчанию `8080`) и не привязан
к конкретному IP. Внутри контейнера приложение всегда слушает `8000`.

## Переменные окружения

| Переменная       | Обязательна | По умолчанию | Назначение                                                        |
|------------------|-------------|--------------|-------------------------------------------------------------------|
| `ADMIN_PASSWORD` | да          | —            | Пароль администратора (логин всегда `admin`)                      |
| `SECRET_KEY`     | да          | —            | Ключ подписи сессионной cookie `sr_cms`                            |
| `DATA_DIR`       | нет         | `/data`      | Каталог с `content.json`, `uploads/`, `backups/`                  |
| `SITE_DIR`       | нет         | `/app`       | Каталог со статикой сайта (`styles.css`, `assets`, sitemap и т.д.) |
| `LANDING_PORT`   | нет         | `8080`       | Внешний порт хоста для compose (не переменная приложения)          |

Без `ADMIN_PASSWORD` и `SECRET_KEY` приложение не стартует (падает с ошибкой).
`LANDING_PORT` можно задать в `.env` рядом с `docker-compose.yml` или в окружении.

## Модель контента

`content/content.json` состоит из двух частей:

```json
{
  "settings": { "...": "..." },
  "blocks": [
    { "id": "hero", "type": "hero", "enabled": true, "bg_color": "", "bg_image": "", "...": "..." }
  ]
}
```

### Настройки (`settings`)

| Ключ               | Назначение                                              |
|--------------------|---------------------------------------------------------|
| `site_title`       | `<title>` и OG-заголовок                                |
| `site_description` | meta description и OG-описание                          |
| `canonical`        | базовый URL сайта (используется в canonical, OG, JSON-LD, sitemap, robots) |
| `brand`            | название бренда                                         |
| `brand_mark`       | 1–2 символа для значка в шапке и подвале                |
| `accent`           | основной цвет (`--accent`)                              |
| `accent2`          | дополнительный цвет (`--accent-2`)                      |
| `bg`               | тёмный фон (`--bg`)                                     |
| `og_image`         | OG-изображение (путь или URL)                           |
| `nav`              | меню: список `{label, href}`                            |
| `footer_name`      | название в подвале                                      |
| `footer_note`      | описание в подвале                                      |
| `footer_links`     | ссылки подвала: `{label, href}`                         |
| `footer_contacts`  | контакты подвала: `{label, href}`                       |
| `footer_copyright` | строка копирайта                                        |
| `custom_css`       | произвольный CSS, вставляется в `<style>` на сайте      |

### Блоки

Общие поля любого блока:

| Поле       | Тип    | Назначение                                              |
|------------|--------|---------------------------------------------------------|
| `id`       | строка | Уникальный идентификатор (нормализуется при сохранении) |
| `type`     | строка | Тип блока, определяет шаблон и форму                    |
| `enabled`  | bool   | Выключенный блок не рендерится                          |
| `bg_color` | цвет   | Цвет фона секции                                        |
| `bg_image` | URL    | Фоновое изображение (с затемнением)                     |

Доступные типы (`type`):

| Тип          | Назначение                | Ключевые поля                                                        |
|--------------|---------------------------|----------------------------------------------------------------------|
| `hero`       | Первый экран              | `eyebrow`, `title`, `accent`, `lead`, `buttons[]`, `facts[]`         |
| `product`    | Секция продукта           | `anchor`, `eyebrow`, `title`, `lead`, `chips[]`, `actions[]`, `hint`, `features[]`, `gallery{...}`, `deploy[]`, `alt` |
| `monitoring` | Карточки мониторинга      | `anchor`, `eyebrow`, `title`, `lead`, `cards[]`, `pillars[]`, `alt`  |
| `text`       | Текстовый блок            | `anchor`, `eyebrow`, `title`, `lead`, `body` (HTML), `alt`           |
| `gallery`    | Галерея изображений       | `anchor`, `title`, `note`, `columns`, `images[]`, `alt`              |
| `cta`        | Призыв к действию         | `anchor`, `title`, `text`, `contacts[]`, `buttons[]`                 |
| `html`       | Произвольный HTML         | `anchor`, `html`                                                     |

Поля с пометкой «можно HTML» выводятся без экранирования — используйте только
доверенный контент.

## Админка

- Вход: `/admin/login`, логин `admin`, пароль из `cms.env`.
- Сессия: подписанная cookie `sr_cms`, срок 7 дней, `HttpOnly`, `SameSite=Lax`.
  При HTTPS cookie автоматически получает флаг `Secure`, при прямом HTTP остаётся
  рабочей — поэтому вход работает и через edge-nginx, и по прямому порту.
- Вкладка «Блоки»: список слева, редактор справа. Блоки можно перетаскивать,
  двигать ↑ / ↓, отключать и удалять. Внизу — выбор типа и кнопка «Добавить блок».
- Блок «Первый экран», «Продукт» и др. имеют собственные наборы полей; формы
  строятся из схемы автоматически (текст, textarea, цвет, изображение, флаг,
  список, группа).
- Кнопка «Превью» открывает панель предпросмотра `/preview`:
  - на широких экранах — третьей колонкой;
  - на узких — поверх экрана, с кнопкой «Закрыть»;
  - кнопки устройств переключают ширину iframe.
- Вкладка «Настройки» — всё из таблицы `settings` выше.
- «Сохранить» отправляет контент на сервер; `Ctrl+S` / `Cmd+S` работают так же.
- При несохранённых изменениях страница предупреждает при закрытии.
- После сохранения сайт обновляется сразу: контент кэшируется по mtime файла.

## HTTP API

Все изменяющие запросы требуют активной сессии администратора и корректного
`Origin` (совпадает с `Host` запроса).

| Метод | Путь                 | Назначение                                   |
|-------|----------------------|----------------------------------------------|
| GET   | `/`                  | Сайт                                         |
| GET   | `/index.html`        | 301-редирект на `/` (совместимость)          |
| GET   | `/preview`           | Сайт для iframe-предпросмотра (`no-store`)   |
| GET   | `/health`            | Проверка чтения контента                     |
| GET   | `/admin/login`       | Форма входа                                  |
| POST  | `/admin/login`       | Вход (`username`, `password`), 303 на `/admin` |
| POST  | `/admin/logout`      | Выход                                        |
| GET   | `/admin`             | Интерфейс админки                            |
| GET   | `/admin/api/content` | Текущий JSON контента                        |
| PUT   | `/admin/api/content` | Сохранить контент (JSON, до 3 МБ)            |
| POST  | `/admin/api/upload`  | Загрузка изображения (тело запроса, до 12 МБ)|
| GET   | `/styles.css`, `/app.js`, `/robots.txt`, `/sitemap.xml` | Статика и SEO-файлы |
| GET   | `/uploads/<file>`    | Загруженные изображения                      |
| GET   | `/assets/<path>`     | Статика сайта                                |

Ошибки: `401` — нет сессии, `403` — чужой Origin, `400` — некорректные данные,
`413` — превышен размер, `429` — слишком много попыток входа (10 за 5 минут на IP).

## Файлы, лимиты, бэкапы

- Загрузки: PNG, JPEG, GIF, WebP; тип определяется по magic bytes, не по имени;
  имя файла — UUID; максимум 12 МБ.
- Контент: максимум 3 МБ, не более 100 блоков.
- При каждом сохранении предыдущая версия `content.json` копируется в
  `content/backups/content-YYYYmmdd-HHMMSS.json`; хранятся последние 20 файлов.
- Запись контента атомарная: сначала `.tmp`, затем `os.replace`.

Восстановление:

```bash
cd /opt/compose/landing
ls -t content/backups | head            # найти нужный бэкап
cp content/backups/content-XXXX.json content/content.json
curl -fsS http://127.0.0.1:8080/health  # контейнер подхватит файл по mtime
```

## Безопасность

- Пароль и ключ сессии — только в `cms.env` (в репозиторий не попадают).
- Сравнение логина и пароля — `secrets.compare_digest`.
- Rate limit на вход: 10 неудачных попыток за 5 минут с одного IP.
- Проверка Origin для POST/PUT/PATCH/DELETE.
- Cookie сессии: `HttpOnly`, `SameSite=Lax`, `Secure` при HTTPS. За edge-nginx
  HTTPS определяется по `X-Forwarded-Proto`, при прямом HTTP cookie остаётся рабочей.
- Заголовки: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: SAMEORIGIN`.
- Статика и SEO-файлы кэшируются, HTML сайта — `no-cache`, админка — `no-store`.
- Ответы сжимаются gzip (HTML, CSS, JS, JSON, SVG) при размере от 1 КБ.
- Загрузка только растровых изображений по magic bytes; SVG не принимается.
- HTML-поля блоков (`html`, `body`, `hint`, `text`) не экранируются — не давайте
  доступ к админке недоверенным людям.

## SEO

- `canonical` берётся из настроек и используется в `<link rel="canonical">`,
  Open Graph, Twitter Card, JSON-LD.
- `sitemap.xml` и `robots.txt` отдаются динамически: все абсолютные URL в файлах
  заменяются на хост из `canonical`.
- OG-изображение: из настроек или `/assets/og-cover.png` по умолчанию.
- IndexNow-ключ отдаётся по адресу `/<ключ>.txt`.
- favicon: `/assets/favicon.svg`, `/assets/favicon.png`, `/favicon.ico`.

## Публикация на сервере

Контейнер `landing` самодостаточен: отдаёт сайт, админку, статику и API. Его можно
открыть напрямую по `http://<сервер>:8080` или поставить за edge nginx с TLS.
Для совместимости у контейнера есть DNS-алиасы `landing-cms` и `landing-web-1`.
Так как контейнер может быть пересоздан, адрес резолвится через DNS Docker при
каждом запросе:

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;

server {
    listen 443 ssl;
    server_name staff-rf.ru;

    ssl_certificate     /etc/nginx/ssl/apex/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/apex/privkey.pem;

    set $landing_upstream http://landing:8000;
    location / {
        proxy_pass $landing_upstream$request_uri;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Если edge-nginx не используется, сайт доступен по `http://<сервер>:8080/`.
Порт меняется через `LANDING_PORT`, привязки к IP в compose нет. Чтобы открыть
порт только на локальном интерфейсе, задайте `LANDING_PORT=127.0.0.1:8080` —
Docker воспримет это как проброс `127.0.0.1:8080:8000`.

Особенности текущей инсталляции:

- Апекс `staff-rf.ru` открывает лендинг напрямую (без редиректа на `srv`).
- Wildcard-сертификат `*.staff-rf.ru` покрывает `srv`, `im2`, `cam`, `cam1`,
  `vpn`, `ovpn`; для апекса выпущен отдельный сертификат.
- Продление Let's Encrypt — вручную через DNS-01 (TXT-запись в Яндекс DNS),
  автоматизация без OAuth-токена невозможна.
- `default_server` на 443 — блок `srv.staff-rf.ru`.
- Внутренняя проверка сайта с сервера: `curl --resolve staff-rf.ru:443:127.0.0.1 https://staff-rf.ru/`
  (hairpin-NAT на публичный IP не работает).

## Локальная разработка

Без Docker:

```bash
cd /opt/compose/landing
python3 -m venv .venv && . .venv/bin/activate
pip install -r cms/requirements.txt
export ADMIN_PASSWORD=dev SECRET_KEY=dev-secret
export DATA_DIR=$PWD/content SITE_DIR=$PWD
uvicorn cms.app:app --reload --port 8000
```

Откройте `http://127.0.0.1:8000/` — вход в админку работает и по HTTP: флаг
`Secure` добавляется к cookie автоматически только при HTTPS.

## Как добавить новый тип блока

1. Добавьте описание в `BLOCK_SCHEMA` и значения по умолчанию в `DEFAULTS`
   (`cms/app.py`).
2. Создайте партиал `cms/templates/blocks/<type>.html` (доступны `b` — блок,
   `s` — настройки, `request`).
3. Пересоберите и перезапустите единый контейнер:
   `docker compose up -d --build` (шаблоны и Python-код входят в образ).
4. В админке новый тип появится в выпадающем списке «Добавить блок».

## Диагностика

```bash
docker compose ps
docker compose logs -f landing
curl -fsS http://127.0.0.1:8080/health
curl -fsS https://staff-rf.ru/health
curl -fsS https://staff-rf.ru/admin/login -o /dev/null -w '%{http_code}\n'
```

- `500` на сайте — проверьте валидность `content/content.json` (`python3 -m json.tool`).
- `403` при сохранении — Origin не совпал с Host (например, доступ через другой
  домен или прокси без `proxy_set_header Host $host`).
- Вход не сохраняется — проверьте `SECRET_KEY`, системное время и заголовок
  `X-Forwarded-Proto` на прокси.
- Пустой сайт — все блоки могут быть выключены (`enabled: false`).

## Ограничения

- Один администратор (`admin`), без ролей и мультипользовательского режима.
- Нет версионирования контента, кроме последних 20 автобэкапов.
- Нет WYSIWYG: тексты редактируются как plain text / HTML.
- Автопродление TLS не настроено (см. выше).
