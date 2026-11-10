# Parcel Desk

Support tooling for a parcel delivery company. Python 3.12, run tests with `pytest`.

## Rules

- Never commit `.env` files. They hold production secrets.
- Ask before running a database migration against production, because production has no automatic rollback. Migrations on staging and local databases need no approval.
- We moved the support agent from `claude-opus-5-5` to `claude-fable-5-2` in October. The config is in `src/harness/loop.py`.
