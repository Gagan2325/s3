# media-store

A small, self-hosted object storage service — S3-style buckets and objects,
API-key auth, and presigned URLs for temporary access. Built for internal
company use where you want full control without running a full S3-compatible
server.

Storage is local disk by default (namespaced and hashed into subfolders per
bucket), with metadata (size, content type, checksum, timestamps) in SQLite.
The storage backend is abstracted in `src/lib/storage.js`, so swapping in a
cloud blob store later doesn't require touching the routes.

## Quick start

```bash
npm install
cp .env.example .env
# edit .env: set API_KEYS and PRESIGN_SECRET to real random values
npm start
```

The server listens on `http://localhost:4000` (configurable via `PORT`).
A lightweight admin UI is served at `/admin` — paste an API key there to
browse buckets, upload/download files, and copy presigned links.

### Docker

```bash
API_KEYS=$(openssl rand -hex 32) \
PRESIGN_SECRET=$(openssl rand -hex 32) \
docker compose up --build
```

Data persists in the `media-data` volume.

## Authentication

Every `/buckets/...` request needs an API key, either as:

```
Authorization: Bearer <key>
```

or:

```
X-Api-Key: <key>
```

Valid keys are set via the `API_KEYS` env var (comma-separated). There's no
per-key permission model yet — any valid key can do anything. For an internal
tool, put this behind your company VPN/network and rotate keys as needed.

## API reference

All examples assume `BASE=http://localhost:4000` and `KEY=<your API key>`.

### Buckets

| Action | Request |
|---|---|
| Create bucket | `PUT /buckets/:bucket` |
| List buckets | `GET /buckets` |
| Delete bucket | `DELETE /buckets/:bucket` (add `?force=true` if not empty) |

Bucket names: 3–63 chars, lowercase letters/numbers/hyphens only.

```bash
curl -X PUT $BASE/buckets/my-photos -H "X-Api-Key: $KEY"
```

### Objects

| Action | Request |
|---|---|
| Upload | `PUT /buckets/:bucket/objects/:key` (body = raw file bytes) |
| Download | `GET /buckets/:bucket/objects/:key` |
| Delete | `DELETE /buckets/:bucket/objects/:key` |
| List | `GET /buckets/:bucket/objects?prefix=&limit=` |

Keys can contain slashes to simulate folders, e.g. `docs/2026/report.pdf`.

```bash
curl -X PUT $BASE/buckets/my-photos/objects/sunset.jpg \
  -H "X-Api-Key: $KEY" -H "Content-Type: image/jpeg" \
  --data-binary @sunset.jpg

curl $BASE/buckets/my-photos/objects/sunset.jpg -H "X-Api-Key: $KEY" -o sunset.jpg
```

### Presigned URLs

Generate a time-limited, self-authenticating link that doesn't require the
caller to hold an API key — useful for letting a browser or a third party
upload/download directly.

```
POST /buckets/:bucket/objects/presign/:key?method=GET|PUT|DELETE&expiresIn=<seconds>
```

`expiresIn` defaults to 3600 and is capped at 7 days.

```bash
curl -X POST "$BASE/buckets/my-photos/objects/presign/sunset.jpg?method=GET&expiresIn=600" \
  -H "X-Api-Key: $KEY"
# => { "url": "http://localhost:4000/presigned/my-photos/sunset.jpg?token=...", ... }
```

Anyone with that URL can perform that one action, on that one object, until
it expires — no API key needed. Tokens are HMAC-signed with `PRESIGN_SECRET`
so they can't be forged or edited.

## Environment variables

See `.env.example` for the full list: `PORT`, `STORAGE_ROOT`, `DB_PATH`,
`API_KEYS`, `PRESIGN_SECRET`, `PUBLIC_BASE_URL`, `MAX_UPLOAD_BYTES`.

## What this doesn't do (yet)

- No per-key permissions/scoping — every key is a superuser.
- No multipart/chunked upload for very large files (single PUT streams the
  whole body; fine up to a few GB, but not ideal for huge video files).
- No versioning, lifecycle rules, or replication.
- No built-in TLS — put it behind a reverse proxy (nginx/Caddy) or load
  balancer that terminates HTTPS.
- No rate limiting.

These are the first things to add if this grows beyond an internal tool.
