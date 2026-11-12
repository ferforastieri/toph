use serde_json::{json, Value};
use toph_server::ai::AiConfig;
use toph_server::features::agents::{
    cli::opencode_model,
    engines,
    models::AgentSpec,
    tools::{mutating, needs_permission, shell},
};

fn agent(extra: Value) -> AgentSpec {
    let mut value = json!({
        "id": "toph",
        "chatId": "chat",
        "name": "Toph",
        "handle": "toph",
        "prompt": "Execute the task.",
        "agentMode": "build",
        "permissionMode": "yolo",
        "tools": ["generate_image"],
        "mcpServers": [],
        "emailAccountIds": []
    });
    for (key, item) in extra.as_object().unwrap() {
        value[key] = item.clone();
    }
    serde_json::from_value(value).unwrap()
}

fn config(model: &str) -> AiConfig {
    serde_json::from_value(json!({
        "provider": "custom",
        "baseUrl": "https://opencode.ai/inference/go/openai/v1",
        "model": model,
        "maxTokens": 4096,
        "temperature": 0,
        "autocomplete": false,
        "systemPrompt": "",
        "autocompleteModel": ""
    }))
    .unwrap()
}

#[test]
fn tool_policy_names_are_stable() {
    for name in [
        "write_file",
        "edit_file",
        "delete_file",
        "shell",
        "remember",
    ] {
        assert!(mutating(name), "{name} should be mutating");
        assert!(needs_permission(name), "{name} should ask in ask mode");
    }
    assert!(!mutating("read_file"));
    assert!(!needs_permission("read_file"));
    assert!(needs_permission("mcp_call"));
}

#[test]
fn model_ids_keep_their_provider_and_old_defaults_become_opencode_go() {
    let mut selected = agent(json!({"model": "default::deepseek-v4.1-flash"}));
    assert_eq!(
        opencode_model(&selected, &config("ignored")),
        "opencode-go/deepseek-v4.1-flash"
    );
    selected.model = "opencode-go/kimi-k3".into();
    assert_eq!(
        opencode_model(&selected, &config("ignored")),
        "opencode-go/kimi-k3"
    );
    selected.model.clear();
    assert_eq!(
        opencode_model(&selected, &config("default::glm-5.3")),
        "opencode-go/glm-5.3"
    );
}

#[test]
fn named_connections_keep_their_real_opencode_provider() {
    let mut openai = config("ignored");
    openai.provider = "openai".into();
    openai.base_url = "https://api.openai.com/v1".into();
    let named = agent(json!({"model": "work::gpt-5"}));
    assert_eq!(opencode_model(&named, &openai), "openai/gpt-5");
    let default = agent(json!({"model": "default::gpt-5"}));
    assert_eq!(opencode_model(&default, &openai), "openai/gpt-5");

    let mut google = config("ignored");
    google.provider = "custom".into();
    google.base_url = "https://generativelanguage.googleapis.com/v1beta/openai".into();
    let gemini = agent(json!({"model": "personal::gemini-2.5"}));
    assert_eq!(opencode_model(&gemini, &google), "google/gemini-2.5");

    let legacy = agent(json!({"model": "deepseek-v4.1-flash"}));
    assert_eq!(
        opencode_model(&legacy, &config("ignored")),
        "opencode-go/deepseek-v4.1-flash"
    );
}

#[test]
fn reasoning_effort_becomes_the_opencode_model_variant() {
    let mut selected = agent(json!({"model": "opencode-go/deepseek-v4.1-flash", "effort": "max"}));
    assert_eq!(
        opencode_model(&selected, &config("ignored")),
        "opencode-go/deepseek-v4.1-flash#max"
    );
    selected.effort = "xhigh".into();
    assert_eq!(
        opencode_model(&selected, &config("ignored")),
        "opencode-go/deepseek-v4.1-flash#xhigh"
    );
    selected.effort = "not valid".into();
    assert_eq!(
        opencode_model(&selected, &config("ignored")),
        "opencode-go/deepseek-v4.1-flash#notvalid"
    );
    selected.effort.clear();
    assert_eq!(
        opencode_model(&selected, &config("ignored")),
        "opencode-go/deepseek-v4.1-flash"
    );
}

#[test]
fn every_engine_is_listed_with_its_install_command() {
    let list = engines::list();
    assert!(list.len() >= 7);
    for engine in &list {
        for key in [
            "id",
            "label",
            "binary",
            "installed",
            "install",
            "site",
            "supported",
        ] {
            assert!(engine.get(key).is_some(), "{key} missing from {engine}");
        }
    }
    let opencode = list
        .iter()
        .find(|engine| engine["id"] == "opencode")
        .unwrap();
    assert_eq!(opencode["supported"], true);
    assert!(opencode["install"]
        .as_str()
        .unwrap()
        .contains("opencode.ai"));
}

#[cfg(unix)]
#[tokio::test]
async fn shell_timeout_kills_background_process_group() {
    let dir = tempfile::tempdir().unwrap();
    let error = shell(dir.path(), "sleep 10 & wait", Some(30))
        .await
        .unwrap_err();
    assert!(error.to_string().contains("timed out"));
}
