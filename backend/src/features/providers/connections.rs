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
    /// One-time identifier migration, preserving both provider and model. This
    /// never retries a failed model through a different provider.
    pub async fn model_reference_migrations(
        &self,
    ) -> AppResult<std::collections::HashMap<String, Vec<String>>> {
        let default = self.load().await?;
        let mut configs = vec![("default".to_owned(), default)];
        configs.extend(
            self.connections()
                .await?
                .into_iter()
                .map(|c| (c.id, c.config)),
        );
        let mut bindings = std::collections::HashMap::<String, Vec<String>>::new();
        for (id, config) in configs {
            if super::protocol::console_gateway(&config.base_url)
                .is_some_and(|url| url.ends_with("/go"))
            {
                bindings
                    .entry("opencode-go/".into())
                    .or_default()
                    .push(id.clone());
            }
            if config.provider == "openai"
                && reqwest::Url::parse(&config.base_url)
                    .ok()
                    .and_then(|url| url.host_str().map(str::to_owned))
                    .as_deref()
                    == Some("api.openai.com")
            {
                bindings.entry("openai/".into()).or_default().push(id);
            }
        }
        Ok(bindings)
    }

    pub async fn migrate_agent_model(&self, model: &str) -> AppResult<String> {
        if !legacy_model_reference(model) {
            return Ok(model.into());
        }
        migrate_model_reference(model, &self.model_reference_migrations().await?)
    }

    pub async fn migrate_layout_models(&self, layout: &mut serde_json::Value) -> AppResult<()> {
        let Some(agents) = layout
            .pointer_mut("/chats/tophs")
            .and_then(serde_json::Value::as_array_mut)
        else {
            return Ok(());
        };
        if !agents
            .iter()
            .any(|a| a["model"].as_str().is_some_and(legacy_model_reference))
        {
            return Ok(());
        }
        let bindings = self.model_reference_migrations().await?;
        for agent in agents {
            if let Some(model) = agent["model"].as_str() {
                // Unconfigured/ambiguous selections stay visible for editing;
                // execution reports a precise configuration error before billing.
                if let Ok(model) = migrate_model_reference(model, &bindings) {
                    agent["model"] = serde_json::json!(model);
                }
            }
        }
        Ok(())
    }

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

fn legacy_model_reference(model: &str) -> bool {
    !model.contains("::") && (model.starts_with("opencode-go/") || model.starts_with("openai/"))
}

fn migrate_model_reference(
    model: &str,
    bindings: &std::collections::HashMap<String, Vec<String>>,
) -> AppResult<String> {
    if !legacy_model_reference(model) {
        return Ok(model.into());
    }
    let prefix = if model.starts_with("opencode-go/") {
        "opencode-go/"
    } else {
        "openai/"
    };
    match bindings.get(prefix).map(Vec::as_slice) {
        Some([connection]) => Ok(format!("{connection}::{}", &model[prefix.len()..])),
        _ => Err(bad_request(format!("Reconfigure o modelo {model} deste Toph: selecione explicitamente a conexão correspondente. Nenhuma outra conexão foi utilizada."))),
    }
}

#[cfg(test)]
mod reference_tests {
    use super::*;
    #[test]
    fn migration_preserves_model_and_provider_without_falling_back() {
        let bindings = std::collections::HashMap::from([
            ("opencode-go/".into(), vec!["default".into()]),
            ("openai/".into(), vec!["openai-account".into()]),
        ]);
        assert_eq!(
            migrate_model_reference("openai/gpt-6-astra", &bindings).unwrap(),
            "openai-account::gpt-6-astra"
        );
        assert_eq!(
            migrate_model_reference("opencode-go/deepseek-v4.1-flash", &bindings).unwrap(),
            "default::deepseek-v4.1-flash"
        );
        assert_eq!(
            migrate_model_reference("router::openai/gpt-6-astra", &bindings).unwrap(),
            "router::openai/gpt-6-astra"
        );
        assert!(
            migrate_model_reference("openai/gpt-6-astra", &std::collections::HashMap::new())
                .is_err()
        );
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
