use std::path::{Path, PathBuf};
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::crypto::{decrypt, encrypt, load_or_create_key};
use crate::errors::{AppError, AppResult};
use crate::store::Store;

const SETTING_KEY: &str = "native_ai_config";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    /// User-visible name of this connection, independent of the wire protocol.
    #[serde(default)]
    pub label: String,
    pub provider: String,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    #[serde(skip)]
    pub api_key: String,
    #[serde(
        rename = "apiKeyEnc",
        default,
        skip_serializing_if = "String::is_empty"
    )]
    pub api_key_enc: String,
    pub model: String,
    #[serde(rename = "autocompleteModel", default)]
    pub autocomplete_model: String,
    #[serde(rename = "maxTokens")]
    pub max_tokens: i32,
    #[serde(rename = "weeklyTokenLimit", default = "default_weekly_token_limit")]
    pub weekly_token_limit: i64,
    pub temperature: f64,
    pub autocomplete: bool,
    #[serde(rename = "systemPrompt")]
    pub system_prompt: String,
    #[serde(rename = "imageProviders", default)]
    pub image_providers: Vec<ImageProvider>,
    /// Resolved connection name for display; never persisted.
    #[serde(skip)]
    pub connection_label: String,
}

/// A configured image generation backend. `kind` selects the wire protocol so
/// any provider can be plugged in without code changes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageProvider {
    pub id: String,
    pub label: String,
    /// openai | gemini | stability | replicate
    pub kind: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub model: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub api_key_enc: String,
    #[serde(skip)]
    pub api_key: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicImageProvider {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub base_url: String,
    pub model: String,
    pub enabled: bool,
    pub has_key: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageProviderInput {
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub clear_key: Option<bool>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicConfig {
    pub label: String,
    pub connection_label: String,
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub autocomplete_model: String,
    pub max_tokens: i32,
    pub weekly_token_limit: i64,
    pub temperature: f64,
    pub autocomplete: bool,
    pub system_prompt: String,
    pub has_key: bool,
    pub image_providers: Vec<PublicImageProvider>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigInput {
    #[serde(default)]
    pub label: String,
    pub provider: String,
    pub base_url: String,
    pub api_key: Option<String>,
    pub clear_key: Option<bool>,
    pub model: String,
    #[serde(default)]
    pub autocomplete_model: String,
    pub max_tokens: i32,
    #[serde(default = "default_weekly_token_limit")]
    pub weekly_token_limit: i64,
    pub temperature: f64,
    pub autocomplete: bool,
    pub system_prompt: String,
    #[serde(default)]
    pub image_providers: Vec<ImageProviderInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModel {
    pub id: String,
    pub label: String,
    pub provider: String,
    #[serde(rename = "connectionLabel", skip_serializing_if = "String::is_empty")]
    pub connection_label: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub variants: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub inputs: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct CompleteInput {
    pub path: String,
    pub language: String,
    pub prefix: String,
    pub suffix: String,
}

/// Context needed to let a direct (OpenAI-compatible) model save generated
/// images inside the current project.
#[derive(Debug, Clone)]
pub struct ImageTool {
    pub project_id: String,
    pub project_root: PathBuf,
}

#[derive(Clone)]
pub struct AiService {
    pub(crate) store: Store,
    pub(crate) key: Vec<u8>,
    pub(crate) client: Client,
}

impl AiService {
    pub fn new(store: Store, key_file: &Path) -> AppResult<Self> {
        Ok(Self {
            store,
            key: load_or_create_key(key_file)?,
            client: Client::builder()
                .user_agent(format!("Toph/{}", crate::VERSION))
                .timeout(Duration::from_secs(600))
                .build()
                .map_err(|error| AppError::Internal(error.into()))?,
        })
    }

    pub async fn load(&self) -> AppResult<AiConfig> {
        let raw = match self.store.setting(SETTING_KEY).await {
            Ok(raw) => raw,
            Err(AppError::NotFound) => {
                return Ok(AiConfig {
                    label: String::new(),
                    provider: String::new(),
                    base_url: String::new(),
                    api_key: String::new(),
                    api_key_enc: String::new(),
                    model: String::new(),
                    autocomplete_model: String::new(),
                    max_tokens: 4096,
                    weekly_token_limit: default_weekly_token_limit(),
                    temperature: 0.0,
                    autocomplete: false,
                    system_prompt: String::new(),
                    image_providers: Vec::new(),
                    connection_label: String::new(),
                });
            }
            Err(error) => return Err(error),
        };
        let mut config: AiConfig = serde_json::from_str(&raw)
            .map_err(|error| crate::errors::bad_request(format!("invalid AI config: {error}")))?;
        if !config.api_key_enc.is_empty() {
            config.api_key = decrypt(&self.key, &config.api_key_enc)
                .map_err(|error| AppError::Internal(error.into()))?;
        }
        for provider in &mut config.image_providers {
            if !provider.api_key_enc.is_empty() {
                provider.api_key = decrypt(&self.key, &provider.api_key_enc)
                    .map_err(|error| AppError::Internal(error.into()))?;
            }
        }
        config.normalize();
        Ok(config)
    }

    pub async fn public(&self) -> AppResult<PublicConfig> {
        let config = self.load().await?;
        Ok(PublicConfig {
            label: config.label.clone(),
            connection_label: config.connection_name(),
            provider: config.provider,
            base_url: config.base_url,
            model: config.model,
            autocomplete_model: config.autocomplete_model,
            max_tokens: config.max_tokens,
            weekly_token_limit: config.weekly_token_limit,
            temperature: config.temperature,
            autocomplete: config.autocomplete,
            system_prompt: config.system_prompt,
            has_key: !config.api_key.is_empty(),
            image_providers: config
                .image_providers
                .iter()
                .map(|provider| PublicImageProvider {
                    id: provider.id.clone(),
                    label: provider.label.clone(),
                    kind: provider.kind.clone(),
                    base_url: provider.base_url.clone(),
                    model: provider.model.clone(),
                    enabled: provider.enabled,
                    has_key: !provider.api_key.is_empty(),
                })
                .collect(),
        })
    }

    pub async fn save(&self, input: AiConfigInput) -> AppResult<PublicConfig> {
        let provider = input.provider.trim().to_lowercase();
        if !matches!(
            provider.as_str(),
            "openai" | "custom" | "anthropic" | "ollama"
        ) {
            return Err(crate::errors::bad_request("unsupported AI provider"));
        }
        let base_url = input.base_url.trim().trim_end_matches('/').to_string();
        if !base_url.is_empty() {
            let parsed = reqwest::Url::parse(&base_url)
                .map_err(|_| crate::errors::bad_request("base URL must be http or https"))?;
            if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
                return Err(crate::errors::bad_request("base URL must be http or https"));
            }
        }
        let mut max_tokens = input.max_tokens;
        if max_tokens <= 0 {
            max_tokens = 1024;
        }
        if max_tokens > 8192 {
            max_tokens = 8192;
        }
        let temperature = input.temperature.clamp(0.0, 2.0);
        super::connections::validate_endpoint(&provider, &base_url)?;
        let old = self.load().await?;
        let api_key = if input.clear_key.unwrap_or(false) {
            String::new()
        } else if let Some(key) = input.api_key.filter(|key| !key.trim().is_empty()) {
            key.trim().to_string()
        } else if provider == old.provider && base_url == old.base_url {
            old.api_key
        } else {
            String::new()
        };
        let api_key_enc =
            encrypt(&self.key, &api_key).map_err(|error| AppError::Internal(error.into()))?;
        let mut image_providers = Vec::new();
        for input in input.image_providers {
            if input.base_url.trim().is_empty() || input.model.trim().is_empty() {
                return Err(crate::errors::bad_request(
                    "Image provider URL and model are required",
                ));
            }
            let id = input.id.trim().to_string();
            if id.is_empty() {
                continue;
            }
            let kind = input.kind.trim().to_lowercase();
            if !matches!(
                kind.as_str(),
                "openai" | "gemini" | "stability" | "replicate"
            ) {
                return Err(crate::errors::bad_request(format!(
                    "unsupported image provider: {kind}"
                )));
            }
            let previous = old
                .image_providers
                .iter()
                .find(|provider| provider.id == id);
            let provider_key = if input.clear_key.unwrap_or(false) {
                String::new()
            } else if let Some(key) = input.api_key.filter(|key| !key.trim().is_empty()) {
                key.trim().to_string()
            } else {
                previous
                    .map(|provider| provider.api_key.clone())
                    .unwrap_or_default()
            };
            let provider_key_enc = encrypt(&self.key, &provider_key)
                .map_err(|error| AppError::Internal(error.into()))?;
            image_providers.push(ImageProvider {
                id,
                label: input.label.trim().to_string(),
                kind,
                base_url: input.base_url.trim().trim_end_matches('/').to_string(),
                model: input.model.trim().to_string(),
                api_key: provider_key,
                api_key_enc: provider_key_enc,
                enabled: input.enabled,
            });
        }
        let mut config = AiConfig {
            label: input.label.trim().to_string(),
            provider,
            base_url,
            api_key,
            api_key_enc,
            model: input.model.trim().to_string(),
            autocomplete_model: input.autocomplete_model.trim().to_string(),
            max_tokens,
            weekly_token_limit: input.weekly_token_limit.max(0),
            temperature,
            autocomplete: input.autocomplete,
            system_prompt: input.system_prompt,
            image_providers,
            connection_label: String::new(),
        };
        config.normalize();
        self.store
            .set_setting(SETTING_KEY, &serde_json::to_string(&config)?)
            .await?;
        self.public().await
    }

    pub async fn test(&self) -> AppResult<()> {
        let config = self.load().await?;
        if config.provider.is_empty() {
            return Err(crate::errors::bad_request("AI provider is not configured"));
        }
        let (url, headers) = match config.provider.as_str() {
            "anthropic" => (
                super::protocol::models_endpoint(&config.base_url),
                vec![
                    ("x-api-key", config.api_key.clone()),
                    ("anthropic-version", "2023-06-01".into()),
                ],
            ),
            "ollama" => (format!("{}/api/tags", config.base_url), Vec::new()),
            "openai" | "custom" => (
                super::protocol::models_endpoint(&config.base_url),
                vec![("Authorization", format!("Bearer {}", config.api_key))],
            ),
            _ => return Err(crate::errors::bad_request("Unsupported provider protocol")),
        };
        self.check(&url, &headers).await
    }

    pub async fn models(&self) -> AppResult<Vec<AiModel>> {
        let mut result = Vec::new();
        let default = self.load().await?;
        if !default.provider.is_empty() {
            let name = default.connection_name();
            for mut model in self.models_for(&default).await? {
                model.id = format!("default::{}", model.id);
                model.connection_label = name.clone();
                result.push(model);
            }
        }
        for connection in self.connections().await? {
            let name = infer_connection_name(
                &connection.label,
                &connection.config.provider,
                &connection.config.base_url,
            );
            for mut model in self.models_for(&connection.config).await? {
                model.id = format!("{}::{}", connection.id, model.id);
                model.connection_label = name.clone();
                result.push(model);
            }
        }
        Ok(result)
    }

    async fn models_for(&self, config: &AiConfig) -> AppResult<Vec<AiModel>> {
        match config.provider.as_str() {
            "anthropic" => self.models_anthropic(&config).await,
            "ollama" => self.models_ollama(&config).await,
            "openai" | "custom" => self.models_openai(&config).await,
            _ => Err(crate::errors::bad_request(
                "Configure a direct model provider",
            )),
        }
    }

    async fn models_openai(&self, config: &AiConfig) -> AppResult<Vec<AiModel>> {
        let value = self
            .get_json(
                &super::protocol::models_endpoint(&config.base_url),
                &auth_headers(&config.api_key),
            )
            .await?;
        let mut models = Vec::new();
        for item in value
            .get("data")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
        {
            if let Some(id) = item.get("id").and_then(Value::as_str) {
                models.push(AiModel {
                    id: id.into(),
                    label: id.into(),
                    provider: config.provider.clone(),
                    connection_label: String::new(),
                    variants: Vec::new(),
                    inputs: Vec::new(),
                });
            }
        }
        models.sort_by(|a, b| a.label.cmp(&b.label));
        Ok(models)
    }

    async fn models_anthropic(&self, config: &AiConfig) -> AppResult<Vec<AiModel>> {
        let value = self
            .get_json(
                &super::protocol::models_endpoint(&config.base_url),
                &[
                    ("x-api-key", config.api_key.clone()),
                    ("anthropic-version", "2023-06-01".into()),
                ],
            )
            .await?;
        let mut models = Vec::new();
        for item in value
            .get("data")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
        {
            let Some(id) = item.get("id").and_then(Value::as_str) else {
                continue;
            };
            let label = item
                .get("display_name")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .unwrap_or(id);
            models.push(AiModel {
                id: id.into(),
                label: label.into(),
                provider: config.provider.clone(),
                connection_label: String::new(),
                variants: Vec::new(),
                inputs: Vec::new(),
            });
        }
        Ok(models)
    }

    async fn models_ollama(&self, config: &AiConfig) -> AppResult<Vec<AiModel>> {
        let value = self
            .get_json(
                &format!("{}/api/tags", config.base_url.trim_end_matches('/')),
                &[],
            )
            .await?;
        let mut models = Vec::new();
        for item in value
            .get("models")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
        {
            if let Some(name) = item.get("name").and_then(Value::as_str) {
                models.push(AiModel {
                    id: name.into(),
                    label: name.into(),
                    provider: "ollama".into(),
                    connection_label: String::new(),
                    variants: Vec::new(),
                    inputs: Vec::new(),
                });
            }
        }
        Ok(models)
    }

    pub async fn chat(
        &self,
        messages: Vec<Message>,
        model: Option<&str>,
        effort: Option<&str>,
        _image: Option<ImageTool>,
        _tools: Vec<String>,
    ) -> AppResult<String> {
        let config = self.resolve(model.unwrap_or("")).await?;
        let messages = messages
            .into_iter()
            .map(|m| json!({"role":m.role,"content":m.content}))
            .collect::<Vec<_>>();
        if crate::features::agents::context::estimate(&json!(messages))
            > crate::features::agents::context::INPUT_BUDGET
        {
            return Err(crate::errors::bad_request(
                "Selected text exceeds the input token budget; narrow the selection",
            ));
        }
        let turn = self.turn(&config, &messages, &[], effort, |_| {}).await?;
        if !turn.calls.is_empty() {
            return Err(crate::errors::bad_request(
                "Tool execution requires an agent run",
            ));
        }
        Ok(turn.text)
    }

    pub async fn image(&self, tool: &ImageTool, arguments: &str) -> AppResult<Value> {
        let config = self.load().await?;
        let providers = image_backends(&config);
        self.generate_image(&config, tool, arguments, &providers)
            .await
    }

    async fn generate_image(
        &self,
        _config: &AiConfig,
        tool: &ImageTool,
        arguments: &str,
        providers: &[ImageProvider],
    ) -> AppResult<Value> {
        let input: Value = serde_json::from_str(arguments).unwrap_or_else(|_| json!({}));
        let prompt = input
            .get("prompt")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim()
            .to_string();
        if prompt.is_empty() {
            return Err(AppError::BadRequest(
                "generate_image requires a prompt".into(),
            ));
        }
        if providers.is_empty() {
            return Err(AppError::BadRequest(
                "no image provider is configured".into(),
            ));
        }
        let size = input
            .get("size")
            .and_then(Value::as_str)
            .unwrap_or("1024x1024");
        let requested = input
            .get("filename")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let requested_provider = input
            .get("provider")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        let provider = if requested_provider.is_empty() {
            if providers.len() != 1 {
                return Err(crate::errors::bad_request("Specify the image provider id"));
            }
            &providers[0]
        } else {
            providers
                .iter()
                .find(|provider| provider.id == requested_provider)
                .ok_or_else(|| crate::errors::bad_request("Unknown image provider"))?
        };
        let model = input
            .get("model")
            .and_then(Value::as_str)
            .filter(|model| !model.trim().is_empty())
            .unwrap_or(&provider.model);
        let bytes = self
            .run_image_provider(provider, &prompt, size, model)
            .await?;
        if bytes.is_empty() {
            return Err(AppError::Upstream(
                "image provider returned an empty file".into(),
            ));
        }
        let stem = if requested.trim().is_empty() {
            let slug = slugify(&prompt);
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|duration| duration.as_millis())
                .unwrap_or_default();
            format!("{slug}-{stamp}")
        } else {
            slugify(&requested)
        };
        let relative = format!("toph-generated/{stem}.png");
        let target = tool.project_root.join(&relative);
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|error| AppError::Internal(error.into()))?;
        }
        std::fs::write(&target, &bytes).map_err(|error| AppError::Internal(error.into()))?;
        let encoded: String = relative
            .chars()
            .map(|ch| {
                if ch.is_ascii_alphanumeric() || matches!(ch, '/' | '-' | '_' | '.') {
                    ch.to_string()
                } else {
                    format!("%{:02X}", ch as u32)
                }
            })
            .collect();
        Ok(json!({
            "ok": true,
            "path": relative,
            "url": format!("/api/projects/{}/raw?path={}", tool.project_id, encoded),
            "bytes": bytes.len(),
        }))
    }

    async fn run_image_provider(
        &self,
        provider: &ImageProvider,
        prompt: &str,
        size: &str,
        model: &str,
    ) -> AppResult<Vec<u8>> {
        if provider.base_url.is_empty() || model.trim().is_empty() {
            return Err(crate::errors::bad_request(
                "Image provider URL and model are required",
            ));
        }
        let client = &self.client;
        match provider.kind.as_str() {
            "gemini" => {
                let base = provider.base_url.as_str();
                let url = format!(
                    "{}/v1beta/models/{}:generateContent?key={}",
                    base.trim_end_matches('/'),
                    model,
                    provider.api_key
                );
                let value = self
                    .post_json(
                        &url,
                        &[],
                        &json!({
                            "contents": [{ "parts": [{ "text": prompt }] }],
                            "generationConfig": { "responseModalities": ["IMAGE"] }
                        }),
                    )
                    .await?;
                let parts = value
                    .pointer("/candidates/0/content/parts")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                for part in parts {
                    let data = part
                        .pointer("/inlineData/data")
                        .or_else(|| part.pointer("/inline_data/data"))
                        .and_then(Value::as_str)
                        .filter(|data| !data.is_empty());
                    if let Some(data) = data {
                        return STANDARD.decode(data.as_bytes()).map_err(|_| {
                            AppError::Upstream("image provider returned invalid base64".into())
                        });
                    }
                }
                Err(AppError::Upstream(
                    "image provider returned no image".into(),
                ))
            }
            "stability" => {
                if !matches!(model, "core" | "ultra") {
                    return Err(crate::errors::bad_request(
                        "Stability image model must be core or ultra",
                    ));
                }
                let base = provider.base_url.as_str();
                let url = format!(
                    "{}/v2beta/stable-image/generate/{model}",
                    base.trim_end_matches('/')
                );
                let ratio = match size {
                    "1536x1024" => "3:2",
                    "1024x1536" => "2:3",
                    _ => "1:1",
                };
                let form = reqwest::multipart::Form::new()
                    .text("prompt", prompt.to_string())
                    .text("output_format", "png")
                    .text("aspect_ratio", ratio.to_string());
                let response = client
                    .post(&url)
                    .header("Authorization", format!("Bearer {}", provider.api_key))
                    .header("Accept", "image/*")
                    .multipart(form)
                    .send()
                    .await
                    .map_err(|error| {
                        AppError::Upstream(format!("image provider unavailable: {error}"))
                    })?;
                let status = response.status();
                let bytes = response
                    .bytes()
                    .await
                    .map_err(|error| AppError::Upstream(format!("image download failed: {error}")))?
                    .to_vec();
                if !status.is_success() {
                    return Err(AppError::Upstream(format!(
                        "image provider returned {status}: {}",
                        String::from_utf8_lossy(&bytes)
                    )));
                }
                Ok(bytes)
            }
            "replicate" => {
                let base = provider.base_url.as_str();
                if model.trim().is_empty() || !model.contains('/') {
                    return Err(AppError::BadRequest(
                        "replicate image provider needs a model like owner/name".into(),
                    ));
                }
                let url = format!(
                    "{}/v1/models/{}/predictions",
                    base.trim_end_matches('/'),
                    model
                );
                let mut value = self
                    .post_json(
                        &url,
                        &[
                            ("Authorization", format!("Bearer {}", provider.api_key)),
                            ("Prefer", "wait".into()),
                        ],
                        &json!({ "input": { "prompt": prompt } }),
                    )
                    .await?;
                for _ in 0..120 {
                    if let Some(output) = value.get("output").filter(|value| !value.is_null()) {
                        let remote = output.as_str().map(str::to_string).or_else(|| {
                            output
                                .as_array()
                                .and_then(|items| items.first())
                                .and_then(Value::as_str)
                                .map(str::to_string)
                        });
                        if let Some(remote) = remote {
                            let response = client.get(&remote).send().await.map_err(|error| {
                                AppError::Upstream(format!("image download failed: {error}"))
                            })?;
                            return response.bytes().await.map(|bytes| bytes.to_vec()).map_err(
                                |error| {
                                    AppError::Upstream(format!("image download failed: {error}"))
                                },
                            );
                        }
                    }
                    if value.get("status").and_then(Value::as_str) == Some("failed") {
                        return Err(AppError::Upstream(format!(
                            "image provider failed: {}",
                            value
                                .get("error")
                                .and_then(Value::as_str)
                                .unwrap_or("unknown error")
                        )));
                    }
                    let Some(poll) = value
                        .get("urls")
                        .and_then(|urls| urls.get("get"))
                        .and_then(Value::as_str)
                    else {
                        break;
                    };
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    value = self
                        .get_json(
                            poll,
                            &[("Authorization", format!("Bearer {}", provider.api_key))],
                        )
                        .await?;
                }
                Err(AppError::Upstream(
                    "image provider did not finish in time".into(),
                ))
            }
            "openai" => {
                let base = provider.base_url.as_str();
                let url = endpoint(base, "/images/generations");
                let headers = auth_headers(&provider.api_key);
                let value = self
                    .post_json(
                        &url,
                        &headers,
                        &json!({ "model": model, "prompt": prompt, "size": size, "n": 1 }),
                    )
                    .await?;
                if let Some(data) = value
                    .pointer("/data/0/b64_json")
                    .and_then(Value::as_str)
                    .filter(|data| !data.is_empty())
                {
                    return STANDARD.decode(data.as_bytes()).map_err(|_| {
                        AppError::Upstream("image provider returned invalid base64".into())
                    });
                }
                if let Some(remote) = value
                    .pointer("/data/0/url")
                    .and_then(Value::as_str)
                    .filter(|url| !url.is_empty())
                {
                    let response = client.get(remote).send().await.map_err(|error| {
                        AppError::Upstream(format!("image download failed: {error}"))
                    })?;
                    return response
                        .bytes()
                        .await
                        .map(|bytes| bytes.to_vec())
                        .map_err(|error| {
                            AppError::Upstream(format!("image download failed: {error}"))
                        });
                }
                Err(AppError::Upstream("image provider returned no data".into()))
            }
            _ => Err(crate::errors::bad_request(
                "Unsupported image provider protocol",
            )),
        }
    }

    pub async fn complete(&self, input: CompleteInput) -> AppResult<String> {
        let prefix = tail(&input.prefix, 2500);
        let suffix = head(&input.suffix, 600);
        let prompt = format!(
            "You are an inline code completion engine. The user is typing in {language}. Continue the file exactly at <cursor>.\n\
             Output only the raw characters to insert. Do not use markdown or code fences, do not explain, and do not repeat the text before or after the cursor. If no useful completion is possible, output nothing.\n\n\
             File: {path}\nLanguage: {language}\n\n<before>\n{prefix}\n</before>\n<cursor>\n<after>\n{suffix}\n</after>",
            language = input.language,
            path = input.path,
            prefix = prefix,
            suffix = suffix,
        );
        let config = self.load().await?;
        let mut messages = vec![Message {
            role: "user".into(),
            content: json!(prompt),
        }];
        if !config.system_prompt.is_empty() {
            messages.insert(
                0,
                Message {
                    role: "system".into(),
                    content: json!(config.system_prompt.clone()),
                },
            );
        }
        let mut selected = self
            .resolve(if config.autocomplete_model.is_empty() {
                &config.model
            } else {
                &config.autocomplete_model
            })
            .await?;
        selected.max_tokens = selected.max_tokens.min(512);
        let messages = messages
            .into_iter()
            .map(|m| json!({"role":m.role,"content":m.content}))
            .collect::<Vec<_>>();
        let session = format!(
            "completion-{}",
            crate::crypto::sha256_hex(input.path.as_bytes())
        );
        let turn = self
            .turn_in_session(&selected, &messages, &[], None, &session, |_| {})
            .await?;
        Ok(clean_completion(&turn.text))
    }

    async fn get_json(&self, url: &str, headers: &[(&str, String)]) -> AppResult<Value> {
        let mut request = self.client.get(url);
        for (key, value) in headers {
            if !value.is_empty() {
                request = request.header(*key, value);
            }
        }
        let response = request
            .send()
            .await
            .map_err(|error| AppError::Upstream(format!("AI provider unavailable: {error}")))?;
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(AppError::Upstream(format!(
                "provider returned {}: {}",
                status,
                body.chars().take(1024).collect::<String>().trim()
            )));
        }
        serde_json::from_str(&body)
            .map_err(|error| AppError::Upstream(format!("invalid provider response: {error}")))
    }

    async fn post_json(
        &self,
        url: &str,
        headers: &[(&str, String)],
        body: &Value,
    ) -> AppResult<Value> {
        let mut request = self.client.post(url).json(body);
        for (key, value) in headers {
            if !value.is_empty() {
                request = request.header(*key, value);
            }
        }
        let response = request
            .send()
            .await
            .map_err(|error| AppError::Upstream(format!("AI provider unavailable: {error}")))?;
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(AppError::Upstream(format!(
                "provider returned {}: {}",
                status,
                text.chars().take(2048).collect::<String>().trim()
            )));
        }
        serde_json::from_str(&text)
            .map_err(|error| AppError::Upstream(format!("invalid provider response: {error}")))
    }

    async fn check(&self, url: &str, headers: &[(&str, String)]) -> AppResult<()> {
        let mut request = self.client.get(url);
        for (key, value) in headers {
            if !value.is_empty() {
                request = request.header(*key, value);
            }
        }
        let response = request
            .send()
            .await
            .map_err(|error| AppError::Upstream(format!("AI provider unavailable: {error}")))?;
        if !response.status().is_success() {
            return Err(AppError::Upstream(format!(
                "provider returned {}",
                response.status()
            )));
        }
        Ok(())
    }
}

impl AiConfig {
    /// Name shown to the user for this connection. The protocol is separate.
    pub fn connection_name(&self) -> String {
        if !self.connection_label.trim().is_empty() {
            return self.connection_label.trim().to_string();
        }
        infer_connection_name(&self.label, &self.provider, &self.base_url)
    }

    fn normalize(&mut self) {
        self.label = self.label.trim().to_string();
        self.provider = self.provider.trim().to_lowercase();
        if self.provider.is_empty() {
            self.provider = String::new();
        }
        self.base_url = self.base_url.trim().trim_end_matches('/').to_string();
        self.model = self.model.trim().to_string();
        self.autocomplete_model = self.autocomplete_model.trim().to_string();
        if self.max_tokens <= 0 {
            self.max_tokens = 1024;
        }
        self.weekly_token_limit = self.weekly_token_limit.clamp(0, 1_000_000_000);
        self.temperature = self.temperature.clamp(0.0, 2.0);
    }
}

fn default_true() -> bool {
    true
}

/// Display name of a direct connection. The protocol stays a separate field so
/// "OpenCode Go" or any user-chosen name never becomes "Custom AI" in the UI.
pub fn infer_connection_name(label: &str, provider: &str, base_url: &str) -> String {
    let label = label.trim();
    if !label.is_empty() {
        return label.to_string();
    }
    let base = base_url.to_lowercase();
    if base.contains("opencode.ai/inference/go") {
        return "OpenCode Go".into();
    }
    let host = reqwest::Url::parse(base_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned));
    if host.as_deref() == Some("api.openai.com") {
        return "OpenAI".into();
    }
    match provider {
        "openai" => "OpenAI".into(),
        "anthropic" => "Anthropic".into(),
        "ollama" => "Ollama".into(),
        _ => host.unwrap_or_else(|| "Conexão personalizada".into()),
    }
}

fn default_weekly_token_limit() -> i64 {
    0
}

fn auth_headers(key: &str) -> Vec<(&'static str, String)> {
    if key.is_empty() {
        Vec::new()
    } else {
        vec![("Authorization", format!("Bearer {key}"))]
    }
}

fn image_backends(config: &AiConfig) -> Vec<ImageProvider> {
    let configured: Vec<ImageProvider> = config
        .image_providers
        .iter()
        .filter(|provider| provider.enabled && !provider.id.trim().is_empty())
        .cloned()
        .collect();
    configured
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for ch in value.chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
            last_dash = false;
        } else if !last_dash && !slug.is_empty() {
            slug.push('-');
            last_dash = true;
        }
        if slug.len() >= 60 {
            break;
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "image".to_string()
    } else {
        slug
    }
}

fn endpoint(base: &str, path: &str) -> String {
    let base = base.trim_end_matches('/');
    if base.ends_with("/v1") {
        format!("{base}{path}")
    } else {
        format!("{base}/v1{path}")
    }
}

fn tail(value: &str, limit: usize) -> &str {
    if value.len() <= limit {
        value
    } else {
        &value[value.len() - limit..]
    }
}

fn head(value: &str, limit: usize) -> &str {
    if value.len() <= limit {
        value
    } else {
        &value[..limit]
    }
}

fn clean_completion(value: &str) -> String {
    let mut value = value.trim().to_string();
    if value.starts_with("```") {
        let mut lines: Vec<&str> = value.lines().collect();
        if lines
            .first()
            .is_some_and(|line| line.trim_start().starts_with("```"))
        {
            lines.remove(0);
        }
        if lines.last().is_some_and(|line| line.trim() == "```") {
            lines.pop();
        }
        value = lines.join("\n");
    }
    value
}
