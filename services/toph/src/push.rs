use std::path::Path;
use std::sync::RwLock;
use std::time::{Duration, Instant};

use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::errors::{AppError, AppResult};
use crate::store::Store;

#[derive(Clone)]
pub struct PushService {
    store: Store,
    inner: Option<std::sync::Arc<PushInner>>,
}

struct PushInner {
    project_id: String,
    client_email: String,
    private_key: String,
    client: Client,
    token: RwLock<Option<(String, Instant)>>,
}

#[derive(Debug, Deserialize)]
struct ServiceAccount {
    client_email: String,
    private_key: String,
    #[serde(default)]
    project_id: String,
}

#[derive(Debug, Serialize)]
struct Claims {
    iss: String,
    scope: String,
    aud: String,
    iat: u64,
    exp: u64,
}

impl PushService {
    pub fn new(store: Store, credentials_file: Option<&Path>, project_id: &str) -> Self {
        let Some(path) = credentials_file else {
            return Self { store, inner: None };
        };
        match load_account(path, project_id) {
            Ok((account, client)) => Self {
                store,
                inner: Some(std::sync::Arc::new(PushInner {
                    project_id: account.0,
                    client_email: account.1,
                    private_key: account.2,
                    client,
                    token: RwLock::new(None),
                })),
            },
            Err(error) => {
                tracing::warn!(%error, "firebase disabled");
                Self { store, inner: None }
            }
        }
    }

    pub fn enabled(&self) -> bool {
        self.inner.is_some()
    }

    pub async fn register(&self, token: &str, platform: &str) -> AppResult<()> {
        self.store.register_push_token(token, platform).await
    }

    pub async fn notify_ai(&self) {
        let Some(inner) = &self.inner else {
            return;
        };
        let tokens = match self.store.list_push_tokens().await {
            Ok(tokens) => tokens,
            Err(error) => {
                tracing::warn!(%error, "could not list push tokens");
                return;
            }
        };
        for token in tokens {
            match self.send(inner, &token).await {
                Ok(()) => {}
                Err(error) => {
                    tracing::warn!(%error, "could not send push notification");
                    if error.to_string().contains("UNREGISTERED")
                        || error
                            .to_string()
                            .contains("registration-token-not-registered")
                    {
                        let _ = self.store.delete_push_token(&token).await;
                    }
                }
            }
        }
    }

    async fn send(&self, inner: &PushInner, token: &str) -> AppResult<()> {
        let access_token = self.access_token(inner).await?;
        let url = format!(
            "https://fcm.googleapis.com/v1/projects/{}/messages:send",
            inner.project_id
        );
        let response = inner
            .client
            .post(url)
            .bearer_auth(access_token)
            .json(&json!({
                "message": {
                    "token": token,
                    "data": {
                        "type": "ai.done",
                        "title": "Resposta da IA",
                        "body": "A IA terminou de responder.",
                    },
                    "android": { "priority": "high" }
                }
            }))
            .send()
            .await
            .map_err(|error| AppError::Upstream(error.to_string()))?;
        if response.status().is_success() {
            return Ok(());
        }
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Err(AppError::Upstream(format!("FCM {status}: {body}")))
    }

    async fn access_token(&self, inner: &PushInner) -> AppResult<String> {
        if let Ok(token) = inner.token.read() {
            if let Some((value, expiry)) = token.as_ref() {
                if *expiry > Instant::now() + Duration::from_secs(60) {
                    return Ok(value.clone());
                }
            }
        }
        let now = chrono::Utc::now().timestamp() as u64;
        let claims = Claims {
            iss: inner.client_email.clone(),
            scope: "https://www.googleapis.com/auth/firebase.messaging".into(),
            aud: "https://oauth2.googleapis.com/token".into(),
            iat: now,
            exp: now + 3600,
        };
        let key = EncodingKey::from_rsa_pem(inner.private_key.as_bytes())
            .map_err(|error| AppError::Internal(error.into()))?;
        let assertion = encode(&Header::new(Algorithm::RS256), &claims, &key)
            .map_err(|error| AppError::Internal(error.into()))?;
        let response = inner
            .client
            .post("https://oauth2.googleapis.com/token")
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
                ("assertion", assertion.as_str()),
            ])
            .send()
            .await
            .map_err(|error| AppError::Upstream(error.to_string()))?;
        if !response.status().is_success() {
            return Err(AppError::Upstream(format!(
                "FCM token endpoint returned {}",
                response.status()
            )));
        }
        let value: serde_json::Value = response
            .json()
            .await
            .map_err(|error| AppError::Upstream(error.to_string()))?;
        let token = value
            .get("access_token")
            .and_then(|value| value.as_str())
            .ok_or_else(|| AppError::Upstream("FCM token missing".into()))?
            .to_string();
        let expires_in = value
            .get("expires_in")
            .and_then(|value| value.as_u64())
            .unwrap_or(3600);
        if let Ok(mut stored) = inner.token.write() {
            *stored = Some((
                token.clone(),
                Instant::now() + Duration::from_secs(expires_in),
            ));
        }
        Ok(token)
    }
}

fn load_account(
    path: &Path,
    configured_project: &str,
) -> anyhow::Result<((String, String, String), Client)> {
    let raw = std::fs::read_to_string(path)?;
    let account: ServiceAccount = serde_json::from_str(&raw)?;
    let project = if configured_project.is_empty() {
        account.project_id
    } else {
        configured_project.to_string()
    };
    if project.is_empty() {
        anyhow::bail!("Firebase project id is required");
    }
    Ok((
        (project, account.client_email, account.private_key),
        Client::builder().timeout(Duration::from_secs(20)).build()?,
    ))
}
