# CARI production deployment

The production site is `https://cari.rnd.huawei.com/ai_procurement/`. Huawei W3 must be
configured with this exact callback URI:

```text
https://cari.rnd.huawei.com/ai_procurement/authorize
```

The callback is case-sensitive and the scheme, host, port, and path must match
the URI registered for the W3 OAuth client. Either add this callback to the
existing W3 client (if Uniportal permits multiple callbacks) or request a
separate client ID and secret for CARI. Never copy a client secret into Git.

## 1. Server prerequisites

- DNS for `cari.rnd.huawei.com` points to the server IP.
- TCP 80 and 443 are reachable; Docker ports 8000 and 8080 stay bound to
  `127.0.0.1` and should not be exposed externally.
- Docker Engine with the Compose plugin and a host Nginx installation are
  installed.
- An HTTPS certificate and private key for `cari.rnd.huawei.com` are present.

## 2. Production environment

Create the untracked runtime file only if it does not already exist. Preserve
your existing exchange-rate credentials and other settings:

```bash
test -f .env || cp .env.example .env
python3 -c 'import secrets; print(secrets.token_urlsafe(64))'
```

Put the generated value in `SESSION_SECRET`, then set at least:

```dotenv
AUTH_MODE=w3
SITE_URL=https://cari.rnd.huawei.com/ai_procurement
TRUSTED_HOSTS=cari.rnd.huawei.com,localhost,127.0.0.1
SESSION_SECRET=<generated-random-value>
SESSION_COOKIE_PATH=/ai_procurement
SESSION_COOKIE_SECURE=true
W3_CLIENT_ID=<w3-client-id>
W3_CLIENT_SECRET=<w3-client-secret>
W3_REDIRECT_URI=https://cari.rnd.huawei.com/ai_procurement/authorize
W3_VERIFY_SSL=true
W3_DEFAULT_ROLE=admin
```

Keep the five Uniportal endpoint defaults from `.env.example`. `admin` retains
the current application's full-access behavior. Change the default role only
after endpoint-level role checks are introduced.

### Single-environment login switch

Use the one backend-controlled switch in the repository-root `.env`:

- `AUTH_MODE=disabled`: hide the login button, skip W3, and use the local test
  administrator for procurement features. This is the default and allows anyone
  who can reach the site to use those features.
- `AUTH_MODE=w3`: show the W3 login button and require a valid session for
  business APIs. Complete the W3 and session configuration above before enabling.

For the first deployment of the login code, leave the switch at `disabled` and
build both containers using section 3. Once the application is working, set it
to `w3` and apply the change:

```bash
docker compose up -d --force-recreate backend frontend
```

The same command applies a change back to `disabled`. Subsequent switch changes
do not require a frontend rebuild or database changes. A plain
container recreation reuses the built images; recreating the frontend refreshes
Nginx's backend address if Docker changed it. The Compose health dependency waits
for the backend before starting the frontend. A plain
`docker compose restart` does **not** reload `.env`. If the shell also exports
`AUTH_MODE`, remove that override first so that Compose uses the file value.

Check the effective mode without printing credentials:

```bash
docker compose exec backend python -c "from app.config import settings; print(settings.auth_mode)"
curl --fail https://cari.rnd.huawei.com/ai_procurement/api/auth/status
```

With login disabled, status returns `mode: disabled`, `authenticated: true`, and
the local test actor. With W3 enabled, a request without a session returns
`mode: w3`, `authenticated: false`. The CARI sign-in/error page rechecks every
five seconds while visible and has a manual **Check sign-in status** button.
If you are on the external Uniportal page, reopen CARI after changing the switch.
Missing W3 configuration displays a retry page; it never automatically grants
unauthenticated access. This switch is independent of exchange-rate IAM settings.

## 3. Start or upgrade the application

Back up the SQLite data before an upgrade, then run:

```bash
docker compose config --quiet
docker compose build --pull
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:8000/api/health
```

The backend container runs `alembic upgrade head` before Uvicorn starts. Do not
use `docker compose down -v` in production because `-v` deletes the data volume.

## 4. Host Nginx

Because `cari.rnd.huawei.com` is shared by multiple applications, add the
contents of `deploy/nginx/ai_procurement.location.conf` inside the **existing**
HTTPS `server_name cari.rnd.huawei.com` block. Do not create a second competing
server block for the same hostname. The important locations are:

```nginx
location = /ai_procurement {
    return 301 /ai_procurement/;
}

location ^~ /ai_procurement/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-Host $host;
}
```

After merging the locations, validate and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

The host Nginx proxies only `/ai_procurement/` to the frontend container on
`127.0.0.1:8080`; all other domain paths remain available to other projects.
The container's Nginx routes `/ai_procurement/api/` and the exact
`/ai_procurement/authorize` callback to FastAPI.

## 5. Verification

```bash
curl -I http://cari.rnd.huawei.com/ai_procurement/
curl -I https://cari.rnd.huawei.com/ai_procurement/
curl https://cari.rnd.huawei.com/ai_procurement/api/health
docker compose logs --tail=100 backend frontend
```

Then open `https://cari.rnd.huawei.com/ai_procurement/`, click **Huawei W3**, complete login,
confirm that the returned URL is on the CARI domain, create a test project, and
test **Sign out**. A callback failure is usually caused by a callback URI that
does not exactly match the W3 registration, an incorrect client secret, or a
certificate trust problem.

## 6. Rollback

If only W3 login is blocking testing, first set `AUTH_MODE=disabled` in `.env`
and run `docker compose up -d --force-recreate backend frontend`. Reopen CARI
to continue as the local test administrator. Keep the W3 credentials in `.env`
so you can enable login again after troubleshooting. This does not remove data.

Keep the pre-deployment database backup and the previously deployed Git commit.
To roll back application code without deleting the volume, check out the known
good commit and run `docker compose build` followed by `docker compose up -d`.
