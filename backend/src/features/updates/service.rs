use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::config::Config;
use crate::errors::{AppError, AppResult};
use reqwest::header::{AUTHORIZATION, ETAG, IF_NONE_MATCH};
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

pub const VERSION: &str = env!("TOPH_VERSION");
// The toast polls the status; keep GitHub calls rare. `If-None-Match`
// violations return 304, which GitHub does not count against the rate limit.
// A release is worth seeing soon: the status asks GitHub again every two minutes.
const CACHE_TTL: Duration = Duration::from_secs(2 * 60);

#[derive(Debug, Clone)]
pub struct UpdateManager {
    pub repo: String,
    helper: std::path::PathBuf,
    path_unit: std::path::PathBuf,
    request: std::path::PathBuf,
    state: std::path::PathBuf,
    client: reqwest::Client,
    token: String,
    cache: Arc<Mutex<UpdateCache>>,
}

#[derive(Default, Debug)]
struct UpdateCache {
    checked: Option<Instant>,
    etag: String,
    latest: String,
    assets: Vec<UpdateInstaller>,
    apk_url: String,
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
        // The releases API allows 60 anonymous calls per hour per IP. A token
        // (or a `github-token` file in the data dir) raises that to 5.000/h.
        let token = std::env::var("TOPH_GITHUB_TOKEN")
            .or_else(|_| std::env::var("GITHUB_TOKEN"))
            .unwrap_or_default()
            .trim()
            .to_string();
        let token = if token.is_empty() {
            std::fs::read_to_string(config.data_dir.join("github-token"))
                .unwrap_or_default()
                .trim()
                .to_string()
        } else {
            token
        };
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
            token,
            cache: Arc::new(Mutex::new(UpdateCache::default())),
        }
    }

    fn github_get(&self, url: &str) -> reqwest::RequestBuilder {
        let request = self
            .client
            .get(url)
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", format!("toph-update-check/{VERSION}"));
        if self.token.is_empty() {
            request
        } else {
            request.header(AUTHORIZATION, format!("Bearer {}", self.token))
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
        let apk_url = self
            .cache
            .lock()
            .map(|cache| cache.apk_url.clone())
            .unwrap_or_default();
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
        let (latest, latest_error) = self.latest_release().await;
        if latest.is_empty() {
            return Err(AppError::Upstream(if latest_error.is_empty() {
                "Não foi possível consultar as releases do Toph.".into()
            } else {
                latest_error
            }));
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
        let (etag, cached) = match self.cache.lock() {
            Ok(cache) => {
                // A failed lookup retries sooner so a rate-limit window or a
                // network blip recovers without waiting the full TTL.
                let ttl = if cache.error.is_empty() {
                    CACHE_TTL
                } else {
                    Duration::from_secs(60)
                };
                if cache.checked.is_some_and(|checked| checked.elapsed() < ttl) {
                    return (cache.latest.clone(), cache.error.clone());
                }
                (
                    cache.etag.clone(),
                    (
                        cache.latest.clone(),
                        cache.assets.clone(),
                        cache.apk_url.clone(),
                    ),
                )
            }
            Err(_) => (String::new(), (String::new(), Vec::new(), String::new())),
        };
        let url = format!("https://api.github.com/repos/{}/releases/latest", self.repo);
        let result = async {
            let mut request = self.github_get(&url);
            if !etag.is_empty() {
                request = request.header(IF_NONE_MATCH, &etag);
            }
            let response = request
                .send()
                .await
                .map_err(|_| "Não foi possível consultar as releases do Toph.".to_string())?;
            if response.status() == StatusCode::NOT_MODIFIED {
                // Nothing changed since the cached release; 304s are free.
                return Ok((cached.0, cached.1, cached.2, String::new()));
            }
            let status = response.status();
            if status == StatusCode::FORBIDDEN || status == StatusCode::TOO_MANY_REQUESTS {
                return Err(format!(
                    "O GitHub limitou as consultas de atualização ({}). Defina TOPH_GITHUB_TOKEN no servidor ou tente novamente em alguns minutos.",
                    status.as_u16()
                ));
            }
            if !status.is_success() {
                return Err(format!(
                    "GitHub respondeu HTTP {} ao consultar releases.",
                    status
                ));
            }
            let etag = response
                .headers()
                .get(ETAG)
                .and_then(|value| value.to_str().ok())
                .unwrap_or_default()
                .to_string();
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
            let apk_url = release
                .assets
                .iter()
                .find(|asset| asset.name.to_lowercase().ends_with(".apk"))
                .map(|asset| asset.browser_download_url.clone())
                .unwrap_or_default();
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
            let apk_url = if apk_url.is_empty() {
                self.latest_apk_url().await.unwrap_or_default()
            } else {
                apk_url
            };
            Ok((release.tag_name, assets, apk_url, etag))
        }
        .await;
        let (latest, assets, apk_url, etag, error) = match result {
            Ok((latest, assets, apk_url, etag)) => (latest, assets, apk_url, etag, String::new()),
            Err(error) => {
                // Keep the last known release when GitHub is temporarily
                // unreachable instead of making the update toast disappear.
                let previous = self
                    .cache
                    .lock()
                    .map(|cache| {
                        (
                            cache.latest.clone(),
                            cache.assets.clone(),
                            cache.apk_url.clone(),
                        )
                    })
                    .unwrap_or_default();
                match self.latest_tag_via_redirect().await {
                    Some(tag) => (tag, previous.1, previous.2, String::new(), String::new()),
                    None => (previous.0, previous.1, previous.2, String::new(), error),
                }
            }
        };
        if let Ok(mut cache) = self.cache.lock() {
            cache.checked = Some(Instant::now());
            if !etag.is_empty() {
                cache.etag = etag;
            }
            cache.latest = latest.clone();
            cache.assets = assets;
            cache.apk_url = apk_url;
            cache.error = error.clone();
        }
        (latest, error)
    }

    /// Last resort when the API is rate limited: GitHub redirects
    /// `/releases/latest` to the tag, and that path is not rate limited.
    async fn latest_tag_via_redirect(&self) -> Option<String> {
        let url = format!("https://github.com/{}/releases/latest", self.repo);
        let response = self
            .client
            .get(url)
            .header("User-Agent", format!("toph-update-check/{VERSION}"))
            .send()
            .await
            .ok()?;
        let final_url = response.url().clone();
        let tag = final_url
            .path_segments()?
            .filter(|segment| !segment.is_empty())
            .next_back()?
            .to_string();
        parse_version(&tag).is_some().then_some(tag)
    }

    async fn latest_apk_url(&self) -> Option<String> {
        let url = format!(
            "https://api.github.com/repos/{}/releases?per_page=20",
            self.repo
        );
        let releases: Vec<GithubRelease> = self
            .github_get(&url)
            .send()
            .await
            .ok()?
            .error_for_status()
            .ok()?
            .json()
            .await
            .ok()?;
        releases
            .into_iter()
            .filter(|release| !release.draft && !release.prerelease)
            .find_map(|release| {
                release
                    .assets
                    .into_iter()
                    .find(|asset| asset.name.to_lowercase().ends_with(".apk"))
                    .map(|asset| asset.browser_download_url)
            })
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
    // Development builds append suffixes such as `-3-gabc123`. The numeric
    // release they derive from is still comparable.
    let core = value.split(['-', '+']).next().unwrap_or(value);
    let mut parts = core.split('.');
    let mut version = [0u64; 3];
    for slot in &mut version {
        *slot = parts.next()?.parse().ok()?;
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
    // When the running build has no comparable version, still offer the
    // newest published release instead of silently hiding the update.
    let Some(current) = parse_version(current) else {
        return true;
    };
    latest > current
}

#[cfg(test)]
mod tests {
    use super::{newer_release, parse_version};

    #[test]
    fn parses_release_and_development_versions() {
        assert_eq!(parse_version("v0.72.1"), Some([0, 72, 1]));
        assert_eq!(parse_version("0.72.1-3-gabc123"), Some([0, 72, 1]));
        assert_eq!(parse_version("0.72.1+build.5"), Some([0, 72, 1]));
        assert_eq!(parse_version("dev"), None);
    }

    #[test]
    fn offers_latest_release_when_running_version_is_unknown() {
        assert!(newer_release("0.72.1", "0.72.0"));
        assert!(!newer_release("0.72.1", "0.72.1"));
        assert!(!newer_release("0.72.1", "0.73.0"));
        assert!(newer_release("0.72.1", "dev"));
        assert!(newer_release("0.72.1", "0.72.0-local"));
    }
}

fn is_zero(value: &i64) -> bool {
    *value == 0
}
