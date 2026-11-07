use std::path::{Component, Path};

use serde::{Deserialize, Serialize};

const MAX_RESEARCH_FILES: usize = 24;
const MAX_EXCERPT_CHARS: usize = 6_000;
const MAX_TOTAL_EXCERPTS: usize = 24_000;
const MAX_SUMMARY_CHARS: usize = 8_000;
const MAX_CONSTRAINTS: usize = 40;
const MAX_PLAN_FILES: usize = 24;
const MAX_INSTRUCTIONS_CHARS: usize = 4_000;
const MAX_TOTAL_INSTRUCTIONS: usize = 24_000;
const MAX_VERIFICATION_COMMANDS: usize = 8;
const MAX_COMMAND_CHARS: usize = 500;

/// Structured output of the read-only research phase.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResearchReport {
    pub summary: String,
    #[serde(default)]
    pub files: Vec<ResearchFile>,
    #[serde(default)]
    pub constraints: Vec<String>,
    #[serde(default)]
    pub open_questions: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResearchFile {
    pub path: String,
    #[serde(default)]
    pub relevance: String,
    #[serde(default)]
    pub excerpt: String,
}

impl ResearchReport {
    pub fn validate(&self) -> Result<(), String> {
        if self.summary.trim().is_empty() {
            return Err("summary must explain what needs to change".into());
        }
        if self.summary.chars().count() > MAX_SUMMARY_CHARS {
            return Err(format!("summary exceeds {MAX_SUMMARY_CHARS} characters"));
        }
        if self.files.len() > MAX_RESEARCH_FILES {
            return Err(format!("at most {MAX_RESEARCH_FILES} files are allowed"));
        }
        let mut excerpt_chars = 0usize;
        for file in &self.files {
            validate_path(&file.path)?;
            if file.excerpt.chars().count() > MAX_EXCERPT_CHARS {
                return Err(format!(
                    "excerpt for {} exceeds {MAX_EXCERPT_CHARS} characters",
                    file.path
                ));
            }
            excerpt_chars += file.excerpt.chars().count();
        }
        if excerpt_chars > MAX_TOTAL_EXCERPTS {
            return Err(format!(
                "total excerpt size exceeds {MAX_TOTAL_EXCERPTS} characters; keep only relevant snippets"
            ));
        }
        if self.constraints.len() > MAX_CONSTRAINTS {
            return Err(format!("at most {MAX_CONSTRAINTS} constraints are allowed"));
        }
        Ok(())
    }

    pub fn system_message(&self) -> String {
        format!(
            "RELATÓRIO DE PESQUISA (dados verificados no projeto):\n{}",
            serde_json::to_string_pretty(self).unwrap_or_default()
        )
    }
}

pub const PLAN_ACTIONS: [&str; 3] = ["edit", "create", "delete"];

/// Structured plan produced by the architect phase and executed by the editor
/// phase. It is the only source of files the editor may touch.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChangePlan {
    pub goal: String,
    pub files: Vec<PlannedFile>,
    pub verification: Vec<String>,
    #[serde(default)]
    pub acceptance: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PlannedFile {
    pub path: String,
    #[serde(default = "default_action")]
    pub action: String,
    pub instructions: String,
}

fn default_action() -> String {
    "edit".into()
}

impl ChangePlan {
    pub fn validate(&self) -> Result<(), String> {
        if self.goal.trim().is_empty() {
            return Err("goal is required".into());
        }
        if self.files.is_empty() {
            return Err("the plan must name at least one file".into());
        }
        if self.files.len() > MAX_PLAN_FILES {
            return Err(format!("at most {MAX_PLAN_FILES} files are allowed"));
        }
        if self.verification.is_empty() {
            return Err("verification must contain at least one real command".into());
        }
        if self.verification.len() > MAX_VERIFICATION_COMMANDS {
            return Err(format!(
                "at most {MAX_VERIFICATION_COMMANDS} verification commands are allowed"
            ));
        }
        let mut instructions_chars = 0usize;
        for file in &self.files {
            validate_path(&file.path)?;
            if !PLAN_ACTIONS.contains(&file.action.as_str()) {
                return Err(format!(
                    "invalid action for {}: use edit, create or delete",
                    file.path
                ));
            }
            if file.instructions.trim().is_empty() {
                return Err(format!("instructions for {} are empty", file.path));
            }
            if file.instructions.chars().count() > MAX_INSTRUCTIONS_CHARS {
                return Err(format!(
                    "instructions for {} exceed {MAX_INSTRUCTIONS_CHARS} characters",
                    file.path
                ));
            }
            instructions_chars += file.instructions.chars().count();
        }
        if instructions_chars > MAX_TOTAL_INSTRUCTIONS {
            return Err(format!(
                "total instruction size exceeds {MAX_TOTAL_INSTRUCTIONS} characters"
            ));
        }
        for command in &self.verification {
            let command = command.trim();
            if command.is_empty() {
                return Err("verification commands cannot be empty".into());
            }
            if command.chars().count() > MAX_COMMAND_CHARS {
                return Err(format!(
                    "verification command exceeds {MAX_COMMAND_CHARS} characters"
                ));
            }
        }
        Ok(())
    }

    pub fn paths(&self) -> Vec<String> {
        self.files.iter().map(|file| file.path.clone()).collect()
    }

    pub fn allows(&self, path: &str) -> bool {
        self.files.iter().any(|file| file.path == path)
    }

    pub fn action_for(&self, path: &str) -> Option<&str> {
        self.files
            .iter()
            .find(|file| file.path == path)
            .map(|file| file.action.as_str())
    }

    pub fn system_message(&self) -> String {
        format!(
            "PLANO DE ALTERAÇÃO (execute exatamente estes arquivos):\n{}",
            serde_json::to_string_pretty(self).unwrap_or_default()
        )
    }
}

fn validate_path(path: &str) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err("file path is empty".into());
    }
    let parsed = Path::new(path);
    if parsed.is_absolute() {
        return Err(format!("file path must be relative: {path}"));
    }
    for component in parsed.components() {
        match component {
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(format!("file path escapes the project: {path}"));
            }
            _ => {}
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report() -> ResearchReport {
        ResearchReport {
            summary: "move the timestamp".into(),
            files: vec![ResearchFile {
                path: "web/src/Chat.tsx".into(),
                relevance: "bubble".into(),
                excerpt: "<p>hello</p>".into(),
            }],
            constraints: vec![],
            open_questions: vec![],
        }
    }

    #[test]
    fn research_rejects_paths_outside_the_project() {
        let mut value = report();
        value.files[0].path = "../secret".into();
        assert!(value.validate().is_err());
    }

    #[test]
    fn plan_requires_a_real_verification_command() {
        let mut plan = ChangePlan {
            goal: "change".into(),
            files: vec![PlannedFile {
                path: "web/src/Chat.tsx".into(),
                action: "edit".into(),
                instructions: "move it".into(),
            }],
            verification: vec![],
            acceptance: vec![],
        };
        assert!(plan.validate().is_err());
        plan.verification.push("npm test".into());
        assert!(plan.validate().is_ok());
        assert!(plan.allows("web/src/Chat.tsx"));
    }
}
