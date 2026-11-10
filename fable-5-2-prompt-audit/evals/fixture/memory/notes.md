# Agent notes

Notes the support agent keeps between sessions.

- 2025-02-11: The inventory service is down this week. Do not call it; use the nightly CSV export instead.
- NEVER retry a failed API call.
- Do not delete rows from `orders` without Priya's go-ahead in the ticket: finance reconciles against them and deleted rows cannot be restored.
- Depot codes are three letters, upper case (for example `LHR`).
