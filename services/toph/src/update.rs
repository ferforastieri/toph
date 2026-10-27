use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::config::Config;
use crate::errors::{AppError, AppResult};
use serde::{Deserialize, Serialize};

pub const VERSION: &str = env!("TOPH_VERSION");
const CACHE_TTL: Duration = Duration::from_secs(120);

#[derive(Debug, Clone)]
pub struct UpdateManager {
    pub repo: String,
    helper: std::path::PathBuf,
    path_unit: std::path::PathBuf,
    request: std::path::PathBuf,
    state: std::path::PathBuf,
    client: reqwest::Client,
    cache: Arc<Mutex<UpdateCache>>,
}

#[derive(Default, Debug)]
struct UpdateCache {
    checked: Option<Instant>,
    latest: String,
    assets: Vec<UpdateInstaller>,
    error: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub current_version: String,
    pub latest_version: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub apk_url: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub installers: Vec<UpdateInstaller>,
    pub available: bool,
    pub supported: bool,
    pub busy: bool,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub error: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInstaller {
    pub kind: String,
    pub name: String,
    pub url: String,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub sha256: String,
    #[serde(skip_serializing_if = "is_zero")]
    pub size: i64,
}

#[derive(Debug, Serialize)]
pub struct UpdateStart {
    pub status: String,
    pub version: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
    size: Option<i64>,
    digest: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct UpdateState {
    status: String,
    version: String,
    updated_at: String,
}

impl UpdateManager {
    pub fn new(config: &Config) -> Self {
        Self {
            repo: config.update_repo.clone(),
            helper: config.update_helper.clone(),
            path_unit: config.update_path_unit.clone(),
            request: config.update_request.clone(),
            state: config.update_state.clone(),
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
            cache: Arc::new(Mutex::new(UpdateCache::default())),
        }
    }

    pub async fn status(&self) -> AppResult<UpdateStatus> {
        let (latest, latest_error) = self.latest_release().await;
        let state = self.read_state();
        let supported = self.helper.is_file() && self.path_unit.is_file();
        let busy = self.request.is_file()
            || state
                .as_ref()
                .map(|state| state.status == "running")
                .unwrap_or(false);
        let mut error = latest_error;
        if state
            .as_ref()
            .map(|state| state.status == "error")
            .unwrap_or(false)
        {
            error = "A última atualização não foi concluída.".into();
        }
        let apk_url = if latest.is_empty() {
            String::new()
        } else {
            format!(
                "https://github.com/{}/releases/download/{}/toph-{}.apk",
                self.repo, latest, latest
            )
        };
        let installers = self.current_installers();
        Ok(UpdateStatus {
            current_version: VERSION.trim_start_matches('v').to_string(),
            latest_version: latest.trim_start_matches('v').to_string(),
            apk_url,
            installers,
            available: !latest.is_empty() && newer_release(&latest, VERSION),
            supported,
            busy,
            error,
        })
    }

    pub async fn start(&self) -> AppResult<UpdateStart> {
        if !self.helper.is_file() || !self.path_unit.is_file() {
            return Err(AppError::ServiceUnavailable(
                "self-update is not installed on this server".into(),
            ));
        }
        if self.request.is_file()
            || self
                .read_state()
                .as_ref()
                .map(|state| state.status == "running")
                .unwrap_or(false)
        {
            return Err(AppError::Conflict);
        }
        let latest = self.latest_release().await.0;
        if latest.is_empty() {
            return Err(AppError::Upstream(
                "Não foi possível consultar as releases do Toph.".into(),
            ));
        }
        if !newer_release(&latest, VERSION) {
            return Ok(UpdateStart {
                status: "current".into(),
                version: VERSION.trim_start_matches('v').to_string(),
            });
        }
        if let Some(parent) = self.request.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let temporary = self.request.with_extension("request.tmp");
        std::fs::write(&temporary, format!("{latest}\n"))?;
        std::fs::rename(&temporary, &self.request)?;
        Ok(UpdateStart {
            status: "started".into(),
            version: latest.trim_start_matches('v').to_string(),
        })
    }

    async fn latest_release(&self) -> (String, String) {
        if let Ok(cache) = self.cache.lock() {
            if cache
                .checked
                .is_some_and(|checked| checked.elapsed() < CACHE_TTL)
            {
                return (cache.latest.clone(), cache.error.clone());
            }
        }
        let url = format!("https://api.github.com/repos/{}/releases/latest", self.repo);
        let result = async {
            let response = self
                .client
                .get(url)
                .header("Accept", "application/vnd.github+json")
                .header("User-Agent", format!("toph-update-check/{VERSION}"))
                .send()
                .await
                .map_err(|_| "Não foi possível consultar as releases do Toph.".to_string())?;
            if !response.status().is_success() {
                return Err(format!(
                    "GitHub respondeu HTTP {} ao consultar releases.",
                    response.status()
                ));
            }
            let release: GithubRelease = response
                .json()
                .await
                .map_err(|_| "Resposta inválida ao consultar releases.".to_string())?;
            if release.draft || release.prerelease {
                return Err("A release mais recente não está publicada.".into());
            }
            if parse_version(&release.tag_name).is_none() {
                return Err("A release mais recente tem uma versão inválida.".into());
            }
            let assets = release
                .assets
                .into_iter()
                .filter_map(|asset| {
                    let kind = if asset.name.ends_with("-setup.exe") {
                        "windows-nsis"
                    } else if asset.name.ends_with(".msi") {
                        "windows-msi"
                    } else if asset.name.ends_with(".AppImage") {
                        "linux-appimage"
                    } else if asset.name.ends_with(".deb") {
                        "linux-deb"
                    } else if asset.name.ends_with(".rpm") {
                        "linux-rpm"
                    } else {
                        return None;
                    };
                    Some(UpdateInstaller {
                        kind: kind.into(),
                        name: asset.name,
                        url: asset.browser_download_url,
                        sha256: asset
                            .digest
                            .unwrap_or_default()
                            .trim_start_matches("sha256:")
                            .to_string(),
                        size: asset.size.unwrap_or(0),
                    })
                })
                .collect();
            Ok((release.tag_name, assets))
        }
        .await;
        let (latest, assets, error) = match result {
            Ok((latest, assets)) => (latest, assets, String::new()),
            Err(error) => (String::new(), Vec::new(), error),
        };
        if let Ok(mut cache) = self.cache.lock() {
            cache.checked = Some(Instant::now());
            cache.latest = latest.clone();
            cache.assets = assets;
            cache.error = error.clone();
        }
        (latest, error)
    }

    fn current_installers(&self) -> Vec<UpdateInstaller> {
        self.cache
            .lock()
            .map(|cache| cache.assets.clone())
            .unwrap_or_default()
    }

    fn read_state(&self) -> Option<UpdateState> {
        let raw = std::fs::read_to_string(&self.state).ok()?;
        serde_json::from_str(&raw).ok()
    }
}

fn parse_version(value: &str) -> Option<[u64; 3]> {
    let value = value.trim().trim_start_matches('v');
    let mut parts = value.split('.');
    let mut version = [0u64; 3];
    for (index, part) in parts.by_ref().take(3).enumerate() {
        version[index] = part.parse().ok()?;
    }
    if parts.next().is_some() {
        return None;
    }
    Some(version)
}

fn newer_release(latest: &str, current: &str) -> bool {
    let Some(latest) = parse_version(latest) else {
        return false;
    };
    let Some(current) = parse_version(current) else {
        return false;
    };
    latest > current
}

fn is_zero(value: &i64) -> bool {
    *value == 0
}
