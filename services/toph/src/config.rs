use std::env;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use ipnet::IpNet;
use std::net::IpAddr;

#[derive(Debug, Clone)]
pub struct Config {
    pub addr: String,
    pub data_dir: PathBuf,
    pub workspace_roots: Vec<PathBuf>,
    pub admin_password: String,
    pub secure_cookies: bool,
    pub trusted_proxies: Vec<IpNet>,
    pub opencode_url: String,
    pub opencode_auth: String,
    pub web_dir: Option<PathBuf>,
    pub firebase_file: Option<PathBuf>,
    pub firebase_project: String,
    pub master_key_file: PathBuf,
    pub build_id: String,
    pub update_repo: String,
    pub update_helper: PathBuf,
    pub update_path_unit: PathBuf,
    pub update_request: PathBuf,
    pub update_state: PathBuf,
}

impl Config {
    pub fn load() -> Result<Self> {
        let data_dir = absolute_path(env_or("TOPH_DATA_DIR", "./data"));
        std::fs::create_dir_all(&data_dir)
            .with_context(|| format!("create data dir {}", data_dir.display()))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&data_dir, std::fs::Permissions::from_mode(0o700));
        }

        let roots = split_roots(&env_or("TOPH_WORKSPACES", "/workspaces"));
        if roots.is_empty() {
            anyhow::bail!("TOPH_WORKSPACES must contain at least one directory");
        }

        let update_repo = env_or("TOPH_UPDATE_REPO", "ferforastieri/toph");
        let (opencode_url, opencode_auth) = opencode_defaults();
        Ok(Self {
            addr: env_or("TOPH_ADDR", "127.0.0.1:8787"),
            workspace_roots: roots,
            admin_password: env::var("TOPH_ADMIN_PASSWORD").unwrap_or_default(),
            secure_cookies: env_bool("TOPH_SECURE_COOKIES", false),
            trusted_proxies: parse_trusted_proxies(
                &env::var("TOPH_TRUSTED_PROXIES").unwrap_or_default(),
            ),
            opencode_url,
            opencode_auth,
            web_dir: non_empty_env("TOPH_WEB_DIR").map(PathBuf::from),
            firebase_file: non_empty_env("TOPH_FIREBASE_CREDENTIALS_FILE").map(PathBuf::from),
            firebase_project: env::var("TOPH_FIREBASE_PROJECT_ID").unwrap_or_default(),
            master_key_file: data_dir.join("master.key"),
            build_id: env::var("TOPH_BUILD_ID")
                .ok()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| {
                    format!(
                        "dev-{}",
                        std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .map(|value| value.as_nanos())
                            .unwrap_or(0)
                    )
                }),
            update_repo,
            update_helper: PathBuf::from(env_or(
                "TOPH_UPDATE_HELPER",
                "/usr/local/lib/toph/update.sh",
            )),
            update_path_unit: PathBuf::from(env_or(
                "TOPH_UPDATE_PATH_UNIT",
                "/etc/systemd/system/toph-update.path",
            )),
            update_request: data_dir.join("update.request"),
            update_state: data_dir.join("update-state.json"),
            data_dir,
        })
    }

    pub fn local(
        data_dir: PathBuf,
        workspace_root: PathBuf,
        admin_password: String,
        addr: String,
    ) -> Self {
        let (opencode_url, opencode_auth) = opencode_defaults();
        Self {
            addr,
            data_dir: data_dir.clone(),
            workspace_roots: vec![workspace_root],
            admin_password,
            secure_cookies: false,
            trusted_proxies: vec!["127.0.0.1/32".parse().expect("valid loopback prefix")],
            opencode_url,
            opencode_auth,
            web_dir: None,
            firebase_file: env::var("TOPH_FIREBASE_CREDENTIALS_FILE")
                .ok()
                .filter(|value| !value.is_empty())
                .map(PathBuf::from),
            firebase_project: env::var("TOPH_FIREBASE_PROJECT_ID").unwrap_or_default(),
            master_key_file: data_dir.join("master.key"),
            build_id: format!(
                "local-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|value| value.as_millis())
                    .unwrap_or(0)
            ),
            update_repo: "ferforastieri/toph".into(),
            update_helper: PathBuf::new(),
            update_path_unit: PathBuf::new(),
            update_request: data_dir.join("update.request"),
            update_state: data_dir.join("update-state.json"),
        }
    }

    pub fn ensure_dirs(&self) -> Result<()> {
        std::fs::create_dir_all(&self.data_dir)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ =
                std::fs::set_permissions(&self.data_dir, std::fs::Permissions::from_mode(0o700));
        }
        Ok(())
    }
}

/// OpenCode saves its local server address and password in
/// `~/.config/opencode/service.json`. When Toph starts on the same machine,
/// use those values so the built-in agent works without a manual setup step.
/// Explicit `TOPH_OPENCODE_*` values always win.
fn opencode_defaults() -> (String, String) {
    let url_env = non_empty_env("TOPH_OPENCODE_URL");
    let auth_env = non_empty_env("TOPH_OPENCODE_AUTH");
    let mut url = url_env
        .clone()
        .unwrap_or_else(|| "http://127.0.0.1:3005".to_string());
    let mut auth = auth_env.unwrap_or_default();

    if auth.is_empty() && is_local_url(&url) {
        if let Some((host, port, password)) = local_opencode_service() {
            if url_env.is_none() {
                url = format!("http://{host}:{port}");
            }
            if let Some(password) = password {
                auth = format!("Basic {}", STANDARD.encode(format!("opencode:{password}")));
            }
        }
    }

    (url.trim_end_matches('/').to_string(), auth)
}

fn is_local_url(raw: &str) -> bool {
    let raw = raw.trim().to_ascii_lowercase();
    raw.starts_with("http://127.0.0.1")
        || raw.starts_with("http://localhost")
        || raw.starts_with("http://[::1]")
}

fn local_opencode_service() -> Option<(String, u16, Option<String>)> {
    let config_home = env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))?;
    let raw = std::fs::read_to_string(config_home.join("opencode/service.json")).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let port = u16::try_from(value.get("port")?.as_u64()?).ok()?;
    let host = value
        .get("hostname")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("127.0.0.1");
    let host = match host {
        "0.0.0.0" | "::" | "[::]" => "127.0.0.1".to_string(),
        value if value.contains(':') && !value.starts_with('[') => format!("[{value}]"),
        value => value.to_string(),
    };
    let password = value
        .get("password")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    Some((host, port, password))
}

fn absolute_path(path: impl AsRef<Path>) -> PathBuf {
    let path = path.as_ref();
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(path)
    }
}

fn split_roots(raw: &str) -> Vec<PathBuf> {
    env::split_paths(raw)
        .map(|path| absolute_path(path))
        .filter(|path| !path.as_os_str().is_empty())
        .collect()
}

fn parse_trusted_proxies(raw: &str) -> Vec<IpNet> {
    raw.split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .filter_map(|value| {
            value
                .parse::<IpNet>()
                .ok()
                .or_else(|| value.parse::<IpAddr>().ok().map(IpNet::from))
        })
        .collect()
}

fn env_or(key: &str, fallback: &str) -> String {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

fn non_empty_env(key: &str) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn env_bool(key: &str, fallback: bool) -> bool {
    match env::var(key)
        .unwrap_or_default()
        .trim()
        .to_lowercase()
        .as_str()
    {
        "1" | "true" | "yes" | "on" => true,
        "0" | "false" | "no" | "off" => false,
        _ => fallback,
    }
}
