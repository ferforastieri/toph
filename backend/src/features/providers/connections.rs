use crate::ai::{AiConfig, AiService};
use crate::crypto::{decrypt, encrypt, new_id};
use crate::errors::{bad_request, AppResult};
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: String,
    pub label: String,
    pub config: AiConfig,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionInput {
    #[serde(default)]
    pub id: String,
    pub label: String,
    pub provider: String,
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub clear_key: bool,
    #[serde(default)]
    pub model: String,
}

impl AiService {
    pub async fn connections(&self) -> AppResult<Vec<Connection>> {
        let raw = match self.store.setting("native_ai_connections").await {
            Ok(raw) => raw,
            Err(crate::errors::AppError::NotFound) => return Ok(Vec::new()),
            Err(error) => return Err(error),
        };
        let mut connections: Vec<Connection> =
            serde_json::from_str(&raw).map_err(|e| bad_request(e.to_string()))?;
        for connection in &mut connections {
            if !connection.config.api_key_enc.is_empty() {
                connection.config.api_key = decrypt(&self.key, &connection.config.api_key_enc)?;
            }
        }
        Ok(connections)
    }

    pub async fn public_connections(&self) -> AppResult<serde_json::Value> {
        Ok(serde_json::Value::Array(self.connections().await?.into_iter().map(|c| serde_json::json!({
            "id":c.id,"label":c.label,"provider":c.config.provider,"baseUrl":c.config.base_url,
            "model":c.config.model,"hasKey":!c.config.api_key.is_empty()
        })).collect()))
    }

    pub async fn save_connection(&self, input: ConnectionInput) -> AppResult<()> {
        validate_endpoint(&input.provider, &input.base_url)?;
        if input.label.trim().is_empty() {
            return Err(bad_request("Connection name is required"));
        }
        let mut all = self.connections().await?;
        if all.len() >= 16 && input.id.is_empty() {
            return Err(bad_request("Maximum 16 connections"));
        }
        let old_key = all
            .iter()
            .find(|c| c.id == input.id)
            .map(|c| c.config.api_key.clone())
            .unwrap_or_default();
        let key = if input.clear_key {
            String::new()
        } else if input.api_key.is_empty() {
            old_key
        } else {
            input.api_key
        };
        let id = if input.id.is_empty() {
            new_id()
        } else {
            if !all.iter().any(|c| c.id == input.id) {
                return Err(crate::errors::AppError::NotFound);
            }
            input.id
        };
        let record = Connection {
            id: id.clone(),
            label: input.label,
            config: AiConfig {
                provider: input.provider,
                base_url: input.base_url.trim_end_matches('/').to_owned(),
                api_key: key.clone(),
                api_key_enc: encrypt(&self.key, &key)?,
                model: input.model,
                autocomplete_model: String::new(),
                max_tokens: 4096,
                weekly_token_limit: 0,
                temperature: 0.0,
                autocomplete: false,
                system_prompt: String::new(),
                image_providers: vec![],
            },
        };
        all.retain(|c| c.id != id);
        all.push(record);
        self.store
            .set_setting(
                "native_ai_connections",
                &serde_json::to_string(&all).map_err(|e| bad_request(e.to_string()))?,
            )
            .await
    }

    pub async fn delete_connection(&self, id: &str) -> AppResult<()> {
        let mut all = self.connections().await?;
        all.retain(|c| c.id != id);
        self.store
            .set_setting(
                "native_ai_connections",
                &serde_json::to_string(&all).map_err(|e| bad_request(e.to_string()))?,
            )
            .await
    }

    pub async fn resolve(&self, requested: &str) -> AppResult<AiConfig> {
        let (id, model) = requested.split_once("::").unwrap_or(("default", requested));
        let mut config = if id == "default" {
            self.load().await?
        } else {
            self.connections()
                .await?
                .into_iter()
                .find(|c| c.id == id)
                .ok_or_else(|| bad_request("The selected model connection no longer exists"))?
                .config
        };
        if !model.is_empty() {
            config.model = model.to_string();
        }
        // The default selection can itself refer to a named connection.
        if requested.is_empty() && config.model.contains("::") {
            let selected = config.model.clone();
            return Box::pin(self.resolve(&selected)).await;
        }
        validate_endpoint(&config.provider, &config.base_url)?;
        if config.model.is_empty() {
            return Err(bad_request("Select a model in Settings → AI"));
        }
        Ok(config)
    }
}

pub fn validate_endpoint(provider: &str, base: &str) -> AppResult<()> {
    if !matches!(provider, "openai" | "custom" | "anthropic" | "ollama") {
        return Err(bad_request(
            "Configure a direct model provider in Settings → AI",
        ));
    }
    let url = reqwest::Url::parse(base).map_err(|_| bad_request("Provider URL is required"))?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err(bad_request("Provider URL must be HTTP or HTTPS"));
    }
    Ok(())
}
