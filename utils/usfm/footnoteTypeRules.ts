/**
 * The shared footnote-type classification table `imports/guide.md` §5 calls
 * for: a pure, side-effect-free lookup with no I/O, imported by both
 * `usfm/footnotes.ts` (the importer) and `usfm/verify.ts` (the independent
 * verifier) — neither may import the other's parsing/segmentation code, but
 * both must agree on this one table.
 *
 * Classifies an already-extracted footnote body (the concatenated `\ft`/
 * `\fq`/`\fqa` text, `\fr`'s own reference label already dropped) into one
 * of guide §6's four ordered types — `xrf` → `var` → `trn` → `stu` — never
 * `map` (see {@link classifyFootnote}'s own doc comment for why).
 *
 * **Order matters**: a witness-language note ("Some Greek texts reverse the
 * order of verses 13 and 14... NU omits verse 14" — Matthew 17) would
 * wrongly fall through to `trn` on the word "Or"/"texts" if that rule ran
 * before `var`.
 *
 * **WEB's own house style is not NLT's**, so this table's signal words were
 * re-derived from WEBUS2020's own real footnote bodies rather than copied
 * from guide §6's NLT-derived worked example: WEB names its Greek-text
 * traditions with the sigla its own front matter defines (MT the Byzantine
 * Majority Text, TR the Textus Receptus, NU the Nestle-Aland/UBS critical
 * text) far more often than it spells out "manuscript"/"Septuagint"/
 * "Masoretic Text" in full, and uses `LXX`/`DSS` as its own standing
 * abbreviations for the Septuagint and Dead Sea Scrolls.
 */

import Footnote from "../../types/Footnote";

/** The four types this classifier can ever produce — `map` is never assigned (see {@link classifyFootnote}). */
export type ClassifiableFootnoteType = Exclude<NonNullable<Footnote["type"]>, "map">;

/**
 * Named witness/text-tradition signals, measured directly against the real
 * in-scope corpus rather than assumed from guide §6's own NLT-derived list.
 * `Samaritan Pentateuch` and `Targum` are kept even though this corpus has
 * zero real instances of either — generic witness vocabulary, harmless to
 * check for, worth confirming absent rather than silently dropping.
 *
 * `authorities read` is the deuterocanon corpus's own recurring
 * manuscript-variant phrase ("Some/Many/other/ancient authorities read
 * <alternate>"), playing the same role as the 66-book corpus's MT/TR/NU
 * sigla, just worded differently (36 real instances across Tobit, Judith,
 * Wisdom, Sirach, 1-2 Maccabees). **Deliberately not joined by a bare
 * `"Hebrew"` phrase**: the canonical corpus already carries real footnotes
 * that mention "the Hebrew" purely as etymological background (e.g. Exodus
 * 2:10's "'Moses' sounds like the Hebrew for 'draw out'"), correctly typed
 * `stu` — a bare `"Hebrew"` entry would silently flip those to `var`.
 *
 * The remaining five entries are ASV1901's own real textual-variant
 * phrasing (16 New Testament notes citing manuscript witnesses,
 * `70-MAT.usfm` through `75-ROM.usfm`), each the verbatim wording measured
 * from those bodies, confirmed to collide with nothing in WEB's own corpus:
 *
 * - `"authorities insert"`/`"authorities add"` — the bare noun-first
 *   phrasing covering most of ASV1901's real instances (e.g. "Many ancient
 *   authorities insert...", John 5:4).
 * - `"authorities, some ancient, insert"` — Matthew 17:21/18:11's own
 *   variant, with a parenthetical clause between "authorities" and
 *   "insert" that the bare phrase above wouldn't match as one substring.
 * - `"authorites insert"` — Acts 15:34's own real source-side spelling
 *   slip (missing the second "i").
 * - `"omitted by the best ancient authorities"` — Mark 9:44/9:46's own
 *   real, reverse (verb-first) word order. Deliberately not the bare
 *   noun-first `"authorities omit"`: WEB's own deuterocanon corpus already
 *   carries 3 real "authorities omit" notes (Sirach 7:26, 1 Esdras 9:48,
 *   Manasses 1:10), correctly `stu`, that a noun-first phrase would flip
 *   to `var`; ASV1901's real wording is reverse-ordered and doesn't
 *   collide.
 */
const WITNESS_PHRASES = [
  "manuscript",
  "Masoretic",
  "Samaritan Pentateuch",
  "Vulgate",
  "Septuagint",
  "Targum",
  "Dead Sea Scrolls",
  "some versions",
  "LXX",
  "DSS",
  "authorities read",
  "authorities insert",
  "authorities add",
  "authorities, some ancient, insert",
  "authorites insert",
  "omitted by the best ancient authorities",
] as const;

/**
 * WEB's own three self-documented Greek-text-tradition sigla (front matter,
 * "What are MT, TR, and NU?") — exported (not just the regex built from it
 * below) so `usfm/footnotes.ts`'s own footnote-initial capitalization fix
 * can anchor the identical vocabulary to a body's own *leading* word
 * instead of re-deriving a second copy of "which three abbreviations count
 * as a witness siglon." That fix needs to recapitalize the *whole*
 * abbreviation (Acts 4:27's real "nu adds..." casing slip becomes "NU
 * adds...", matching upstream `HEAD`, not the "Nu adds..." a bare
 * first-letter rule would produce), a different shape of use than this
 * module's own unanchored, anywhere-in-the-body match below, so the two
 * call sites share the vocabulary, not the compiled pattern.
 */
export const WITNESS_SIGLA_NAMES = "TR|NU|MT";

/**
 * Matched case-insensitively as a whole word, anywhere in the body. Every
 * real instance in the corpus is upper-case except one (Acts 4:27's "nu
 * adds..." — a real source-side casing slip against 200+ other upper-case
 * occurrences), which case-insensitive matching classifies correctly
 * without a special-cased typo branch.
 */
const WITNESS_SIGLA = new RegExp(`\\b(?:${WITNESS_SIGLA_NAMES})\\b`, "i");

/**
 * WEB's own recurring `trn` phrasing, read directly off the real corpus
 * rather than assumed from guide §6's NLT-derived openers. WEB rarely opens
 * a note with the bare word "Or" the way NLT does — its own house style is
 * `or, <alternate reading>` (lower-case, comma-led, e.g. "or, aromatic
 * resin"), plus `Hebrew:`/`Greek:`/`Aramaic:` openers naming the literal
 * original-language reading, plus a recurring "an alternate English gloss
 * exists" sentence shape — "(can/could/may) (also) (correctly) be
 * translated", "sometimes translated"/"sometimes rendered", or "also
 * means" — each introducing a second, genuinely substitutable English
 * wording in quotes (John 1:14's "only born"/"only begotten").
 *
 * This is deliberately narrower than "any note that mentions Hebrew/Greek":
 * a note that only *names* the underlying original-language term as
 * background, with no verb saying it was *rendered* or *translated* that
 * way (Genesis 25:26's "Isaac means 'he laughs'", Revelation 9:11's
 * "'Abaddon' is a Hebrew word that means 'ruin'...") offers no live English
 * alternative and is `stu`, not `trn`.
 *
 * **The hardest real boundary this module draws.** Genesis 1:1's own
 * recurring "The Hebrew word rendered 'God' is '<Hebrew>' (Elohim)." and
 * every book's own recurring "The word translated 'Lord' is 'Adonai'."
 * look, on the surface, like the identical shape as Isaac/Abaddon/Apollyon
 * above — a quoted term, a word named as background — but *saying a word
 * was "rendered" or "translated" is itself already describing a real
 * translation choice*, the same family of signal as the `Hebrew:`/`Greek:`
 * openers and `sometimes translated`/`sometimes rendered` above, not a
 * different kind of note that merely happens to share a surface shape with
 * a name-etymology note. Isaac/Abaddon/Apollyon stay `stu` for a
 * different, principled reason, not because they use different words: they
 * explain what a name *means* because it matters to the narrative, and
 * never once say the name was *rendered* or *translated* — "Isaac means
 * 'he laughs'" reports a name's own etymology; "the word rendered 'God' is
 * 'Elohim'" reports a translation choice. Real fixtures for both sides of
 * this exact line live in this module's own tests.
 *
 * `/^Gr\.\s/i` is the deuterocanon corpus's own abbreviated spelling of the
 * same `Greek:`/`Greek ` opener (140 real instances in Tobit/2 Maccabees,
 * each immediately following `\ft` with nothing before it, so anchoring at
 * the body's own start is exactly as safe here as for the spelled-out
 * form).
 *
 * `/^(?:Literally,?|Lit\.?)\s/i` matches a `Literally,`/`literally,` opener
 * (27 real WEB instances, e.g. Leviticus 19:16's `literally, "blood"`) or
 * the abbreviated `Lit`/`Lit.` form — never spelled out in real WEB text,
 * but `NET2019` tags all 24 of its own spelled-out `"Literally, ..."`
 * bodies `trn`, and `LSB2021`/`CSB2017`/`NKJV1982` use the abbreviated form
 * for hundreds to thousands of their own real `trn` notes. **One real,
 * accepted disagreement**: `AMP1987`'s own 3 real `"Literally, ..."`
 * bodies are tagged `stu`, not `trn` — not reimported or reclassified
 * here, so no shipped data is at risk; the other four corpora's volume
 * justifies keeping the pattern this broad rather than narrowing it to
 * dodge one corpus.
 *
 * `/\bBehold\b[^.]*?\bmeans look at, take notice, observe, see, or gaze
 * at\b/i` matches WEB's own recurring interjection-gloss boilerplate
 * ("Behold", from "הִנֵּה"/"ἰδοὺ", means look at, take notice, observe, see,
 * or gaze at...", 52 real instances). **Deliberately narrow, anchored to
 * this exact, named, recurring construct** rather than a general "sentence
 * says means followed by an or-list" rule: this corpus also carries two
 * real name-etymology notes sharing the identical comma-and-`or`-separated
 * gloss-list shape ("'Abaddon' is a Hebrew word that means 'ruin',
 * 'destruction', or 'the place of destruction'" and "'Apollyon' means
 * 'Destroyer'.", Revelation 9:11), both correctly `stu` — a broader
 * structural rule would misclassify them. The real distinction: `Behold`/
 * `Lo` is a common word translators *did* translate every time its
 * underlying term occurs, and this note offers other ways that live choice
 * could have gone; `Abaddon`/`Apollyon` are transliterated proper names
 * the translators left *untranslated*, so their notes are glossary
 * background about a name, never a live alternative for anything actually
 * rendered.
 *
 * `\balso means?\b` (broadened from the exact `\balso means\b`) is a
 * grammatical-number fix, not a new construct: WEB's own real "can also
 * **mean** 'gods', 'princes', or 'angels'" (Psalm 138:1) and "can also
 * **mean** teachers, scientists, ..." (Matthew 2:1) use the bare infinitive
 * a plural-subject gloss list agrees with, which the singular `\balso
 * means\b` could never match. **A real, documented cross-corpus
 * disagreement, not silently narrowed away**: several other already-shipped
 * corpora (`CSB2017`, `ESV2025`, `NCV1991`, `NET2019`, `NIV1984`,
 * `NLT1996`, `NLT2015`) carry real, already-`stu`-tagged bodies using this
 * identical bare-infinitive construct for what reads as a genuine
 * alternative in their own house style — none of them is reimported or
 * reclassified here, and WEB's own corpus has zero unwanted collision from
 * this broadening.
 *
 * The `(?:can|could|may)...be...translated` alternation gained one more
 * optional `also` after `be` (not just after the modal) to accept a real
 * word-order permutation: Acts 3:17's own recurring "may **be also**
 * correctly translated" (7 real instances). Zero collision elsewhere.
 *
 * `Hebrew[:,\s]`/`Greek[:,\s]`/`Aramaic[:,\s]` each gained a comma to their
 * own bracket class (objective 2026-08-22-001's own Finding 5), covering a
 * comma-punctuated opener in the identical translation-choice family as the
 * colon-led form — WEB's own real "Hebrew, Yahweh Nissi" (Exodus 17:15) and
 * "Greek, petra, a rock mass or bedrock." (Matthew 16:18), the corpus's own
 * only two real instances of this shape, both already `trn` upstream. Zero
 * `Aramaic,` instances exist today; the comma is added there too for the
 * same reason `Samaritan Pentateuch`/`Targum` stay in `WITNESS_PHRASES`
 * with zero real hits — harmless to check for, and it keeps the three
 * openers' own bracket classes matching each other rather than drifting.
 * Confirmed corpus-wide: exactly these two real bodies gain a comma
 * immediately after the bare language name anywhere in WEBUS2020's real
 * 2,233 footnotes, and zero real body in any other already-shipped version
 * would newly match if it were ever run through this classifier.
 *
 * `\bnot as a word, but as a grammatical marker\b/i` (objective
 * 2026-08-22-001's own Finding 5) covers WEB's own real "Aleph Tav" note —
 * "the Hebrew has the two letters 'Aleph Tav' ... not as a word, but as a
 * grammatical marker" — explaining a real Hebrew grammatical particle with
 * no English rendering at all, not a name's own etymology (the shape
 * `WITNESS_PHRASES`'s own doc comment above already warns a bare "Hebrew"
 * substring would misclassify). First described as a genuine singleton
 * (Exodus 20:1 alone); checked directly against the real corpus, that
 * description was wrong — Zechariah 12:10 carries the identical template
 * verbatim, differing only in the quoted word before it ("God" vs "me"),
 * and upstream `HEAD` tags both `trn`. Anchored to the note's own
 * distinctive closing clause, not to "Aleph Tav" or "Hebrew" alone, so nothing
 * else in the corpus's real "Hebrew"-mentioning background notes can ever
 * match it. Confirmed corpus-wide: exactly these two real bodies in
 * WEBUS2020, and zero real body in any other already-shipped version.
 *
 * `\bword\s+(?:rendered|translated)\b/i` generalizes the divine-title-
 * naming template above into a construct rather than two hardcoded literal
 * phrases ("Hebrew word rendered 'God'", "word translated 'Lord'"), so it
 * also catches every other body using the identical wording. Measured
 * directly against the full 82-file in-scope corpus: this flips exactly 71
 * real bodies from `stu` to `trn` (41 "Hebrew word rendered 'God'..."
 * instances, 30 "word translated 'Lord' is 'Adonai'" instances). Zero other
 * real WEBUS2020 body is touched: neither Isaac/Abaddon/Apollyon (none say
 * a name was "rendered" or "translated") nor the corpus's only two other
 * bodies containing either verb — Exodus 10:19's "could be more literally
 * translated" (no "word" immediately before "translated") and 1 Maccabees
 * 1:59's "The two **words** rendered altar..." (plural "words," so the
 * `\bword\b` singular boundary excludes it).
 *
 * **A real, documented cross-corpus disagreement, not silently omitted.**
 * None of the corpora below is reimported, reclassified, or written to
 * here. `AMP1987` and `NIV1984` tag their own real "word rendered/
 * translated" bodies `stu` where they read as background gloss on a word's
 * semantic range rather than a live alternative. `ESV2025`'s three
 * instances are `stu` notes about translation *uncertainty*, not an
 * offered alternative. `NET2019` (75 instances) splits internally on this
 * identical template (36 `trn`, 32 `stu`, 2 `var`), so it never applied one
 * consistent rule to this construct and carries no weight as an arbiter
 * here.
 */
const TRANSLATION_ALTERNATIVE_PATTERNS = [
  /^Or,?\s/i,
  /^Hebrew[:,\s]/i,
  /^Greek[:,\s]/i,
  /^Gr\.\s/i,
  /^Aramaic[:,\s]/i,
  /^(?:Literally,?|Lit\.?)\s/i,
  /\bBehold\b[^.]*?\bmeans look at, take notice, observe, see, or gaze at\b/i,
  /\b(?:can|could|may)(?:\s+also)?\s+(?:be\s+(?:also\s+)?correctly\s+translated|correctly\s+be\s+translated|be\s+(?:also\s+)?translated)\b/i,
  /\bsometimes (?:translated|rendered)\b/i,
  /\bword\s+(?:rendered|translated)\b/i,
  /\balso means?\b/i,
  /\bnot as a word, but as a grammatical marker\b/i,
] as const;

/**
 * A reference-shaped run: `[1-4 ]Book chapter:verse[-verse]`, optionally
 * followed by a trailing tradition siglon (`LXX`/`MT`/`TR`/`NU`) — the same
 * four-siglon vocabulary and case-sensitive matching `usfm/references.ts`'s
 * own `REFERENCE_SUFFIX` uses for the identical shape, resolution-side.
 * E.g. "Exodus 30:12" or, the one real in-scope fixture needing the
 * trailing group, Hebrews 1:6's own "Deuteronomy 32:43 LXX". Used only by
 * {@link isNothingButReferences}'s own boundary test — never a real
 * resolver (`usfm/references.ts` owns turning a reference into a
 * `bibleLink`; this predicate only asks "if every reference-shaped run
 * were deleted, would anything be left").
 */
const REFERENCE_PATTERN = /\b(?:[1-4]\s?)?[A-Z][a-z]+(?:\s[A-Z][a-z]+)*\s\d+:\d+(?:[-–—,]\s?\d+)*(?:\s(?:LXX|MT|TR|NU))?\b/g;

/**
 * Guide §6's own `xrf` test: delete every reference-shaped run from `body`
 * and see whether anything real is left. A note that is *only* references
 * (no connecting prose at all) is `xrf`; a note that merely *contains* one
 * ("cherubim are powerful angelic creatures... See Ezekiel 10.") is not.
 * The real in-scope corpus carries zero true `\f`-type notes shaped this
 * way (every reference inside a real `\f` note sits in explanatory prose),
 * so this predicate's own unit test instead uses a real reference string
 * pulled from an in-scope `\x` cross-reference's own `\xt` target (2 Kings
 * 12:4's `Exodus 30:12`) to prove the rule on a genuinely reference-only
 * body.
 *
 * **A reference immediately followed by a trailing tradition siglon is
 * still "nothing but a reference."** Hebrews 1:6's own real target,
 * "Deuteronomy 32:43 LXX," is `\x`-sourced — `usfm/references.ts`'s own
 * `buildCrossReferenceContent` hardcodes every `\x`-derived footnote's type
 * to `xrf` unconditionally, so this predicate never runs against it at
 * real import time. It does run whenever anything re-derives a type from
 * already-built `content` instead (`overhaulFootnotes.ts`'s
 * `reclassifyFootnotesIn`, `usfm/verify.ts`'s own reconciliation): without
 * this rule, the residue check would leave the trailing " LXX" behind, fall
 * through to `namesAWitness`, and misclassify the note `var` instead of
 * `xrf` — a citation naming which textual tradition it quotes is not the
 * same as a note contesting the verse's own wording. Upstream WEBUS2020
 * tags this note `xrf`; `CSB2017`'s own already-shipped corpus tags the
 * identical shape `var` instead, systematically — a real, documented
 * disagreement this fix does not resolve for that corpus, since it is
 * scoped to WEBUS2020's own confirmed convention.
 */
function isNothingButReferences(body: string): boolean {
  const withoutReferences = body.replace(REFERENCE_PATTERN, "").replace(/[;,.\s]/g, "");
  return withoutReferences.length === 0 && body.trim().length > 0;
}

/** Whether `body` names a witness/text-tradition (a phrase from {@link WITNESS_PHRASES} or a siglum from {@link WITNESS_SIGLA}) — the `var` signal. */
function namesAWitness(body: string): boolean {
  return WITNESS_PHRASES.some((phrase) => body.includes(phrase)) || WITNESS_SIGLA.test(body);
}

/** Whether `body` offers a live English alternative reading, matching one of {@link TRANSLATION_ALTERNATIVE_PATTERNS} — the `trn` signal. */
function offersATranslationAlternative(body: string): boolean {
  return TRANSLATION_ALTERNATIVE_PATTERNS.some((pattern) => pattern.test(body));
}

/**
 * Flattens any already-built `Content` value down to its own plain visible
 * text, ignoring every formatting property (`marks`, `script`, `strong`,
 * `paragraph`, `break`) — exactly the input {@link classifyFootnote} needs,
 * and also `usfm/verify.ts`'s own character-reconciliation question ("what
 * characters does this footnote body actually show"), deliberately blind to
 * how those characters got distributed across nodes. Shared here so both
 * call sites that re-derive a classifier body from already-built JSON — the
 * independent verifier and the version-agnostic `overhaulFootnotes.ts` CLI
 * — use one implementation; `usfm/footnotes.ts` (the importer) needs no
 * version of this, since it builds its own classify-input text directly
 * from the raw `\ft`/`\fq`/`\fqa` tokens, never from an already-built
 * `Content` tree.
 *
 * **A bare `{bibleLink}` node with no display override flattens to the
 * reference itself** — `types/Content.ts`'s own doc comment on
 * `ContentBibleLink.content` states this directly ("Optional display
 * override (defaults to the reference)"). Without this, every real
 * `xrf`-type footnote without a display override (2 Kings 12:4's
 * `{bibleLink: "Exodus 30:12"}`, most of this corpus's own cross-reference
 * footnotes) flattens to an empty string and silently misclassifies as
 * `stu` instead of `xrf` — latent until this function had a second caller,
 * since `usfm/verify.ts`'s own character-reconciliation check (its only
 * caller before) excludes `xrf`-type footnotes from the comparison that
 * calls it.
 */
export function flattenContentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(flattenContentText).join("");
  if (content !== null && typeof content === "object") {
    const node = content as { text?: unknown; content?: unknown; bibleLink?: unknown };
    if (typeof node.text === "string") return node.text;
    if ("content" in node) return flattenContentText(node.content);
    if (typeof node.bibleLink === "string") return node.bibleLink;
  }
  return "";
}

/**
 * Classifies one already-extracted footnote body into guide §6's ordered
 * `xrf` → `var` → `trn` → `stu` types.
 *
 * **`map` is never returned.** Guide §6 is explicit that `map` is not
 * hypothetical in general (NET2019's own corpus populates it, from an
 * explicit `notetype="map"` source label) but that emitting it "stretches a
 * guess into existence" wherever the source gives no comparable, unambiguous
 * signal — and WEBUS2020's own footnotes carry no map-reference apparatus
 * at all, checked directly against the real corpus. This function's own
 * return type (excluding `map`) makes that a compile-time guarantee, not
 * just a runtime habit.
 *
 * @param body - The footnote's own concatenated `\ft`/`\fq`/`\fqa` text
 *   (`\fr`'s reference label already dropped, per the already-established
 *   repo convention — see `usfm/footnotes.ts`'s own doc comment).
 */
export function classifyFootnote(body: string): ClassifiableFootnoteType {
  if (isNothingButReferences(body)) return "xrf";
  if (namesAWitness(body)) return "var";
  if (offersATranslationAlternative(body)) return "trn";
  return "stu";
}
