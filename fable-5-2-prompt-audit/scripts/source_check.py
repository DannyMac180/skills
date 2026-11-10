#!/usr/bin/env python3
"""Tie references/checklist.md to the sentences of Anthropic's guide.

The checklist paraphrases the guide and stores a fingerprint (first 12 hex
chars of SHA-256) of each source sentence instead of the sentence itself.

  source_check.py list   <page> [filter]     print "fingerprint  sentence" for a page
  source_check.py verify <checklist> <page>...  check every fingerprint still exists
  source_check.py show   <checklist> <page>...  print the source sentence per fingerprint

<page> is a local markdown file or an https URL (fetch the ".md" form of a
docs page). verify exits 1 if any fingerprint is missing, which means the
guide changed and the checklist item needs a re-read.
"""
import hashlib
import re
import sys
import urllib.request

LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")
SPLIT = re.compile(r"(?<=[.!?:])[”\"]?\s+(?=[A-Z“`*\[])")
FP = re.compile(r"`([0-9a-f]{12})`")


def load(page):
    if page.startswith("https://"):
        req = urllib.request.Request(page, headers={"User-Agent": "docs-fetch"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read().decode("utf-8")
    with open(page, encoding="utf-8") as f:
        return f.read()


def sentences(text):
    out = {}
    for line in LINK.sub(r"\1", text).splitlines():
        line = re.sub(r"^\s*(?:[*\-]|\d+\.)\s+", "", line).replace("**", "").strip()
        if not line or line.startswith(("#", "```", "<", "---")):
            continue
        for s in SPLIT.split(line):
            s = " ".join(s.split())
            if len(s) > 20:
                out[hashlib.sha256(s.encode()).hexdigest()[:12]] = s
    return out


def main(argv):
    if len(argv) < 3 or argv[1] not in ("list", "verify", "show"):
        print(__doc__)
        return 2
    if argv[1] == "list":
        needle = argv[3].lower() if len(argv) > 3 else ""
        for fp, s in sentences(load(argv[2])).items():
            if needle in s.lower():
                print(fp, s)
        return 0
    known = {}
    for page in argv[3:]:
        known.update(sentences(load(page)))
    with open(argv[2], encoding="utf-8") as f:
        wanted = list(dict.fromkeys(FP.findall(f.read())))
    missing = [fp for fp in wanted if fp not in known]
    if argv[1] == "show":
        for fp in wanted:
            print(fp, known.get(fp, "MISSING"))
    print(f"{len(wanted) - len(missing)}/{len(wanted)} fingerprints found")
    for fp in missing:
        print("MISSING", fp)
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
