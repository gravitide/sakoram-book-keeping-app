#!/usr/bin/env bash
# Mint a Sakoram license key — a friendly wrapper around
# `cargo run --bin mint_license -- mint`.
#
# Reads the private signing key from ~/.sakoram/license-signing.key (override
# with --key-file or $SAKORAM_LICENSE_KEY_FILE). Auto-assigns the next license
# id and appends a row to a CSV ledger so you have a record of every key sold.
# The key file + ledger live under ~/.sakoram (outside the repo, never committed).
#
# Usage:
#   scripts/mint-license.sh                              # fully interactive
#   scripts/mint-license.sh premium "Acme (Pvt) Ltd" owner@acme.lk
#   scripts/mint-license.sh plus "Foo Co" foo@x.lk 1042 # explicit license id
#   scripts/mint-license.sh --out acme.lic premium "Acme" owner@acme.lk
#
# First time only — generate your signing keypair (then paste the printed
# PUBLIC key into EMBEDDED_PUBLIC_KEY in src-tauri/src/license.rs):
#   (cd src-tauri && cargo run --bin mint_license -- keygen --out ~/.sakoram/license-signing.key)
set -euo pipefail

SAKORAM_DIR="${SAKORAM_DIR:-$HOME/.sakoram}"
KEY_FILE="${SAKORAM_LICENSE_KEY_FILE:-$SAKORAM_DIR/license-signing.key}"
ID_FILE="$SAKORAM_DIR/last-license-id"
LEDGER="$SAKORAM_DIR/licenses.csv"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

OUT=""
POSITIONAL=()
while [[ $# -gt 0 ]]; do
	case "$1" in
		--out) OUT="$2"; shift 2 ;;
		--key-file) KEY_FILE="$2"; shift 2 ;;
		-h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
		-*) echo "error: unknown flag $1" >&2; exit 1 ;;
		*) POSITIONAL+=("$1"); shift ;;
	esac
done

TIER="${POSITIONAL[0]:-}"
NAME="${POSITIONAL[1]:-}"
EMAIL="${POSITIONAL[2]:-}"
LICENSE_ID="${POSITIONAL[3]:-}"

# Prompt for anything not supplied on the command line.
[[ -n "$TIER" ]]  || read -rp "Tier (plus/premium): " TIER
[[ -n "$NAME" ]]  || read -rp "Buyer name: " NAME
[[ -n "$EMAIL" ]] || read -rp "Buyer email: " EMAIL

# Validate.
case "$TIER" in
	plus|premium) ;;
	*) echo "error: tier must be 'plus' or 'premium' (got '$TIER')" >&2; exit 1 ;;
esac
[[ -n "$NAME" ]]  || { echo "error: buyer name is required" >&2; exit 1; }
[[ -n "$EMAIL" ]] || { echo "error: buyer email is required" >&2; exit 1; }
if [[ ! -f "$KEY_FILE" ]]; then
	echo "error: signing key not found at $KEY_FILE" >&2
	echo "Generate one first:" >&2
	echo "  (cd \"$REPO_ROOT/src-tauri\" && cargo run --bin mint_license -- keygen --out \"$KEY_FILE\")" >&2
	exit 1
fi

# Auto-assign the next license id if none was given.
if [[ -z "$LICENSE_ID" ]]; then
	last="$(cat "$ID_FILE" 2>/dev/null || echo 1000)"
	LICENSE_ID=$(( last + 1 ))
fi
[[ "$LICENSE_ID" =~ ^[0-9]+$ ]] || { echo "error: license id must be a number (got '$LICENSE_ID')" >&2; exit 1; }

echo "Minting ${TIER} key #${LICENSE_ID} for ${NAME} <${EMAIL}> ..." >&2

mint_args=(mint --tier "$TIER" --name "$NAME" --email "$EMAIL" --license-id "$LICENSE_ID" --key-file "$KEY_FILE")
[[ -n "$OUT" ]] && mint_args+=(--out "$OUT")

# Run the Rust tool from the crate dir; capture stdout (the key).
key_output="$(cd "$REPO_ROOT/src-tauri" && cargo run --quiet --bin mint_license -- "${mint_args[@]}")"
echo "$key_output"

# Record-keeping (only reached on success). Bump the id counter + ledger.
mkdir -p "$SAKORAM_DIR"
echo "$LICENSE_ID" > "$ID_FILE"
if [[ ! -f "$LEDGER" ]]; then
	echo "license_id,tier,name,email,issued_at" > "$LEDGER"
fi
csv() { printf '"%s"' "${1//\"/\"\"}"; }
echo "${LICENSE_ID},${TIER},$(csv "$NAME"),$(csv "$EMAIL"),$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LEDGER"
echo "Recorded license #${LICENSE_ID} in ${LEDGER}" >&2
