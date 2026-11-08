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
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

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

/// The recipe without the YAML frontmatter, for the built-in catalog.
pub(crate) fn recipe(raw: &str) -> &str {
    split_frontmatter(raw).1.trim_start()
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

const LOCAL_TEXT_EXTENSIONS: [&str; 8] =
    ["md", "txt", "json", "yaml", "yml", "csv", "toml", "html"];
const LOCAL_SCRIPT_EXTENSIONS: [&str; 9] =
    ["py", "sh", "js", "mjs", "cjs", "ts", "rb", "go", "swift"];
/// A local recipe is read on demand; this keeps one accidental giant file
/// from blowing up the tool result.
pub const LOCAL_BODY_CHARS: usize = 100_000;

/// A `SKILL.md` already on the machine: from Claude Code, Codex, OpenCode,
/// the shared agents directory, or the project itself.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSkill {
    pub source: String,
    pub name: String,
    pub description: String,
    pub origin: String,
    pub body_length: usize,
    pub files: Vec<String>,
    pub scripts: bool,
}

fn home() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}

/// Every skill directory Toph knows how to read, including the tools' own
/// global directories. Project skills come first, so they win on duplicates.
pub fn local(root: &Path) -> Vec<LocalSkill> {
    let mut roots: Vec<(PathBuf, &'static str, usize)> = vec![
        (root.join(".toph/skills"), "Projeto (.toph)", 3),
        (root.join(".agents/skills"), "Projeto (.agents)", 3),
        (root.join(".claude/skills"), "Projeto (.claude)", 3),
        (root.join(".opencode/skills"), "Projeto (.opencode)", 3),
    ];
    if let Some(home) = home() {
        let claude = std::env::var_os("CLAUDE_CONFIG_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".claude"));
        let codex = std::env::var_os("CODEX_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".codex"));
        let config = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".config"));
        roots.push((claude.join("skills"), "Claude Code", 3));
        roots.push((codex.join("skills"), "Codex", 3));
        roots.push((config.join("opencode/skills"), "OpenCode", 3));
        roots.push((config.join("opencode/skill"), "OpenCode", 3));
        roots.push((home.join(".agents/skills"), "Agents", 3));
        // Claude Code keeps enabled plugins under cache/<market>/<plugin>/<version>.
        roots.push((claude.join("plugins/cache"), "Plugin Claude Code", 6));
    }
    let mut found = Vec::new();
    let mut seen = HashSet::new();
    for (path, origin, depth) in roots {
        scan(&path, origin, depth, &mut found, &mut seen);
    }
    found.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then(a.origin.cmp(&b.origin))
    });
    found
}

fn scan(
    root: &Path,
    origin: &str,
    depth: usize,
    out: &mut Vec<LocalSkill>,
    seen: &mut HashSet<String>,
) {
    if !root.exists() {
        return;
    }
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    while let Some((dir, level)) = stack.pop() {
        if dir.join("SKILL.md").is_file() {
            let source = dir.join("SKILL.md");
            let key = std::fs::canonicalize(&source)
                .map(|path| path.display().to_string())
                .unwrap_or_else(|_| source.display().to_string());
            if seen.insert(key) {
                if let Some(skill) = parse_local(&source, origin) {
                    out.push(skill);
                }
            }
            // A directory with SKILL.md is one skill; do not look inside it.
            continue;
        }
        if level >= depth {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if name == "node_modules" || name == ".git" {
                continue;
            }
            stack.push((path, level + 1));
        }
    }
}

fn parse_local(source: &Path, origin: &str) -> Option<LocalSkill> {
    let raw = head(source, FRONTMATTER_BYTES).ok()?;
    let (frontmatter, _) = split_frontmatter(&raw);
    let folder = source.parent()?.file_name()?.to_string_lossy().to_string();
    let name = field(frontmatter, "name");
    let name = if name.is_empty() { folder } else { name };
    let description = field(frontmatter, "description")
        .chars()
        .take(MAX_DESCRIPTION_CHARS)
        .collect::<String>();
    let full = std::fs::read_to_string(source).ok()?;
    let (_, body) = split_frontmatter(&full);
    let (files, scripts) = local_files(source.parent()?);
    Some(LocalSkill {
        source: source.display().to_string(),
        name,
        description,
        origin: origin.to_string(),
        body_length: body.trim().chars().count(),
        files,
        scripts,
    })
}

fn local_files(dir: &Path) -> (Vec<String>, bool) {
    let mut files = Vec::new();
    let mut scripts = false;
    let mut stack = vec![(dir.to_path_buf(), 0usize)];
    while let Some((current, level)) = stack.pop() {
        if level > 2 {
            continue;
        }
        let Ok(entries) = std::fs::read_dir(&current) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if path.file_name().and_then(|name| name.to_str()) == Some("node_modules") {
                    continue;
                }
                stack.push((path, level + 1));
                continue;
            }
            let extension = path
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("")
                .to_lowercase();
            if LOCAL_SCRIPT_EXTENSIONS.contains(&extension.as_str()) {
                scripts = true;
            }
            if path.file_name().and_then(|name| name.to_str()) == Some("SKILL.md") {
                continue;
            }
            if LOCAL_TEXT_EXTENSIONS.contains(&extension.as_str()) {
                if let Ok(relative) = path.strip_prefix(dir) {
                    files.push(relative.to_string_lossy().replace('\\', "/"));
                }
            }
        }
    }
    files.sort();
    (files, scripts)
}

/// Reads a linked skill's current recipe, or one of its supporting text files.
/// The file must stay inside the skill's own directory.
pub fn read_local(source: &str, file: Option<&str>) -> AppResult<String> {
    let source = std::fs::canonicalize(source).map_err(|_| AppError::NotFound)?;
    if source.file_name().and_then(|name| name.to_str()) != Some("SKILL.md") {
        return Err(bad_request("Not a SKILL.md file"));
    }
    let dir = source.parent().ok_or(AppError::NotFound)?;
    if let Some(file) = file {
        let file = file.trim();
        if file.is_empty() {
            return read_local(&source.display().to_string(), None);
        }
        let path = std::fs::canonicalize(dir.join(file)).map_err(|_| AppError::NotFound)?;
        if !path.starts_with(dir) {
            return Err(AppError::Forbidden);
        }
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !LOCAL_TEXT_EXTENSIONS.contains(&extension.as_str()) {
            return Err(bad_request("Only the skill's text files can be read."));
        }
        return Ok(limit(std::fs::read_to_string(path)?));
    }
    let raw = std::fs::read_to_string(&source)?;
    let body = split_frontmatter(&raw).1.trim_start().to_string();
    Ok(limit(body))
}

fn limit(content: String) -> String {
    if content.chars().count() <= LOCAL_BODY_CHARS {
        content
    } else {
        format!(
            "{}\n\n[… cortado em {} caracteres]",
            content.chars().take(LOCAL_BODY_CHARS).collect::<String>(),
            LOCAL_BODY_CHARS
        )
    }
}

/// The metadata of a source that is still present on the machine.
pub fn find_local(root: &Path, source: &str) -> Option<LocalSkill> {
    let canonical = std::fs::canonicalize(source).ok()?;
    local(root).into_iter().find(|skill| {
        std::fs::canonicalize(&skill.source)
            .map(|path| path == canonical)
            .unwrap_or(false)
    })
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
    fn scans_nested_skill_dirs_and_supporting_files() {
        let root = temporary();
        let dir = root.join(".opencode/skills/team/release");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(
            dir.join("SKILL.md"),
            "---\nname: release\ndescription: Prepare a release\n---\n\nRun the tests.\n",
        )
        .unwrap();
        std::fs::write(dir.join("style.md"), "Short sentences.\n").unwrap();
        let mut found = Vec::new();
        let mut seen = std::collections::HashSet::new();
        scan(
            &root.join(".opencode/skills"),
            "OpenCode",
            3,
            &mut found,
            &mut seen,
        );
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "release");
        assert_eq!(found[0].origin, "OpenCode");
        assert_eq!(found[0].files, vec!["style.md"]);
        assert!(!found[0].scripts);
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn linked_skill_reads_only_files_inside_its_folder() {
        let root = temporary();
        let dir = root.join(".claude/skills/release");
        std::fs::create_dir_all(&dir).unwrap();
        let source = dir.join("SKILL.md");
        std::fs::write(
            &source,
            "---\nname: release\ndescription: Prepare a release\n---\n\nRun the tests.\n",
        )
        .unwrap();
        std::fs::write(dir.join("style.md"), "Short sentences.\n").unwrap();
        let outside = root.join("outside.md");
        std::fs::write(&outside, "secret\n").unwrap();
        let source = source.display().to_string();
        assert_eq!(read_local(&source, None).unwrap().trim(), "Run the tests.");
        assert_eq!(
            read_local(&source, Some("style.md")).unwrap(),
            "Short sentences.\n"
        );
        assert!(read_local(&source, Some("../outside.md")).is_err());
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
