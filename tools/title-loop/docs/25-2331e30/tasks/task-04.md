# Task 04: Run evaluation harness and confirm no regressions

## Summary

Run the title-loop evaluation harness to verify the fix passes the failing case and introduces no regressions.

## Files to modify

- `tools/title-loop/docs/25-2331e30/results.txt` (updated with new results)

## Changes

This is a verification-only task. No code changes — just running the evaluation and recording results.

### Steps

1. **Run the evaluation harness:**
   ```bash
   cd tools/title-loop && python title-loop.py
   ```

2. **Check the specific failing case:**
   Look for `FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS` in the output.
   - It should now show as **PASS** (not FAIL).
   - Expected output: `FINNISH MILK FLATBREADS + FINNISH POTATO FLATBREADS`

3. **Check for regressions:**
   - Compare total pass/fail counts against iteration 25 baseline:
     - Real files: was 10/11 passing (1 failure). Should now be 11/11 (0 failures).
     - Generated files: was 0 failures. Should remain 0 failures.
   - If any previously-passing test now fails, the corroboration filter is too aggressive and needs adjustment.

4. **Record results:**
   Save the evaluation output to `tools/title-loop/docs/25-2331e30/results.txt` (or a new iteration directory if the workflow requires it).

### Troubleshooting

If the fix doesn't work (the case still fails):
- Check that `corroborationScore` uses `>= 3` word length threshold (not `>= 4`), otherwise "DAT" is excluded and gets score 1.0.
- Check that the threshold comparison uses `score >= threshold` (not `score > threshold`).
- Verify the `corroboratedCaps.length >= 2` fallback logic — if only 1 candidate passes corroboration, the code should fall back to the original set.

If there are regressions:
- Identify which test case regressed and examine its ALL_CAPS candidates.
- Check whether the corroboration threshold (1.0 for ≤3 words, 0.67 for >3 words) is too strict for that case.
- Consider relaxing the threshold or adding special handling.

## Verification

1. Evaluation harness reports 0 real-file failures and 0 generated-file failures.
2. The FINNISH MILK/POTATO FLATBREADS case specifically passes.
3. Total accuracy is ≥ the previous iteration's accuracy (was 90.9% overall).
