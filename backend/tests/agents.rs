use serde_json::{json, Value};
use toph_server::ai::AiConfig;
use toph_server::features::agents::{
    cli::opencode_model,
    engines,
    models::AgentSpec,
    tools::{gateway_definitions, mutating, needs_permission, shell},
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
        "skills": [],
        "mcpServers": [],
        "emailAccountIds": []
    });
    for (key, item) in extra.as_object().unwrap() {
        value[key] = item.clone();
    }
    serde_json::from_value(value).unwrap()
}

fn names(tools: &[Value]) -> Vec<&str> {
    tools
        .iter()
        .filter_map(|tool| tool["name"].as_str())
        .collect()
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
fn gateway_tools_use_the_mcp_envelope() {
    let tools = gateway_definitions(&agent(json!({})));
    assert!(!tools.is_empty());
    for tool in &tools {
        assert!(tool["name"].is_string(), "missing MCP name: {tool}");
        assert!(
            tool["inputSchema"]["type"] == "object",
            "missing inputSchema: {tool}"
        );
        assert!(tool.get("function").is_none(), "OpenAI envelope leaked");
    }
    assert!(names(&tools).contains(&"read_file"));
    assert!(names(&tools).contains(&"write_file"));
    assert!(names(&tools).contains(&"shell"));
    assert!(names(&tools).contains(&"fetch_url"));
    assert!(names(&tools).contains(&"generate_image"));
}

#[test]
fn plan_mode_and_deny_remove_mutating_tools() {
    let plan = gateway_definitions(&agent(json!({"agentMode":"plan"})));
    assert!(!names(&plan).contains(&"write_file"));
    assert!(!names(&plan).contains(&"shell"));
    assert!(names(&plan).contains(&"read_file"));
    let deny = gateway_definitions(&agent(json!({"permissionMode":"deny"})));
    assert!(!names(&deny).contains(&"write_file"));
    assert!(!names(&deny).contains(&"shell"));
    assert!(names(&deny).contains(&"search"));
}

#[test]
fn capabilities_add_their_gateway_tools_only_when_selected() {
    let plain = gateway_definitions(&agent(json!({})));
    assert!(!names(&plain).contains(&"read_skill"));
    assert!(!names(&plain).contains(&"mcp_call"));
    assert!(!names(&plain).contains(&"email_send"));

    let full = gateway_definitions(&agent(json!({
        "skills": ["frontend"],
        "mcpServers": ["stripe"],
        "emailAccountIds": ["mail"]
    })));
    assert!(names(&full).contains(&"read_skill"));
    assert!(names(&full).contains(&"mcp_list"));
    assert!(names(&full).contains(&"mcp_call"));
    assert!(names(&full).contains(&"email_list"));
    assert!(names(&full).contains(&"email_send"));

    let read_only_mail = gateway_definitions(&agent(json!({
        "permissionMode": "deny",
        "emailAccountIds": ["mail"]
    })));
    assert!(names(&read_only_mail).contains(&"email_read"));
    assert!(!names(&read_only_mail).contains(&"email_send"));
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
