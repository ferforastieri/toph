//! Project and built-in skills: `SKILL.md` files with YAML frontmatter,
//! discovered per project and enabled per agent.
//!
//! Progressive disclosure is the whole point: only `name` and `description`
//! reach the system prompt, and the body is loaded on demand through the
//! `read_skill` tool. A project with 30 skills therefore costs a few hundred
//! tokens instead of tens of thousands, and the full text is only read when the
//! model actually decides to use it.

use crate::{
    errors::{bad_request, AppError, AppResult},
    workspace::WorkspaceService,
};
use rust_embed::RustEmbed;
use std::path::Path;

/// Metadata alone is enough to choose a skill; the body is read on demand.
pub const MAX_DESCRIPTION_CHARS: usize = 400;
/// Guards against a runaway `SKILL.md` blowing up the context window.
pub const MAX_BODY_CHARS: usize = 24_000;
/// Only the head of the file is read to parse frontmatter.
const FRONTMATTER_BYTES: u64 = 8 * 1024;
/// Directory names scanned inside the project root, in priority order.
const DIRECTORIES: [&str; 3] = [".toph/skills", ".agents/skills", ".claude/skills"];

#[derive(RustEmbed)]
#[folder = "skills/"]
struct BuiltinSkills;

#[derive(Clone, Debug)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    /// Project-relative path to the `SKILL.md`, or the embedded path when
    /// `builtin` is true. Reused by `read_skill`.
    pub path: String,
    builtin: bool,
}

fn split_frontmatter(raw: &str) -> (&str, &str) {
    let trimmed = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    let Some(rest) = trimmed.strip_prefix("---") else {
        return ("", trimmed);
    };
    // The opening fence must be followed by a newline to count as frontmatter.
    let Some(rest) = rest
        .strip_prefix("\r\n")
        .or_else(|| rest.strip_prefix('\n'))
    else {
        return ("", trimmed);
    };
    match rest.find("\n---") {
        Some(end) => (&rest[..end], &rest[end + 4..]),
        None => ("", trimmed),
    }
}

/// Minimal `key: value` frontmatter reader. Nested YAML is ignored on purpose:
/// descriptions are single-line, and a full parser would be dead weight.
fn field(frontmatter: &str, key: &str) -> String {
    for line in frontmatter.lines() {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.trim() != key {
            continue;
        }
        let value = value.trim();
        let value = value
            .strip_prefix('"')
            .and_then(|v| v.strip_suffix('"'))
            .or_else(|| value.strip_prefix('\'').and_then(|v| v.strip_suffix('\'')))
            .unwrap_or(value);
        return value.trim().to_string();
    }
    String::new()
}

/// Reads at most `FRONTMATTER_BYTES` from a path, so listing stays cheap even
/// with large skill bodies.
fn head(path: &Path, limit: u64) -> AppResult<String> {
    use std::io::Read;
    let file = std::fs::File::open(path)?;
    let mut buffer = Vec::new();
    file.take(limit).read_to_end(&mut buffer)?;
    Ok(String::from_utf8_lossy(&buffer).into_owned())
}

fn parse_raw(relative: &str, raw: &str, builtin: bool) -> Option<Skill> {
    let (frontmatter, _) = split_frontmatter(raw);
    let folder = relative.rsplit('/').nth(1).unwrap_or("skill").to_string();
    let name = field(frontmatter, "name");
    let description: String = field(frontmatter, "description")
        .chars()
        .take(MAX_DESCRIPTION_CHARS)
        .collect();
    // A skill without a description cannot be chosen by the model, so it is
    // skipped instead of polluting the prompt with a blind name.
    if description.is_empty() {
        return None;
    }
    Some(Skill {
        id: if name.is_empty() {
            folder.clone()
        } else {
            name.clone()
        },
        name: if name.is_empty() { folder } else { name },
        description,
        path: relative.to_string(),
        builtin,
    })
}

fn parse(root: &Path, relative: &str) -> Option<Skill> {
    let raw = head(&root.join(relative), FRONTMATTER_BYTES).ok()?;
    parse_raw(relative, &raw, false)
}

fn parse_builtin(relative: &str) -> Option<Skill> {
    let file = BuiltinSkills::get(relative)?;
    parse_raw(relative, &String::from_utf8_lossy(&file.data), true)
}

fn builtin_skills() -> Vec<Skill> {
    let mut found: Vec<Skill> = BuiltinSkills::iter()
        .filter(|path| path.ends_with("/SKILL.md"))
        .filter_map(|path| parse_builtin(&path))
        .collect();
    found.sort_by(|a, b| a.id.cmp(&b.id));
    found
}

/// Lists the skills available in a project. Ordering is by directory priority,
/// then by id, and is stable so the prompt stays cache-friendly.
pub fn discover(root: &Path) -> Vec<Skill> {
    let mut found: Vec<Skill> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for directory in DIRECTORIES {
        let Ok(entries) = std::fs::read_dir(root.join(directory)) else {
            continue;
        };
        let mut names: Vec<String> = entries
            .flatten()
            .filter(|entry| entry.path().is_dir())
            .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
            .collect();
        names.sort();
        for folder in names {
            let relative = format!("{directory}/{folder}/SKILL.md");
            if !root.join(&relative).is_file() {
                continue;
            }
            let Some(skill) = parse(root, &relative) else {
                continue;
            };
            // The first directory that defines an id wins.
            if !seen.insert(skill.id.clone()) {
                continue;
            }
            found.push(skill);
        }
    }
    // Project skills take precedence over identically named built-in skills.
    for skill in builtin_skills() {
        if seen.insert(skill.id.clone()) {
            found.push(skill);
        }
    }
    found
}

/// Only the skills the agent enabled, in declaration order.
pub fn enabled(root: &Path, ids: &[String]) -> Vec<Skill> {
    if ids.is_empty() {
        return Vec::new();
    }
    let all = discover(root);
    ids.iter()
        .filter_map(|id| all.iter().find(|skill| &skill.id == id).cloned())
        .collect()
}

pub fn read(workspace: &WorkspaceService, root: &Path, id: &str) -> AppResult<String> {
    let skill = discover(root)
        .into_iter()
        .find(|skill| skill.id == id)
        .ok_or_else(|| bad_request(format!("Unknown skill: {id}")))?;
    let content = if skill.builtin {
        let file = BuiltinSkills::get(&skill.path).ok_or(AppError::NotFound)?;
        String::from_utf8_lossy(&file.data).into_owned()
    } else {
        workspace.read(root, &skill.path)?.content
    };
    if content.chars().count() > MAX_BODY_CHARS {
        return Err(AppError::TooLarge);
    }
    let (_, body) = split_frontmatter(&content);
    Ok(body.trim_start().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temporary() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("toph-skill-{}", crate::crypto::new_id()));
        std::fs::create_dir_all(path.join(".toph/skills/browser")).unwrap();
        path
    }

    #[test]
    fn reads_single_line_frontmatter() {
        let root = temporary();
        std::fs::write(
            root.join(".toph/skills/browser/SKILL.md"),
            "---\nname: browser\ndescription: \"Automate pages\"\n---\n\nStep one.\n",
        )
        .unwrap();
        let skills = discover(&root);
        let browser = skills
            .iter()
            .find(|skill| skill.id == "browser")
            .expect("project skill");
        assert_eq!(browser.description, "Automate pages");
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn skips_skills_without_a_description() {
        let root = temporary();
        std::fs::write(
            root.join(".toph/skills/browser/SKILL.md"),
            "---\nname: browser\n---\nBody\n",
        )
        .unwrap();
        assert!(!discover(&root).iter().any(|skill| skill.id == "browser"));
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn includes_builtin_skills() {
        let root = temporary();
        let skills = discover(&root);
        let skill = skills
            .iter()
            .find(|skill| skill.id == "chrome-devtools")
            .expect("builtin chrome-devtools skill");
        assert!(skill.description.contains("Chrome"));
        let workspace = WorkspaceService::new(vec![root.clone()]).unwrap();
        let body = read(&workspace, &root, "chrome-devtools").unwrap();
        assert!(body.contains("# Chrome DevTools"));
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn enabled_filter_keeps_declaration_order() {
        let root = temporary();
        std::fs::create_dir_all(root.join(".toph/skills/other")).unwrap();
        std::fs::write(
            root.join(".toph/skills/browser/SKILL.md"),
            "---\nname: browser\ndescription: B\n---\n",
        )
        .unwrap();
        std::fs::write(
            root.join(".toph/skills/other/SKILL.md"),
            "---\nname: other\ndescription: O\n---\n",
        )
        .unwrap();
        let picked = enabled(&root, &["other".into(), "browser".into()]);
        assert_eq!(
            picked.iter().map(|s| s.id.as_str()).collect::<Vec<_>>(),
            ["other", "browser"]
        );
        std::fs::remove_dir_all(&root).ok();
    }
}
