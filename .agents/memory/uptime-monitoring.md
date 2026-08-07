---
name: Uptime monitoring for gateway services
description: Health checks and hosting choices for long-running Discord gateway processes
---

The health endpoint for a gateway-backed service should be lightweight and dependency-free so an external monitor measures process reachability without flapping on downstream Discord or database issues.

**Why:** External uptime monitors provide alerting, but they do not keep a scale-to-zero deployment alive; Discord gateway clients need an always-running deployment.

**How to apply:** Publish the bot/API process on an always-on VM, then point UptimeRobot at the public production health URL rather than a workspace development URL.