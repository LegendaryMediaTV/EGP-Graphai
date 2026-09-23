# Short Definitions

A root in the lexical map may carry a `shortDefinition`: a brief English gloss for the word. This document defines how to write one. For the codex shape it sits in, see [lexical-map.md](./lexical-map.md).

A short definition has one job. A reader who does not know the language sees a word in a verse, reads its parse, reads its short definition, and can put the definition in place of the word to make an English sentence. Every rule below serves that job in one of two ways: the gloss's shape tells the reader the part of speech without a label, and its content is precise enough to swap in without misleading.

The rules are written for any language the map holds. The examples are Greek.

## What a short definition covers

**One gloss per root, for the dictionary word.** The gloss belongs to the root, not to any inflection, and there are no per-inflection glosses. A root that carries several index numbers still gets one gloss, written for the word itself rather than for whichever number happens to match the citation form.

**Tense-neutral, person-neutral, case-neutral.** The parse on each cell already states tense, voice, mood, person, number, case, gender and degree. The gloss states none of them, so it combines with every cell's parse instead of contradicting most of them. εἰμί is "to be": read beside a third person singular present indicative it becomes "is", and beside an imperfect it becomes "was". A gloss of "I am" would be right for one cell and wrong for the rest. For the same reason οἶδα is "to see; fig. to know, notice", not "to have seen", and ἐσθίω is "to eat", even though an index gives its present and aorist stems separate numbers. The parse says which stem a form uses.

**The smallest effective dose.** Give the fewest glosses that let a reader swap the word into a sentence and understand it correctly. A second or third synonym belongs only when it adds a shade the first lacks. Aim for 50 characters or fewer. Go past 50 only when the word has several distinct senses a reader needs, or synonyms that each add a shade the others lack, and never past 90. πέτρα "a massive rock, solid rock mass, bedrock, cliffside, crag" runs to 57 because its list is what separates it from λίθος "a stone".

## Anatomy

A short definition is one or more clauses separated by semicolons. The first clause is the lead and has no label. Each later clause opens with a label that says how it relates to the lead.

```text
to be extremely grieved; fig. to be extremely angry, infuriated; trad. to be indignant
└──────── lead ───────┘ └──────────────── fig. ────────────────┘ └────── trad. ──────┘
```

Inside a clause, commas separate near-synonyms for the same sense.

### Labels

There are five labels, and no others.

| Label   | Reads as      | Marks                                                                                                   | Example                                                        |
| ------- | ------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `lit.`  | literally     | A literal or etymological meaning the word is not used in, placed after the sense it is used in         | ἀπόστολος "an apostle; lit. a sent one, delegate"              |
| `refl.` | reflexively   | The sense the word takes when reflexive (middle)                                                        | πείθω "to persuade, convince; refl. to trust"                  |
| `pl.`   | plurally      | The sense the word takes in the plural                                                                  | γένος "a relative; pl. a family"                               |
| `fig.`  | figuratively  | Any sense extended or derived from the literal one, not only metaphor                                   | ἀνήρ "a man; fig. a husband"                                   |
| `trad.` | traditionally | A rendering traditional English Bibles carried over, when the lead departs from it                      | πραΰς "to be serene; trad. to be meek"                         |

Clauses appear in that order: the lead, then `lit.`, then `refl.` or `pl.`, then `fig.`, then `trad.` last. A label is lowercase, ends in a period, follows a semicolon and a space, and is followed by a space. It is never written with a colon or a comma.

## The frame names the part of speech

The first gloss of every clause opens with a frame, a fixed opening that marks the part of speech. The frame repeats after a label, because a labeled clause is read on its own. The other glosses in the same clause leave it off.

- ἀγγεῖον "a container, flask, vessel"
- ἀβαρής "to be weightless, light-weight, non-burdensome; fig. to be easy-going"

The frame follows the root's own `pos`, with exceptions for cardinal numbers and some quantifiers (see [Numerals and quantifiers](#numerals-and-quantifiers)). A root's cells may be tagged with other parts of speech, since a corpus tags each token by how it is used, but the gloss is written once for the word, so it follows the root.

| Part of speech                  | Frame                   | Examples                                                                                     |
| ------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| Noun                            | `a` / `an` X            | λίθος "a stone"; ἄγγελος "a messenger, angel; fig. a pastor"                                 |
| Noun naming a single referent   | `the` X                 | γῆ "the earth, soil, dirt; fig. a land, territory"; σάρξ "the flesh; fig. the physical"      |
| Verb                            | `to` X                  | ἀκούω "to hear"; ἀποστέλλω "to send"                                                         |
| Adjective                       | `to be` X               | ἀγαθός "to be good/well; fig. to be useful, beneficial"; λευκός "to be white"                |
| Adverb                          | bare adverb or phrase   | ἀεί "always"; λάθρᾳ "secretly"; ἐπαύριον "on the next day"                                   |
| Cardinal number                 | bare number             | δύο "two"                                                                                    |
| Preposition                     | bare preposition        | ἐν "in, at"; διά "through, throughout, thoroughly; fig. because of"                          |
| Conjunction, particle           | bare word               | καί "and, also, additionally, furthermore"; οὖν "therefore"                                  |
| Pronoun                         | bare pronoun forms      | ἐγώ "I, me"; αὐτός "him, her, them, it"; οὗτος "this/these"                                  |
| Article                         | `the`                   | ὁ "the"                                                                                      |
| Interjection                    | exclamation with `!`    | ὡσαννά "save us!, salvation has come!; trad. hosanna!"                                       |
| Proper name                     | the English name        | Ἀβραάμ "Abraham; lit. Father of a Multitude"                                                 |

A word the map files as a Hebrew or Aramaic transliteration (`pos` `hebrew` or `aramaic`) takes the frame of the role it plays in the sentence. ὡσαννά is an exclamation, so it takes the interjection frame, and ῥαββί is a noun, "a rabbi".

### Nouns

Use `a` or `an` by the sound that follows. Every common noun takes one, including abstract nouns and nouns English treats as uncountable: "a peace", "a knowledge", "a bread", "a blood". The article is what tells the reader the word is a noun. A bare gloss is the frame for adverbs, prepositions, conjunctions and particles, so a bare "blood" would read as one of those. A rule with no exception for countability also saves the writer from judging countability, which English leaves unclear ("a knowledge" or "knowledge"?). The article can read as "a kind of", which does no harm: a reader adjusts articles every time they swap a noun gloss into a sentence, since Greek has no indefinite article.

Use `the` only for something there is one of, or a title: "the earth", "the gospel", "the Christ".

When a common noun narrows to a single referent with the Greek article, the lead stays the common noun and the narrowed sense follows as `fig.`, written as a name: θεός "a god/goddess; fig. God". The article in the text does the narrowing, so the lead still swaps in where the word is used without it.

A sense that names a particular place is written as a name: capitalized, with no article. οὐρανός is "a sky; fig. Heaven".

### Verbs

Use `to be` X when English expresses the verb's meaning with an adjective or a participle: κάθημαι "to be seated", ἀπορέω "to be perplexed", δύναμαι "to be able to, can".

Keep the preposition a verb takes, so the reader sees what it governs: ἐλεέω "to have mercy on", ἐξουσιάζω "to exercise authority over".

Gloss a deponent verb by its meaning, which in English is active: ἀποκρίνομαι "to respond, answer". Gloss an impersonal verb the same way as any other: δεῖ "to be binding, necessary, must".

### Adverbs, prepositions, conjunctions and particles

These are bare: the English equivalent, with no frame, because it swaps into a sentence as it stands. Bare is read by elimination. The three marked frames cover the three parts of speech where English words cross over (love is a noun and a verb; near is an adjective and an adverb), so a gloss with none of them is none of those three.

An adverb never takes `to be`, even when Greek uses it as a predicate. In ἐγγύς ἐστιν, "it is near", the "is" comes from ἐστιν, not from ἐγγύς, and putting it in the adverb's gloss would give the adverb the adjective frame. No other frame fits adverbs cleanly: "in a … manner" does not work for "here", "now" or "soon", and those have no -ly form either.

### Adjectives

An adjective is always `to be` X, including when the corpus mostly uses it as a noun. In "the infants" the article makes the noun, and the adjective underneath is still an adjective, so the gloss stays true to it. Degree follows the tense rule above: a comparative or superlative form under a root takes the root's gloss, and the parse says which degree it is.

### Numerals and quantifiers

A cardinal number is bare, whatever part of speech the map files it under: ἑπτά is "seven" and δύο is "two". A number swaps into a sentence as it stands. An ordinal is an ordinary adjective, δεύτερος "to be second", and a number word that is a noun takes the noun frame, μυριάς "a ten-thousand; fig. a myriad".

A quantifier that English cannot put after "to be" is bare for the same reason: πᾶς "every, all of", ἕκαστος "each, every", μηδείς "no one, nothing", ποταπός "what kind of". A quantifier English can use after "to be" is an ordinary adjective: ὅλος "to be whole, entire", ὀλίγος "to be little, few".

These two are the only exceptions to the frame following the root's `pos`.

### Proper names

A proper name leads with its traditional English rendering. When English tradition renders the same Greek name more than one way, list them, commas between: Ἰησοῦς "Jesus, Joshua; lit. YHWH/Yahweh/Jehovah Is Salvation".

When the name's meaning is known, a `lit.` clause gives it in title case: Πέτρος "Peter; lit. Rock". Where scholars propose more than one etymology, separate them with commas. A `fig.` clause may follow for a sense the name carries beyond its literal meaning: Μωσῆς "Moses; lit. Drawing Out; fig. Rescued".

Render the divine name in a name's meaning as `YH/Yah/Jah` for the short form and `YHWH/Yahweh/Jehovah` for the full form, so every name built on it reads the same way.

The name of a people, party or office is not a proper name, even when it is capitalized. It takes the frame of its part of speech: Φαρισαῖος "a Pharisee", Ἰουδαῖος "to be Jewish".

### Established terms

Some words have a received English rendering that has become a technical term or a title of its own, usually a loanword. Lead with the received term so the reader recognizes it, and give the literal meaning in a `lit.` clause, the way a proper name does:

- γραφή "a scripture; lit. a writing"
- εὐαγγέλιον "the gospel; lit. a victorious message/news"
- κόσμος "the cosmos, world; lit. a decoration"
- διάκονος "a deacon; lit. an assistant, minister"

## Punctuation inside a clause

**Slash** joins alternatives that share the rest of the gloss, with no spaces: "to work/toil well", "a bent/folded arm", "to go out/away". It keeps a gloss short where a comma would force the shared words to repeat.

**Parentheses** comment on the English. They hold letters or words the reader may keep or drop, as in "our(s)", "to walk (around)" and "to be (made) weak". They also say which sense of an English word is meant, as in "an olive (berry or tree)" and "to engage (as in marriage)", and they carry an `i.e.` explanation of an idiom: "to work/toil well (i.e., do a good job)".

**Square brackets** comment on the Greek. They hold grammar the English does not show, as in πῶς "how? [interrogative]", and the tag that separates two near-synonyms sharing an English gloss:

- ἁγιότης "a holiness [state], sanctity, consecration, devotion"
- ἁγιωσύνη "a holiness [quality], sacredness, devoutness"

The tag goes right after the gloss the two words share. When every gloss in the clause is shared, it goes once at the end of the clause, as in τελειότης "a completion; fig. a perfection, maturity [state]".

**Curly quotation marks** set off an English idiom or a word-part rendering: ἀγαλλιάω "to jump much; fig. to “jump for joy”, ecstatically delight"; μέγας "to be great, “mega-”". Apostrophes are curly too: "to change one’s understanding".

**Exclamation and question marks** belong to exclamations and questions: "see!", "how?". A short definition has no final period.

**Capitals** follow English usage: lowercase except for proper names, named places, titles, God, and words English capitalizes, as in "a fellow Christian/Believer". The literal meaning of a proper name is in title case: small words such as "of", "a", "by", "in" and "with" stay lowercase, and every verb is capitalized, "Is" and "Will" included, as in Ἰσαάκ "Isaac; lit. Laughter, He Will Laugh".

**Spelling** is American.

## Principles of content

### Literal first

The lead gives the concrete, literal sense. Senses that grow out of it follow as `fig.`. A reader who meets the word in a figurative verse can still see the picture the figure is drawn from.

- ἀγοράζω "to go shopping; fig. to buy, purchase, redeem"
- ἀληθής "to be unconcealed; fig. to be truthful, valid"
- μετανοέω "to change one’s understanding; fig. to repent"

Leading with the literal sense only works when the word is used in that sense. Three kinds of word lead instead with the sense the reader will meet, and give the literal meaning after it in a `lit.` clause:

- Proper names and established terms, for the reasons given under each: the reader needs to recognize the word before the literal meaning helps.
- Words whose literal meaning is only etymological. The word is not used in its literal sense, so leading with it would give a sense the reader never meets in a verse:
  - ἀρετή "a vitality, vigor; lit. a manliness"
  - ἰσχύς "an ability, capability; lit. a forcefulness"
  - ὑποτάσσω "to subject, subdue; lit. to put under orders"

A `lit.` clause takes the frame like any other labeled clause, so a noun's literal meaning still opens with "a" or "an".

### Follow the etymological path

A word derived from another reuses its parent's gloss, so a family of words reads as one family:

- βάπτω "to overwhelm, immerse; fig. to dip"
- βαπτίζω "to overwhelm, immerse; fig. to ritually wash, baptize"
- βάπτισμα "a saturation, soaking; fig. a baptism"
- Βαπτιστής "a Baptizer/Baptist; lit. an overwhelmer, immerser"

The same holds for prefixes and suffixes. Render each one the same way wherever it appears, so a compound shows its parts:

| Part    | Rendering              | Example                                                           |
| ------- | ---------------------- | ----------------------------------------------------------------- |
| ἀ-      | un-, -less, without    | ἄτεκνος "to be childless"; ἀδάπανος "to be without cost/expense, free" |
| ἀνα-    | re-, up                | ἀνασταυρόω "to re-crucify"; ἀναβαίνω "to go up"                   |
| ἀπο-    | off, away, back        | ἀποθνῄσκω "to die off"; ἀποδίδωμι "to give back; fig. to pay, repay" |
| δια-    | thoroughly, through    | διαπορέω "to be thoroughly perplexed"; διέρχομαι "to go/come through, traverse" |
| εὐ-     | well                   | εὐάρεστος "to be well-pleasing"                                   |
| προ-    | pre-, before           | προορίζω "to predetermine"                                        |
| συν-    | with, together, co-    | συμπάσχω "to suffer with"; συμπρεσβύτερος "a co-elder"            |
| ὑπερ-   | super-                 | ὑπερνικάω "to super-conquer"                                      |
| -μα     | the result or product  | ἀσθένημα "a weakness; fig. a sickness"; ἀδίκημα "an unjust deed; fig. a wrong done" |
| -σις, -μός | the act or process  | ἀθέτησις "a displacement; fig. a rejection"; ἁγνισμός "a purification, cleansing" |
| -της    | the one who does it    | μεριστής "a divider"; παιδευτής "a trainer, discipliner"          |
| -ιον    | a smaller or lesser one | παιδίον "a little/young child"; δαιμόνιον "a (lesser) demon, imp" |

### Keep near-synonyms apart

Words with overlapping meanings get leads that tell them apart. A generic gloss shared by several words, a dozen entries all reading "a word" or "to love", tells the reader nothing about which word the text chose.

| Words                 | Glosses                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------- |
| ἀγαπάω, φιλέω         | "to truly/unconditionally love, cherish"; "to love (like a close friend), adore; fig. to kiss" |
| λόγος, ῥῆμα           | "a statement, message, word"; "a spoken word; fig. a personal message"                      |
| ναός, ἱερόν           | "a sanctuary"; "a temple"                                                                   |
| λίθος, πέτρα          | "a stone"; "a massive rock, solid rock mass, bedrock, cliffside, crag"                       |
| οὐ, μή                | "absolutely/definitely (do) not!"; "no, not"                                                 |
| δαίμων, δαιμόνιον     | "an archdemon, deity"; "a (lesser) demon, imp"                                               |

Where the English really has only one word for both, a square-bracket tag does the separating, as with ἁγιότης and ἁγιωσύνη above.

### Honor each part of speech

Words built on one stem but belonging to different parts of speech each get their own frame, so the family resemblance and the grammatical difference both show:

- ἀλήθεια "a truth, what is true"
- ἀληθεύω "to speak truth"
- ἀληθής "to be unconcealed; fig. to be truthful, valid"
- ἀληθῶς "truly"

Two words spelled alike are two roots, told apart by a superscript as [lexical-map.md](./lexical-map.md#how-roots-are-derived) describes, and each gets its own gloss in its own frame: μήν¹ is a particle and μήν² is "a month".

### Connect to the familiar rendering

When the accurate lead departs from the rendering readers know from traditional English Bibles, add that rendering as `trad.` so they can connect the two: ὁμοθυμαδόν "harmoniously; trad. with one accord". Leave it off when the lead already is the familiar rendering.

`trad.` is for a rendering carried over into English rather than a sense the word carries: a transliteration, as "baptize" is beside "immerse", or a word that is slightly off, as "meek" is beside "serene". A sense the word implies in use is `fig.`, even when traditional Bibles render it that way. In πλησίον "nearby; fig. neighborly", the adverb implies the person nearby, so that clause is `fig.`, not `trad.`.

## Checklist

Before adding or revising a short definition, check that it:

1. Glosses the dictionary word, with no tense, person, number, case or degree built in.
2. Opens every clause with the frame for the root's `pos`.
3. Leads with the literal sense, unless the word is a proper name, an established term, or not used in its literal sense; those lead with the sense in use and give the literal meaning as `lit.`.
4. Uses only the five labels, in order, each written `; label. `.
5. Separates the word from its near-synonyms and matches its etymological family.
6. Uses parentheses for comments on the English and square brackets for comments on the Greek.
7. Runs 50 characters or fewer, or has distinct senses or needed shades to justify more, and never passes 90.
