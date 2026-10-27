use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;
use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("not found")]
    NotFound,
    #[error("already exists")]
    Conflict,
    #[error("path outside project")]
    Forbidden,
    #[error("file changed on disk")]
    FileConflict,
    #[error("file too large")]
    TooLarge,
    #[error("binary file")]
    Binary,
    #[error("unsupported database driver")]
    UnsupportedDriver,
    #[error("authentication required")]
    Unauthorized,
    #[error("invalid credentials")]
    InvalidCredentials,
    #[error("too many requests")]
    RateLimited,
    #[error("invalid csrf token")]
    InvalidCsrf,
    #[error("{0}")]
    BadRequest(String),
    #[error("{0}")]
    ServiceUnavailable(String),
    #[error("{0}")]
    Upstream(String),
    #[error("internal error: {0}")]
    Internal(#[from] anyhow::Error),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

impl AppError {
    pub fn status(&self) -> StatusCode {
        match self {
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::Conflict => StatusCode::CONFLICT,
            Self::Forbidden | Self::InvalidCsrf => StatusCode::FORBIDDEN,
            Self::FileConflict => StatusCode::CONFLICT,
            Self::TooLarge => StatusCode::PAYLOAD_TOO_LARGE,
            Self::Binary => StatusCode::UNSUPPORTED_MEDIA_TYPE,
            Self::UnsupportedDriver | Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::Unauthorized | Self::InvalidCredentials => StatusCode::UNAUTHORIZED,
            Self::RateLimited => StatusCode::TOO_MANY_REQUESTS,
            Self::ServiceUnavailable(_) => StatusCode::SERVICE_UNAVAILABLE,
            Self::Upstream(_) => StatusCode::BAD_GATEWAY,
            Self::Internal(_) | Self::Database(_) | Self::Io(_) | Self::Json(_) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        }
    }

    pub fn message(&self) -> String {
        match self {
            Self::NotFound => "not found".into(),
            Self::Conflict => "already exists".into(),
            Self::Forbidden => "path outside project".into(),
            Self::FileConflict => "file changed on disk".into(),
            Self::TooLarge => "file too large".into(),
            Self::Binary => "binary file".into(),
            Self::UnsupportedDriver => "unsupported database driver".into(),
            Self::Unauthorized => "authentication required".into(),
            Self::InvalidCredentials => "invalid credentials".into(),
            Self::RateLimited => "too many requests".into(),
            Self::InvalidCsrf => "invalid csrf token".into(),
            Self::BadRequest(message)
            | Self::ServiceUnavailable(message)
            | Self::Upstream(message) => message.clone(),
            Self::Internal(error) => {
                tracing::error!(%error, "internal error");
                "internal error".into()
            }
            Self::Database(error) => {
                tracing::error!(%error, "database error");
                "internal error".into()
            }
            Self::Io(error) => error.to_string(),
            Self::Json(error) => {
                tracing::error!(%error, "json error");
                "internal error".into()
            }
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        (self.status(), Json(json!({ "error": self.message() }))).into_response()
    }
}

pub fn bad_request(message: impl Into<String>) -> AppError {
    AppError::BadRequest(message.into())
}

pub fn internal(message: impl Into<String>) -> AppError {
    AppError::Internal(anyhow::anyhow!(message.into()))
}
