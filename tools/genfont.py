#!/usr/bin/env python3
"""
Build the two bundled woff2 files from upstream Pixelify Sans.

Why this exists: the released Pixelify Sans has no U+041E (О) and no
U+041F (П). Those are two of the commonest capitals in Russian, so without
them the browser silently swaps in a system serif mid-word and the UI looks
broken. The font also has no arrow, check or star, which we use as UI marks.

Rather than redraw anything by hand, each addition is derived from a glyph
that is already in the font, so it keeps the original proportions and its
weight-axis variation:

  О  is the Latin O outline, copied across with its gvar deltas. In this
     design the two are the same shape.
  П  is п raised from x-height to cap height. The two have an identical
     point structure - two stems joined by a bar - so the deltas carry over
     unchanged.
  → ✔ ★ are drawn as pixel bitmaps on the font's own grid. They are
     decorative and never appear in bold text, so they carry no
     variation data.

The result is a derivative work, so the internal family name is changed.
See ASSET_LICENSES.md.

    pip install fonttools brotli
    python3 tools/genfont.py

Needs network access to fonts.gstatic.com. The .woff2 files are committed,
so an ordinary build never runs this.
"""
import os
import sys
import urllib.request

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphCoordinates
from fontTools.ttLib.tables.TupleVariation import TupleVariation
from fontTools.pens.ttGlyphPen import TTGlyphPen

# The woff2 subsets Google Fonts serves for this family. Their unicode
# coverage is what src/ui/style.css declares in its unicode-range rules.
SOURCES = {
    "latin": ("https://fonts.gstatic.com/s/pixelifysans/v3/"
              "CHylV-3HFUT7aC4iv1TxGDR9Jn0Eiw.woff2"),
    "cyrillic": ("https://fonts.gstatic.com/s/pixelifysans/v3/"
                 "CHylV-3HFUT7aC4iv1TxGDR9JnkEi1lR.woff2"),
}
OUT_DIR = "public/fonts"

# Only ever seen inside the file; the CSS calls the family 'Pixelify'.
FAMILY = "Sparkscrapper Pixel"

# п sits at x-height and П at cap height. Both are 631 - 450 apart.
X_HEIGHT, CAP_HEIGHT = 450, 631
RAISE = CAP_HEIGHT - X_HEIGHT

# The alphabet occupies x 60..525. A 7-cell grid of 66 units fills that box.
# Caps run -12..631, so centring the block on y=310 puts the marks on the
# same optical line as the letters.
CELL, MARK_X0, MARK_Y0 = 66, 60, 79

MARKS = {
    0x2192: [  # arrow, used in the before/after comparison on the panel
        ".......",
        "....#..",
        ".....#.",
        "#######",
        ".....#.",
        "....#..",
        ".......",
    ],
    0x2714: [  # check, marks a completed contract
        ".......",
        "......#",
        ".....#.",
        "#...#..",
        ".#.#...",
        "..#....",
        ".......",
    ],
    0x2605: [  # star, shows contract tier
        "...#...",
        "..###..",
        "#######",
        ".#####.",
        "..###..",
        ".##.##.",
        ".#...#.",
    ],
}


def fetch(name, url):
    path = f"/tmp/pixelify-{name}.woff2"
    if not os.path.exists(path):
        print(f"  downloading {name}")
        urllib.request.urlretrieve(url, path)
    font = TTFont(path)
    # These tables decompile against the glyph order, so they have to be
    # read before any glyph is appended to it.
    for tag in ("glyf", "gvar", "hmtx", "cmap", "name"):
        font[tag]
    return font


def copy_glyph(src_font, glyph_name):
    """Deep-copy an outline so edits never touch the source glyph."""
    src = src_font["glyf"][glyph_name]
    out = Glyph()
    out.numberOfContours = src.numberOfContours
    out.coordinates = GlyphCoordinates(src.coordinates)
    out.flags = bytearray(src.flags)
    out.endPtsOfContours = list(src.endPtsOfContours)
    out.program = src.program
    return out


def copy_variations(src_font, glyph_name):
    return [TupleVariation(dict(v.axes), list(v.coordinates))
            for v in src_font["gvar"].variations.get(glyph_name, [])]


def pixel_glyph(rows):
    """
    Turn a bitmap into rectangles, one per horizontal run of ink.

    Rows read top-down; '#' is ink. Runs are merged horizontally but never
    vertically: fusing stacked runs would weld an arrowhead's two barbs into
    a single stroke and quietly change the shape. Every rectangle is wound
    the same way, so where they abut the fill joins cleanly.
    """
    height = len(rows)
    width = max(len(r) for r in rows)
    pen = TTGlyphPen(None)
    for y, row in enumerate(rows):
        row = row.ljust(width)
        x = 0
        while x < width:
            if row[x] != "#":
                x += 1
                continue
            end = x
            while end < width and row[end] == "#":
                end += 1
            # Bitmap rows go down the page; glyph coordinates go up.
            x0 = MARK_X0 + x * CELL
            x1 = MARK_X0 + end * CELL
            y0 = MARK_Y0 + (height - 1 - y) * CELL
            y1 = y0 + CELL
            pen.moveTo((x0, y0))
            pen.lineTo((x0, y1))
            pen.lineTo((x1, y1))
            pen.lineTo((x1, y0))
            pen.closePath()
            x = end
    return pen.glyph()


def add_glyph(font, codepoint, name, glyph, advance, variations):
    glyph.recalcBounds(font["glyf"])
    font["glyf"].glyphs[name] = glyph
    font["hmtx"].metrics[name] = (advance, glyph.xMin)
    order = font.getGlyphOrder()
    if name not in order:
        font.setGlyphOrder(list(order) + [name])
        font["glyf"].glyphOrder = font.getGlyphOrder()
    if variations:
        font["gvar"].variations[name] = variations
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[codepoint] = name
    print(f"    added U+{codepoint:04X} {chr(codepoint)} -> {name}")


def rename(font):
    """Mark the file as a derivative rather than the original release."""
    for rec in font["name"].names:
        if rec.nameID in (1, 3, 4, 6, 16):
            text = rec.toUnicode()
            text = text.replace("PixelifySans", FAMILY.replace(" ", ""))
            text = text.replace("Pixelify Sans", FAMILY)
            rec.string = text
    font["name"].setName(
        "Derived from Pixelify Sans by The Pixelify Sans Project Authors, "
        "SIL Open Font License 1.1. Added U+041E, U+041F, U+2192, U+2605, "
        "U+2714; renamed to distinguish it from the original release.",
        10, 3, 1, 0x409)


def main():
    print("reading upstream subsets")
    latin = fetch("latin", SOURCES["latin"])
    cyrillic = fetch("cyrillic", SOURCES["cyrillic"])

    latin_cmap = latin.getBestCmap()
    cyrillic_cmap = cyrillic.getBestCmap()
    advance = cyrillic["hmtx"][cyrillic_cmap[ord("Н")]][0]

    print("  patching the cyrillic subset")

    # О — the Latin O outline, brought across with its variation data.
    o_name = latin_cmap[ord("O")]
    add_glyph(cyrillic, 0x041E, "uni041E",
              copy_glyph(latin, o_name),
              latin["hmtx"][o_name][0],
              copy_variations(latin, o_name))

    # П — п lifted from x-height to cap height. Same points, same deltas.
    pe_name = cyrillic_cmap[ord("п")]
    pe = copy_glyph(cyrillic, pe_name)
    pe.coordinates = GlyphCoordinates(
        [(x, y + RAISE if y >= X_HEIGHT - 100 else y) for x, y in pe.coordinates])
    add_glyph(cyrillic, 0x041F, "uni041F", pe, advance,
              copy_variations(cyrillic, pe_name))

    for codepoint, rows in MARKS.items():
        add_glyph(cyrillic, codepoint, f"uni{codepoint:04X}",
                  pixel_glyph(rows), advance, [])

    os.makedirs(OUT_DIR, exist_ok=True)
    for name, font in (("latin", latin), ("cyrillic", cyrillic)):
        rename(font)
        font.flavor = "woff2"
        path = os.path.join(OUT_DIR, f"pixelify-{name}.woff2")
        font.save(path)
        print(f"  wrote {path} ({os.path.getsize(path)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
