# Sakoram

A single-user desktop bookkeeper for a Sri Lankan business: quotes, invoices,
bills, vouchers, payroll and letters, rendered as printable PDFs.

## Language

### PDF appearance

**Stationery**:
The business's printed identity on every PDF page — what is drawn around the
content, and which areas of the page the content must stay out of. One per
business, shared by every document type.
_Avoid_: Letterhead (one kind of stationery, not the concept), template, theme

**Stationery mode**:
Which kind of Stationery the business uses: **Built-in**, **Full-page
background**, **Header & footer images**, or **Pre-printed paper**. Exactly
one is active.

**Built-in stationery**:
The app draws the business identity itself from the logo, header text and
footer text. The default for a business with no artwork of its own.

**Full-page background**:
Stationery that is a single page-sized artwork drawn behind the content.

**Header & footer images**:
Stationery made of two separate artworks, one pinned to the top of the page
and one to the bottom, each positioned and sized independently.

**Pre-printed paper**:
Stationery where nothing is printed — the business prints onto paper that
already carries its letterhead, so only the blank bands are reserved.
_Avoid_: Letterhead template, pre-printed mode

**Safe area**:
The part of the page the document content may occupy, bounded by the
Stationery's four margins. Stationery artwork owns everything outside it.
_Avoid_: Content area, printable area

**Reserved band**:
The strip between a page edge and the Safe area — at the top or bottom —
that the content never enters.
_Avoid_: Header zone, dead zone

**Paper size**:
The sheet every PDF of the business is laid out on (A4, A5, US Letter or US
Legal). One per business; Stationery artwork is prepared for it.
_Avoid_: Page size, page format

**Layout**:
How a document's own content (title, details block, line table, totals) is
arranged inside the Safe area. A choice only under Built-in stationery; every
other Stationery mode uses Classic, because the artwork or the printed paper is
the design.
_Avoid_: Template (the old word for Layout + Stationery combined)
