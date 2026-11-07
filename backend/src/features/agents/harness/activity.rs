use serde_json::Value;

/// Human-readable activity shown in the chat timeline. The frontend prefixes
/// the Toph name, so these strings start with a verb.
pub fn tool_activity(name: &str, args: &Value) -> String {
    match name {
        "read_file" => format!(
            "leu `{}`",
            short(args["path"].as_str().unwrap_or("arquivo"))
        ),
        "edit_file" | "write_file" => {
            format!(
                "editou `{}`",
                short(args["path"].as_str().unwrap_or("arquivo"))
            )
        }
        "delete_file" => format!(
            "removeu `{}`",
            short(args["path"].as_str().unwrap_or("arquivo"))
        ),
        "search" => format!(
            "pesquisou por `{}`",
            short(args["query"].as_str().unwrap_or(""))
        ),
        "list_files" => "listou arquivos do projeto".into(),
        "shell" => "executou um comando no projeto".into(),
        "verify" => "verificou o projeto".into(),
        "submit_research" | "submit_report" => "concluiu a pesquisa".into(),
        "submit_plan" => "montou o plano de alteração".into(),
        "report_blocked" => "encontrou um bloqueio".into(),
        "ask_user" => "perguntou ao usuário".into(),
        "delegate" => format!(
            "passou uma tarefa para @{}",
            short(args["agent"].as_str().unwrap_or("agente"))
        ),
        "fetch_url" => "consultou um link".into(),
        "read_artifact" => "leu um anexo".into(),
        "search_history" => "consultou o histórico".into(),
        "search_memory" => "consultou a memória do projeto".into(),
        "remember" => "salvou uma memória do projeto".into(),
        "mcp_call" => format!(
            "usou a integração `{}`",
            short(args["server"].as_str().unwrap_or("MCP"))
        ),
        "generate_image" => "gerou uma imagem".into(),
        "email_list" | "email_read" => "consultou o e-mail".into(),
        "email_send" => "enviou um e-mail".into(),
        _ => "usou uma ferramenta".into(),
    }
}

fn short(value: &str) -> String {
    let value = value.trim().replace('\n', " ");
    if value.chars().count() <= 80 {
        value
    } else {
        format!("{}…", value.chars().take(79).collect::<String>())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn shell_never_leaks_the_raw_command() {
        let text = tool_activity("shell", &json!({"command":"rm -rf /"}));
        assert_eq!(text, "executou um comando no projeto");
        assert!(!text.contains("rm -rf"));
    }

    #[test]
    fn file_activity_names_the_file() {
        assert_eq!(
            tool_activity("read_file", &json!({"path":"web/src/Chat.tsx"})),
            "leu `web/src/Chat.tsx`"
        );
    }
}
