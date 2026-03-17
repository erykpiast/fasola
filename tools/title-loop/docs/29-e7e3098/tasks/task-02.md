# Task 02: Expand Polish cooking verb filter

## Summary

Add missing perfective-prefix verbs (`ugotuj`, `upiecz`, `podawać`, etc.) to `POLISH_COOKING_INSTRUCTION_STARTS` regex.

## Files to modify

- `lib/text-classifier/title-extractor.ts`

## Changes

The `POLISH_COOKING_INSTRUCTION_STARTS` regex at line 346 is missing common perfective-prefix cooking verbs. These missing verbs cause body lines like `Ugotuj ziemniaki w osolonej wodzie.` to pass through the cooking instruction filter and enter the candidate pool.

**Modify the `POLISH_COOKING_INSTRUCTION_STARTS` regex at line 346.** Add the following verb forms to the alternation group:

```
ugotuj|ugotowa[cć]    // perfective u+gotuj forms ("cook to completion")
upiecz                // perfective u+piecz ("bake to completion")
podawa[cć]            // infinitive form of "serve" (podawać)
zapiekaj              // "bake in oven"
obtocz|obtoczy[cć]    // "coat/roll in"
podgrzej|podgrzewaj   // "reheat/warm up"
```

The full updated regex should look like:

```typescript
const POLISH_COOKING_INSTRUCTION_STARTS = /^(podawaj|dodaj|dodawaj|sma[zż]|gotuj|odced[zź]|wymieszaj|mieszaj|wlej|nalej|przygotuj|zagotuj|pokr[oó]j|obierz|wrzuc|wrzuć|usma[zż]|podsma[zż]|prze[lł][oó][zż]|zblenduj|ubij|roztrzepaj|rozprowad[zź]|wyrob|zamieszaj|posyp|polej|odstaw|na[lł][oó][zż]|przykryj|odkryj|wstaw|zdejmij|ods[aą]cz|rozgrzej|posiekaj|zetrzyj|wy[lł][oó][zż]|wyjmij|ukr[oó]j|przekr[oó]j|formuj|ugniataj|rozwałkuj|ugotuj|ugotowa[cć]|upiecz|podawa[cć]|zapiekaj|obtocz|obtoczy[cć]|podgrzej|podgrzewaj)\b/i;
```

**Note:** `usmaż` is already covered by `usma[zż]` in the existing regex. The new additions are specifically:
- `ugotuj` / `ugotowa[cć]` — perfective forms of "cook"
- `upiecz` — perfective "bake"
- `podawa[cć]` — infinitive "serve" (distinct from existing `podawaj` which is imperative)
- `zapiekaj` — "bake in oven"
- `obtocz` / `obtoczy[cć]` — "coat/roll in"
- `podgrzej` / `podgrzewaj` — "reheat/warm up"

## Verification

- `looksLikeCookingInstruction("Ugotuj ziemniaki w osolonej wodzie.")` → `true`
- `looksLikeCookingInstruction("Podawać letni lub chłodny.")` → `true`
- `looksLikeCookingInstruction("Upiecz ciasto w piekarniku.")` → `true` (new verb)
- `looksLikeCookingInstruction("Ugotuj")` → `false` (< 4 words, existing guard)
- Run eval suite: Pattern 2 and 4 failures involving Polish cooking verbs should improve
- No regressions on currently-passing files
