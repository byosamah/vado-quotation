# What changed, and what did not

Verified with `tools/compare.py`, which diffs every paragraph and every
picture box against the unpacked original. Result: **0 picture differences,
0 unexplained text differences**. The three deltas below are deliberate.

## Deliberate changes

**1. Slide 8 shows N/A for a service that is not included.**
The original file leaves every one of the eleven rows reading "Yes / نعم"
and only greys the text out. The VBA macro was meant to overwrite the
excluded ones with "N/A" but the file was saved before it ran. The Excel
Services sheet also says N/A. The rebuild writes N/A, and greys both the
name and the status together.
*Cost if wrong:* a client reads "Yes" beside a service you are not selling.

**2. Slide 12 numbers the four payments 1, 2, 3, 4.**
The original writes "1." and "4." as plain text and leaves "2." and "3." to
PowerPoint automatic numbering. Because the automatic run is broken by the
plain lines, those two can render as "1." The rebuild writes all four as
plain text, so the order is fixed.
*Cost if wrong:* a payment schedule that reads 1, 1, 1, 4.

**3. Slide 3 has the section rail on the right, like every other page.**
Slide 3 was the only page where the rail sat on the left edge. Eleven other
pages have it on the right. Confirmed with Osama on 23 Aug 2026.

**4. The salutation on slide 3 is a proper Arabic address.**
The original read `{{name_title_ar}} | {{firstname_ar}}` followed by three
tab characters and `حفظه الله,`. Three faults in one line: a template pipe
that was never removed, a first name with no family name on a document the
client may sign, and a Latin comma. It now reads
`{{name_title_ar}} {{firstname_ar}} {{lastname_ar}}`, one tab against a
declared stop, then `حفظه الله،`.

**5. The signature is bound to the name.**
`content.json` has a `signatories` block holding the name, the prefixed
name, the role, the office and the signature image as one record. A job
picks one with `"signatory": "mkm"`. Before this, changing who signs meant
editing two places, and forgetting one put Moataz's signature over somebody
else's name.

**6. The contents numbers on slide 2 are sand, not near-white.**
`#E7E6E6` on `#F2F1EE` paper is a contrast ratio of about 1.1 to 1, which
at A3 is close to invisible. Now `sand`, tunable in `theme.json` under
`contents.number_color`.

**7. The postcode was wrong on the contact page.**
The footer carried `34413` and slide 14 carried `34443`, the same building
number with a different postcode, on every proposal ever sent. `34413` is
correct, confirmed 23 Aug 2026. The address is now one record with three
format templates, so the two places compose from the same parts.

## Overlaps: a preview artefact, not a fault

An earlier version of this file listed text overlaps on slides 1, 5, 12 and
13. **Those were wrong.** They came from previewing the deck through
Keynote, which lacks Aller and GE SS Text and so reflows every text box.
Osama checked slide 1 in PowerPoint on 23 Aug 2026: no overlap.

The rule that follows: **a local preview is evidence about content, never
about layout.** Text presence, colour, table structure and shape positions
can be checked here. Line breaks, box growth and anything that depends on
font metrics cannot. Only PowerPoint with the brand fonts can settle those,
and that means asking Osama.

Slides 5, 12 and 13 were flagged on the same bad evidence and have not been
rechecked. Treat them as unknown, not as faults.

## Faults kept on purpose

* **Slides 5, 6, 7, 10, 12** indent with tab characters, not list levels.
  Change a font and the columns move.
* **Slide 8** row 2 reads "Architectural + Engineering Design" while the
  Excel form calls the same service "Engineering Design".
* **Slide 1** the English subtitle runs the client name into the project
  type with no separator: "Mr. Saud Al Dossary Residential Villa". This one
  is in the text, not the rendering.

## Things to decide when we walk through it

* **The side rail.** Only two of the eight squares are visible: the section
  you are on, and the two ends. The other six are set to inherit a fill
  that does not exist, so PowerPoint draws nothing. Is that the intent, or
  should all eight show as a progress bar?
* **Percent signs.** A value like `30%` in a right-to-left paragraph renders
  as `%30`. Decide whether the field carries the sign or the slide does.
* **The QR code** is a flat image. Replace `assets/qr-vado.png` to change
  where it points.
* **The bank details, the IBAN and the phone number** are in
  `content.json` under `company`, not in a field. They change rarely.

## What was thrown away

* `vbaProject.bin` and all five macros. `VADO_TFP_Autofill`,
  `VADO_Services_Update` and `InsertAndPositionPicture` are now what
  `build.py` does. `ProcessShape` was already dead code.
* `SpellNumberArabic` is ported to `vado/numwords.py`. Set `costwritten` to
  `"auto"` and the build spells the figure. Verified against the value the
  Excel had cached: 1,534 gives `ألف و خمسمائة و أربعة و ثلاثون`.
* The Excel workbook. `jobs/*.json` takes its place.

## Verified

| Check | Result |
|---|---|
| Opens in PowerPoint without a repair prompt | pass |
| `tools/lint_pptx.py` | 0 problems |
| Paragraph text vs the original | matches, bar the three deltas above |
| Picture positions vs the original | 13 of 13 match |
| Table columns, row heights, merges, fills | 7 of 7 tables match exactly |
| Filled build from `jobs/sample.json` | renders correctly |
| Payment total validation | rejects a split that does not reach 100 |
| Digits drawn by a GE SS face | 0 of 141 |
| Arabic paragraphs mixing scripts with no base direction | 0, and linted |

Typography was verified structurally, not visually: this Mac does not have
Aller or GE SS Text Medium / Bold installed, so the preview renders substitute
faces. Open the file on a machine with the brand fonts before sending it.
