#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["fonttools>=4.50"]
# ///
"""
Instance bundled variable fonts into static-weight TTFs.

Typst 0.14 does NOT render multiple weights from a single variable TTF —
it only sees the default weight unless the file ships STAT-named
instances at each weight, which most Google Fonts variable files don't.
A "bold" request on a variable-only font falls back, so PDF headers
render at the same weight as body text.

Fix: instantiate each variable font at the standard weights (400, 700,
optionally 500) and ship the resulting static TTFs. Typst indexes
those as separate faces of the same family and selects the right one
for each weight request.

How to use:
    uv run scripts/instance-fonts.py

The PEP 723 inline metadata above tells uv to resolve fontTools into
an ephemeral environment — no global install required.

Idempotent — re-running overwrites the statics. Add a new font by
appending an entry to JOBS and re-running.

The bundled variable file is replaced with a static set (Regular,
optionally Medium, Bold). The original variable file is deleted from
both font directories so Typst doesn't see two faces called the same
thing with conflicting metadata.
"""

from __future__ import annotations

import sys
from pathlib import Path

try:
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
except ImportError:
    sys.stderr.write(
        "fontTools is required. Install it with:\n    pip install fonttools\n"
    )
    sys.exit(1)


REPO = Path(__file__).resolve().parents[1]
APP_FONTS = REPO / "app" / "assets" / "fonts"
TAURI_FONTS = REPO / "src-tauri" / "fonts"


# (variable source filename in src-tauri/fonts/, family display name —
#  what the picker / Typst sees — file stem for the static TTFs, list
#  of (weight value, style name) instances to generate). Family name
#  and file stem are separate because filesystem-friendly stems like
#  "InterTight" need to map to the canonical display family "Inter
#  Tight" with a space.
JOBS: list[tuple[str, str, str, list[tuple[int, str]]]] = [
    ("InterVariable.ttf", "Inter",           "Inter",         [(400, "Regular"), (500, "Medium"), (700, "Bold")]),
    ("InterTight.ttf",    "Inter Tight",     "InterTight",    [(400, "Regular"), (500, "Medium"), (700, "Bold")]),
    ("Akt.ttf",           "Akt",             "Akt",           [(400, "Regular"), (500, "Medium"), (700, "Bold")]),
    ("Amarna.ttf",        "Amarna",          "Amarna",        [(400, "Regular"), (700, "Bold")]),
    ("StackSansText.ttf", "Stack Sans Text", "StackSansText", [(400, "Regular"), (700, "Bold")]),
    ("MiriamLibre.ttf",   "Miriam Libre",    "MiriamLibre",   [(400, "Regular"), (700, "Bold")]),
]

# Name-table IDs we rewrite so the instanced font reports as the right
# family / subfamily / full-name. fontTools sets some of these
# automatically but it's safer to be explicit.
NAME_FAMILY = 1
NAME_SUBFAMILY = 2
NAME_UNIQUE_ID = 3
NAME_FULL_NAME = 4
NAME_POSTSCRIPT = 6
NAME_TYPO_FAMILY = 16
NAME_TYPO_SUBFAMILY = 17


def instance_one(src: Path, family: str, stem: str, weight: int, style: str, out_paths: list[Path]) -> None:
    """Instantiate `src` at `wght=weight` and write to each path in out_paths.

    `family` is the display name written into the OpenType name table
    (e.g. "Miriam Libre"); `stem` is the filesystem-friendly file stem
    (e.g. "MiriamLibre"). Output files are `<stem>-<style>.ttf`.
    """
    print(f"  {stem}-{style}.ttf (family={family!r}, wght={weight})")
    font = TTFont(str(src))
    instance = instantiateVariableFont(font, {"wght": weight})

    full = f"{family} {style}"
    ps = full.replace(" ", "-")
    name = instance["name"]
    # Overwrite the relevant name records across all (platform, encoding,
    # language) combinations so Windows/macOS/Linux all agree.
    for record in list(name.names):
        nid = record.nameID
        if nid == NAME_FAMILY or nid == NAME_TYPO_FAMILY:
            record.string = family
        elif nid == NAME_SUBFAMILY or nid == NAME_TYPO_SUBFAMILY:
            record.string = style
        elif nid == NAME_FULL_NAME or nid == NAME_UNIQUE_ID:
            record.string = full
        elif nid == NAME_POSTSCRIPT:
            record.string = ps

    # OS/2 fsSelection / usWeightClass — set the weight bit + class.
    os2 = instance["OS/2"]
    os2.usWeightClass = weight
    if style == "Bold":
        os2.fsSelection = (os2.fsSelection & ~0b1000000) | 0b100000  # bold bit on, regular bit off
    else:
        os2.fsSelection = (os2.fsSelection & ~0b100000) | 0b1000000 if style == "Regular" else os2.fsSelection
    # head.macStyle bold flag.
    head = instance["head"]
    head.macStyle = (head.macStyle | 0b1) if style == "Bold" else (head.macStyle & ~0b1)

    for out in out_paths:
        out.parent.mkdir(parents=True, exist_ok=True)
        instance.save(str(out))


def main() -> int:
    if not TAURI_FONTS.exists():
        sys.stderr.write(f"font dir not found: {TAURI_FONTS}\n")
        return 1

    generated: list[Path] = []
    for src_name, family, stem, weights in JOBS:
        src = TAURI_FONTS / src_name
        if not src.exists():
            print(f"{family}: skipping — {src_name} not found")
            continue
        print(f"{family}:")
        for weight, style in weights:
            for out_dir in (APP_FONTS, TAURI_FONTS):
                out_path = out_dir / f"{stem}-{style}.ttf"
                instance_one(src, family, stem, weight, style, [out_path])
                generated.append(out_path)

    # Remove the now-obsolete variable source files. The statics carry
    # the same family name, so leaving the variable in place would let
    # Typst pick it (single-weight) instead of the statics.
    for src_name, _family, _stem, _w in JOBS:
        for d in (APP_FONTS, TAURI_FONTS):
            old = d / src_name
            if old.exists():
                print(f"removing {old.relative_to(REPO)}")
                old.unlink()

    print(f"\nDone — wrote {len(generated)} static TTFs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
