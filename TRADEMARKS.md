# Sakoram trademark policy

"**Sakoram**", the tagline "**Sakoram — The desktop bookkeeper!**", the Sakoram
wordmark and the Sakoram icon (together, the "Marks") are trademarks of
**Gravitide**.

Sakoram's source code is free software under the GNU GPL v3 (see
[`LICENSE`](./LICENSE) and [`NOTICE.md`](./NOTICE.md)). That licence covers the
**code**. It does **not** grant any right to use the Marks — the GPL says so
itself. This policy explains what you may do with them.

The point is simple: when someone installs something called "Sakoram", they
should be getting the app Gravitide publishes — not a modified copy that handles
their financial records differently.

## You may, without asking

- Use the name "Sakoram" to **refer to** the project truthfully — in articles,
  reviews, tutorials, talks, comparisons, or a list of software you use.
- Say that your software is "based on Sakoram", "a fork of Sakoram" or
  "compatible with Sakoram", as long as that is true and it is clear your
  project is not the official one and is not endorsed by Gravitide.
- Redistribute the **unmodified** official installers under the Sakoram name.
- Build Sakoram from unmodified source for your own use and call it Sakoram.

## You may not, without written permission

- Distribute a **modified** version under the name "Sakoram", or under a name
  confusingly similar to it.
- Use the Sakoram wordmark or icon for a modified version, or for any other
  product, service, company or domain name.
- Sell or promote a product or service in a way that suggests it comes from, or
  is endorsed by, Gravitide or the Sakoram project.

## If you fork Sakoram

You are welcome to — that is what the GPL is for. Before you distribute your
version:

1. **Rename it.** Change `productName` in `src-tauri/tauri.conf.json`, the
   window titles, and the in-app name.
2. **Replace the logos** — `app/assets/sakoram-icon.svg`,
   `app/assets/sakoram-wordmark.svg`, the files in `src-tauri/icons/`, and the
   brand assets in `docs/`.
3. **Change the bundle identifier** (`com.sakoram.billing`) so your build does
   not read or overwrite a Sakoram user's data.
4. Keep the copyright and licence notices intact, state that your version is
   modified, and publish its source under the GPL v3.

## Questions and permission

Write to <hello@gravitide.com>.

Gravitide may update this policy; the version in the `main` branch of the
official repository is the current one.
