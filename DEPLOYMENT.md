# CARI production deployment

The production site is `https://ai4news.rnd.huawei.com/ai_procurement/`. Huawei W3 must be
configured with this exact callback URI:

```text
https://ai4news.rnd.huawei.com/ai_procurement/authorize
```

Use this exact callback consistently in the application and token exchange.
It must be accepted by the W3 client's redirect policy. The current deployment
reuses the `com.huawei.caplatform.ai4news` client with the owner's authorization.
Uniportal accepts the procurement path on `ai4news.rnd.huawei.com`; the same
path on `cari.rnd.huawei.com` returns `E_10004` (redirect_uri parameter error).
Keep the original news callback `/authorize` unchanged. Never copy a client
secret into Git.

## 1. Server prerequisites

The current deployment uses the existing HTTPS Nginx on `10.218.163.144`
(`/etc/nginx`) and Docker on `7.184.9.192`. Keep the shared gateway; do not
install a competing public Nginx on the application host. Only the
`/ai_procurement/` locations belong to this application.

- DNS for `ai4news.rnd.huawei.com` points to the HTTPS gateway.
- TCP 80 and 443 are reachable on the gateway. For this split-host deployment,
  set `FRONTEND_BIND_HOST=0.0.0.0` on the application host so the gateway can reach
  port 8080. Restrict it to the gateway/internal network with firewall rules.
  The backend port does not need to be public. For a same-host gateway, retain
  the default loopback frontend binding.
- Docker Engine with the Compose plugin and a host Nginx installation are
  installed.
- An HTTPS certificate and private key for `ai4news.rnd.huawei.com` are present.

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
SITE_URL=https://ai4news.rnd.huawei.com/ai_procurement
FRONTEND_BIND_HOST=0.0.0.0
TRUSTED_HOSTS=ai4news.rnd.huawei.com,cari.rnd.huawei.com,7.184.9.192,localhost,127.0.0.1
SESSION_SECRET=<generated-random-value>
SESSION_COOKIE_PATH=/ai_procurement
SESSION_COOKIE_SECURE=true
W3_CLIENT_ID=<w3-client-id>
W3_CLIENT_SECRET=<w3-client-secret>
W3_REDIRECT_URI=https://ai4news.rnd.huawei.com/ai_procurement/authorize
W3_VERIFY_SSL=true
W3_DEFAULT_ROLE=admin
```

Keep the five Uniportal endpoint defaults from `.env.example`. `admin` retains
the current application's full-access behavior. Change the default role only
after endpoint-level role checks are introduced.

Use a W3 client authorized for this application. The approved shared client
uses the news credentials, but procurement retains its own callback
`https://ai4news.rnd.huawei.com/ai_procurement/authorize` and its own
`cari_session` cookie scoped to `/ai_procurement`. Do not point procurement at
the news `/authorize` endpoint or replace any news login routes. Keep W3 TLS
verification enabled; the application image trusts the required corporate CAs.
Access procurement through its configured HTTPS domain so that the session
cookie is available when Uniportal calls back. Existing CARI-domain and IP
entry points redirect login to this canonical host before creating OAuth state.
When setting `TRUSTED_HOSTS` explicitly, retain any existing deployment-specific
hosts. In particular, keep `7.184.9.192` if old IP bookmarks must still work;
otherwise Host validation rejects those requests before the login redirect.

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
curl --fail https://ai4news.rnd.huawei.com/ai_procurement/api/auth/status
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

Because `ai4news.rnd.huawei.com` is shared by multiple applications, add the
contents of `deploy/nginx/ai_procurement.location.conf` inside the **existing**
HTTPS `server_name ai4news.rnd.huawei.com` block. Do not create a second competing
server block for the same hostname. The important locations are:

```nginx
location = /ai_procurement {
    return 301 /ai_procurement/;
}

location ^~ /ai_procurement/ {
    proxy_pass http://7.184.9.192:8080;
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

On the current gateway, Nginx is running outside systemd and its PID file is
empty. Do not start a second instance or restart shared services. After
`nginx -t`, identify the existing master process and verify that it is the
`/usr/sbin/nginx` instance listening on 80/443 with this configuration, then
send `HUP` to that verified master for a graceful reload. Do not reuse a PID
from an earlier deployment. Back up the site file first and compare the
unrelated site configurations and HTTP responses after reloading.

The gateway Nginx proxies only `/ai_procurement/` to the frontend container on
`7.184.9.192:8080`; all other domain paths remain available to other projects.
On the current gateway, `/etc/nginx/sites-available/ai4news` includes the
dedicated `/etc/nginx/snippets/ai_procurement.conf` inside its HTTPS block.
Leave the news root, `/api/`, `/login/`, and `/authorize` routing unchanged.
The existing procurement include on the legacy CARI host can remain in place;
the application sends login requests to the configured ai4news origin.
The container's Nginx routes `/ai_procurement/api/` and the exact
`/ai_procurement/authorize` callback to FastAPI.

## 5. Verification

```bash
curl -I http://ai4news.rnd.huawei.com/ai_procurement/
curl -I https://ai4news.rnd.huawei.com/ai_procurement/
curl https://ai4news.rnd.huawei.com/ai_procurement/api/health
docker compose logs --tail=100 backend frontend
```

Then open `https://ai4news.rnd.huawei.com/ai_procurement/`, follow the automatic W3 redirect and complete login,
confirm that the returned URL stays under the procurement path, create a test project, and
test **Sign out**. A callback failure is usually caused by a callback URI that
does not exactly match the W3 registration, an incorrect client secret, or a
certificate trust problem.

For `E_10004`, inspect the actual `redirect_uri` sent to Uniportal. With the
current shared client, use the ai4news procurement callback above, not the
legacy CARI domain. Passing this redirect check verifies only the initial
authorization step; a real W3 account must still complete the callback,
token exchange, userinfo lookup, and local session flow.

If clicking W3 appears to do nothing, inspect `/api/auth/status` through the
application prefix. `login_ready: false` and `configuration_issues` list missing
or invalid setting names (never secret values). The login page displays this
configuration error and disables repeated attempts until it is fixed. The
backend also redirects IP-based login requests to the configured public host
before creating OAuth state, avoiding cross-host cookie loss.

### Signed-in account display

The upper-right identity shows only the avatar and English name, with a separate
always-visible **Sign out** action (no account dropdown). `displayNameEn` from W3
is stored as the optional `name_en` field; the original audit name is unchanged.
Older sessions fall back to an existing Latin-script name or account ID without
inventing a translation. Sign out and sign in once to refresh the English name.
Existing sessions
without a photo remain valid. If a new W3 userinfo response supplies an optional
HTTPS avatar URL, it is retained with the minimal actor fields; otherwise the
UI uses name initials. Missing or failed photos never block login or navigation.
Inline image data and token-bearing avatar URLs are not stored in the session.
The news application's user-uploaded avatars are not copied or queried. Users
can sign in again to refresh any photo supplied by W3. No database migration
or additional environment setting is required for this display.

Unauthenticated visits automatically start W3 sign-in and preserve the requested
page, filters, and hash. Missing configuration, service errors, and callback
errors stop automatic retries and show recovery options instead of a redirect
loop. Explicit sign-out clears the session and returns with `signed_out=1`, so
an existing SSO session cannot immediately sign the user back in. The user may
start sign-in again from that confirmation screen. `AUTH_MODE=disabled` still
opens the test workspace directly and does not show a sign-out action.

### GitHub-first updates

Validate changes locally, commit and push to GitHub, then run `git pull --ff-only`
on the deployment server before rebuilding/restarting the procurement services.
Never commit `.env`, credentials, authenticated proxy URLs, or private deployment
files. The existing server has local Dockerfile, certificate, Compose, and
migration adjustments: back up and preserve those changes before pulling. Do not
use a hard reset to discard them. Keep a recoverable Git stash and private backup,
then restore only the reviewed deployment overrides after the fast-forward pull.
Verify the resulting commit, `.env` checksum, deployment overrides, health endpoint,
and login redirect. Do not modify the shared news/Nginx service for app-only updates.

## 6. Rollback

If only W3 login is blocking testing, first set `AUTH_MODE=disabled` in `.env`
and run `docker compose up -d --force-recreate backend frontend`. Reopen CARI
to continue as the local test administrator. Keep the W3 credentials in `.env`
so you can enable login again after troubleshooting. This does not remove data.

Keep the pre-deployment database backup and the previously deployed Git commit.
To roll back application code without deleting the volume, check out the known
good commit and run `docker compose build` followed by `docker compose up -d`.
