# Prompt Log

A chronological record of the requests, implementation choices, problems, feedback and decisions behind this watcher. A new entry is added after each significant feature or design decision.

---

## 1. Original local watcher — 2026-11-07

**Original request**
Get notified when new TikTok Product Management internship roles appear on the SimplifyJobs Summer 2027 list. (Reconstructed from the files created that day; the exact wording was in an earlier session.)

**Implementation summary**
- `watch.mjs` downloads the SimplifyJobs README, reads the "Product Management Internship Roles" table and keeps the open TikTok / ByteDance rows.
- `seen.json` stores the Simplify IDs of roles already reported. `check` lists roles not in it, and `ack` marks them as seen, but only after an alert has gone out, so a failed alert is retried.
- A Claude desktop scheduled task ran the checker every 30 minutes and, when it found new roles, sent an email through the Gmail connector plus a push notification.

**Problems encountered**
- Plain Node `fetch` failed on this machine, so it needs `--use-env-proxy`.

**Final decision**
Run locally on a 30-minute schedule, with email and push alerts.

---

## 2. Alerts were not immediate; PM-only filter — 2026-11-11

**Original request**
"Why the notifications of job alert is not 即时? The TT intern job you just gave me is like 4 days ago? I only want notification about PM job of TT, please don't include other types."

**Investigation**
- The alert was for "Product Operations Intern" (LA). The "4d" age is how long ago TikTok posted the job, not when SimplifyJobs added it to the list. SimplifyJobs added it late, and the watcher alerted when it appeared there.
- The local task also had gaps: no runs from about 18:00 on Nov 10 to 08:00 on Nov 11 (Beijing time) while the PC was off or the app was closed, followed by two runs that failed with network errors (EPROTO).

**Implementation summary**
Added a title filter so that only roles containing "Product Manager" were reported (3 of 6 TikTok roles).

**My feedback**
"Product manager or product or product operation, these product-related types."

**Final decision**
Widened the filter to any title containing "Product", which covers Product Manager, Product Operations, Product Solutions and so on (6 roles). The check interval changed from 30 to 10 minutes.

---

## 3. Move the watcher to the cloud (GitHub Actions) — 2026-11-11

**Original request**
"Would moving Signal off my computer be better, so it doesn't depend on whether my computer is online?"

**Analysis**
The watcher is a Claude desktop scheduled task that is separate from Signal, so deploying Signal wouldn't help. The watcher itself has to run in the cloud. The options were GitHub Actions (free, about 5-minute minimum, no Claude usage) and a Claude cloud routine (would use a lot of usage at a 10-minute interval). The recommendation was GitHub Actions.

**My feedback**
"OK, GitHub Actions." Then chose a **public repo, every 5 minutes**.

**Implementation summary**
- `watch.mjs` was rewritten for Actions with the same parser and "Product" filter, and no proxy flag needed.
- Alerts: the watcher opens a GitHub issue (GitHub emails and pushes it to the owner). Optionally it also sends a Gmail email through nodemailer when the `GMAIL_USER`, `GMAIL_APP_PASSWORD` and `ALERT_TO` repo secrets are set.
- `seen.json` was carried over from the local watcher so the 6 known roles don't alert again. It is only updated after alerts succeed, and the workflow commits it back to the repo.
- If `seen.json` is missing, the first run records a baseline instead of alerting.
- `.github/workflows/watch.yml` runs on cron `*/5 * * * *` plus manual "Run workflow", with `contents: write`, `issues: write`, and a concurrency guard.

**Problems encountered**
- Repo-minute limits: a private repo gets 2,000 free minutes a month, and every 5 minutes would use about 8,600. Public repos have unlimited minutes, which is why the repo is public. Caveat: GitHub disables scheduled workflows in a public repo after 60 days without commits. If that happens, re-enable the workflow in the Actions tab.
- The GitHub CLI isn't installed and the in-app browser wasn't signed in, so the user created the repo manually. The code was pushed with git.
- The repo wasn't being watched (0 watching), which would block issue notifications. The user was told to set Watch → All Activity (or Custom → Issues).

**Final decision**
GitHub Actions in a public repo, every 5 minutes. The first manual run passed. The local Claude scheduled task was **paused** (not deleted) to avoid duplicate alerts. Gmail email is optional, and the user is setting up the secrets.
