# Adapter: Papers & PDFs

**What "meaning" means here: claim + evidence.** A paper exists to argue that
something is true. The explanation's job is to make the claim, the evidence,
and the gap between them legible.

## Ingestion

- Read the full text when available (PDF read, HTML, or LaTeX source).
- Read in evidence order, not page order: abstract → figures + captions →
  results → methods → discussion. The figures usually carry the real argument.
- Note what the authors *measured* vs what they *claim* — the gap between the
  two is often the most important thing to explain.

## Spine emphasis

1. **Why does this exist** — what question was open before this paper, and why
   did existing answers fail? (Check the related-work section for the authors'
   own framing, but don't trust it uncritically.)
2. **The one idea** — the claim in one sentence, with its strength qualified
   honestly ("shows X on benchmark Y" ≠ "proves X").
3. **How it works** — mechanism before math. Every equation that matters gets
   an intuition first; equations that don't bear load get skipped, and say so.
4. **What can you now do** — can the learner use the method, cite the result,
   or challenge the claim? Tie to their formation goals.
5. **Check yourself** — at least one question about the evidence quality, not
   just the mechanism ("what would falsify the headline claim?").

## Watch for

- **Headline-vs-fine-print drift:** abstract claims broader than the results
  support. Explaining this gap is high-value, not pedantry.
- **Notation walls:** if the learner's profile lists formal notation as thin,
  translate symbols to words the first time each appears.
