//! Local key-minting tool (NOT bundled into the app). Shares the payload
//! format with the app via `sakoram_billing_lib::license`.
//!
//!   cargo run --bin mint_license -- keygen --out ~/.sakoram/license-signing.key
//!   cargo run --bin mint_license -- mint --tier premium --name "Acme" \
//!       --email "o@acme.lk" --license-id 1042 [--out acme.lic]
//!
//! The private key lives ONLY on your machine (the --out file or the
//! SAKORAM_LICENSE_PRIVATE_KEY env var, hex). Never commit it. The PUBLIC key
//! printed by `keygen` goes into EMBEDDED_PUBLIC_KEY in src/license.rs.

use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use ed25519_dalek::SigningKey;
use rand_core::OsRng;
use sakoram_billing_lib::license::{encode_key, Payload, TIER_PLUS, TIER_PREMIUM};

fn args() -> (String, HashMap<String, String>) {
    let mut a = std::env::args().skip(1);
    let cmd = a.next().unwrap_or_default();
    let mut map = HashMap::new();
    while let Some(flag) = a.next() {
        if let Some(name) = flag.strip_prefix("--") {
            map.insert(name.to_string(), a.next().unwrap_or_default());
        }
    }
    (cmd, map)
}

fn read_private_key(opts: &HashMap<String, String>) -> SigningKey {
    let hex = if let Some(path) = opts.get("key-file") {
        std::fs::read_to_string(path).expect("read key-file").trim().to_string()
    } else {
        std::env::var("SAKORAM_LICENSE_PRIVATE_KEY")
            .expect("set SAKORAM_LICENSE_PRIVATE_KEY or pass --key-file")
            .trim().to_string()
    };
    let bytes = hex_decode(&hex).expect("private key must be 64 hex chars");
    SigningKey::from_bytes(&bytes.try_into().expect("32-byte key"))
}

fn hex_decode(s: &str) -> Result<Vec<u8>, ()> {
    if s.len() % 2 != 0 { return Err(()); }
    (0..s.len()).step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| ()))
        .collect()
}
fn hex_encode(b: &[u8]) -> String {
    b.iter().map(|x| format!("{:02x}", x)).collect()
}

fn main() {
    let (cmd, opts) = args();
    match cmd.as_str() {
        "keygen" => {
            let sk = SigningKey::generate(&mut OsRng);
            let vk = sk.verifying_key();
            let priv_hex = hex_encode(&sk.to_bytes());
            if let Some(out) = opts.get("out") {
                std::fs::write(out, &priv_hex).expect("write key");
                println!("Private key written to {out} (NEVER commit this).");
            } else {
                println!("PRIVATE (save securely, never commit):\n{priv_hex}");
            }
            println!("\nPUBLIC key — paste into EMBEDDED_PUBLIC_KEY in src/license.rs:\n{}",
                     hex_encode(&vk.to_bytes()));
        }
        "mint" => {
            let sk = read_private_key(&opts);
            let tier = match opts.get("tier").map(String::as_str) {
                Some("plus") => TIER_PLUS,
                Some("premium") => TIER_PREMIUM,
                _ => panic!("--tier must be plus|premium"),
            };
            let issued_days = (SystemTime::now().duration_since(UNIX_EPOCH)
                .unwrap().as_secs() / 86_400) as u32;
            let payload = Payload {
                tier,
                license_id: opts.get("license-id").and_then(|s| s.parse().ok()).unwrap_or(0),
                issued_days,
                name: opts.get("name").cloned().unwrap_or_default(),
                email: opts.get("email").cloned().unwrap_or_default(),
            };
            let key = encode_key(&payload, &sk);
            println!("Key:\n{key}");
            if let Some(out) = opts.get("out") {
                std::fs::write(out, &key).expect("write .lic");
                println!("\nFile: {out}");
            }
        }
        _ => eprintln!("usage: mint_license <keygen|mint> [--flags]"),
    }
}
