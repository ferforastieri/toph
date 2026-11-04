use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use std::time::Duration;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::crypto::{decrypt, encrypt, load_or_create_key};
use crate::errors::{AppError, AppResult};
use crate::store::Store;

const SETTING_KEY: &str = "ai_config";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
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

fn message_text(content: &Value) -> String {
    if let Some(text) = content.as_str() {
        return text.to_string();
    }
    content
        .as_array()
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n")
        })
        .unwrap_or_default()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModel {
    pub id: String,
    pub label: String,
    pub provider: String,
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
    store: Store,
    key: Vec<u8>,
    client: Client,
    default_opencode_url: String,
    default_opencode_auth: String,
    autocomplete_cache: Arc<RwLock<Option<String>>>,
}

impl AiService {
    pub fn new(
        store: Store,
        key_file: &Path,
        default_opencode_url: String,
        default_opencode_auth: String,
    ) -> AppResult<Self> {
        Ok(Self {
            store,
            key: load_or_create_key(key_file)?,
            client: Client::builder()
                .timeout(Duration::from_secs(600))
                .build()
                .map_err(|error| AppError::Internal(error.into()))?,
            default_opencode_url,
            default_opencode_auth,
            autocomplete_cache: Arc::new(RwLock::new(None)),
        })
    }

    pub async fn load(&self) -> AppResult<AiConfig> {
        let raw = match self.store.setting(SETTING_KEY).await {
            Ok(raw) => raw,
            Err(AppError::NotFound) => {
                return Ok(AiConfig {
                    provider: "opencode".into(),
                    base_url: self.default_opencode_url.trim_end_matches('/').to_string(),
                    api_key: self.default_opencode_auth.clone(),
                    api_key_enc: String::new(),
                    model: String::new(),
                    autocomplete_model: String::new(),
                    max_tokens: 1024,
                    weekly_token_limit: default_weekly_token_limit(),
                    temperature: 0.0,
                    autocomplete: false,
                    system_prompt: String::new(),
                    image_providers: Vec::new(),
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
        if config.provider == "opencode" {
            if config.base_url.is_empty() {
                config.base_url = self.default_opencode_url.trim_end_matches('/').to_string();
            }
            if config.api_key.is_empty() && config.api_key_enc.is_empty() {
                config.api_key = self.default_opencode_auth.clone();
            } else {
                config.api_key = normalize_opencode_auth(&config.api_key);
            }
        }
        config.normalize();
        Ok(config)
    }

    pub async fn public(&self) -> AppResult<PublicConfig> {
        let config = self.load().await?;
        Ok(PublicConfig {
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
            "opencode" | "openai" | "codex" | "custom" | "claude" | "anthropic" | "ollama"
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
        let old = self.load().await.unwrap_or_else(|_| AiConfig {
            provider: "opencode".into(),
            base_url: String::new(),
            api_key: String::new(),
            api_key_enc: String::new(),
            model: String::new(),
            autocomplete_model: String::new(),
            max_tokens: 1024,
            weekly_token_limit: default_weekly_token_limit(),
            temperature: 0.0,
            autocomplete: false,
            system_prompt: String::new(),
            image_providers: Vec::new(),
        });
        let api_key = if input.clear_key.unwrap_or(false) {
            String::new()
        } else if let Some(key) = input.api_key.filter(|key| !key.trim().is_empty()) {
            key.trim().to_string()
        } else if provider == "opencode" && old.api_key.is_empty() {
            self.default_opencode_auth.clone()
        } else {
            old.api_key
        };
        let api_key = if provider == "opencode" {
            normalize_opencode_auth(&api_key)
        } else {
            api_key
        };
        let api_key_enc =
            encrypt(&self.key, &api_key).map_err(|error| AppError::Internal(error.into()))?;
        let mut image_providers = Vec::new();
        for input in input.image_providers {
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
        };
        config.normalize();
        self.store
            .set_setting(
                SETTING_KEY,
                &serde_json::to_string(&config).unwrap_or_default(),
            )
            .await?;
        self.public().await
    }

    pub async fn test(&self) -> AppResult<()> {
        let config = self.load().await?;
        if config.provider.is_empty() {
            return Err(crate::errors::bad_request("AI provider is not configured"));
        }
        let (url, headers) = match config.provider.as_str() {
            "opencode" => (
                format!("{}/api/info", config.base_url),
                vec![("Authorization", config.api_key.clone())],
            ),
            "claude" | "anthropic" => (
                endpoint(&config.base_url, "/models"),
                vec![
                    ("x-api-key", config.api_key.clone()),
                    ("anthropic-version", "2023-06-01".into()),
                ],
            ),
            "ollama" => (format!("{}/api/tags", config.base_url), Vec::new()),
            _ => (
                endpoint(&config.base_url, "/models"),
                vec![("Authorization", format!("Bearer {}", config.api_key))],
            ),
        };
        self.check(&url, &headers).await
    }

    pub async fn models(&self) -> AppResult<Vec<AiModel>> {
        let config = self.load().await?;
        match config.provider.as_str() {
            "opencode" => self.models_opencode(&config).await,
            "claude" | "anthropic" => self.models_anthropic(&config).await,
            "ollama" => self.models_ollama(&config).await,
            _ => self.models_openai(&config).await,
        }
    }

    async fn models_opencode(&self, config: &AiConfig) -> AppResult<Vec<AiModel>> {
        let value = self
            .get_json(
                &format!("{}/api/model", config.base_url.trim_end_matches('/')),
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
            if item.get("enabled").and_then(Value::as_bool) != Some(true)
                || item.get("status").and_then(Value::as_str) == Some("deprecated")
            {
                continue;
            }
            let Some(id) = item.get("modelID").and_then(Value::as_str) else {
                continue;
            };
            let provider = item.get("providerID").and_then(Value::as_str).unwrap_or("");
            let label = item
                .get("name")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .unwrap_or(id);
            models.push(AiModel {
                id: format!("{provider}/{id}"),
                label: label.into(),
                provider: provider.into(),
                variants: item
                    .get("variants")
                    .and_then(Value::as_array)
                    .map(|values| {
                        values
                            .iter()
                            .filter_map(|value| value.get("id").and_then(Value::as_str))
                            .map(ToOwned::to_owned)
                            .collect()
                    })
                    .unwrap_or_default(),
                inputs: item
                    .pointer("/capabilities/input")
                    .and_then(Value::as_array)
                    .map(|values| {
                        values
                            .iter()
                            .filter_map(Value::as_str)
                            .map(ToOwned::to_owned)
                            .collect()
                    })
                    .unwrap_or_default(),
            });
        }
        models.sort_by(|a, b| a.label.to_lowercase().cmp(&b.label.to_lowercase()));
        Ok(models)
    }

    async fn models_openai(&self, config: &AiConfig) -> AppResult<Vec<AiModel>> {
        let value = self
            .get_json(
                &endpoint(&config.base_url, "/models"),
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
                &endpoint(&config.base_url, "/models"),
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
        image: Option<ImageTool>,
        tools: Vec<String>,
    ) -> AppResult<String> {
        let mut config = self.load().await?;
        if config.provider == "opencode" {
            return Err(crate::errors::bad_request(
                "OpenCode uses its own agent API",
            ));
        }
        if let Some(model) = model.filter(|value| !value.is_empty()) {
            config.model = model.to_string();
        }
        if messages.is_empty() {
            return Err(crate::errors::bad_request("messages are required"));
        }
        match config.provider.as_str() {
            "claude" | "anthropic" => self.chat_anthropic(&config, &messages).await,
            "ollama" => self.chat_ollama(&config, &messages).await,
            _ => {
                self.chat_openai(&config, &messages, effort, image.as_ref(), &tools)
                    .await
            }
        }
    }

    async fn chat_openai(
        &self,
        config: &AiConfig,
        messages: &[Message],
        effort: Option<&str>,
        image: Option<&ImageTool>,
        tools: &[String],
    ) -> AppResult<String> {
        let providers = image_backends(config);
        let allow_image = tools.is_empty() || tools.iter().any(|tool| tool == "generate_image");
        let mut conversation: Vec<Value> = messages
            .iter()
            .map(|message| json!({ "role": message.role, "content": message.content }))
            .collect();
        let mut use_tools = image.is_some() && allow_image && !providers.is_empty();
        for _ in 0..8 {
            let mut body = json!({
                "model": config.model,
                "messages": conversation,
                "max_tokens": config.max_tokens,
                "temperature": config.temperature,
            });
            if let Some(effort) = effort.filter(|value| !value.is_empty()) {
                body["reasoning_effort"] = json!(effort);
            }
            if use_tools {
                body["tools"] = image_tools(&providers);
                body["tool_choice"] = json!("auto");
            }
            let value = match self
                .post_json(
                    &endpoint(&config.base_url, "/chat/completions"),
                    &auth_headers(&config.api_key),
                    &body,
                )
                .await
            {
                Ok(value) => value,
                // Some models/providers reject the `tools` field. Fall back to a
                // plain text completion instead of failing the whole reply.
                Err(_) if use_tools => {
                    use_tools = false;
                    continue;
                }
                Err(error) => return Err(error),
            };
            let message = value
                .pointer("/choices/0/message")
                .cloned()
                .unwrap_or(Value::Null);
            let calls = message
                .get("tool_calls")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            if calls.is_empty() {
                return message
                    .get("content")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .filter(|text| !text.trim().is_empty())
                    .ok_or_else(|| AppError::Upstream("AI returned no choices".into()));
            }
            conversation.push(json!({
                "role": "assistant",
                "content": message.get("content").cloned().unwrap_or(Value::Null),
                "tool_calls": calls,
            }));
            let Some(tool) = image else {
                return Err(AppError::Upstream(
                    "AI requested a tool but none is available".into(),
                ));
            };
            for call in &calls {
                let name = call
                    .pointer("/function/name")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let call_id = call.get("id").and_then(Value::as_str).unwrap_or("call_0");
                let arguments = call
                    .pointer("/function/arguments")
                    .and_then(Value::as_str)
                    .unwrap_or("{}");
                let result = match name {
                    "generate_image" => {
                        self.generate_image(config, tool, arguments, &providers)
                            .await
                    }
                    other => Err(AppError::BadRequest(format!("unknown tool: {other}"))),
                };
                let payload = match result {
                    Ok(value) => value,
                    Err(error) => json!({ "ok": false, "error": error.to_string() }),
                };
                conversation.push(json!({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": payload.to_string(),
                }));
            }
        }
        Err(AppError::Upstream(
            "AI kept calling tools without producing an answer".into(),
        ))
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
        let provider = providers
            .iter()
            .find(|provider| !requested_provider.is_empty() && provider.id == requested_provider)
            .unwrap_or(&providers[0]);
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
        let client = Client::builder()
            .timeout(Duration::from_secs(600))
            .build()
            .map_err(|error| AppError::Internal(error.into()))?;
        match provider.kind.as_str() {
            "gemini" => {
                let base = if provider.base_url.is_empty() {
                    "https://generativelanguage.googleapis.com"
                } else {
                    provider.base_url.as_str()
                };
                let model = if model.trim().is_empty() {
                    "gemini-2.5-flash-image"
                } else {
                    model
                };
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
                let base = if provider.base_url.is_empty() {
                    "https://api.stability.ai"
                } else {
                    provider.base_url.as_str()
                };
                let url = format!(
                    "{}/v2beta/stable-image/generate/core",
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
                let base = if provider.base_url.is_empty() {
                    "https://api.replicate.com"
                } else {
                    provider.base_url.as_str()
                };
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
            _ => {
                let base = if provider.base_url.is_empty() {
                    "https://api.openai.com"
                } else {
                    provider.base_url.as_str()
                };
                let url = endpoint(base, "/images/generations");
                let model = if model.trim().is_empty() {
                    "gpt-image-2"
                } else {
                    model
                };
                let headers = auth_headers(&provider.api_key);
                let mut value = self
                    .post_json(
                        &url,
                        &headers,
                        &json!({ "model": model, "prompt": prompt, "size": size, "n": 1 }),
                    )
                    .await;
                if value.is_err() && model != "gpt-image-1" {
                    value = self
                        .post_json(
                            &url,
                            &headers,
                            &json!({
                                "model": "gpt-image-1",
                                "prompt": prompt,
                                "size": size,
                                "n": 1,
                            }),
                        )
                        .await;
                }
                let value = value?;
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
        }
    }

    async fn chat_anthropic(&self, config: &AiConfig, messages: &[Message]) -> AppResult<String> {
        let mut system = String::new();
        let chat: Vec<&Message> = messages
            .iter()
            .filter(|message| {
                if message.role == "system" {
                    system.push_str(&message_text(&message.content));
                    system.push('\n');
                    false
                } else {
                    true
                }
            })
            .collect();
        let mut body = json!({
            "model": config.model,
            "max_tokens": config.max_tokens,
            "temperature": config.temperature,
            "messages": chat,
        });
        if !system.trim().is_empty() {
            body["system"] = json!(system.trim());
        }
        let value = self
            .post_json(
                &endpoint(&config.base_url, "/messages"),
                &[
                    ("x-api-key", config.api_key.clone()),
                    ("anthropic-version", "2023-06-01".into()),
                ],
                &body,
            )
            .await?;
        let parts: Vec<String> = value
            .get("content")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| {
                        (item.get("type").and_then(Value::as_str) == Some("text"))
                            .then(|| item.get("text").and_then(Value::as_str))
                            .flatten()
                            .map(ToOwned::to_owned)
                    })
                    .collect()
            })
            .unwrap_or_default();
        Ok(parts.join("\n"))
    }

    async fn chat_ollama(&self, config: &AiConfig, messages: &[Message]) -> AppResult<String> {
        let body = json!({
            "model": config.model,
            "messages": messages,
            "stream": false,
            "options": {
                "temperature": config.temperature,
                "num_predict": config.max_tokens,
            },
        });
        let value = self
            .post_json(
                &format!("{}/api/chat", config.base_url.trim_end_matches('/')),
                &[],
                &body,
            )
            .await?;
        value
            .pointer("/message/content")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .ok_or_else(|| AppError::Upstream("AI returned no message".into()))
    }

    /// Current OpenCode Go usage windows (rolling 5-hour, weekly, monthly).
    /// The token comes from the local OpenCode credential store; it is never
    /// exposed to the browser.
    pub async fn go_usage(&self) -> AppResult<Value> {
        let config = self.load().await?;
        if config.provider != "opencode-go" && !config.model.starts_with("opencode-go/") {
            return Ok(json!({
                "available": false,
                "reason": "Os limites de 5 horas, semana e mês estão disponíveis apenas para o OpenCode Go."
            }));
        }
        let Some(token) = opencode_go_token().await else {
            return Ok(json!({
                "available": false,
                "reason": "OpenCode Go credential not found"
            }));
        };
        let response = self
            .client
            .get("https://opencode.ai/zen/go/v1/usage")
            .bearer_auth(token)
            .send()
            .await
            .map_err(|error| {
                AppError::Upstream(format!("OpenCode Go usage request failed: {error}"))
            })?;
        let status = response.status();
        let payload: Value = response.json().await.unwrap_or_else(|_| json!({}));
        if !status.is_success() {
            return Ok(json!({
                "available": false,
                "reason": format!("OpenCode Go usage returned {status}"),
                "status": status.as_u16()
            }));
        }
        Ok(json!({
            "available": true,
            "usage": payload.get("usage").cloned().unwrap_or(payload)
        }))
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
        if config.provider == "opencode" {
            return self.complete_opencode(&config, &prompt).await;
        }
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
        let text = self.chat(messages, None, None, None, Vec::new()).await?;
        Ok(clean_completion(&text))
    }

    async fn complete_opencode(&self, config: &AiConfig, prompt: &str) -> AppResult<String> {
        if config.base_url.is_empty() {
            return Err(crate::errors::bad_request("OpenCode base URL is required"));
        }
        let mut candidates = Vec::new();
        let mut add = |model: &str| {
            let model = model.trim();
            if !model.is_empty() && !candidates.iter().any(|current| current == model) {
                candidates.push(model.to_string());
            }
        };

        add(&config.autocomplete_model);
        if let Some(cached) = self
            .autocomplete_cache
            .read()
            .ok()
            .and_then(|cache| cache.clone())
        {
            add(&cached);
        }
        for model in [
            "opencode-go/claude-haiku-5-5",
            "opencode-go/minimax-m3.1-flash",
            "opencode-go/step-5-preview",
            "opencode-go/mimo-v2.6-flash",
            "opencode-go/gemini-4-argon",
            "opencode-go/deepseek-v4.1-flash",
            "opencode-go/beam-free",
            "opencode/beam-free",
            "opencode/deepseek-v4.1-flash-free",
        ] {
            add(model);
        }
        add(&config.model);
        drop(add);

        // If the known light models are not available for this account, derive
        // a short fallback list from the provider catalog instead of failing.
        if let Ok(models) = self.models_opencode(config).await {
            let mut added = 0;
            for model in models {
                if added >= 6 {
                    break;
                }
                let id = model.id.to_lowercase();
                if (id.contains("free")
                    || id.contains("flash")
                    || id.contains("haiku")
                    || id.contains("mini")
                    || id.contains("beam"))
                    && !candidates.iter().any(|current| current == &model.id)
                {
                    candidates.push(model.id);
                    added += 1;
                }
            }
        }

        let mut last_error = None;
        for model in candidates {
            let result = tokio::time::timeout(
                Duration::from_secs(6),
                self.generate_opencode(config, &model, prompt),
            )
            .await
            .unwrap_or_else(|_| Err(AppError::Upstream("autocomplete model timed out".into())));
            match result {
                Ok(text) => {
                    let completion = clean_completion(&text);
                    if !completion.trim().is_empty() {
                        if let Ok(mut cache) = self.autocomplete_cache.write() {
                            *cache = Some(model);
                        }
                        return Ok(completion);
                    }
                }
                Err(error) => last_error = Some(error),
            }
        }
        Err(last_error.unwrap_or_else(|| {
            AppError::Upstream("OpenCode returned no autocomplete result".into())
        }))
    }

    async fn generate_opencode(
        &self,
        config: &AiConfig,
        model: &str,
        prompt: &str,
    ) -> AppResult<String> {
        let Some((provider, id)) = model.split_once('/') else {
            return Err(crate::errors::bad_request("invalid autocomplete model"));
        };
        let body = json!({
            "prompt": prompt,
            "model": { "providerID": provider, "id": id },
        });
        let value = self
            .post_json(
                &format!(
                    "{}/api/experimental/generate",
                    config.base_url.trim_end_matches('/')
                ),
                &auth_headers(&config.api_key),
                &body,
            )
            .await?;
        Ok(value
            .get("text")
            .and_then(Value::as_str)
            .or_else(|| value.pointer("/data/text").and_then(Value::as_str))
            .unwrap_or_default()
            .to_string())
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
    fn normalize(&mut self) {
        self.provider = self.provider.trim().to_lowercase();
        if self.provider.is_empty() {
            self.provider = "opencode".into();
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

fn opencode_db_path() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("OPENCODE_DATA_DIR") {
        return Some(PathBuf::from(dir).join("opencode.db"));
    }
    if let Some(dir) = std::env::var_os("XDG_DATA_HOME") {
        return Some(PathBuf::from(dir).join("opencode").join("opencode.db"));
    }
    std::env::var_os("HOME").map(|home| {
        PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("opencode")
            .join("opencode.db")
    })
}

async fn opencode_go_token() -> Option<String> {
    let path = opencode_db_path()?;
    if !path.is_file() {
        return None;
    }
    let options = sqlx::sqlite::SqliteConnectOptions::new()
        .filename(&path)
        .read_only(true)
        .create_if_missing(false);
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .ok()?;
    let raw: Option<String> = sqlx::query_scalar(
        "SELECT value FROM credential WHERE integration_id = 'opencode' AND active = 1 ORDER BY time_updated DESC LIMIT 1",
    )
    .fetch_optional(&pool)
    .await
    .ok()
    .flatten();
    pool.close().await;
    let parsed: Value = serde_json::from_str(&raw?).ok()?;
    parsed
        .get("access")
        .and_then(Value::as_str)
        .or_else(|| parsed.get("key").and_then(Value::as_str))
        .map(str::to_string)
}

fn default_true() -> bool {
    true
}

fn default_weekly_token_limit() -> i64 {
    10_000_000
}

/// Accept either the raw OpenCode service password or a complete
/// Authorization header. OpenCode's local server uses HTTP Basic auth with the
/// `opencode` user, so a pasted password is converted for convenience.
fn normalize_opencode_auth(key: &str) -> String {
    let key = key.trim();
    if key.is_empty()
        || key.starts_with("Basic ")
        || key.starts_with("Bearer ")
        || key.starts_with("basic ")
        || key.starts_with("bearer ")
    {
        key.to_string()
    } else {
        format!("Basic {}", STANDARD.encode(format!("opencode:{key}")))
    }
}

fn auth_headers(key: &str) -> Vec<(&'static str, String)> {
    if key.is_empty() {
        Vec::new()
    } else {
        vec![("Authorization", key.to_string())]
    }
}

fn image_tools(providers: &[ImageProvider]) -> Value {
    let available: Vec<Value> = providers
        .iter()
        .map(|provider| {
            json!({
                "id": provider.id,
                "label": provider.label,
                "model": provider.model,
                "kind": provider.kind,
            })
        })
        .collect();
    let ids: Vec<String> = providers
        .iter()
        .map(|provider| provider.id.clone())
        .collect();
    json!([{
        "type": "function",
        "function": {
            "name": "generate_image",
            "description": "Gera uma imagem (PNG) com um dos provedores de imagem configurados e salva o arquivo dentro do projeto atual. Use sempre que o usuário pedir para criar, desenhar, redesenhar ou variar imagens, avatares, logos, ícones ou ilustrações. Depois de gerar, mostre a imagem na resposta usando markdown com o campo url retornado.",
            "parameters": {
                "type": "object",
                "properties": {
                    "prompt": {
                        "type": "string",
                        "description": "Descrição visual detalhada da imagem, em inglês, incluindo estilo, cores, composição e fundo."
                    },
                    "filename": {
                        "type": "string",
                        "description": "Nome do arquivo sem extensão. Opcional."
                    },
                    "size": {
                        "type": "string",
                        "enum": ["1024x1024", "1536x1024", "1024x1536"],
                        "description": "Tamanho da imagem. Padrão 1024x1024."
                    },
                    "provider": {
                        "type": "string",
                        "enum": ids,
                        "description": format!("Provedor de imagem. Disponíveis: {}", available.iter().map(|item| format!("#{} {} ({})", item["id"].as_str().unwrap_or(""), item["label"].as_str().unwrap_or(""), item["model"].as_str().unwrap_or(""))).collect::<Vec<_>>().join("; "))
                    },
                    "model": {
                        "type": "string",
                        "description": "Modelo de imagem. Opcional; usa o modelo do provedor escolhido."
                    }
                },
                "required": ["prompt"]
            }
        }
    }])
}

fn image_backends(config: &AiConfig) -> Vec<ImageProvider> {
    let configured: Vec<ImageProvider> = config
        .image_providers
        .iter()
        .filter(|provider| provider.enabled && !provider.id.trim().is_empty())
        .cloned()
        .collect();
    if !configured.is_empty() {
        return configured;
    }
    // Backwards compatible default: reuse the main OpenAI-compatible account.
    if matches!(config.provider.as_str(), "openai" | "codex" | "custom") {
        return vec![ImageProvider {
            id: "openai".into(),
            label: "OpenAI".into(),
            kind: "openai".into(),
            base_url: config.base_url.clone(),
            model: "gpt-image-2".into(),
            api_key: config.api_key.clone(),
            api_key_enc: String::new(),
            enabled: true,
        }];
    }
    Vec::new()
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
