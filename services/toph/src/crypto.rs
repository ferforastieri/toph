use std::fs;
use std::path::Path;

use aes_gcm::aead::{Aead, KeyInit, OsRng};
use aes_gcm::{AeadCore, Aes256Gcm, Nonce};
use anyhow::{Context, Result};
use base64::engine::general_purpose::{STANDARD_NO_PAD, URL_SAFE_NO_PAD};
use base64::Engine;
use rand::RngCore;
use sha2::{Digest, Sha256};

pub fn load_or_create_key(path: &Path) -> Result<Vec<u8>> {
    if let Ok(data) = fs::read(path) {
        if data.len() != 32 {
            anyhow::bail!("master key {} must be 32 bytes", path.display());
        }
        return Ok(data);
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut key = vec![0u8; 32];
    OsRng.fill_bytes(&mut key);
    fs::write(path, &key)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    Ok(key)
}

pub fn encrypt(key: &[u8], value: &str) -> Result<String> {
    if value.is_empty() {
        return Ok(String::new());
    }
    let cipher = Aes256Gcm::new_from_slice(key).context("invalid encryption key")?;
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, value.as_bytes())
        .map_err(|_| anyhow::anyhow!("encrypt failed"))?;
    let mut payload = nonce.to_vec();
    payload.extend_from_slice(&ciphertext);
    Ok(STANDARD_NO_PAD.encode(payload))
}

pub fn decrypt(key: &[u8], value: &str) -> Result<String> {
    if value.is_empty() {
        return Ok(String::new());
    }
    let data = STANDARD_NO_PAD
        .decode(value)
        .context("invalid encrypted value")?;
    if data.len() < 12 {
        anyhow::bail!("invalid encrypted value");
    }
    let cipher = Aes256Gcm::new_from_slice(key).context("invalid encryption key")?;
    let nonce = Nonce::from_slice(&data[..12]);
    let plain = cipher
        .decrypt(nonce, &data[12..])
        .map_err(|_| anyhow::anyhow!("decrypt failed"))?;
    String::from_utf8(plain).context("invalid utf-8")
}

pub fn random_secret(bytes: usize) -> String {
    let mut data = vec![0u8; bytes];
    OsRng.fill_bytes(&mut data);
    URL_SAFE_NO_PAD.encode(data)
}

pub fn token_hash(raw: &str) -> String {
    hex::encode(Sha256::digest(raw.as_bytes()))
}

pub fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

pub fn new_id() -> String {
    random_secret(12)
}
