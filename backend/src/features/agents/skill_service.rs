//! Managed skills: recipes stored per project and assigned to one or more
//! Tophs. A skill with an empty `agents` list applies to every Toph; otherwise
//! only the listed agent ids see it. The full body never goes into the prompt:
//! the agent reads it on demand with `toph_read_skill`, and proposes new ones
//! with `toph_propose_skill` for the user to approve.

use super::models::now;
use crate::{
    crypto::new_id,
    errors::{bad_request, AppError, AppResult},
    store::Store,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;

/// A recipe is read on demand, so it can be larger than a prompt section.
/// This is still a ceiling: the tool result has to fit in the model context.
pub const MAX_BODY_CHARS: usize = 100_000;
/// One agent cannot flood the review screen with proposals.
pub const MAX_PENDING: i64 = 5;
const MAX_NAME_CHARS: usize = 48;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedSkill {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub description: String,
    pub body: String,
    /// Empty means every Toph in the project.
    pub agents: Vec<String>,
    /// active, pending or archived.
    pub state: String,
    /// A pending change points at the active skill it would replace.
    pub replaces: Option<String>,
    pub proposed_by: Option<String>,
    pub reason: Option<String>,
    /// Set for a skill linked to a SKILL.md file outside the database.
    pub source: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedSkillVersion {
    pub id: i64,
    pub skill_id: String,
    pub name: String,
    pub description: String,
    pub body: String,
    /// "me" or the agent id whose proposal changed it.
    pub by: String,
    pub at: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedSkillInput {
    pub id: Option<String>,
    pub name: String,
    pub description: String,
    pub body: String,
    #[serde(default)]
    pub agents: Vec<String>,
    #[serde(default)]
    pub source: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProposalInput {
    pub name: String,
    pub description: String,
    pub body: String,
    #[serde(default)]
    pub reason: String,
}

#[derive(Clone)]
pub struct Service(pub Store);

impl Service {
    pub fn new(store: Store) -> Self {
        Self(store)
    }

    fn row(row: &sqlx::sqlite::SqliteRow) -> AppResult<ManagedSkill> {
        let agents: String = row.get("agents");
        Ok(ManagedSkill {
            id: row.get("id"),
            project_id: row.get("project_id"),
            name: row.get("name"),
            description: row.get("description"),
            body: row.get("body"),
            agents: serde_json::from_str(&agents).unwrap_or_default(),
            state: row.get("state"),
            replaces: row.get("replaces"),
            proposed_by: row.get("proposed_by"),
            reason: row.get("reason"),
            source: row.get("source"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        })
    }

    pub async fn list(&self, project: &str) -> AppResult<Vec<ManagedSkill>> {
        let rows = sqlx::query(
            "SELECT id,project_id,name,description,body,agents,state,replaces,proposed_by,reason,source,created_at,updated_at \
             FROM agent_skills WHERE project_id=? ORDER BY name",
        )
        .bind(project)
        .fetch_all(self.0.pool())
        .await?;
        rows.iter().map(Self::row).collect()
    }

    pub async fn get(&self, project: &str, id: &str) -> AppResult<ManagedSkill> {
        let row = sqlx::query(
            "SELECT id,project_id,name,description,body,agents,state,replaces,proposed_by,reason,source,created_at,updated_at \
             FROM agent_skills WHERE project_id=? AND id=?",
        )
        .bind(project)
        .bind(id)
        .fetch_optional(self.0.pool())
        .await?
        .ok_or(AppError::NotFound)?;
        Self::row(&row)
    }

    async fn active_by_name(&self, project: &str, name: &str) -> AppResult<Option<ManagedSkill>> {
        let row = sqlx::query(
            "SELECT id,project_id,name,description,body,agents,state,replaces,proposed_by,reason,source,created_at,updated_at \
             FROM agent_skills WHERE project_id=? AND state='active' AND name=?",
        )
        .bind(project)
        .bind(name)
        .fetch_optional(self.0.pool())
        .await?;
        row.as_ref().map(Self::row).transpose()
    }

    /// Active skills this Toph follows, in stable name order.
    pub async fn for_agent(&self, project: &str, agent: &str) -> AppResult<Vec<ManagedSkill>> {
        Ok(self
            .list(project)
            .await?
            .into_iter()
            .filter(|skill| {
                skill.state == "active"
                    && (skill.agents.is_empty() || skill.agents.iter().any(|id| id == agent))
            })
            .collect())
    }

    /// The managed skill with this name or id, when it applies to the agent.
    pub async fn read_for_agent(
        &self,
        project: &str,
        agent: &str,
        name: &str,
    ) -> AppResult<Option<ManagedSkill>> {
        Ok(self
            .for_agent(project, agent)
            .await?
            .into_iter()
            .find(|skill| {
                skill.name.eq_ignore_ascii_case(name) || skill.id.eq_ignore_ascii_case(name)
            }))
    }

    async fn keep(&self, skill: &ManagedSkill, by: &str) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO agent_skill_versions(skill_id,name,description,body,by,at) VALUES(?,?,?,?,?,?)",
        )
        .bind(&skill.id)
        .bind(&skill.name)
        .bind(&skill.description)
        .bind(&skill.body)
        .bind(by)
        .bind(now())
        .execute(self.0.pool())
        .await?;
        Ok(())
    }

    fn validated(input: &ManagedSkillInput) -> AppResult<(String, String, String, Vec<String>)> {
        let name = normalize_name(&input.name)?;
        let description = input.description.trim().to_string();
        let body = input.body.trim().to_string();
        if description.is_empty() {
            return Err(bad_request("Diga quando usar a skill."));
        }
        if body.is_empty() {
            return Err(bad_request("Escreva a receita da skill."));
        }
        if body.chars().count() > MAX_BODY_CHARS {
            return Err(bad_request(format!(
                "A receita passou de {MAX_BODY_CHARS} caracteres."
            )));
        }
        Ok((name, description, body, unique(&input.agents)))
    }

    /// Creates or edits a skill from the Skills screen. Editing keeps the old
    /// version, so every change can be undone.
    pub async fn save(&self, project: &str, input: ManagedSkillInput) -> AppResult<ManagedSkill> {
        let (name, description, body, agents) = Self::validated(&input)?;
        let at = now();
        if let Some(id) = input.id.as_deref() {
            let previous = self.get(project, id).await?;
            if previous.source.is_some() {
                sqlx::query(
                    "UPDATE agent_skills SET agents=?,updated_at=? WHERE id=? AND project_id=?",
                )
                .bind(json!(agents).to_string())
                .bind(at)
                .bind(id)
                .bind(project)
                .execute(self.0.pool())
                .await?;
                return self.get(project, id).await;
            }
            if previous.state == "active"
                && (previous.name != name
                    || previous.description != description
                    || previous.body != body)
            {
                self.keep(&previous, "me").await?;
            }
            if previous.name != name {
                if self.active_by_name(project, &name).await?.is_some() {
                    return Err(bad_request("Já existe uma skill ativa com esse nome."));
                }
            }
            sqlx::query(
                "UPDATE agent_skills SET name=?,description=?,body=?,agents=?,state='active',replaces=NULL,proposed_by=NULL,reason=NULL,updated_at=? \
                 WHERE id=? AND project_id=?",
            )
            .bind(&name)
            .bind(&description)
            .bind(&body)
            .bind(json!(agents).to_string())
            .bind(at)
            .bind(id)
            .bind(project)
            .execute(self.0.pool())
            .await?;
            return self.get(project, id).await;
        }
        if self.active_by_name(project, &name).await?.is_some() {
            return Err(bad_request("Já existe uma skill ativa com esse nome."));
        }
        let id = new_id();
        sqlx::query(
            "INSERT INTO agent_skills(id,project_id,name,description,body,agents,state,source,created_at,updated_at) \
             VALUES(?,?,?,?,?,?,'active',?,?,?)",
        )
        .bind(&id)
        .bind(project)
        .bind(&name)
        .bind(&description)
        .bind(&body)
        .bind(json!(agents).to_string())
        .bind(input.source.as_deref())
        .bind(at)
        .bind(at)
        .execute(self.0.pool())
        .await?;
        self.get(project, &id).await
    }

    /// `toph_propose_skill`: an agent proposes a new skill or a change to one
    /// of its own. The proposal only becomes active after the user approves it.
    pub async fn propose(
        &self,
        project: &str,
        agent: &str,
        input: ProposalInput,
    ) -> AppResult<Value> {
        let name = normalize_name(&input.name)?;
        let description = input.description.trim().to_string();
        let body = input.body.trim().to_string();
        let reason = input.reason.trim().to_string();
        if description.is_empty() || body.is_empty() {
            return Err(bad_request("Faltou quando_usar ou receita."));
        }
        if body.chars().count() > MAX_BODY_CHARS {
            return Err(bad_request(format!(
                "A receita passou de {MAX_BODY_CHARS} caracteres."
            )));
        }
        let pending: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM agent_skills WHERE project_id=? AND state='pending' AND proposed_by=?",
        )
        .bind(project)
        .bind(agent)
        .fetch_one(self.0.pool())
        .await?;
        if pending >= MAX_PENDING {
            return Err(bad_request(format!(
                "Você já tem {MAX_PENDING} propostas esperando revisão. Espere o usuário decidir."
            )));
        }
        let current = self.active_by_name(project, &name).await?;
        if let Some(current) = &current {
            if current.source.is_some() {
                return Err(bad_request(
                    "Essa skill vem de um arquivo do usuário: ela muda lá, não aqui.",
                ));
            }
            if !current.agents.is_empty() && !current.agents.iter().any(|id| id == agent) {
                return Err(bad_request(
                    "Já existe uma skill com esse nome que não é sua: escolha outro nome.",
                ));
            }
            if current.description == description && current.body == body {
                return Ok(json!({"message":"Essa skill já está assim.", "skill":current}));
            }
        }
        let waiting = sqlx::query(
            "SELECT id FROM agent_skills WHERE project_id=? AND state='pending' AND proposed_by=? AND name=?",
        )
        .bind(project)
        .bind(agent)
        .bind(&name)
        .fetch_optional(self.0.pool())
        .await?;
        let at = now();
        let id = if let Some(row) = waiting {
            let id: String = row.get("id");
            sqlx::query(
                "UPDATE agent_skills SET description=?,body=?,agents=?,replaces=?,reason=?,updated_at=? \
                 WHERE id=? AND project_id=?",
            )
            .bind(&description)
            .bind(&body)
            .bind(json!(current.as_ref().map(|skill| skill.agents.clone()).unwrap_or_else(|| vec![agent.to_string()])).to_string())
            .bind(current.as_ref().map(|skill| skill.id.clone()))
            .bind(if reason.is_empty() { None } else { Some(reason) })
            .bind(at)
            .bind(&id)
            .bind(project)
            .execute(self.0.pool())
            .await?;
            id
        } else {
            let id = new_id();
            sqlx::query(
                "INSERT INTO agent_skills(id,project_id,name,description,body,agents,state,replaces,proposed_by,reason,created_at,updated_at) \
                 VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?)",
            )
            .bind(&id)
            .bind(project)
            .bind(&name)
            .bind(&description)
            .bind(&body)
            .bind(json!(current.as_ref().map(|skill| skill.agents.clone()).unwrap_or_else(|| vec![agent.to_string()])).to_string())
            .bind(current.as_ref().map(|skill| skill.id.clone()))
            .bind(agent)
            .bind(if reason.is_empty() { None } else { Some(reason) })
            .bind(at)
            .bind(at)
            .execute(self.0.pool())
            .await?;
            id
        };
        let skill = self.get(project, &id).await?;
        Ok(json!({
            "message": "Proposta enviada. Ela só vale depois que o usuário aprovar, na tela de Skills.",
            "skill": skill
        }))
    }

    /// The user approves or refuses a pending proposal.
    pub async fn decide(
        &self,
        project: &str,
        id: &str,
        approve: bool,
    ) -> AppResult<Option<ManagedSkill>> {
        let pending = self.get(project, id).await?;
        if pending.state != "pending" {
            return Err(AppError::NotFound);
        }
        if !approve {
            self.remove(project, id).await?;
            return Ok(None);
        }
        if let Some(target_id) = pending.replaces.as_deref() {
            let target = self.get(project, target_id).await?;
            if target.state == "active" {
                self.keep(&target, pending.proposed_by.as_deref().unwrap_or("me"))
                    .await?;
                sqlx::query(
                    "UPDATE agent_skills SET description=?,body=?,updated_at=? WHERE id=? AND project_id=?",
                )
                .bind(&pending.description)
                .bind(&pending.body)
                .bind(now())
                .bind(target_id)
                .bind(project)
                .execute(self.0.pool())
                .await?;
                self.remove(project, id).await?;
                return Ok(Some(self.get(project, target_id).await?));
            }
        }
        if self.active_by_name(project, &pending.name).await?.is_some() {
            return Err(bad_request("Já existe uma skill ativa com esse nome."));
        }
        sqlx::query(
            "UPDATE agent_skills SET state='active',replaces=NULL,proposed_by=NULL,reason=NULL,updated_at=? \
             WHERE id=? AND project_id=?",
        )
        .bind(now())
        .bind(id)
        .bind(project)
        .execute(self.0.pool())
        .await?;
        Ok(Some(self.get(project, id).await?))
    }

    pub async fn versions(&self, project: &str, id: &str) -> AppResult<Vec<ManagedSkillVersion>> {
        self.get(project, id).await?;
        let rows = sqlx::query(
            "SELECT id,skill_id,name,description,body,by,at FROM agent_skill_versions WHERE skill_id=? ORDER BY at DESC,id DESC",
        )
        .bind(id)
        .fetch_all(self.0.pool())
        .await?;
        Ok(rows
            .iter()
            .map(|row| ManagedSkillVersion {
                id: row.get("id"),
                skill_id: row.get("skill_id"),
                name: row.get("name"),
                description: row.get("description"),
                body: row.get("body"),
                by: row.get("by"),
                at: row.get("at"),
            })
            .collect())
    }

    /// Restores a previous version. The current one is kept too, so this can
    /// be undone as well.
    pub async fn restore(
        &self,
        project: &str,
        id: &str,
        version_id: i64,
    ) -> AppResult<ManagedSkill> {
        let current = self.get(project, id).await?;
        let version = sqlx::query(
            "SELECT name,description,body FROM agent_skill_versions WHERE id=? AND skill_id=?",
        )
        .bind(version_id)
        .bind(id)
        .fetch_optional(self.0.pool())
        .await?
        .ok_or(AppError::NotFound)?;
        let name: String = version.get("name");
        let name = if name != current.name && self.active_by_name(project, &name).await?.is_some() {
            current.name.clone()
        } else {
            name
        };
        self.keep(&current, "me").await?;
        sqlx::query(
            "UPDATE agent_skills SET name=?,description=?,body=?,updated_at=? WHERE id=? AND project_id=?",
        )
        .bind(&name)
        .bind(version.get::<String, _>("description"))
        .bind(version.get::<String, _>("body"))
        .bind(now())
        .bind(id)
        .bind(project)
        .execute(self.0.pool())
        .await?;
        self.get(project, id).await
    }

    pub async fn archive(
        &self,
        project: &str,
        id: &str,
        archived: bool,
    ) -> AppResult<ManagedSkill> {
        let skill = self.get(project, id).await?;
        if skill.state == "pending" {
            return Err(AppError::NotFound);
        }
        if !archived && self.active_by_name(project, &skill.name).await?.is_some() {
            return Err(bad_request("Já existe uma skill ativa com esse nome."));
        }
        sqlx::query("UPDATE agent_skills SET state=?,updated_at=? WHERE id=? AND project_id=?")
            .bind(if archived { "archived" } else { "active" })
            .bind(now())
            .bind(id)
            .bind(project)
            .execute(self.0.pool())
            .await?;
        self.get(project, id).await
    }

    pub async fn remove(&self, project: &str, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM agent_skill_versions WHERE skill_id=?")
            .bind(id)
            .execute(self.0.pool())
            .await?;
        sqlx::query("DELETE FROM agent_skills WHERE id=? AND project_id=?")
            .bind(id)
            .bind(project)
            .execute(self.0.pool())
            .await?;
        Ok(())
    }
}

/// Names become short, unique handles ("testes do core" -> "testes-do-core").
pub fn normalize_name(raw: &str) -> AppResult<String> {
    let name: String = raw
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| match c {
            'a'..='z' | '0'..='9' | '-' | '_' => c,
            'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            _ => '-',
        })
        .collect();
    let name = name
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .take(MAX_NAME_CHARS)
        .collect::<String>();
    if name.is_empty() {
        return Err(bad_request("Dê um nome para a skill."));
    }
    Ok(name)
}

fn unique(ids: &[String]) -> Vec<String> {
    let mut out = Vec::new();
    for id in ids {
        let id = id.trim();
        if !id.is_empty() && !out.iter().any(|seen| seen == id) {
            out.push(id.to_string());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_become_stable_slugs() {
        assert_eq!(normalize_name("Testes do Core").unwrap(), "testes-do-core");
        assert_eq!(
            normalize_name("  Revisão   de código ").unwrap(),
            "revisao-de-codigo"
        );
        assert!(normalize_name("...").is_err());
    }

    #[test]
    fn duplicate_agent_ids_are_removed() {
        assert_eq!(
            unique(&["a".into(), "a".into(), " ".into(), "b".into()]),
            vec!["a".to_string(), "b".to_string()]
        );
    }
}
