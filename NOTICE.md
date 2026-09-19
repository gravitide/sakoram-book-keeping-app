# Sakoram — copyright and licence notice

**Sakoram — The desktop bookkeeper!**
Copyright (C) 2026 Gravitide · <hello@gravitide.com> · <https://gravitide.dev>

This program is free software: you can redistribute it and/or modify it under
the terms of the **GNU General Public License, version 3**, as published by the
Free Software Foundation.

This program is distributed in the hope that it will be useful, but **WITHOUT
ANY WARRANTY**; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

The full licence text is in [`LICENSE`](./LICENSE). If it is missing, see
<https://www.gnu.org/licenses/gpl-3.0.html>.

SPDX identifier: `GPL-3.0-only`

## What this means in practice

- You may use Sakoram for anything, including running a business's books, free
  of charge.
- You may study it, change it, and share it — changed or unchanged.
- If you distribute it, changed or not, you must pass on these same freedoms:
  ship this notice and the licence, and make the **complete corresponding
  source code** of what you distribute available under the GPL v3. A closed or
  proprietary version is not permitted.
- You must mark a modified version as changed, so its problems are not
  attributed to Gravitide.
- There is no warranty and no liability, to the extent the law allows.

## The name and the logo are not part of the licence

"Sakoram", the Sakoram wordmark and the Sakoram icon are trademarks of
Gravitide. The GPL grants rights in the **code**, not in the **brand**. A
modified version must use a different name and different logos — see
[`TRADEMARKS.md`](./TRADEMARKS.md).

## Third-party material

### Nuxtor project template — MIT

The initial project scaffold was generated from
[Nuxtor](https://github.com/NicolaSpadari/nuxtor). The portions that remain are
used under the MIT License, whose notice must be preserved:

```
MIT License

Copyright (c) 2024 Nicola Spadari<https://github.com/NicolaSpadari>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Bundled fonts — SIL Open Font License 1.1

The font families shipped in `app/assets/fonts/` and `src-tauri/fonts/` remain
under the SIL OFL 1.1, **not** the GPL. Their copyright notices and the licence
are in [`src-tauri/fonts/OFL.txt`](./src-tauri/fonts/OFL.txt) and are shown
in-app under **About → Fonts & licences**.

### Typst — Apache License 2.0

Release installers bundle an unmodified [Typst](https://github.com/typst/typst)
command-line binary, which Sakoram runs as a separate program to render PDFs.
Typst is licensed under the Apache License 2.0 and is not part of this
program's source.

### Libraries

Sakoram is built on Tauri, Nuxt, Vue, NuxtUI, PrimeVue, TipTap, sqlx, qpdf and
many other open-source libraries, each under its own licence — MIT, Apache-2.0,
BSD, ISC, MPL-2.0 and similar, all compatible with the GPL v3. They are listed
in `package.json` / `bun.lock` and `src-tauri/Cargo.toml` / `Cargo.lock`.
