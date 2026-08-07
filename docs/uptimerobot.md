# UptimeRobot setup for Arcade Command

Arcade Command's API has a dedicated monitor endpoint:

```text
GET /api/healthz
```

It returns `200 OK` and:

```json
{"status":"ok"}
```

## Setup

1. Publish the **API Server** artifact from Replit.
2. Choose an **Always On / VM** deployment for the API. This is important for
   the Discord bot: an autoscale deployment may scale down when there is no
   traffic, while the Discord gateway needs a continuously running process.
3. Copy the public production URL from Replit.
4. In UptimeRobot, create an **HTTP(s)** monitor with:
   - URL: `https://<production-api-domain>/api/healthz`
   - Method: `GET`
   - Expected status code: `200`
   - Monitoring interval: 5 minutes or longer
5. Save the monitor and confirm the first check succeeds.

Use the production `.replit.app` URL or a configured custom domain. The
workspace `.replit.dev` URL is not a stable public endpoint and should not be
used in UptimeRobot.

## What this check means

The endpoint is intentionally lightweight and dependency-free. A successful
check confirms that the API process is accepting requests. It does not attempt
to call Discord or the database, so a Discord or database outage should be
investigated separately rather than causing the monitor to flap.

UptimeRobot provides alerting and availability checks; it does not itself keep
a sleeping deployment alive. The Always On / VM deployment is the part that
keeps the Discord bot connected.