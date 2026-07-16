# Adapter: Code, Diffs & Repos

**What "meaning" means here: behavioral change and intent.** Code exists to
make a machine behave a certain way; a diff exists to change that behavior.
The explanation's job is the behavior and the why — the code text is evidence,
not the subject.

## Ingestion

- **Diff:** read the surrounding code first — the explanation of a change
  needs the system as it was. Identify the behavioral delta: what does the
  system do after that it didn't do before (or stops doing)?
- **Repo / module:** find the entry points and one representative end-to-end
  path before reading anything alphabetically. Prose order beats file order.
- Run tests or the tool itself when possible — observed behavior beats
  inferred behavior.

## Spine emphasis

1. **Why does this exist** — the problem or requirement that forced this code
   into existence. For a diff: what was broken, missing, or slow.
2. **The one idea** — the core design move in one sentence ("all writes go
   through one queue so readers never see partial state").
3. **How it works** — literate sequencing: follow one request/call/datum
   through the system in narrative order. Intuition for the design before
   syntax of the implementation. Skip what the learner's profile says they
   know (don't re-teach their own stack to them).
4. **What can you now do** — can they modify it safely, review it critically,
   or reuse the pattern? Name the one place a naive change would break things.
5. **Check yourself** — favor transfer ("what happens if two callers hit this
   concurrently?") over recall of names and signatures.

## Watch for

- **Incidental vs essential complexity:** flag which parts are the idea and
  which are plumbing. Learners drown when explanations weight them equally.
- **The diff that lies:** a small textual change with a large behavioral
  radius (default flips, shared helpers). Size the explanation to the
  behavioral change, not the line count.
