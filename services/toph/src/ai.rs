use std::path::Path;
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
    pub temperature: f64,
    pub autocomplete: bool,
    #[serde(rename = "systemPrompt")]
    pub system_prompt: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicConfig {
    pub provider: String,
    pub base_url: String,
    pub model: String,
    pub autocomplete_model: String,
    pub max_tokens: i32,
    pub temperature: f64,
    pub autocomplete: bool,
    pub system_prompt: String,
    pub has_key: bool,
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
    pub temperature: f64,
    pub autocomplete: bool,
    pub system_prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: String,
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
                .timeout(Duration::from_secs(90))
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
                    temperature: 0.0,
                    autocomplete: false,
                    system_prompt: String::new(),
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
            temperature: config.temperature,
            autocomplete: config.autocomplete,
            system_prompt: config.system_prompt,
            has_key: !config.api_key.is_empty(),
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
            temperature: 0.0,
            autocomplete: false,
            system_prompt: String::new(),
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
        let mut config = AiConfig {
            provider,
            base_url,
            api_key,
            api_key_enc,
            model: input.model.trim().to_string(),
            autocomplete_model: input.autocomplete_model.trim().to_string(),
            max_tokens,
            temperature,
            autocomplete: input.autocomplete,
            system_prompt: input.system_prompt,
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
            _ => self.chat_openai(&config, &messages, effort).await,
        }
    }

    async fn chat_openai(
        &self,
        config: &AiConfig,
        messages: &[Message],
        effort: Option<&str>,
    ) -> AppResult<String> {
        let mut body = json!({
            "model": config.model,
            "messages": messages,
            "max_tokens": config.max_tokens,
            "temperature": config.temperature,
        });
        if let Some(effort) = effort.filter(|value| !value.is_empty()) {
            body["reasoning_effort"] = json!(effort);
        }
        let value = self
            .post_json(
                &endpoint(&config.base_url, "/chat/completions"),
                &auth_headers(&config.api_key),
                &body,
            )
            .await?;
        value
            .pointer("/choices/0/message/content")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .ok_or_else(|| AppError::Upstream("AI returned no choices".into()))
    }

    async fn chat_anthropic(&self, config: &AiConfig, messages: &[Message]) -> AppResult<String> {
        let mut system = String::new();
        let chat: Vec<&Message> = messages
            .iter()
            .filter(|message| {
                if message.role == "system" {
                    system.push_str(&message.content);
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

    pub async fn complete(&self, input: CompleteInput) -> AppResult<String> {
        let prefix = tail(&input.prefix, 6000);
        let suffix = head(&input.suffix, 1500);
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
            content: prompt,
        }];
        if !config.system_prompt.is_empty() {
            messages.insert(
                0,
                Message {
                    role: "system".into(),
                    content: config.system_prompt.clone(),
                },
            );
        }
        let text = self.chat(messages, None, None).await?;
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
            match self.generate_opencode(config, &model, prompt).await {
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
        self.temperature = self.temperature.clamp(0.0, 2.0);
    }
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
