//! Native email account settings and IMAP/SMTP operations.
//!
//! Accounts are stored globally in the `email_accounts` setting. Only public
//! metadata is returned by the API; passwords are encrypted with the same
//! AES-GCM master key used by the AI and database services. Mail operations
//! run through a small standard-library Python helper so the Rust server does
//! not need an IMAP/SMTP client dependency. The helper receives its request as
//! JSON on stdin, which keeps credentials out of the process command line.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Value};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;
use tokio::sync::Mutex;

use crate::crypto::{decrypt, encrypt, load_or_create_key, new_id};
use crate::errors::{bad_request, AppError, AppResult};
use crate::store::Store;

const SETTING_KEY: &str = "email_accounts";
const HELPER_FILE: &str = "email_helper.py";
const HELPER_SOURCE: &str = include_str!("email_helper.py");
const HELPER_TIMEOUT: Duration = Duration::from_secs(90);
pub const DEFAULT_LIST_LIMIT: usize = 20;
const MAX_LIST_LIMIT: usize = 100;
const MAX_TEXT_BYTES: usize = 400_000;
const MAX_SUBJECT_CHARS: usize = 1_000;
const MAX_ADDRESS_BYTES: usize = 32_000;
const MAX_NAME_CHARS: usize = 200;

#[derive(Clone)]
pub struct EmailService {
    store: Store,
    key: Vec<u8>,
    helper_path: PathBuf,
    write_lock: Arc<Mutex<()>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredServer {
    host: String,
    port: u16,
    user: String,
    #[serde(default)]
    security: String,
    #[serde(default)]
    password_enc: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredAccount {
    id: String,
    name: String,
    email: String,
    #[serde(default)]
    from_name: String,
    imap: StoredServer,
    smtp: StoredServer,
    created_at: String,
}

/// Account representation returned by the API. Passwords are never included.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicAccount {
    pub id: String,
    pub name: String,
    pub email: String,
    pub from_name: String,
    pub imap_host: String,
    pub imap_port: u16,
    pub imap_user: String,
    pub imap_tls: bool,
    pub imap_security: String,
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_user: String,
    pub smtp_tls: bool,
    pub smtp_security: String,
    pub created_at: String,
}

impl From<&StoredAccount> for PublicAccount {
    fn from(account: &StoredAccount) -> Self {
        Self {
            id: account.id.clone(),
            name: account.name.clone(),
            email: account.email.clone(),
            from_name: account.from_name.clone(),
            imap_host: account.imap.host.clone(),
            imap_port: account.imap.port,
            imap_user: account.imap.user.clone(),
            imap_tls: account.imap.security != "none",
            imap_security: account.imap.security.clone(),
            smtp_host: account.smtp.host.clone(),
            smtp_port: account.smtp.port,
            smtp_user: account.smtp.user.clone(),
            smtp_tls: account.smtp.security != "none",
            smtp_security: account.smtp.security.clone(),
            created_at: account.created_at.clone(),
        }
    }
}

/// Flat account input used by the web client.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountInput {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub from_name: String,
    /// Nested IMAP settings are also accepted for API clients that prefer
    /// grouping host/port/user/password/tls.
    #[serde(default)]
    pub imap: Option<MailServerInput>,
    #[serde(default)]
    pub smtp: Option<MailServerInput>,
    #[serde(default)]
    pub imap_host: String,
    #[serde(default)]
    pub imap_port: Option<u16>,
    #[serde(default)]
    pub imap_user: String,
    #[serde(default)]
    pub imap_password: String,
    #[serde(default)]
    pub imap_tls: Option<TlsFlag>,
    #[serde(default)]
    pub imap_security: String,
    #[serde(default)]
    pub smtp_host: String,
    #[serde(default)]
    pub smtp_port: Option<u16>,
    #[serde(default)]
    pub smtp_user: String,
    #[serde(default)]
    pub smtp_password: String,
    #[serde(default)]
    pub smtp_tls: Option<TlsFlag>,
    #[serde(default)]
    pub smtp_security: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailServerInput {
    #[serde(default)]
    pub host: String,
    #[serde(default)]
    pub port: Option<u16>,
    #[serde(default)]
    pub user: String,
    #[serde(default)]
    pub password: String,
    /// `true` means implicit TLS, `false` means no TLS. Use `security` or a
    /// string value such as `"starttls"` when STARTTLS is required.
    #[serde(default)]
    pub tls: Option<TlsFlag>,
    #[serde(default)]
    pub security: String,
}

impl MailServerInput {
    fn is_present(&self) -> bool {
        !self.host.trim().is_empty()
            || self.port.is_some()
            || !self.user.trim().is_empty()
            || !self.password.is_empty()
            || self.tls.is_some()
            || !self.security.trim().is_empty()
    }
}

/// Accepts both the boolean `imapTls`/`smtpTls` used by the web client and
/// string values such as `"ssl"`, `"starttls"` or `"none"`.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum TlsFlag {
    Bool(bool),
    Text(String),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendInput {
    #[serde(default, deserialize_with = "deserialize_addresses")]
    pub to: String,
    #[serde(default, deserialize_with = "deserialize_addresses")]
    pub cc: String,
    #[serde(default, deserialize_with = "deserialize_addresses")]
    pub bcc: String,
    #[serde(default)]
    pub subject: String,
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub in_reply_to: String,
}

/// Address fields accept either the comma-separated string used by the web
/// client or a JSON array of addresses. `null` becomes an empty string.
fn deserialize_addresses<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Addresses {
        Text(String),
        List(Vec<String>),
    }

    Ok(match Option::<Addresses>::deserialize(deserializer)? {
        Some(Addresses::Text(value)) => value,
        Some(Addresses::List(values)) => values.join(", "),
        None => String::new(),
    })
}

struct ResolvedServer {
    host: String,
    port: u16,
    user: String,
    password: String,
    security: String,
}

struct ResolvedAccount {
    name: String,
    email: String,
    from_name: String,
    imap: ResolvedServer,
    smtp: ResolvedServer,
}

struct AccountCredentials {
    account: StoredAccount,
    imap_password: String,
    smtp_password: String,
}

impl EmailService {
    pub fn new(store: Store, data_dir: &Path, key_file: &Path) -> AppResult<Self> {
        let helper_path = data_dir.join(HELPER_FILE);
        install_helper(&helper_path)?;
        Ok(Self {
            store,
            key: load_or_create_key(key_file)?,
            helper_path,
            write_lock: Arc::new(Mutex::new(())),
        })
    }

    pub async fn list(&self) -> AppResult<Vec<PublicAccount>> {
        Ok(self
            .accounts()
            .await?
            .iter()
            .map(PublicAccount::from)
            .collect())
    }

    pub async fn create(&self, input: AccountInput) -> AppResult<PublicAccount> {
        let resolved = input.resolve()?;
        let _guard = self.write_lock.lock().await;
        let mut accounts = self.accounts().await?;
        if accounts
            .iter()
            .any(|account| account.email.eq_ignore_ascii_case(&resolved.email))
        {
            return Err(AppError::Conflict);
        }

        let account = StoredAccount {
            id: new_id(),
            name: resolved.name,
            email: resolved.email,
            from_name: resolved.from_name,
            imap: StoredServer {
                host: resolved.imap.host,
                port: resolved.imap.port,
                user: resolved.imap.user,
                security: resolved.imap.security,
                password_enc: encrypt(&self.key, &resolved.imap.password)?,
            },
            smtp: StoredServer {
                host: resolved.smtp.host,
                port: resolved.smtp.port,
                user: resolved.smtp.user,
                security: resolved.smtp.security,
                password_enc: encrypt(&self.key, &resolved.smtp.password)?,
            },
            created_at: Utc::now().to_rfc3339(),
        };
        accounts.push(account.clone());
        self.save_accounts(&accounts).await?;
        Ok(PublicAccount::from(&account))
    }

    pub async fn delete(&self, id: &str) -> AppResult<()> {
        let _guard = self.write_lock.lock().await;
        let mut accounts = self.accounts().await?;
        let before = accounts.len();
        accounts.retain(|account| account.id != id);
        if accounts.len() == before {
            return Err(AppError::NotFound);
        }
        self.save_accounts(&accounts).await
    }

    pub async fn test(&self, id: &str) -> AppResult<Value> {
        let credentials = self.credentials(id).await?;
        self.call(self.request("test", &credentials), HELPER_TIMEOUT)
            .await
    }

    pub async fn messages(&self, id: &str, limit: usize) -> AppResult<Vec<Value>> {
        let limit = limit.clamp(1, MAX_LIST_LIMIT);
        let credentials = self.credentials(id).await?;
        let mut payload = self.request("list", &credentials);
        payload["limit"] = json!(limit);
        let result = self.call(payload, HELPER_TIMEOUT).await?;
        Ok(result
            .get("messages")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default())
    }

    pub async fn message(&self, id: &str, uid: &str) -> AppResult<Value> {
        validate_uid(uid)?;
        let credentials = self.credentials(id).await?;
        let mut payload = self.request("read", &credentials);
        payload["uid"] = json!(uid);
        let result = self.call(payload, HELPER_TIMEOUT).await?;
        result
            .get("message")
            .cloned()
            .ok_or_else(|| crate::errors::internal("email helper returned no message"))
    }

    pub async fn delete_message(&self, id: &str, uid: &str) -> AppResult<Value> {
        validate_uid(uid)?;
        let credentials = self.credentials(id).await?;
        let mut payload = self.request("delete", &credentials);
        payload["uid"] = json!(uid);
        self.call(payload, HELPER_TIMEOUT).await
    }

    pub async fn send(&self, id: &str, input: SendInput) -> AppResult<Value> {
        validate_send(&input)?;
        let credentials = self.credentials(id).await?;
        let mut payload = self.request("send", &credentials);
        payload["message"] = json!({
            "to": input.to,
            "cc": input.cc,
            "bcc": input.bcc,
            "subject": input.subject,
            "text": input.text,
            "inReplyTo": input.in_reply_to,
        });
        self.call(payload, HELPER_TIMEOUT).await
    }

    async fn accounts(&self) -> AppResult<Vec<StoredAccount>> {
        let raw = match self.store.setting(SETTING_KEY).await {
            Ok(raw) => raw,
            Err(AppError::NotFound) => return Ok(Vec::new()),
            Err(error) => return Err(error),
        };
        if raw.trim().is_empty() {
            return Ok(Vec::new());
        }
        serde_json::from_str(&raw)
            .map_err(|_| crate::errors::internal("invalid email accounts setting"))
    }

    async fn save_accounts(&self, accounts: &[StoredAccount]) -> AppResult<()> {
        let raw = serde_json::to_string(accounts)
            .map_err(|error| crate::errors::internal(error.to_string()))?;
        self.store.set_setting(SETTING_KEY, &raw).await
    }

    async fn credentials(&self, id: &str) -> AppResult<AccountCredentials> {
        let account = self
            .accounts()
            .await?
            .into_iter()
            .find(|account| account.id == id)
            .ok_or(AppError::NotFound)?;
        let imap_password = decrypt(&self.key, &account.imap.password_enc)?;
        let smtp_password = decrypt(&self.key, &account.smtp.password_enc)?;
        Ok(AccountCredentials {
            account,
            imap_password,
            smtp_password,
        })
    }

    fn request(&self, action: &str, credentials: &AccountCredentials) -> Value {
        json!({
            "action": action,
            "imap": {
                "host": credentials.account.imap.host,
                "port": credentials.account.imap.port,
                "user": credentials.account.imap.user,
                "password": credentials.imap_password,
                "security": credentials.account.imap.security,
            },
            "smtp": {
                "host": credentials.account.smtp.host,
                "port": credentials.account.smtp.port,
                "user": credentials.account.smtp.user,
                "password": credentials.smtp_password,
                "security": credentials.account.smtp.security,
            },
            "identity": {
                "name": credentials.account.name,
                "email": credentials.account.email,
                "fromName": credentials.account.from_name,
            },
        })
    }

    async fn call(&self, payload: Value, timeout: Duration) -> AppResult<Value> {
        let python = std::env::var("TOPH_PYTHON")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "python3".into());
        let mut child = Command::new(python)
            .arg(&self.helper_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|error| {
                AppError::ServiceUnavailable(format!("email helper unavailable: {error}"))
            })?;

        let data = serde_json::to_vec(&payload)
            .map_err(|error| crate::errors::internal(error.to_string()))?;
        let output = tokio::time::timeout(timeout, async move {
            if let Some(mut stdin) = child.stdin.take() {
                stdin.write_all(&data).await?;
            }
            child.wait_with_output().await
        })
        .await;
        let output = match output {
            Ok(Ok(output)) => output,
            Ok(Err(_)) => {
                return Err(AppError::Upstream(
                    "could not communicate with email helper".into(),
                ))
            }
            Err(_) => return Err(AppError::Upstream("email operation timed out".into())),
        };
        if !output.status.success() {
            return Err(AppError::Upstream("email helper failed".into()));
        }
        let value: Value = serde_json::from_slice(&output.stdout)
            .map_err(|_| AppError::Upstream("email helper returned an invalid response".into()))?;
        if value.get("ok").and_then(Value::as_bool) != Some(true) {
            let message = value
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("email operation failed");
            return Err(AppError::Upstream(message.to_string()));
        }
        Ok(value)
    }
}

impl AccountInput {
    fn resolve(self) -> AppResult<ResolvedAccount> {
        let name = self.name.trim().to_string();
        if name.is_empty() {
            return Err(bad_request("name is required"));
        }
        if name.chars().count() > MAX_NAME_CHARS {
            return Err(bad_request("name is too long"));
        }
        let email = self.email.trim().to_string();
        validate_email(&email)?;
        let from_name = self.from_name.trim().to_string();
        if from_name.chars().count() > MAX_NAME_CHARS {
            return Err(bad_request("from name is too long"));
        }

        let imap = match self.imap.filter(|server| server.is_present()) {
            Some(server) => server,
            None => MailServerInput {
                host: self.imap_host,
                port: self.imap_port,
                user: self.imap_user,
                password: self.imap_password,
                tls: self.imap_tls,
                security: self.imap_security,
            },
        };
        let smtp = match self.smtp.filter(|server| server.is_present()) {
            Some(server) => server,
            None => MailServerInput {
                host: self.smtp_host,
                port: self.smtp_port,
                user: self.smtp_user,
                password: self.smtp_password,
                tls: self.smtp_tls,
                security: self.smtp_security,
            },
        };

        Ok(ResolvedAccount {
            name,
            email: email.clone(),
            from_name,
            imap: resolve_server("imap", imap, &email, 993, 143)?,
            smtp: resolve_server("smtp", smtp, &email, 465, 587)?,
        })
    }
}

fn resolve_server(
    label: &str,
    server: MailServerInput,
    email: &str,
    ssl_port: u16,
    plain_port: u16,
) -> AppResult<ResolvedServer> {
    let host = server.host.trim().to_string();
    if host.is_empty() {
        return Err(bad_request(format!("{label} host is required")));
    }
    if host.len() > 253
        || host
            .chars()
            .any(|value| value.is_whitespace() || value.is_control())
    {
        return Err(bad_request(format!("{label} host is invalid")));
    }
    let security = resolve_security(&server.security, server.tls.as_ref())?;
    let port = match server.port.unwrap_or(0) {
        0 if security == "ssl" => ssl_port,
        0 => plain_port,
        port => port,
    };
    let mut user = server.user.trim().to_string();
    if user.is_empty() {
        user = email.to_string();
    }
    if user.is_empty() || user.chars().any(|value| value.is_control()) {
        return Err(bad_request(format!("{label} user is invalid")));
    }
    if server.password.is_empty() {
        return Err(bad_request(format!("{label} password is required")));
    }
    Ok(ResolvedServer {
        host,
        port,
        user,
        password: server.password,
        security,
    })
}

fn resolve_security(explicit: &str, tls: Option<&TlsFlag>) -> AppResult<String> {
    if !explicit.trim().is_empty() {
        return normalize_security(explicit);
    }
    match tls {
        None => Ok("ssl".into()),
        Some(TlsFlag::Bool(true)) => Ok("ssl".into()),
        Some(TlsFlag::Bool(false)) => Ok("none".into()),
        Some(TlsFlag::Text(value)) => normalize_security(value),
    }
}

fn normalize_security(value: &str) -> AppResult<String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "ssl" | "tls" | "implicit" | "true" => Ok("ssl".into()),
        "starttls" | "start_tls" | "start-tls" => Ok("starttls".into()),
        "none" | "plain" | "off" | "false" => Ok("none".into()),
        _ => Err(bad_request("TLS must be ssl, starttls or none")),
    }
}

fn validate_email(value: &str) -> AppResult<()> {
    if value.is_empty() || value.len() > 320 {
        return Err(bad_request("email is invalid"));
    }
    if value
        .chars()
        .any(|character| character.is_whitespace() || character.is_control())
    {
        return Err(bad_request("email is invalid"));
    }
    let Some((local, domain)) = value.split_once('@') else {
        return Err(bad_request("email is invalid"));
    };
    if local.is_empty() || domain.is_empty() || domain.contains('@') {
        return Err(bad_request("email is invalid"));
    }
    Ok(())
}

fn validate_uid(uid: &str) -> AppResult<()> {
    if uid.is_empty() || uid.len() > 20 || !uid.chars().all(|value| value.is_ascii_digit()) {
        return Err(bad_request("invalid message uid"));
    }
    Ok(())
}

fn validate_send(input: &SendInput) -> AppResult<()> {
    if input.to.trim().is_empty() {
        return Err(bad_request("to is required"));
    }
    for (label, value) in [("to", &input.to), ("cc", &input.cc), ("bcc", &input.bcc)] {
        if value.len() > MAX_ADDRESS_BYTES {
            return Err(bad_request(format!("{label} is too long")));
        }
        if value.contains('\r') || value.contains('\n') {
            return Err(bad_request(format!("{label} is invalid")));
        }
    }
    if input.subject.chars().count() > MAX_SUBJECT_CHARS {
        return Err(bad_request("subject is too long"));
    }
    if input.in_reply_to.len() > 1_000
        || input.in_reply_to.contains('\r')
        || input.in_reply_to.contains('\n')
    {
        return Err(bad_request("inReplyTo is invalid"));
    }
    if input.text.len() > MAX_TEXT_BYTES {
        return Err(bad_request("message body is too large"));
    }
    Ok(())
}

fn install_helper(path: &Path) -> AppResult<()> {
    if let Ok(existing) = std::fs::read(path) {
        if existing == HELPER_SOURCE.as_bytes() {
            return Ok(());
        }
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temporary = path.with_file_name(format!(".email_helper.{}.tmp", new_id()));
    std::fs::write(&temporary, HELPER_SOURCE.as_bytes())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&temporary, std::fs::Permissions::from_mode(0o600));
    }
    std::fs::rename(&temporary, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    async fn test_service(dir: &Path) -> EmailService {
        let store = Store::open(&dir.join("toph.db")).await.unwrap();
        EmailService::new(store, dir, &dir.join("master.key")).unwrap()
    }

    fn flat_account(email: &str, password: &str) -> AccountInput {
        serde_json::from_value(json!({
            "name": "Personal",
            "email": email,
            "imapHost": "imap.example.com",
            "imapPort": 993,
            "imapUser": email,
            "imapPassword": password,
            "imapTls": true,
            "smtpHost": "smtp.example.com",
            "smtpPort": 465,
            "smtpUser": email,
            "smtpPassword": password,
            "smtpTls": true
        }))
        .unwrap()
    }

    #[tokio::test]
    async fn accounts_encrypt_passwords_and_return_public_metadata() {
        let dir = tempdir().unwrap();
        let service = test_service(dir.path()).await;
        let created = service
            .create(flat_account("me@example.com", "super-secret"))
            .await
            .unwrap();
        assert_eq!(created.imap_host, "imap.example.com");
        assert!(created.imap_tls);

        let listed = service.list().await.unwrap();
        assert_eq!(listed.len(), 1);
        let public = serde_json::to_string(&listed).unwrap();
        assert!(!public.contains("super-secret"));
        assert!(!public.to_ascii_lowercase().contains("password"));
        assert!(!public.contains("passwordEnc"));

        let raw = service.store.setting(SETTING_KEY).await.unwrap();
        assert!(!raw.contains("super-secret"));
        let stored: Vec<StoredAccount> = serde_json::from_str(&raw).unwrap();
        assert_eq!(
            decrypt(&service.key, &stored[0].imap.password_enc).unwrap(),
            "super-secret"
        );
        assert_eq!(
            decrypt(&service.key, &stored[0].smtp.password_enc).unwrap(),
            "super-secret"
        );

        service.delete(&created.id).await.unwrap();
        assert!(service.list().await.unwrap().is_empty());
        assert!(matches!(
            service.delete(&created.id).await,
            Err(AppError::NotFound)
        ));
    }

    #[tokio::test]
    async fn nested_accounts_support_starttls_and_plain_connections() {
        let dir = tempdir().unwrap();
        let service = test_service(dir.path()).await;
        let input: AccountInput = serde_json::from_value(json!({
            "name": "Work",
            "email": "work@example.com",
            "imap": {
                "host": "imap.example.com",
                "port": 143,
                "user": "work@example.com",
                "password": "imap-secret",
                "tls": "starttls"
            },
            "smtp": {
                "host": "smtp.example.com",
                "port": 587,
                "user": "work@example.com",
                "password": "smtp-secret",
                "tls": false
            }
        }))
        .unwrap();
        let account = service.create(input).await.unwrap();
        assert_eq!(account.imap_security, "starttls");
        assert!(account.imap_tls);
        assert_eq!(account.smtp_security, "none");
        assert!(!account.smtp_tls);
        assert_eq!(account.imap_port, 143);
        assert_eq!(account.smtp_port, 587);
    }

    #[tokio::test]
    async fn account_validation_rejects_incomplete_or_invalid_settings() {
        let dir = tempdir().unwrap();
        let service = test_service(dir.path()).await;

        let mut input = flat_account("me@example.com", "secret");
        input.imap_host.clear();
        assert!(matches!(
            service.create(input).await,
            Err(AppError::BadRequest(_))
        ));

        let mut input = flat_account("not-an-email", "secret");
        input.email = "not-an-email".into();
        assert!(matches!(
            service.create(input).await,
            Err(AppError::BadRequest(_))
        ));

        let mut input = flat_account("me@example.com", "");
        input.imap_password.clear();
        assert!(matches!(
            service.create(input).await,
            Err(AppError::BadRequest(_))
        ));

        let input: AccountInput = serde_json::from_value(json!({
            "name": "Bad TLS",
            "email": "tls@example.com",
            "imapHost": "imap.example.com",
            "imapPassword": "secret",
            "imapSecurity": "sometimes",
            "smtpHost": "smtp.example.com",
            "smtpPassword": "secret"
        }))
        .unwrap();
        assert!(matches!(
            service.create(input).await,
            Err(AppError::BadRequest(_))
        ));

        service
            .create(flat_account("duplicate@example.com", "secret"))
            .await
            .unwrap();
        assert!(matches!(
            service
                .create(flat_account("DUPLICATE@example.com", "secret"))
                .await,
            Err(AppError::Conflict)
        ));
    }

    #[test]
    fn send_input_accepts_strings_arrays_and_nulls() {
        let input: SendInput = serde_json::from_value(json!({
            "to": ["one@example.com", "two@example.com"],
            "cc": null,
            "subject": "Hi",
            "text": "Body"
        }))
        .unwrap();
        assert_eq!(input.to, "one@example.com, two@example.com");
        assert!(input.cc.is_empty());
        assert!(validate_send(&input).is_ok());

        let input: SendInput = serde_json::from_value(json!({
            "to": "one@example.com",
            "subject": "Hi"
        }))
        .unwrap();
        assert!(validate_send(&input).is_ok());

        let input: SendInput = serde_json::from_value(json!({
            "to": "",
            "subject": "Hi"
        }))
        .unwrap();
        assert!(validate_send(&input).is_err());
    }

    #[tokio::test]
    async fn python_helper_parses_mime_messages() {
        if std::process::Command::new("python3")
            .arg("--version")
            .output()
            .is_err()
        {
            return;
        }
        let dir = tempdir().unwrap();
        let service = test_service(dir.path()).await;
        assert!(dir.path().join(HELPER_FILE).exists());
        let result = service
            .call(json!({ "action": "selftest" }), Duration::from_secs(30))
            .await
            .unwrap();
        assert_eq!(result["summary"]["subject"], "Olá mundo");
        assert_eq!(result["summary"]["date"], "2024-10-01T10:00:00Z");
        assert_eq!(result["summary"]["seen"], true);
        assert_eq!(result["message"]["attachments"][0], "report.pdf");
        assert!(result["message"]["text"]
            .as_str()
            .unwrap()
            .contains("Hello, world!"));

        let error = service
            .call(json!({ "action": "unknown" }), Duration::from_secs(30))
            .await
            .unwrap_err();
        assert!(matches!(
            error,
            AppError::Upstream(message) if message.contains("unknown email action")
        ));
    }
}
