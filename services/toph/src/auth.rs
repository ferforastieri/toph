use std::sync::Arc;
use std::time::Duration;

use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};
use chrono::{Duration as ChronoDuration, Utc};

use crate::crypto::{random_secret, token_hash};
use crate::errors::{AppError, AppResult};
use crate::model::{Session, User};
use crate::store::Store;

const ARGON_MEMORY: u32 = 64 * 1024;
const ARGON_ITERATIONS: u32 = 3;
const ARGON_PARALLELISM: u32 = 2;
const ARGON_KEY_LENGTH: usize = 32;

#[derive(Clone)]
pub struct AuthManager {
    store: Store,
    secure_cookies: bool,
    session_ttl: ChronoDuration,
    dummy_hash: Arc<String>,
}

pub struct LoginResult {
    pub token: String,
    pub session: Session,
    pub user: User,
    pub csrf_token: String,
}

impl AuthManager {
    pub fn new(store: Store, secure_cookies: bool) -> Self {
        let dummy_hash =
            hash_password("toph-invalid-password-placeholder").unwrap_or_else(|_| String::new());
        Self {
            store,
            secure_cookies,
            session_ttl: ChronoDuration::days(30),
            dummy_hash: Arc::new(dummy_hash),
        }
    }

    pub fn secure_cookies(&self) -> bool {
        self.secure_cookies
    }

    pub async fn bootstrap(&self, configured_password: &str) -> AppResult<Option<String>> {
        if self.store.user_count().await? > 0 {
            return Ok(None);
        }
        let (password, generated) = if configured_password.trim().is_empty() {
            (random_secret(18), true)
        } else {
            (configured_password.to_string(), false)
        };
        let hash = hash_password(&password).map_err(|error| AppError::Internal(error.into()))?;
        self.store.create_user("admin", &hash).await?;
        Ok(generated.then_some(password))
    }

    pub async fn login(
        &self,
        username: &str,
        password: &str,
        kind: &str,
    ) -> AppResult<LoginResult> {
        let user = match self.store.user_by_username(username).await {
            Ok(user) => user,
            Err(AppError::NotFound) => {
                let _ = verify_password(self.dummy_hash.as_str(), password);
                return Err(AppError::Unauthorized);
            }
            Err(error) => return Err(error),
        };
        if !verify_password(&user.password_hash, password) {
            return Err(AppError::Unauthorized);
        }
        let raw = random_secret(32);
        let hash = token_hash(&raw);
        let session_id = random_secret(16);
        let expires = Utc::now() + self.session_ttl;
        let session = self
            .store
            .create_session(&session_id, user.id, &hash, kind, expires)
            .await?;
        Ok(LoginResult {
            token: raw,
            session,
            user,
            csrf_token: random_secret(24),
        })
    }

    pub async fn authenticate(&self, raw: &str) -> AppResult<(Session, User)> {
        if raw.is_empty() {
            return Err(AppError::Unauthorized);
        }
        let (session, user) = self.store.session_by_token_hash(&token_hash(raw)).await?;
        let _ = self.store.touch_session(&session.id).await;
        Ok((session, user))
    }

    pub async fn logout(&self, session_id: &str) -> AppResult<()> {
        self.store.delete_session(session_id).await
    }

    pub fn session_ttl(&self) -> Duration {
        Duration::from_secs(30 * 24 * 60 * 60)
    }
}

fn argon2() -> Argon2<'static> {
    let params = Params::new(
        ARGON_MEMORY,
        ARGON_ITERATIONS,
        ARGON_PARALLELISM,
        Some(ARGON_KEY_LENGTH),
    )
    .expect("valid argon2 params");
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
}

pub fn hash_password(password: &str) -> anyhow::Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    argon2()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| anyhow::anyhow!(error.to_string()))
}

pub fn verify_password(encoded: &str, password: &str) -> bool {
    let Ok(parsed) = PasswordHash::new(encoded) else {
        return false;
    };
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}
