# Iteration 23 Feedback

## Summary

1 failure (1 real, 0 generated).

---

## Pattern 1: Complete extraction failure on multilingual headers with non-Latin scripts

**Affected files:** real only
**Count:** 1

### What happened

| Expected | Extracted |
|----------|-----------|
| Smażona zielona fasolka | *(empty)* |

The title "Smażona zielona fasolka" appears on line 1 — the very first line of the file. Yet the extractor returned an empty string rather than a wrong guess.

### Why

The file has an unusual multilingual header structure:

```
Smażona zielona fasolka        ← Polish title (line 1)
GREEN BEANS BORKEUM            ← English translation (line 2)
그린빈 볶음                      ← Korean/Hangul (line 3)
```

The Korean Hangul characters on line 3 likely disrupted the extraction pipeline. The extractor may be:
- Failing to parse the document at all when non-Latin scripts appear in the opening lines, returning empty instead of a best-guess
- Treating the trilingual preamble as ambiguous and declining to commit to any candidate

The root cause is not a bad title choice — it is a complete failure to extract anything. The correct title was trivially available on line 1. The extractor should degrade gracefully by returning the first non-empty line when normal heuristics fail.

### Recommendation

Add a fallback: if the primary extraction logic returns empty (or null), return the first non-blank line of the input. This would fix this case with no risk of regression on well-formed files.
