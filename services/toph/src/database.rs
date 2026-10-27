//! Database profiles, query execution, schema introspection and row editing.
//!
//! The behavior intentionally mirrors the Go implementation that previously
//! powered this API: DSNs are encrypted at rest with AES-GCM, SQL profiles are
//! opened through the native sqlx drivers (plus native clients for SQL Server,
//! Oracle and ClickHouse), and the NoSQL adapters expose the same read-only
//! surfaces as their Go counterparts.

use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::str::FromStr;
use std::time::{Duration, Instant};

use futures_util::{StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Number, Value};
use sqlx::encode::IsNull;
use sqlx::error::BoxDynError;
use sqlx::mysql::{MySqlArguments, MySqlPool, MySqlPoolOptions, MySqlRow};
use sqlx::postgres::{PgArgumentBuffer, PgArguments, PgPool, PgPoolOptions, PgRow};
use sqlx::query::Query as SqlxQuery;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions, SqliteRow};
use sqlx::{Column, Executor, MySql, Postgres, Row, Sqlite, TypeInfo, ValueRef};
use tokio_util::compat::TokioAsyncWriteCompatExt;
use url::Url;

use crate::crypto::{decrypt, encrypt, load_or_create_key, new_id};
use crate::errors::{AppError, AppResult};
use crate::model::DbProfile;
use crate::store::Store;

const QUERY_TIMEOUT: Duration = Duration::from_secs(30);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_SCHEMA_TABLES: usize = 500;
const MAX_SCHEMA_ROWS: usize = 1_000_000;

#[derive(Clone)]
pub struct DatabaseService {
    store: Store,
    key: Vec<u8>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub folder: String,
    #[serde(default)]
    pub project_root: String,
    #[serde(default)]
    pub driver: String,
    #[serde(default)]
    pub dsn: String,
    #[serde(default)]
    pub read_only: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RowChange {
    #[serde(default)]
    pub schema: String,
    #[serde(default)]
    pub table: String,
    #[serde(default)]
    pub key: Option<HashMap<String, Value>>,
    #[serde(default)]
    pub values: Option<HashMap<String, Value>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryColumn {
    pub name: String,
    #[serde(rename = "type")]
    pub type_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub columns: Vec<QueryColumn>,
    pub rows: Vec<Vec<Value>>,
    pub row_count: usize,
    pub truncated: bool,
    pub duration_ms: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaColumn {
    pub name: String,
    #[serde(rename = "type")]
    pub type_name: String,
    pub nullable: bool,
    pub primary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaTable {
    pub schema: String,
    pub name: String,
    pub columns: Vec<SchemaColumn>,
}

impl DatabaseService {
    pub fn new(store: Store, key_file: &Path) -> AppResult<Self> {
        Ok(Self {
            store,
            key: load_or_create_key(key_file)?,
        })
    }

    pub async fn create(&self, input: ProfileInput) -> AppResult<DbProfile> {
        let driver = input.driver.trim().to_ascii_lowercase();
        if !supported(&driver) {
            return Err(AppError::UnsupportedDriver);
        }
        let name = input.name;
        let dsn = input.dsn;
        if name.trim().is_empty() || dsn.trim().is_empty() {
            return Err(AppError::BadRequest("name and dsn are required".into()));
        }
        let encrypted = encrypt(&self.key, &dsn)?;
        self.store
            .create_db_profile(DbProfile {
                id: new_id(),
                name,
                folder: input.folder.trim().to_string(),
                project_root: input.project_root.trim().to_string(),
                driver,
                dsn_encrypted: encrypted,
                read_only: input.read_only,
                created_at: String::new(),
                updated_at: String::new(),
            })
            .await
    }

    pub async fn delete(&self, id: &str) -> AppResult<()> {
        self.store.delete_db_profile(id).await
    }

    pub async fn test(&self, id: &str) -> AppResult<()> {
        let (profile, dsn) = self.profile_and_dsn(id).await?;
        match profile.driver.as_str() {
            "mongodb" => test_mongo(&dsn).await,
            "redis" => test_redis(&dsn).await,
            "cassandra" => test_cassandra(&dsn).await,
            "elasticsearch" => test_elasticsearch(&dsn).await,
            "neo4j" => test_neo4j(&dsn).await,
            "sqlserver" => test_sqlserver(&dsn, profile.read_only).await,
            "oracle" => test_oracle(&dsn).await,
            "clickhouse" => test_clickhouse(&dsn).await,
            "postgres" => {
                let pool = open_pg(&dsn, profile.read_only).await?;
                ping_pg(&pool).await?;
                pool.close().await;
                Ok(())
            }
            "mysql" => {
                let pool = open_mysql(&dsn).await?;
                ping_mysql(&pool).await?;
                pool.close().await;
                Ok(())
            }
            "sqlite" => {
                let pool = open_sqlite(&dsn, profile.read_only).await?;
                ping_sqlite(&pool).await?;
                pool.close().await;
                Ok(())
            }
            _ => Err(AppError::UnsupportedDriver),
        }
    }

    pub async fn query(&self, id: &str, sql: &str, max_rows: usize) -> AppResult<QueryResult> {
        if sql.trim().is_empty() {
            return Err(AppError::BadRequest("query is required".into()));
        }
        let max_rows = clamp_max_rows(max_rows);
        let (profile, dsn) = self.profile_and_dsn(id).await?;
        if profile.read_only {
            let allowed = match profile.driver.as_str() {
                // The MongoDB and Elasticsearch adapters only expose reads.
                "mongodb" | "elasticsearch" => true,
                "redis" => is_read_only_redis(sql),
                "cassandra" => is_read_only_cassandra(sql),
                "neo4j" => is_read_only_neo4j(sql),
                _ => is_read_only_query(sql),
            };
            if !allowed {
                return Err(AppError::BadRequest("profile is read-only".into()));
            }
        }
        match profile.driver.as_str() {
            "mongodb" => query_mongo(&dsn, sql, max_rows).await,
            "redis" => query_redis(&dsn, sql, max_rows).await,
            "cassandra" => query_cassandra(&dsn, sql, max_rows).await,
            "elasticsearch" => query_elasticsearch(&dsn, sql, max_rows).await,
            "neo4j" => query_neo4j(&dsn, sql, max_rows).await,
            "postgres" => query_pg(&dsn, sql, max_rows, profile.read_only).await,
            "mysql" => query_mysql(&dsn, sql, max_rows).await,
            "sqlite" => query_sqlite(&dsn, sql, max_rows, profile.read_only).await,
            "sqlserver" => query_sqlserver(&dsn, sql, max_rows, profile.read_only).await,
            "oracle" => query_oracle(&dsn, sql, max_rows).await,
            "clickhouse" => query_clickhouse(&dsn, sql, max_rows).await,
            _ => Err(AppError::UnsupportedDriver),
        }
    }

    pub async fn schema(&self, id: &str) -> AppResult<Vec<SchemaTable>> {
        let (profile, dsn) = self.profile_and_dsn(id).await?;
        match profile.driver.as_str() {
            "mongodb" => schema_mongo(&dsn).await,
            "redis" => schema_redis(&dsn).await,
            "cassandra" => schema_cassandra(&dsn).await,
            "elasticsearch" => schema_elasticsearch(&dsn).await,
            "neo4j" => schema_neo4j(&dsn).await,
            "postgres" => {
                let pool = open_pg(&dsn, profile.read_only).await?;
                let result = schema_pg(&pool).await;
                pool.close().await;
                result
            }
            "mysql" => {
                let pool = open_mysql(&dsn).await?;
                let result = schema_mysql(&pool).await;
                pool.close().await;
                result
            }
            "sqlite" => {
                let pool = open_sqlite(&dsn, profile.read_only).await?;
                let result = schema_sqlite(&pool).await;
                pool.close().await;
                result
            }
            "sqlserver" => schema_sqlserver(&dsn, profile.read_only).await,
            "oracle" => schema_oracle(&dsn).await,
            "clickhouse" => schema_clickhouse(&dsn).await,
            _ => Err(AppError::UnsupportedDriver),
        }
    }

    pub async fn insert_row(&self, id: &str, change: RowChange) -> AppResult<u64> {
        let (profile, dsn) = self.sql_profile_for_row_change(id).await?;
        validate_row_change(&change, false)?;
        let values = sorted_entries(&change.values);
        if values.is_empty() {
            return Err(AppError::BadRequest("no values".into()));
        }
        let columns: Vec<&str> = values.iter().map(|(key, _)| key.as_str()).collect();
        let args: Vec<Value> = values.iter().map(|(_, value)| value.clone()).collect();
        let placeholders = row_placeholders(
            profile.driver.as_str(),
            &dsn,
            &change.schema,
            &change.table,
            &columns,
        )
        .await?;
        let query = format!(
            "INSERT INTO {} ({}) VALUES ({})",
            qualified(profile.driver.as_str(), &change.schema, &change.table),
            quote_columns(profile.driver.as_str(), &columns),
            placeholders.join(", ")
        );
        execute_sql(profile.driver.as_str(), &dsn, &query, &args).await
    }

    pub async fn update_row(&self, id: &str, change: RowChange) -> AppResult<u64> {
        let (profile, dsn) = self.sql_profile_for_row_change(id).await?;
        validate_row_change(&change, true)?;
        let values = sorted_entries(&change.values);
        if values.is_empty() {
            return Err(AppError::BadRequest("no values to update".into()));
        }
        let keys = sorted_entries(&change.key);
        let mut args = Vec::with_capacity(values.len() + keys.len());
        let mut bound_columns = Vec::with_capacity(values.len() + keys.len());
        for (column, value) in &values {
            bound_columns.push(column.as_str());
            args.push(value.clone());
        }
        for (column, value) in &keys {
            bound_columns.push(column.as_str());
            args.push(value.clone());
        }
        let placeholders = row_placeholders(
            profile.driver.as_str(),
            &dsn,
            &change.schema,
            &change.table,
            &bound_columns,
        )
        .await?;
        let mut sets = Vec::with_capacity(values.len());
        for (index, (column, _)) in values.iter().enumerate() {
            sets.push(format!(
                "{} = {}",
                quote_ident(profile.driver.as_str(), column),
                placeholders[index]
            ));
        }
        let mut conditions = Vec::with_capacity(keys.len());
        for (index, (column, _)) in keys.iter().enumerate() {
            conditions.push(format!(
                "{} = {}",
                quote_ident(profile.driver.as_str(), column),
                placeholders[values.len() + index]
            ));
        }
        let query = format!(
            "UPDATE {} SET {} WHERE {}",
            qualified(profile.driver.as_str(), &change.schema, &change.table),
            sets.join(", "),
            conditions.join(" AND ")
        );
        execute_sql(profile.driver.as_str(), &dsn, &query, &args).await
    }

    pub async fn delete_row(&self, id: &str, change: RowChange) -> AppResult<u64> {
        let (profile, dsn) = self.sql_profile_for_row_change(id).await?;
        validate_row_change(&change, true)?;
        let keys = sorted_entries(&change.key);
        let mut args = Vec::with_capacity(keys.len());
        let mut bound_columns = Vec::with_capacity(keys.len());
        let mut conditions = Vec::with_capacity(keys.len());
        for (column, value) in &keys {
            bound_columns.push(column.as_str());
            args.push(value.clone());
        }
        let placeholders = row_placeholders(
            profile.driver.as_str(),
            &dsn,
            &change.schema,
            &change.table,
            &bound_columns,
        )
        .await?;
        for (index, (column, _)) in keys.iter().enumerate() {
            conditions.push(format!(
                "{} = {}",
                quote_ident(profile.driver.as_str(), column),
                placeholders[index]
            ));
        }
        let query = format!(
            "DELETE FROM {} WHERE {}",
            qualified(profile.driver.as_str(), &change.schema, &change.table),
            conditions.join(" AND ")
        );
        execute_sql(profile.driver.as_str(), &dsn, &query, &args).await
    }

    async fn profile_and_dsn(&self, id: &str) -> AppResult<(DbProfile, String)> {
        let profile = self.store.db_profile(id).await?;
        let dsn = decrypt(&self.key, &profile.dsn_encrypted)?;
        Ok((profile, dsn))
    }

    async fn sql_profile_for_row_change(&self, id: &str) -> AppResult<(DbProfile, String)> {
        let (profile, dsn) = self.profile_and_dsn(id).await?;
        if profile.read_only {
            return Err(AppError::BadRequest("profile is read-only".into()));
        }
        match profile.driver.as_str() {
            "postgres" | "mysql" | "sqlite" | "sqlserver" | "oracle" | "clickhouse" => {
                Ok((profile, dsn))
            }
            _ => Err(AppError::BadRequest(
                "row editing is available for SQL profiles only".into(),
            )),
        }
    }
}

fn supported(driver: &str) -> bool {
    matches!(
        driver,
        "postgres"
            | "mysql"
            | "sqlite"
            | "sqlserver"
            | "oracle"
            | "clickhouse"
            | "mongodb"
            | "redis"
            | "cassandra"
            | "elasticsearch"
            | "neo4j"
    )
}

fn clamp_max_rows(max_rows: usize) -> usize {
    if max_rows == 0 {
        500
    } else {
        max_rows.min(5000)
    }
}

fn upstream(context: &str, error: impl std::fmt::Display) -> AppError {
    AppError::Upstream(format!("{context}: {error}"))
}

fn bad_request(message: impl Into<String>) -> AppError {
    AppError::BadRequest(message.into())
}

fn json_number(value: f64) -> Value {
    Number::from_f64(value)
        .map(Value::Number)
        .unwrap_or_else(|| Value::String(value.to_string()))
}

fn json_integer(value: i64) -> Value {
    Value::Number(Number::from(value))
}

fn json_unsigned(value: u64) -> Value {
    Value::Number(Number::from(value))
}

fn normalize_bytes(data: &[u8]) -> Value {
    if data.iter().all(|byte| *byte != 0) {
        if let Ok(text) = std::str::from_utf8(data) {
            return Value::String(text.to_string());
        }
    }
    Value::String(format!("0x{}", hex::encode(data)))
}

fn format_naive_date(value: chrono::NaiveDate) -> String {
    value.format("%Y-%m-%d").to_string()
}

fn format_naive_time(value: chrono::NaiveTime) -> String {
    value.format("%H:%M:%S%.f").to_string()
}

fn format_naive_datetime(value: chrono::NaiveDateTime) -> String {
    value.format("%Y-%m-%dT%H:%M:%S%.f").to_string()
}

fn format_utc_datetime(value: chrono::DateTime<chrono::Utc>) -> String {
    value.to_rfc3339_opts(chrono::SecondsFormat::AutoSi, true)
}

fn format_offset_datetime(value: chrono::DateTime<chrono::FixedOffset>) -> String {
    value.to_rfc3339_opts(chrono::SecondsFormat::AutoSi, false)
}

// ---------------------------------------------------------------------------
// Read-only heuristics (kept in sync with the Go service)
// ---------------------------------------------------------------------------

fn is_read_only_query(query: &str) -> bool {
    let lower = query.trim().to_ascii_lowercase();
    ["select", "with", "explain", "show", "pragma", "values"]
        .iter()
        .any(|prefix| lower.starts_with(prefix))
}

fn is_read_only_redis(query: &str) -> bool {
    let Ok(args) = parse_redis_command(query) else {
        return false;
    };
    let Some(command) = args.first() else {
        return false;
    };
    matches!(
        command.to_ascii_uppercase().as_str(),
        "GET"
            | "MGET"
            | "KEYS"
            | "SCAN"
            | "HGET"
            | "HGETALL"
            | "HMGET"
            | "HLEN"
            | "LRANGE"
            | "LLEN"
            | "SMEMBERS"
            | "SCARD"
            | "ZRANGE"
            | "ZCARD"
            | "TYPE"
            | "TTL"
            | "PTTL"
            | "EXISTS"
            | "INFO"
            | "PING"
            | "STRLEN"
    )
}

fn is_read_only_cassandra(query: &str) -> bool {
    let lower = query.trim().to_ascii_lowercase();
    ["select", "describe", "use", "show"]
        .iter()
        .any(|prefix| lower.starts_with(prefix))
}

fn is_read_only_neo4j(query: &str) -> bool {
    let lower = query.trim().to_ascii_lowercase();
    ["match", "return", "call", "with", "unwind", "show"]
        .iter()
        .any(|prefix| lower.starts_with(prefix))
}

fn sqlite_read_only(dsn: &str) -> String {
    if dsn.starts_with("file:") {
        if dsn.contains('?') {
            format!("{dsn}&mode=ro")
        } else {
            format!("{dsn}?mode=ro")
        }
    } else {
        format!("file:{dsn}?mode=ro")
    }
}

fn postgres_read_only(dsn: &str) -> String {
    if dsn.starts_with("postgres://") || dsn.starts_with("postgresql://") {
        let separator = if dsn.contains('?') { '&' } else { '?' };
        format!("{dsn}{separator}default_transaction_read_only=on")
    } else {
        format!("{dsn} default_transaction_read_only=on")
    }
}

/// Translate the DSN formats accepted by the Go drivers into the URL syntax
/// understood by sqlx. Existing Toph profiles commonly use `user:pass@tcp(...)`
/// for MySQL and libpq keyword/value syntax for PostgreSQL.
fn normalize_mysql_dsn(dsn: &str) -> AppResult<String> {
    let trimmed = dsn.trim();
    if trimmed.starts_with("mysql://") {
        return Ok(trimmed.to_string());
    }
    if let Some(rest) = trimmed.strip_prefix("mariadb://") {
        return Ok(format!("mysql://{rest}"));
    }

    let (body, query) = match trimmed.split_once('?') {
        Some((body, query)) => (body, Some(query)),
        None => (trimmed, None),
    };
    let (credentials, rest) = match body.rfind('@') {
        Some(index) => (Some(&body[..index]), &body[index + 1..]),
        None => (None, body),
    };

    let (net, database) = split_mysql_net(rest);
    let mut host = "localhost".to_string();
    let mut port = 3306_u16;
    let mut socket = None;
    match net {
        Some(spec) if spec.starts_with("tcp(") && spec.ends_with(')') => {
            let address = &spec[4..spec.len() - 1];
            (host, port) = parse_host_port(address, 3306);
        }
        Some(spec) if spec.starts_with("unix(") && spec.ends_with(')') => {
            socket = Some(spec[5..spec.len() - 1].to_string());
        }
        Some(spec) if !spec.is_empty() => {
            (host, port) = parse_host_port(spec, 3306);
        }
        _ => {}
    }

    let (user, password) = match credentials {
        Some(credentials) => match credentials.split_once(':') {
            Some((user, password)) => (user, password),
            None => (credentials, ""),
        },
        None => ("", ""),
    };

    let mut url = String::from("mysql://");
    if !user.is_empty() || !password.is_empty() {
        url.push_str(&url_encode_component(user));
        if !password.is_empty() {
            url.push(':');
            url.push_str(&url_encode_component(password));
        }
        url.push('@');
    }
    if host.contains(':') && !host.starts_with('[') {
        url.push('[');
        url.push_str(&host);
        url.push(']');
    } else {
        url.push_str(&host);
    }
    if port != 3306 {
        url.push(':');
        url.push_str(&port.to_string());
    }
    url.push('/');
    url.push_str(&url_encode_component(database));

    let mut serializer = url::form_urlencoded::Serializer::new(String::new());
    if let Some(socket) = socket {
        serializer.append_pair("socket", &socket);
    }
    if let Some(query) = query {
        for (key, value) in url::form_urlencoded::parse(query.as_bytes()) {
            let key_lower = key.to_ascii_lowercase();
            if key_lower == "tls" {
                let mode = if value.eq_ignore_ascii_case("false")
                    || value.eq_ignore_ascii_case("disabled")
                {
                    "disabled"
                } else if value.eq_ignore_ascii_case("preferred") {
                    "preferred"
                } else {
                    "required"
                };
                serializer.append_pair("ssl-mode", mode);
                continue;
            }
            serializer.append_pair(&key, &value);
        }
    }
    let query = serializer.finish();
    if !query.is_empty() {
        url.push('?');
        url.push_str(&query);
    }
    Ok(url)
}

fn split_mysql_net(rest: &str) -> (Option<&str>, &str) {
    if let Some(database) = rest.strip_prefix('/') {
        return (None, database);
    }
    if rest.starts_with("tcp(") || rest.starts_with("unix(") {
        if let Some(close) = rest.find(')') {
            let net = &rest[..=close];
            let tail = &rest[close + 1..];
            return (Some(net), tail.strip_prefix('/').unwrap_or(tail));
        }
    }
    match rest.split_once('/') {
        Some((net, database)) => (Some(net), database),
        None => (Some(rest), ""),
    }
}

fn parse_host_port(address: &str, default_port: u16) -> (String, u16) {
    let address = address.trim();
    if address.starts_with('[') {
        if let Some(close) = address.find(']') {
            let host = address[..=close].to_string();
            let port = address[close + 1..]
                .strip_prefix(':')
                .and_then(|value| value.parse::<u16>().ok())
                .unwrap_or(default_port);
            return (host, port);
        }
    }
    match address.rsplit_once(':') {
        Some((host, port)) => match port.parse::<u16>() {
            Ok(port) if !host.is_empty() => (host.to_string(), port),
            _ => (address.to_string(), default_port),
        },
        None if !address.is_empty() => (address.to_string(), default_port),
        None => ("localhost".to_string(), default_port),
    }
}

fn normalize_postgres_dsn(dsn: &str) -> String {
    let trimmed = dsn.trim();
    if trimmed.starts_with("postgres://") || trimmed.starts_with("postgresql://") {
        return trimmed.to_string();
    }
    if !trimmed.contains('=') {
        return trimmed.to_string();
    }
    let pairs = parse_postgres_keywords(trimmed);
    if pairs.is_empty() {
        return trimmed.to_string();
    }

    let mut host = String::new();
    let mut port = None;
    let mut user = String::new();
    let mut password = String::new();
    let mut database = String::new();
    let mut query: Vec<(String, String)> = Vec::new();
    for (key, value) in pairs {
        match key.to_ascii_lowercase().as_str() {
            "host" => {
                host = value
                    .split(',')
                    .next()
                    .unwrap_or_default()
                    .trim()
                    .to_string()
            }
            "port" => {
                port = value
                    .split(',')
                    .next()
                    .and_then(|value| value.parse::<u16>().ok())
            }
            "user" => user = value,
            "password" => password = value,
            "dbname" | "database" => database = value,
            "hostaddr" => {}
            _ => query.push((key, value)),
        }
    }

    let mut serializer = url::form_urlencoded::Serializer::new(String::new());
    let mut url_host = if host.is_empty() {
        "localhost".to_string()
    } else if host.starts_with('/') {
        serializer.append_pair("host", &host);
        "localhost".to_string()
    } else if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host
    };
    if url_host.is_empty() {
        url_host = "localhost".to_string();
    }
    for (key, value) in query {
        serializer.append_pair(&key, &value);
    }
    let query = serializer.finish();

    let mut url = String::from("postgresql://");
    if !user.is_empty() || !password.is_empty() {
        url.push_str(&url_encode_component(&user));
        if !password.is_empty() {
            url.push(':');
            url.push_str(&url_encode_component(&password));
        }
        url.push('@');
    }
    url.push_str(&url_host);
    if let Some(port) = port {
        url.push(':');
        url.push_str(&port.to_string());
    }
    url.push('/');
    url.push_str(&url_encode_component(&database));
    if !query.is_empty() {
        url.push('?');
        url.push_str(&query);
    }
    url
}

fn parse_postgres_keywords(input: &str) -> Vec<(String, String)> {
    let chars: Vec<char> = input.chars().collect();
    let mut pairs = Vec::new();
    let mut index = 0;
    while index < chars.len() {
        while index < chars.len() && chars[index].is_whitespace() {
            index += 1;
        }
        if index >= chars.len() {
            break;
        }
        let mut key = String::new();
        while index < chars.len() && chars[index] != '=' && !chars[index].is_whitespace() {
            key.push(chars[index]);
            index += 1;
        }
        while index < chars.len() && chars[index].is_whitespace() {
            index += 1;
        }
        if index >= chars.len() || chars[index] != '=' {
            break;
        }
        index += 1;
        while index < chars.len() && chars[index].is_whitespace() {
            index += 1;
        }
        let mut value = String::new();
        if index < chars.len() && chars[index] == '\'' {
            index += 1;
            while index < chars.len() {
                if chars[index] == '\\' && index + 1 < chars.len() {
                    index += 1;
                    value.push(chars[index]);
                    index += 1;
                } else if chars[index] == '\'' {
                    index += 1;
                    break;
                } else {
                    value.push(chars[index]);
                    index += 1;
                }
            }
        } else {
            while index < chars.len() && !chars[index].is_whitespace() {
                value.push(chars[index]);
                index += 1;
            }
        }
        pairs.push((key, value));
    }
    pairs
}

fn url_encode_component(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            output.push(byte as char);
        } else {
            output.push_str(&format!("%{byte:02X}"));
        }
    }
    output
}

// ---------------------------------------------------------------------------
// SQLx connection helpers
// ---------------------------------------------------------------------------

async fn open_pg(dsn: &str, read_only: bool) -> AppResult<PgPool> {
    let normalized = normalize_postgres_dsn(dsn);
    let effective = if read_only {
        postgres_read_only(&normalized)
    } else {
        normalized
    };
    PgPoolOptions::new()
        .max_connections(2)
        .min_connections(0)
        .max_lifetime(Duration::from_secs(300))
        .idle_timeout(Duration::from_secs(60))
        .acquire_timeout(CONNECT_TIMEOUT)
        .connect(&effective)
        .await
        .map_err(|error| upstream("postgres", error))
}

async fn ping_pg(pool: &PgPool) -> AppResult<()> {
    sqlx::query("SELECT 1")
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|error| upstream("postgres", error))
}

async fn open_mysql(dsn: &str) -> AppResult<MySqlPool> {
    let dsn = normalize_mysql_dsn(dsn)?;
    MySqlPoolOptions::new()
        .max_connections(2)
        .min_connections(0)
        .max_lifetime(Duration::from_secs(300))
        .idle_timeout(Duration::from_secs(60))
        .acquire_timeout(CONNECT_TIMEOUT)
        .connect(&dsn)
        .await
        .map_err(|error| upstream("mysql", error))
}

async fn ping_mysql(pool: &MySqlPool) -> AppResult<()> {
    sqlx::query("SELECT 1")
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|error| upstream("mysql", error))
}

async fn open_sqlite(dsn: &str, read_only: bool) -> AppResult<SqlitePool> {
    let effective = if read_only {
        sqlite_read_only(dsn)
    } else {
        dsn.to_string()
    };
    let mut options =
        SqliteConnectOptions::from_str(&effective).map_err(|error| upstream("sqlite", error))?;
    if !read_only {
        options = options.create_if_missing(true);
    }
    SqlitePoolOptions::new()
        .max_connections(2)
        .min_connections(0)
        .max_lifetime(Duration::from_secs(300))
        .idle_timeout(Duration::from_secs(60))
        .acquire_timeout(CONNECT_TIMEOUT)
        .connect_with(options)
        .await
        .map_err(|error| upstream("sqlite", error))
}

async fn ping_sqlite(pool: &SqlitePool) -> AppResult<()> {
    sqlx::query("SELECT 1")
        .execute(pool)
        .await
        .map(|_| ())
        .map_err(|error| upstream("sqlite", error))
}

// ---------------------------------------------------------------------------
// Postgres query / schema
// ---------------------------------------------------------------------------

async fn query_pg(
    dsn: &str,
    sql: &str,
    max_rows: usize,
    read_only: bool,
) -> AppResult<QueryResult> {
    let pool = open_pg(dsn, read_only).await?;
    let started = Instant::now();
    let work = async {
        let mut columns = match pool.describe(sql).await {
            Ok(description) => description
                .columns()
                .iter()
                .map(|column| QueryColumn {
                    name: column.name().to_string(),
                    type_name: column.type_info().name().to_string(),
                })
                .collect::<Vec<_>>(),
            Err(_) => Vec::new(),
        };
        let mut rows: Vec<Vec<Value>> = Vec::new();
        let mut truncated = false;
        let mut stream = sqlx::query(sql).fetch(&pool);
        while let Some(row) = stream
            .try_next()
            .await
            .map_err(|error| upstream("postgres", error))?
        {
            if rows.len() >= max_rows {
                truncated = true;
                break;
            }
            if columns.is_empty() {
                columns = row
                    .columns()
                    .iter()
                    .map(|column| QueryColumn {
                        name: column.name().to_string(),
                        type_name: column.type_info().name().to_string(),
                    })
                    .collect();
            }
            rows.push(pg_row_values(&row));
        }
        Ok(QueryResult {
            columns,
            row_count: rows.len(),
            rows,
            truncated,
            duration_ms: started.elapsed().as_millis() as i64,
        })
    };
    let result = tokio::time::timeout(QUERY_TIMEOUT, work)
        .await
        .map_err(|_| upstream("postgres", "query timed out"))?;
    pool.close().await;
    result
}

fn pg_row_values(row: &PgRow) -> Vec<Value> {
    let mut values = Vec::with_capacity(row.columns().len());
    for index in 0..row.columns().len() {
        let name = row.columns()[index].type_info().name().to_string();
        values.push(pg_value(row, index, &name));
    }
    values
}

fn pg_value(row: &PgRow, index: usize, name: &str) -> Value {
    if row
        .try_get_raw(index)
        .map(|value| value.is_null())
        .unwrap_or(true)
    {
        return Value::Null;
    }
    if let Some(base) = name.strip_suffix("[]") {
        return pg_array_value(row, index, base);
    }
    match name {
        "BOOL" => row
            .try_get::<bool, _>(index)
            .map(Value::Bool)
            .unwrap_or(Value::Null),
        "INT2" => row
            .try_get::<i16, _>(index)
            .map(|value| json_integer(value as i64))
            .unwrap_or(Value::Null),
        "INT4" => row
            .try_get::<i32, _>(index)
            .map(|value| json_integer(value as i64))
            .unwrap_or(Value::Null),
        "INT8" => row
            .try_get::<i64, _>(index)
            .map(json_integer)
            .unwrap_or(Value::Null),
        "OID" => match row.try_get_unchecked::<Vec<u8>, _>(index) {
            Ok(bytes) if bytes.len() == 4 => {
                json_unsigned(u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as u64)
            }
            Ok(bytes) => normalize_bytes(&bytes),
            Err(_) => Value::Null,
        },
        "FLOAT4" => row
            .try_get::<f32, _>(index)
            .map(|value| json_number(value as f64))
            .unwrap_or(Value::Null),
        "FLOAT8" => row
            .try_get::<f64, _>(index)
            .map(json_number)
            .unwrap_or(Value::Null),
        "NUMERIC" => decode_pg_numeric(row, index),
        "TEXT" | "VARCHAR" | "BPCHAR" | "CHAR" | "\"CHAR\"" | "NAME" | "UNKNOWN" => row
            .try_get::<String, _>(index)
            .map(Value::String)
            .unwrap_or(Value::Null),
        "BYTEA" => row
            .try_get::<Vec<u8>, _>(index)
            .map(|bytes| normalize_bytes(&bytes))
            .unwrap_or(Value::Null),
        "DATE" => row
            .try_get::<chrono::NaiveDate, _>(index)
            .map(|value| Value::String(format_naive_date(value)))
            .unwrap_or(Value::Null),
        "TIME" => row
            .try_get::<chrono::NaiveTime, _>(index)
            .map(|value| Value::String(format_naive_time(value)))
            .unwrap_or(Value::Null),
        "TIMESTAMP" => row
            .try_get::<chrono::NaiveDateTime, _>(index)
            .map(|value| Value::String(format_naive_datetime(value)))
            .unwrap_or(Value::Null),
        "TIMESTAMPTZ" => row
            .try_get::<chrono::DateTime<chrono::Utc>, _>(index)
            .map(|value| Value::String(format_utc_datetime(value)))
            .unwrap_or(Value::Null),
        "UUID" => row
            .try_get::<uuid::Uuid, _>(index)
            .map(|value| Value::String(value.to_string()))
            .unwrap_or(Value::Null),
        "JSON" | "JSONB" => row.try_get::<Value, _>(index).unwrap_or(Value::Null),
        "XML" => match row.try_get_unchecked::<String, _>(index) {
            Ok(value) => Value::String(value),
            Err(_) => match row.try_get_unchecked::<Vec<u8>, _>(index) {
                Ok(bytes) => normalize_bytes(&bytes),
                Err(_) => Value::Null,
            },
        },
        "INET" | "CIDR" => match row.try_get_unchecked::<Vec<u8>, _>(index) {
            Ok(bytes) => match pg_inet_string(&bytes) {
                Some(value) => Value::String(value),
                None => normalize_bytes(&bytes),
            },
            Err(_) => Value::Null,
        },
        "MACADDR" | "MACADDR8" => match row.try_get_unchecked::<Vec<u8>, _>(index) {
            Ok(bytes) => Value::String(
                bytes
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<Vec<_>>()
                    .join(":"),
            ),
            Err(_) => Value::Null,
        },
        _ => match row.try_get_unchecked::<Vec<u8>, _>(index) {
            Ok(bytes) => normalize_bytes(&bytes),
            Err(_) => Value::Null,
        },
    }
}

fn pg_inet_string(bytes: &[u8]) -> Option<String> {
    if bytes.len() < 4 {
        return None;
    }
    let family = bytes[0];
    let bits = bytes[1];
    let address_len = bytes[3] as usize;
    if bytes.len() < 4 + address_len {
        return None;
    }
    let address = &bytes[4..4 + address_len];
    let (text, max_bits) = match family {
        2 if address.len() == 4 => (
            std::net::Ipv4Addr::new(address[0], address[1], address[2], address[3]).to_string(),
            32,
        ),
        3 if address.len() == 16 => {
            let mut octets = [0u8; 16];
            octets.copy_from_slice(address);
            (std::net::Ipv6Addr::from(octets).to_string(), 128)
        }
        _ => return None,
    };
    if bits < max_bits {
        Some(format!("{text}/{bits}"))
    } else {
        Some(text)
    }
}

fn pg_array_value(row: &PgRow, index: usize, base: &str) -> Value {
    macro_rules! array {
        ($ty:ty) => {
            row.try_get::<Vec<$ty>, _>(index)
                .map(|values| serde_json::to_value(values).unwrap_or(Value::Null))
                .unwrap_or(Value::Null)
        };
    }
    match base {
        "BOOL" => array!(bool),
        "INT2" => array!(i16),
        "INT4" => array!(i32),
        "INT8" => array!(i64),
        "FLOAT4" => array!(f32),
        "FLOAT8" => array!(f64),
        "TEXT" | "VARCHAR" | "BPCHAR" | "\"CHAR\"" | "NAME" => array!(String),
        "UUID" => array!(uuid::Uuid),
        "JSON" | "JSONB" => array!(Value),
        "DATE" => array!(chrono::NaiveDate),
        "TIME" => array!(chrono::NaiveTime),
        "TIMESTAMP" => array!(chrono::NaiveDateTime),
        "TIMESTAMPTZ" => array!(chrono::DateTime<chrono::Utc>),
        "BYTEA" => match row.try_get::<Vec<Vec<u8>>, _>(index) {
            Ok(values) => Value::Array(
                values
                    .iter()
                    .map(|bytes| normalize_bytes(bytes))
                    .collect::<Vec<_>>(),
            ),
            Err(_) => Value::Null,
        },
        _ => match row.try_get_unchecked::<Vec<u8>, _>(index) {
            Ok(bytes) => normalize_bytes(&bytes),
            Err(_) => Value::Null,
        },
    }
}

fn decode_pg_numeric(row: &PgRow, index: usize) -> Value {
    match row.try_get_unchecked::<Vec<u8>, _>(index) {
        Ok(bytes) => match pg_numeric_string(&bytes) {
            Some(value) => Value::String(value),
            None => normalize_bytes(&bytes),
        },
        Err(_) => Value::Null,
    }
}

/// Decode PostgreSQL's binary NUMERIC representation into a decimal string.
///
/// Layout: i16 digit count, i16 weight, u16 sign (0x0000 positive, 0x4000
/// negative, 0xC000 NaN), u16 display scale, followed by base-10000 digits.
fn pg_numeric_string(bytes: &[u8]) -> Option<String> {
    if bytes.len() < 8 {
        return None;
    }
    let digits_count = i16::from_be_bytes([bytes[0], bytes[1]]);
    let weight = i16::from_be_bytes([bytes[2], bytes[3]]) as i64;
    let sign = u16::from_be_bytes([bytes[4], bytes[5]]);
    let scale = u16::from_be_bytes([bytes[6], bytes[7]]) as usize;
    if digits_count < 0 {
        return None;
    }
    if sign == 0xC000 {
        return Some("NaN".to_string());
    }
    let digits_count = digits_count as usize;
    if bytes.len() < 8 + digits_count * 2 {
        return None;
    }
    let mut digits = Vec::with_capacity(digits_count);
    for offset in 0..digits_count {
        let start = 8 + offset * 2;
        let digit = u16::from_be_bytes([bytes[start], bytes[start + 1]]);
        if digit >= 10000 {
            return None;
        }
        digits.push(digit);
    }

    // Integer groups are stored at base-10000 digit positions `weight`
    // (most significant) down to zero.
    let mut integer_groups = Vec::new();
    if weight >= 0 {
        for power in (0..=weight).rev() {
            let index = (weight - power) as usize;
            integer_groups.push(digits.get(index).copied().unwrap_or(0));
        }
    }

    // Fractional groups start immediately after the decimal point.
    let fractional_needed = scale.div_ceil(4);
    let mut fractional_groups = Vec::with_capacity(fractional_needed);
    for step in 0..fractional_needed {
        let power = -(step as i64) - 1;
        let index = weight - power;
        let digit = if index >= 0 {
            digits.get(index as usize).copied().unwrap_or(0)
        } else {
            0
        };
        fractional_groups.push(digit);
    }

    let mut output = String::new();
    if integer_groups.is_empty() {
        output.push('0');
    } else {
        let mut first = true;
        for group in integer_groups {
            if first {
                output.push_str(&group.to_string());
                first = false;
            } else {
                output.push_str(&format!("{group:04}"));
            }
        }
        if output.bytes().all(|byte| byte == b'0') {
            output.clear();
            output.push('0');
        }
    }

    if scale > 0 {
        let mut fractional = fractional_groups
            .iter()
            .map(|group| format!("{group:04}"))
            .collect::<String>();
        if fractional.len() < scale {
            fractional.push_str(&"0".repeat(scale - fractional.len()));
        }
        fractional.truncate(scale);
        output.push('.');
        output.push_str(&fractional);
    }

    let non_zero = output.bytes().any(|byte| (b'1'..=b'9').contains(&byte));
    if sign == 0x4000 && non_zero {
        output.insert(0, '-');
    }
    Some(output)
}

async fn schema_pg(pool: &PgPool) -> AppResult<Vec<SchemaTable>> {
    let table_rows = sqlx::query(
        "SELECT table_schema, table_name
         FROM information_schema.tables
         WHERE table_type = 'BASE TABLE'
           AND table_schema NOT IN ('pg_catalog', 'information_schema')
         ORDER BY table_schema, table_name
         LIMIT 500",
    )
    .fetch_all(pool)
    .await
    .map_err(|error| upstream("postgres", error))?;

    let mut tables = Vec::with_capacity(table_rows.len());
    for row in table_rows {
        tables.push(SchemaTable {
            schema: row.try_get(0)?,
            name: row.try_get(1)?,
            columns: Vec::new(),
        });
    }

    for table in tables.iter_mut() {
        let column_rows = sqlx::query(
            "SELECT column_name, data_type, is_nullable = 'YES',
                    COALESCE((SELECT TRUE FROM information_schema.table_constraints tc
                              JOIN information_schema.key_column_usage kcu
                                ON tc.constraint_name = kcu.constraint_name
                               AND tc.table_schema = kcu.table_schema
                              WHERE tc.constraint_type = 'PRIMARY KEY'
                                AND tc.table_schema = $1 AND tc.table_name = $2
                                AND kcu.column_name = c.column_name LIMIT 1), FALSE)
             FROM information_schema.columns c
             WHERE table_schema = $1 AND table_name = $2
             ORDER BY ordinal_position",
        )
        .bind(&table.schema)
        .bind(&table.name)
        .fetch_all(pool)
        .await
        .map_err(|error| upstream("postgres", error))?;
        for row in column_rows {
            table.columns.push(SchemaColumn {
                name: row.try_get(0)?,
                type_name: row.try_get(1)?,
                nullable: row.try_get(2)?,
                primary: row.try_get(3)?,
            });
        }
    }
    Ok(tables)
}

// ---------------------------------------------------------------------------
// MySQL query / schema
// ---------------------------------------------------------------------------

async fn query_mysql(dsn: &str, sql: &str, max_rows: usize) -> AppResult<QueryResult> {
    let pool = open_mysql(dsn).await?;
    let started = Instant::now();
    let work = async {
        let mut columns = match pool.describe(sql).await {
            Ok(description) => description
                .columns()
                .iter()
                .map(|column| QueryColumn {
                    name: column.name().to_string(),
                    type_name: column.type_info().name().to_string(),
                })
                .collect::<Vec<_>>(),
            Err(_) => Vec::new(),
        };
        let mut rows: Vec<Vec<Value>> = Vec::new();
        let mut truncated = false;
        let mut stream = sqlx::query(sql).fetch(&pool);
        while let Some(row) = stream
            .try_next()
            .await
            .map_err(|error| upstream("mysql", error))?
        {
            if rows.len() >= max_rows {
                truncated = true;
                break;
            }
            if columns.is_empty() {
                columns = row
                    .columns()
                    .iter()
                    .map(|column| QueryColumn {
                        name: column.name().to_string(),
                        type_name: column.type_info().name().to_string(),
                    })
                    .collect();
            }
            rows.push(mysql_row_values(&row));
        }
        Ok(QueryResult {
            columns,
            row_count: rows.len(),
            rows,
            truncated,
            duration_ms: started.elapsed().as_millis() as i64,
        })
    };
    let result = tokio::time::timeout(QUERY_TIMEOUT, work)
        .await
        .map_err(|_| upstream("mysql", "query timed out"))?;
    pool.close().await;
    result
}

fn mysql_row_values(row: &MySqlRow) -> Vec<Value> {
    let mut values = Vec::with_capacity(row.columns().len());
    for index in 0..row.columns().len() {
        let name = row.columns()[index].type_info().name().to_string();
        values.push(mysql_value(row, index, &name));
    }
    values
}

fn mysql_value(row: &MySqlRow, index: usize, name: &str) -> Value {
    if row
        .try_get_raw(index)
        .map(|value| value.is_null())
        .unwrap_or(true)
    {
        return Value::Null;
    }
    match name {
        "TINYINT" | "SMALLINT" | "MEDIUMINT" | "INT" | "BIGINT" => {
            if let Ok(value) = row.try_get::<i64, _>(index) {
                json_integer(value)
            } else if let Ok(value) = row.try_get_unchecked::<u64, _>(index) {
                json_unsigned(value)
            } else {
                Value::Null
            }
        }
        "YEAR" => row
            .try_get_unchecked::<u64, _>(index)
            .map(json_unsigned)
            .unwrap_or(Value::Null),
        "FLOAT" => row
            .try_get::<f32, _>(index)
            .map(|value| json_number(value as f64))
            .unwrap_or(Value::Null),
        "DOUBLE" => row
            .try_get::<f64, _>(index)
            .map(json_number)
            .unwrap_or(Value::Null),
        "DECIMAL" => row
            .try_get_unchecked::<String, _>(index)
            .map(Value::String)
            .unwrap_or(Value::Null),
        "BIT" => row
            .try_get_unchecked::<Vec<u8>, _>(index)
            .map(|bytes| normalize_bytes(&bytes))
            .unwrap_or(Value::Null),
        "DATE" => row
            .try_get::<chrono::NaiveDate, _>(index)
            .map(|value| Value::String(format_naive_date(value)))
            .unwrap_or(Value::Null),
        "TIME" => row
            .try_get::<chrono::NaiveTime, _>(index)
            .map(|value| Value::String(format_naive_time(value)))
            .unwrap_or(Value::Null),
        "DATETIME" | "TIMESTAMP" => row
            .try_get::<chrono::NaiveDateTime, _>(index)
            .map(|value| Value::String(format_naive_datetime(value)))
            .unwrap_or(Value::Null),
        "JSON" => row.try_get::<Value, _>(index).unwrap_or(Value::Null),
        "NULL" => Value::Null,
        "BLOB" | "TINYBLOB" | "MEDIUMBLOB" | "LONGBLOB" => row
            .try_get::<Vec<u8>, _>(index)
            .map(|bytes| normalize_bytes(&bytes))
            .unwrap_or(Value::Null),
        _ => match row.try_get::<String, _>(index) {
            Ok(value) => Value::String(value),
            Err(_) => match row.try_get::<Vec<u8>, _>(index) {
                Ok(bytes) => normalize_bytes(&bytes),
                Err(_) => Value::Null,
            },
        },
    }
}

async fn schema_mysql(pool: &MySqlPool) -> AppResult<Vec<SchemaTable>> {
    let table_rows = sqlx::query(
        "SELECT table_schema, table_name
         FROM information_schema.tables
         WHERE table_type = 'BASE TABLE'
           AND table_schema NOT IN ('mysql', 'information_schema', 'performance_schema', 'sys')
         ORDER BY table_schema, table_name
         LIMIT 500",
    )
    .fetch_all(pool)
    .await
    .map_err(|error| upstream("mysql", error))?;

    let mut tables = Vec::with_capacity(table_rows.len());
    for row in table_rows {
        tables.push(SchemaTable {
            schema: row.try_get(0)?,
            name: row.try_get(1)?,
            columns: Vec::new(),
        });
    }

    for table in tables.iter_mut() {
        let column_rows = sqlx::query(
            "SELECT column_name, column_type, is_nullable = 'YES', column_key = 'PRI'
             FROM information_schema.columns
             WHERE table_schema = ? AND table_name = ?
             ORDER BY ordinal_position",
        )
        .bind(&table.schema)
        .bind(&table.name)
        .fetch_all(pool)
        .await
        .map_err(|error| upstream("mysql", error))?;
        for row in column_rows {
            let nullable: i64 = row.try_get(2)?;
            let primary: i64 = row.try_get(3)?;
            table.columns.push(SchemaColumn {
                name: row.try_get(0)?,
                type_name: row.try_get(1)?,
                nullable: nullable != 0,
                primary: primary != 0,
            });
        }
    }
    Ok(tables)
}

// ---------------------------------------------------------------------------
// SQLite query / schema
// ---------------------------------------------------------------------------

async fn query_sqlite(
    dsn: &str,
    sql: &str,
    max_rows: usize,
    read_only: bool,
) -> AppResult<QueryResult> {
    let pool = open_sqlite(dsn, read_only).await?;
    let started = Instant::now();
    let work = async {
        let mut columns = match pool.describe(sql).await {
            Ok(description) => description
                .columns()
                .iter()
                .map(|column| QueryColumn {
                    name: column.name().to_string(),
                    type_name: column.type_info().name().to_string(),
                })
                .collect::<Vec<_>>(),
            Err(_) => Vec::new(),
        };
        let mut rows: Vec<Vec<Value>> = Vec::new();
        let mut truncated = false;
        let mut stream = sqlx::query(sql).fetch(&pool);
        while let Some(row) = stream
            .try_next()
            .await
            .map_err(|error| upstream("sqlite", error))?
        {
            if rows.len() >= max_rows {
                truncated = true;
                break;
            }
            if columns.is_empty() {
                columns = row
                    .columns()
                    .iter()
                    .map(|column| QueryColumn {
                        name: column.name().to_string(),
                        type_name: column.type_info().name().to_string(),
                    })
                    .collect();
            }
            rows.push(sqlite_row_values(&row));
        }
        Ok(QueryResult {
            columns,
            row_count: rows.len(),
            rows,
            truncated,
            duration_ms: started.elapsed().as_millis() as i64,
        })
    };
    let result = tokio::time::timeout(QUERY_TIMEOUT, work)
        .await
        .map_err(|_| upstream("sqlite", "query timed out"))?;
    pool.close().await;
    result
}

fn sqlite_row_values(row: &SqliteRow) -> Vec<Value> {
    let mut values = Vec::with_capacity(row.columns().len());
    for index in 0..row.columns().len() {
        values.push(sqlite_value(row, index));
    }
    values
}

fn sqlite_value(row: &SqliteRow, index: usize) -> Value {
    let raw = match row.try_get_raw(index) {
        Ok(raw) => raw,
        Err(_) => return Value::Null,
    };
    if raw.is_null() {
        return Value::Null;
    }
    let type_name = raw.type_info().name().to_string();
    match type_name.as_str() {
        "INTEGER" => row
            .try_get::<i64, _>(index)
            .map(json_integer)
            .unwrap_or(Value::Null),
        "REAL" => row
            .try_get::<f64, _>(index)
            .map(json_number)
            .unwrap_or(Value::Null),
        "TEXT" => row
            .try_get::<String, _>(index)
            .map(Value::String)
            .unwrap_or(Value::Null),
        "BLOB" => row
            .try_get::<Vec<u8>, _>(index)
            .map(|bytes| normalize_bytes(&bytes))
            .unwrap_or(Value::Null),
        _ => match row.try_get::<String, _>(index) {
            Ok(value) => Value::String(value),
            Err(_) => match row.try_get::<Vec<u8>, _>(index) {
                Ok(bytes) => normalize_bytes(&bytes),
                Err(_) => Value::Null,
            },
        },
    }
}

async fn schema_sqlite(pool: &SqlitePool) -> AppResult<Vec<SchemaTable>> {
    let names = sqlx::query(
        "SELECT name FROM sqlite_master
         WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'
         ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .map_err(|error| upstream("sqlite", error))?;

    let mut tables = Vec::with_capacity(names.len());
    for row in names {
        let name: String = row.try_get(0)?;
        let mut table = SchemaTable {
            schema: "main".into(),
            name: name.clone(),
            columns: Vec::new(),
        };
        let pragma = format!("PRAGMA table_info({})", quote_ident("sqlite", &name));
        let column_rows = sqlx::query(&pragma)
            .fetch_all(pool)
            .await
            .map_err(|error| upstream("sqlite", error))?;
        for column in column_rows {
            let not_null: i64 = column.try_get(3)?;
            let primary: i64 = column.try_get(5)?;
            table.columns.push(SchemaColumn {
                name: column.try_get(1)?,
                type_name: column.try_get(2)?,
                nullable: not_null == 0,
                primary: primary > 0,
            });
        }
        tables.push(table);
    }
    Ok(tables)
}

// ---------------------------------------------------------------------------
// SQL Server (Tiberius)
// ---------------------------------------------------------------------------

type TdsClient = tiberius::Client<tokio_util::compat::Compat<tokio::net::TcpStream>>;

async fn open_sqlserver(dsn: &str) -> AppResult<TdsClient> {
    let config = sqlserver_config(dsn)?;
    let tcp = tokio::net::TcpStream::connect(config.get_addr())
        .await
        .map_err(|error| upstream("sqlserver", error))?;
    tcp.set_nodelay(true)
        .map_err(|error| upstream("sqlserver", error))?;
    tiberius::Client::connect(config, tcp.compat_write())
        .await
        .map_err(|error| upstream("sqlserver", error))
}

fn sqlserver_config(dsn: &str) -> AppResult<tiberius::Config> {
    let trimmed = dsn.trim();
    if trimmed.starts_with("sqlserver://") || trimmed.starts_with("mssql://") {
        let url = Url::parse(trimmed)
            .map_err(|error| bad_request(format!("invalid sqlserver DSN: {error}")))?;
        let mut config = tiberius::Config::new();
        let host = url
            .host_str()
            .ok_or_else(|| bad_request("sqlserver DSN is missing a host"))?;
        config.host(host);
        config.port(url.port().unwrap_or(1433));
        // go-mssqldb defaults to encrypting only the login packet. Keep the
        // same default so existing DSNs continue to work, while honouring an
        // explicit `encrypt` option.
        config.encryption(tiberius::EncryptionLevel::Off);
        let username = percent_decode(url.username());
        let password = percent_decode(url.password().unwrap_or(""));
        if !username.is_empty() {
            config.authentication(tiberius::AuthMethod::sql_server(
                username.as_str(),
                password.as_str(),
            ));
        }
        let mut database = None;
        let mut trust_cert = false;
        for (key, value) in url.query_pairs() {
            let key = key.to_ascii_lowercase();
            match key.as_str() {
                "database" | "initial catalog" => database = Some(value.to_string()),
                "encrypt" => {
                    if value.eq_ignore_ascii_case("disable")
                        || value.eq_ignore_ascii_case("false")
                        || value.eq_ignore_ascii_case("no")
                    {
                        config.encryption(tiberius::EncryptionLevel::NotSupported);
                    } else if value.eq_ignore_ascii_case("strict") {
                        config.encryption(tiberius::EncryptionLevel::Strict);
                    } else if value.eq_ignore_ascii_case("true")
                        || value.eq_ignore_ascii_case("yes")
                        || value == "1"
                    {
                        config.encryption(tiberius::EncryptionLevel::Required);
                    } else {
                        config.encryption(tiberius::EncryptionLevel::Off);
                    }
                }
                "trustservercertificate" | "trust_cert" | "trust-cert"
                    if value.eq_ignore_ascii_case("true")
                        || value.eq_ignore_ascii_case("yes")
                        || value == "1" =>
                {
                    trust_cert = true;
                }
                _ => {}
            }
        }
        if let Some(database) = database {
            config.database(database);
        }
        if trust_cert {
            config.trust_cert();
        }
        config.command_timeout(Some(QUERY_TIMEOUT));
        Ok(config)
    } else if trimmed.contains('=') || trimmed.contains(';') {
        let has_encrypt = trimmed.split(';').any(|part| {
            part.split('=')
                .next()
                .map(|key| key.trim().eq_ignore_ascii_case("encrypt"))
                .unwrap_or(false)
        });
        let mut config = tiberius::Config::from_ado_string(trimmed)
            .map_err(|error| bad_request(format!("invalid sqlserver DSN: {error}")))?;
        if !has_encrypt {
            // Match go-mssqldb's default: only the login packet is encrypted.
            config.encryption(tiberius::EncryptionLevel::Off);
        }
        config.command_timeout(Some(QUERY_TIMEOUT));
        Ok(config)
    } else {
        let (host, port) = match trimmed.rsplit_once(':') {
            Some((host, port)) => (
                host,
                port.parse::<u16>()
                    .map_err(|_| bad_request("invalid sqlserver port"))?,
            ),
            None => (trimmed, 1433),
        };
        let mut config = tiberius::Config::new();
        config.host(host);
        config.port(port);
        config.encryption(tiberius::EncryptionLevel::Off);
        config.command_timeout(Some(QUERY_TIMEOUT));
        Ok(config)
    }
}

async fn test_sqlserver(dsn: &str, _read_only: bool) -> AppResult<()> {
    let mut client = open_sqlserver(dsn).await?;
    let result = client
        .simple_query("SELECT 1")
        .await
        .map_err(|error| upstream("sqlserver", error))?;
    let _ = result.into_results().await;
    let _ = client.close().await;
    Ok(())
}

async fn query_sqlserver(
    dsn: &str,
    sql: &str,
    max_rows: usize,
    _read_only: bool,
) -> AppResult<QueryResult> {
    let started = Instant::now();
    let mut client = open_sqlserver(dsn).await?;
    let work = async {
        let mut stream = client
            .query(sql, &[])
            .await
            .map_err(|error| upstream("sqlserver", error))?;
        let columns = match stream
            .columns()
            .await
            .map_err(|error| upstream("sqlserver", error))?
        {
            Some(columns) => columns
                .iter()
                .map(|column| QueryColumn {
                    name: column.name().to_string(),
                    type_name: sqlserver_type_name(column.column_type()).to_string(),
                })
                .collect::<Vec<_>>(),
            None => Vec::new(),
        };
        let mut rows: Vec<Vec<Value>> = Vec::new();
        let mut truncated = false;
        let mut row_stream = stream.into_row_stream();
        while let Some(row) = row_stream
            .try_next()
            .await
            .map_err(|error| upstream("sqlserver", error))?
        {
            if rows.len() >= max_rows {
                truncated = true;
                break;
            }
            rows.push(row.into_iter().map(tds_value).collect());
        }
        Ok(QueryResult {
            columns,
            row_count: rows.len(),
            rows,
            truncated,
            duration_ms: started.elapsed().as_millis() as i64,
        })
    };
    let result = tokio::time::timeout(QUERY_TIMEOUT, work)
        .await
        .map_err(|_| upstream("sqlserver", "query timed out"))?;
    let _ = client.close().await;
    result
}

fn tds_value(data: tiberius::ColumnData<'static>) -> Value {
    use tiberius::ColumnData;
    match data {
        ColumnData::U8(value) => value
            .map(|value| json_integer(value as i64))
            .unwrap_or(Value::Null),
        ColumnData::I16(value) => value
            .map(|value| json_integer(value as i64))
            .unwrap_or(Value::Null),
        ColumnData::I32(value) => value
            .map(|value| json_integer(value as i64))
            .unwrap_or(Value::Null),
        ColumnData::I64(value) => value.map(json_integer).unwrap_or(Value::Null),
        ColumnData::F32(value) => value
            .map(|value| json_number(value as f64))
            .unwrap_or(Value::Null),
        ColumnData::F64(value) => value.map(json_number).unwrap_or(Value::Null),
        ColumnData::Bit(value) => value.map(Value::Bool).unwrap_or(Value::Null),
        ColumnData::String(value) => value
            .map(|value| Value::String(value.into_owned()))
            .unwrap_or(Value::Null),
        ColumnData::Guid(value) => value
            .map(|value| Value::String(value.to_string()))
            .unwrap_or(Value::Null),
        ColumnData::Binary(value) => value
            .map(|value| normalize_bytes(value.as_ref()))
            .unwrap_or(Value::Null),
        ColumnData::Numeric(value) => value
            .map(|value| Value::String(value.to_string()))
            .unwrap_or(Value::Null),
        ColumnData::Xml(value) => value
            .map(|value| Value::String(value.to_string()))
            .unwrap_or(Value::Null),
        other => {
            if let Ok(Some(value)) = <chrono::NaiveDateTime as tiberius::FromSql>::from_sql(&other)
            {
                return Value::String(format_naive_datetime(value));
            }
            if let Ok(Some(value)) =
                <chrono::DateTime<chrono::FixedOffset> as tiberius::FromSql>::from_sql(&other)
            {
                return Value::String(format_offset_datetime(value));
            }
            if let Ok(Some(value)) = <chrono::NaiveDate as tiberius::FromSql>::from_sql(&other) {
                return Value::String(format_naive_date(value));
            }
            if let Ok(Some(value)) = <chrono::NaiveTime as tiberius::FromSql>::from_sql(&other) {
                return Value::String(format_naive_time(value));
            }
            Value::Null
        }
    }
}

fn sqlserver_type_name(column_type: tiberius::ColumnType) -> &'static str {
    use tiberius::ColumnType;
    match column_type {
        ColumnType::Null => "NULL",
        ColumnType::Bit | ColumnType::Bitn => "BIT",
        ColumnType::Int1 => "TINYINT",
        ColumnType::Int2 => "SMALLINT",
        ColumnType::Int4 => "INT",
        ColumnType::Int8 => "BIGINT",
        ColumnType::Intn => "INT",
        ColumnType::Datetime4 | ColumnType::Datetime | ColumnType::Datetimen => "DATETIME",
        ColumnType::Float4 => "REAL",
        ColumnType::Float8 => "FLOAT",
        ColumnType::Floatn => "FLOAT",
        ColumnType::Money | ColumnType::Money4 => "MONEY",
        ColumnType::Guid => "UNIQUEIDENTIFIER",
        ColumnType::Decimaln | ColumnType::Numericn => "DECIMAL",
        ColumnType::Daten => "DATE",
        ColumnType::Timen => "TIME",
        ColumnType::Datetime2 => "DATETIME2",
        ColumnType::DatetimeOffsetn => "DATETIMEOFFSET",
        ColumnType::BigVarBin | ColumnType::BigBinary | ColumnType::Image => "VARBINARY",
        ColumnType::BigVarChar | ColumnType::BigChar => "VARCHAR",
        ColumnType::NVarchar | ColumnType::NChar => "NVARCHAR",
        ColumnType::Xml => "XML",
        ColumnType::Udt => "UDT",
        ColumnType::Text => "TEXT",
        ColumnType::NText => "NTEXT",
        ColumnType::SSVariant => "SQL_VARIANT",
    }
}

async fn schema_sqlserver(dsn: &str, _read_only: bool) -> AppResult<Vec<SchemaTable>> {
    let sql = "SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.is_nullable,
                      CASE WHEN kcu.column_name IS NULL THEN 0 ELSE 1 END
               FROM information_schema.columns c
               LEFT JOIN information_schema.table_constraints tc
                 ON tc.table_schema = c.table_schema AND tc.table_name = c.table_name
                AND tc.constraint_type = 'PRIMARY KEY'
               LEFT JOIN information_schema.key_column_usage kcu
                 ON kcu.constraint_name = tc.constraint_name
                AND kcu.table_schema = tc.table_schema
                AND kcu.table_name = tc.table_name
                AND kcu.column_name = c.column_name
               WHERE c.table_schema NOT IN ('sys', 'INFORMATION_SCHEMA')
               ORDER BY c.table_schema, c.table_name, c.ordinal_position";
    let result = query_sqlserver(dsn, sql, MAX_SCHEMA_ROWS, false).await?;
    let mut tables = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();
    for row in result.rows {
        let schema = value_as_string(row.first());
        let table = value_as_string(row.get(1));
        if schema.is_empty() || table.is_empty() {
            continue;
        }
        let key = format!("{schema}.{table}");
        let position = match index.get(&key) {
            Some(position) => *position,
            None => {
                tables.push(SchemaTable {
                    schema: schema.clone(),
                    name: table.clone(),
                    columns: Vec::new(),
                });
                let position = tables.len() - 1;
                index.insert(key, position);
                position
            }
        };
        let nullable = value_as_string(row.get(4));
        tables[position].columns.push(SchemaColumn {
            name: value_as_string(row.get(2)),
            type_name: value_as_string(row.get(3)),
            nullable: nullable == "YES" || nullable == "Y",
            primary: value_as_i64(row.get(5)) != 0,
        });
    }
    Ok(tables)
}

// ---------------------------------------------------------------------------
// Oracle
// ---------------------------------------------------------------------------

async fn open_oracle(dsn: &str) -> AppResult<oracle_rs::Connection> {
    let parsed = parse_oracle_dsn(dsn)?;
    let config = oracle_rs::Config::new(
        parsed.host.as_str(),
        parsed.port,
        parsed.service.as_str(),
        parsed.user.as_str(),
        parsed.password.as_str(),
    );
    oracle_rs::Connection::connect_with_config(config)
        .await
        .map_err(|error| upstream("oracle", error))
}

struct OracleDsn {
    host: String,
    port: u16,
    service: String,
    user: String,
    password: String,
}

fn parse_oracle_dsn(dsn: &str) -> AppResult<OracleDsn> {
    let trimmed = dsn.trim();
    if trimmed.starts_with("oracle://") || trimmed.starts_with("oracle+") {
        let url = Url::parse(trimmed)
            .map_err(|error| bad_request(format!("invalid oracle DSN: {error}")))?;
        let host = url
            .host_str()
            .ok_or_else(|| bad_request("oracle DSN is missing a host"))?
            .to_string();
        let path = percent_decode(url.path().trim_start_matches('/'));
        let service = if path.is_empty() {
            url.query_pairs()
                .find(|(key, _)| {
                    matches!(
                        key.to_ascii_lowercase().as_str(),
                        "service_name" | "servicename"
                    )
                })
                .map(|(_, value)| value.to_string())
                .unwrap_or_default()
        } else {
            path
        };
        if service.is_empty() {
            return Err(bad_request("oracle DSN is missing a service name"));
        }
        return Ok(OracleDsn {
            host,
            port: url.port().unwrap_or(1521),
            service,
            user: percent_decode(url.username()),
            password: percent_decode(url.password().unwrap_or("")),
        });
    }

    // EZConnect: user/password@host[:port]/service
    let (credentials, address) = trimmed
        .split_once('@')
        .ok_or_else(|| bad_request("invalid oracle DSN"))?;
    let (user, password) = credentials
        .split_once('/')
        .ok_or_else(|| bad_request("oracle DSN requires user/password"))?;
    let (host_port, service) = address
        .split_once('/')
        .ok_or_else(|| bad_request("oracle DSN requires a service name"))?;
    let (host, port) = match host_port.rsplit_once(':') {
        Some((host, port)) => (
            host,
            port.parse::<u16>()
                .map_err(|_| bad_request("invalid oracle port"))?,
        ),
        None => (host_port, 1521),
    };
    Ok(OracleDsn {
        host: host.to_string(),
        port,
        service: service.to_string(),
        user: user.to_string(),
        password: password.to_string(),
    })
}

async fn test_oracle(dsn: &str) -> AppResult<()> {
    let connection = open_oracle(dsn).await?;
    let result = connection
        .ping()
        .await
        .map_err(|error| upstream("oracle", error));
    let _ = connection.close().await;
    result
}

async fn query_oracle(dsn: &str, sql: &str, max_rows: usize) -> AppResult<QueryResult> {
    let started = Instant::now();
    let connection = open_oracle(dsn).await?;
    let work = async {
        let (columns, raw_rows, truncated) = oracle_collect(&connection, sql, max_rows).await?;
        let mut rows = Vec::with_capacity(raw_rows.len());
        for row in raw_rows {
            rows.push(row.into_iter().map(oracle_value).collect::<Vec<_>>());
        }
        Ok(QueryResult {
            columns,
            row_count: rows.len(),
            rows,
            truncated,
            duration_ms: started.elapsed().as_millis() as i64,
        })
    };
    let result = tokio::time::timeout(QUERY_TIMEOUT, work)
        .await
        .map_err(|_| upstream("oracle", "query timed out"))?;
    let _ = connection.close().await;
    result
}

async fn oracle_collect(
    connection: &oracle_rs::Connection,
    sql: &str,
    max_rows: usize,
) -> AppResult<(Vec<QueryColumn>, Vec<Vec<oracle_rs::Value>>, bool)> {
    let result = connection
        .query(sql, &[])
        .await
        .map_err(|error| upstream("oracle", error))?;
    let columns = result
        .columns
        .iter()
        .map(|column| QueryColumn {
            name: column.name.clone(),
            type_name: oracle_type_name(column.oracle_type).to_string(),
        })
        .collect::<Vec<_>>();
    let column_info = result.columns.clone();
    let mut rows = result.rows;
    let mut has_more_rows = result.has_more_rows;
    let mut cursor_id = result.cursor_id;
    while has_more_rows && rows.len() < max_rows {
        let next = connection
            .fetch_more(cursor_id, &column_info, max_rows as u32)
            .await
            .map_err(|error| upstream("oracle", error))?;
        if next.rows.is_empty() {
            has_more_rows = false;
            break;
        }
        has_more_rows = next.has_more_rows;
        cursor_id = next.cursor_id;
        rows.extend(next.rows);
    }
    let truncated = if rows.len() > max_rows {
        rows.truncate(max_rows);
        true
    } else {
        has_more_rows
    };
    let raw_rows = rows
        .into_iter()
        .map(|row| row.into_values())
        .collect::<Vec<_>>();
    Ok((columns, raw_rows, truncated))
}

fn oracle_value(value: oracle_rs::Value) -> Value {
    use oracle_rs::Value as OracleValue;
    match value {
        OracleValue::Null => Value::Null,
        OracleValue::String(value) => Value::String(value),
        OracleValue::Bytes(value) => normalize_bytes(&value),
        OracleValue::Integer(value) => json_integer(value),
        OracleValue::Float(value) => json_number(value),
        OracleValue::Number(value) => {
            let raw = value.as_str();
            if value.is_integer {
                match raw.parse::<i64>() {
                    Ok(integer) => json_integer(integer),
                    Err(_) => Value::String(raw.to_string()),
                }
            } else {
                match raw.parse::<f64>() {
                    Ok(float) => json_number(float),
                    Err(_) => Value::String(raw.to_string()),
                }
            }
        }
        OracleValue::Date(value) => Value::String(format!(
            "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}",
            value.year, value.month, value.day, value.hour, value.minute, value.second
        )),
        OracleValue::Timestamp(value) => {
            let mut output = format!(
                "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:06}",
                value.year,
                value.month,
                value.day,
                value.hour,
                value.minute,
                value.second,
                value.microsecond
            );
            if value.has_timezone() {
                output.push_str(&format!(
                    "{:+03}:{:02}",
                    value.tz_hour_offset, value.tz_minute_offset
                ));
            }
            Value::String(output)
        }
        OracleValue::RowId(value) => Value::String(value.to_string().unwrap_or_default()),
        OracleValue::Boolean(value) => Value::Bool(value),
        OracleValue::Lob(value) => {
            if let Ok(Some(text)) = value.as_string() {
                Value::String(text)
            } else if let Ok(Some(bytes)) = value.as_bytes() {
                normalize_bytes(&bytes)
            } else {
                Value::Null
            }
        }
        OracleValue::Json(value) => value,
        OracleValue::Vector(value) => match value.data() {
            oracle_rs::VectorData::Float32(values) => Value::Array(
                values
                    .iter()
                    .map(|value| json_number(*value as f64))
                    .collect(),
            ),
            oracle_rs::VectorData::Float64(values) => {
                Value::Array(values.iter().map(|value| json_number(*value)).collect())
            }
            oracle_rs::VectorData::Int8(values) => Value::Array(
                values
                    .iter()
                    .map(|value| json_integer(*value as i64))
                    .collect(),
            ),
            oracle_rs::VectorData::Binary(values) => normalize_bytes(values),
        },
        OracleValue::Cursor(_) | OracleValue::Collection(_) => Value::String(value.to_string()),
    }
}

fn oracle_type_name(value: oracle_rs::OracleType) -> &'static str {
    use oracle_rs::OracleType;
    match value {
        OracleType::Varchar => "VARCHAR2",
        OracleType::Number => "NUMBER",
        OracleType::BinaryInteger => "BINARY_INTEGER",
        OracleType::Long => "LONG",
        OracleType::Rowid => "ROWID",
        OracleType::Date => "DATE",
        OracleType::Raw => "RAW",
        OracleType::LongRaw => "LONG RAW",
        OracleType::Char => "CHAR",
        OracleType::BinaryFloat => "BINARY_FLOAT",
        OracleType::BinaryDouble => "BINARY_DOUBLE",
        OracleType::Cursor => "REF CURSOR",
        OracleType::Object => "OBJECT",
        OracleType::Clob => "CLOB",
        OracleType::Blob => "BLOB",
        OracleType::Bfile => "BFILE",
        OracleType::Json => "JSON",
        OracleType::Vector => "VECTOR",
        OracleType::Timestamp => "TIMESTAMP",
        OracleType::TimestampTz => "TIMESTAMP WITH TIME ZONE",
        OracleType::IntervalYm => "INTERVAL YEAR TO MONTH",
        OracleType::IntervalDs => "INTERVAL DAY TO SECOND",
        OracleType::Urowid => "UROWID",
        OracleType::TimestampLtz => "TIMESTAMP WITH LOCAL TIME ZONE",
        OracleType::Boolean => "BOOLEAN",
    }
}

async fn schema_oracle(dsn: &str) -> AppResult<Vec<SchemaTable>> {
    let sql = "SELECT c.owner, c.table_name, c.column_name, c.data_type, c.nullable,
                      CASE WHEN cc.column_name IS NULL THEN 0 ELSE 1 END
               FROM all_tab_columns c
               LEFT JOIN all_constraints ac
                 ON ac.owner = c.owner AND ac.table_name = c.table_name
                AND ac.constraint_type = 'P'
               LEFT JOIN all_cons_columns cc
                 ON cc.owner = ac.owner AND cc.constraint_name = ac.constraint_name
                AND cc.column_name = c.column_name
               WHERE c.owner NOT IN (
                 'SYS','SYSTEM','XDB','MDSYS','CTXSYS','ORDDATA','ORDSYS','LBACSYS',
                 'DBSNMP','OUTLN','APPQOSSYS','GSMADMIN_INTERNAL','AUDSYS','DVSYS',
                 'DVF','OJVMSYS','WMSYS','REMOTE_SCHEDULER_AGENT','SYSBACKUP','SYSDG',
                 'SYSKM','SYSRAC','SYS$UMF'
               )
               ORDER BY c.owner, c.table_name, c.column_id";
    let connection = open_oracle(dsn).await?;
    let (_, raw_rows, _) = oracle_collect(&connection, sql, MAX_SCHEMA_ROWS).await?;
    let _ = connection.close().await;

    let mut tables = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();
    for row in raw_rows {
        let schema = oracle_row_string(&row, 0);
        let table = oracle_row_string(&row, 1);
        if schema.is_empty() || table.is_empty() {
            continue;
        }
        let key = format!("{schema}.{table}");
        let position = match index.get(&key) {
            Some(position) => *position,
            None => {
                tables.push(SchemaTable {
                    schema: schema.clone(),
                    name: table.clone(),
                    columns: Vec::new(),
                });
                let position = tables.len() - 1;
                index.insert(key, position);
                position
            }
        };
        let nullable = oracle_row_string(&row, 4);
        tables[position].columns.push(SchemaColumn {
            name: oracle_row_string(&row, 2),
            type_name: oracle_row_string(&row, 3),
            nullable: nullable == "Y" || nullable == "YES",
            primary: oracle_row_i64(&row, 5) != 0,
        });
    }
    Ok(tables)
}

fn oracle_row_string(row: &[oracle_rs::Value], index: usize) -> String {
    match row.get(index) {
        Some(value) => oracle_value_string(value),
        None => String::new(),
    }
}

fn oracle_value_string(value: &oracle_rs::Value) -> String {
    match value {
        oracle_rs::Value::Null => String::new(),
        oracle_rs::Value::String(value) => value.clone(),
        oracle_rs::Value::Number(value) => value.as_str().to_string(),
        oracle_rs::Value::Integer(value) => value.to_string(),
        oracle_rs::Value::Float(value) => value.to_string(),
        other => other.to_string(),
    }
}

fn oracle_row_i64(row: &[oracle_rs::Value], index: usize) -> i64 {
    match row.get(index) {
        Some(oracle_rs::Value::Integer(value)) => *value,
        Some(oracle_rs::Value::Number(value)) => value.as_str().parse().unwrap_or_default(),
        Some(oracle_rs::Value::Float(value)) => *value as i64,
        Some(oracle_rs::Value::Boolean(value)) => i64::from(*value),
        _ => 0,
    }
}

// ---------------------------------------------------------------------------
// ClickHouse
// ---------------------------------------------------------------------------

fn clickhouse_client(dsn: &str) -> AppResult<clickhouse::Client> {
    let trimmed = dsn.trim();
    let with_scheme = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };
    let url = Url::parse(&with_scheme)
        .map_err(|error| bad_request(format!("invalid clickhouse DSN: {error}")))?;
    let scheme = url.scheme().to_ascii_lowercase();
    let secure = matches!(scheme.as_str(), "https" | "clickhouses")
        || url.query_pairs().any(|(key, value)| {
            key.eq_ignore_ascii_case("secure") && value.eq_ignore_ascii_case("true")
        });
    let host = url
        .host_str()
        .ok_or_else(|| bad_request("clickhouse DSN is missing a host"))?;
    let default_port = if secure { 8443 } else { 8123 };
    let mut port = url.port().unwrap_or(default_port);
    if matches!(scheme.as_str(), "clickhouse" | "clickhouses") {
        if !secure && port == 9000 {
            port = 8123;
        } else if secure && port == 9440 {
            port = 8443;
        }
    }
    let base = format!(
        "{}://{}:{}",
        if secure { "https" } else { "http" },
        host,
        port
    );
    let mut client = clickhouse::Client::default().with_url(base);
    let query_username = url
        .query_pairs()
        .find(|(key, _)| key.eq_ignore_ascii_case("username"))
        .map(|(_, value)| value.to_string());
    let query_password = url
        .query_pairs()
        .find(|(key, _)| key.eq_ignore_ascii_case("password"))
        .map(|(_, value)| value.to_string());
    let username = if url.username().is_empty() {
        query_username.unwrap_or_default()
    } else {
        percent_decode(url.username())
    };
    if !username.is_empty() {
        let password = match url.password() {
            Some(password) => percent_decode(password),
            None => query_password.unwrap_or_default(),
        };
        client = client.with_user(username);
        client = client.with_password(password);
    }
    let database = percent_decode(url.path().trim_start_matches('/'));
    let database = if database.is_empty() {
        url.query_pairs()
            .find(|(key, _)| key.eq_ignore_ascii_case("database"))
            .map(|(_, value)| value.to_string())
            .unwrap_or_default()
    } else {
        database
    };
    if !database.is_empty() {
        client = client.with_database(database);
    }
    Ok(client)
}

async fn test_clickhouse(dsn: &str) -> AppResult<()> {
    let client = clickhouse_client(dsn)?;
    client
        .query("SELECT 1")
        .execute()
        .await
        .map_err(|error| upstream("clickhouse", error))
}

async fn query_clickhouse(dsn: &str, sql: &str, max_rows: usize) -> AppResult<QueryResult> {
    let client = clickhouse_client(dsn)?;
    let started = Instant::now();
    let work = clickhouse_query(&client, sql, max_rows);
    let (columns, rows, truncated) = tokio::time::timeout(QUERY_TIMEOUT, work)
        .await
        .map_err(|_| upstream("clickhouse", "query timed out"))??;
    Ok(QueryResult {
        columns,
        row_count: rows.len(),
        rows,
        truncated,
        duration_ms: started.elapsed().as_millis() as i64,
    })
}

async fn clickhouse_query(
    client: &clickhouse::Client,
    sql: &str,
    max_rows: usize,
) -> AppResult<(Vec<QueryColumn>, Vec<Vec<Value>>, bool)> {
    let mut cursor = client
        .query(sql)
        .fetch_bytes("JSONCompactEachRowWithNamesAndTypes")
        .map_err(|error| upstream("clickhouse", error))?;
    let mut columns: Vec<QueryColumn> = Vec::new();
    let mut rows: Vec<Vec<Value>> = Vec::new();
    let mut truncated = false;
    let mut line_index = 0usize;
    let mut buffer: Vec<u8> = Vec::new();

    'outer: while let Some(chunk) = cursor
        .next()
        .await
        .map_err(|error| upstream("clickhouse", error))?
    {
        buffer.extend_from_slice(&chunk);
        while let Some(position) = buffer.iter().position(|byte| *byte == b'\n') {
            let line = buffer.drain(..=position).collect::<Vec<_>>();
            if clickhouse_line(&line, &mut line_index, &mut columns, &mut rows, max_rows)? {
                truncated = true;
                break 'outer;
            }
        }
    }
    if !truncated && !buffer.is_empty() {
        truncated = clickhouse_line(&buffer, &mut line_index, &mut columns, &mut rows, max_rows)?;
    }
    Ok((columns, rows, truncated))
}

fn clickhouse_line(
    bytes: &[u8],
    line_index: &mut usize,
    columns: &mut Vec<QueryColumn>,
    rows: &mut Vec<Vec<Value>>,
    max_rows: usize,
) -> AppResult<bool> {
    let line = std::str::from_utf8(bytes)
        .map_err(|_| upstream("clickhouse", "invalid UTF-8 response"))?
        .trim();
    if line.is_empty() {
        return Ok(false);
    }
    let value: Value = serde_json::from_str(line).map_err(|error| upstream("clickhouse", error))?;
    let stop = match *line_index {
        0 => {
            let names = value
                .as_array()
                .ok_or_else(|| upstream("clickhouse", "invalid column header"))?;
            *columns = names
                .iter()
                .map(|name| QueryColumn {
                    name: name.as_str().unwrap_or_default().to_string(),
                    type_name: String::new(),
                })
                .collect();
            false
        }
        1 => {
            let types = value
                .as_array()
                .ok_or_else(|| upstream("clickhouse", "invalid type header"))?;
            for (index, type_name) in types.iter().enumerate() {
                if let Some(column) = columns.get_mut(index) {
                    column.type_name = type_name.as_str().unwrap_or_default().to_string();
                }
            }
            false
        }
        _ => {
            if rows.len() >= max_rows {
                true
            } else {
                let mut row = value
                    .as_array()
                    .cloned()
                    .ok_or_else(|| upstream("clickhouse", "invalid row"))?;
                row.resize(columns.len(), Value::Null);
                rows.push(row);
                false
            }
        }
    };
    *line_index += 1;
    Ok(stop)
}

fn bind_clickhouse(query: clickhouse::query::Query, value: &Value) -> clickhouse::query::Query {
    match value {
        Value::Null => query.bind(Option::<String>::None),
        Value::Bool(value) => query.bind(*value),
        Value::Number(number) => {
            if let Some(value) = number.as_i64() {
                query.bind(value)
            } else if let Some(value) = number.as_u64() {
                query.bind(value)
            } else {
                query.bind(number.as_f64().unwrap_or_default())
            }
        }
        Value::String(value) => query.bind(value.clone()),
        Value::Array(_) | Value::Object(_) => {
            query.bind(serde_json::to_string(value).unwrap_or_default())
        }
    }
}

async fn schema_clickhouse(dsn: &str) -> AppResult<Vec<SchemaTable>> {
    let client = clickhouse_client(dsn)?;
    let sql = "SELECT database, table, name, type
               FROM system.columns
               WHERE database NOT IN ('system', 'INFORMATION_SCHEMA', 'information_schema')
               ORDER BY database, table, position";
    let (_, rows, _) = clickhouse_query(&client, sql, MAX_SCHEMA_ROWS).await?;
    let mut tables = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();
    for row in rows {
        let database = value_as_string(row.first());
        let table = value_as_string(row.get(1));
        if database.is_empty() || table.is_empty() {
            continue;
        }
        let key = format!("{database}.{table}");
        let position = match index.get(&key) {
            Some(position) => *position,
            None => {
                tables.push(SchemaTable {
                    schema: database.clone(),
                    name: table.clone(),
                    columns: Vec::new(),
                });
                let position = tables.len() - 1;
                index.insert(key, position);
                position
            }
        };
        let type_name = value_as_string(row.get(3));
        tables[position].columns.push(SchemaColumn {
            name: value_as_string(row.get(2)),
            nullable: type_name.starts_with("Nullable("),
            type_name,
            primary: false,
        });
    }
    Ok(tables)
}

// ---------------------------------------------------------------------------
// MongoDB
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct MongoRequest {
    #[serde(default)]
    database: String,
    #[serde(default)]
    collection: String,
    #[serde(default)]
    filter: Option<Value>,
    #[serde(default)]
    pipeline: Option<Vec<Value>>,
    #[serde(default)]
    limit: i64,
}

async fn mongo_client(dsn: &str) -> AppResult<mongodb::Client> {
    let mut options = mongodb::options::ClientOptions::parse(dsn)
        .await
        .map_err(|error| upstream("mongodb", error))?;
    options.connect_timeout = Some(CONNECT_TIMEOUT);
    options.server_selection_timeout = Some(CONNECT_TIMEOUT);
    mongodb::Client::with_options(options).map_err(|error| upstream("mongodb", error))
}

async fn test_mongo(dsn: &str) -> AppResult<()> {
    let client = mongo_client(dsn).await?;
    client
        .database("admin")
        .run_command(mongodb::bson::doc! { "ping": 1 })
        .await
        .map_err(|error| upstream("mongodb", error))?;
    Ok(())
}

async fn query_mongo(dsn: &str, query: &str, max_rows: usize) -> AppResult<QueryResult> {
    let request: MongoRequest = serde_json::from_str(query).map_err(|_| {
        bad_request("mongodb query must be JSON: {database, collection, filter, pipeline, limit}")
    })?;
    if request.database.is_empty() || request.collection.is_empty() {
        return Err(bad_request(
            "mongodb query requires database and collection",
        ));
    }
    let limit = if request.limit <= 0 || request.limit as usize > max_rows {
        max_rows as i64
    } else {
        request.limit
    };

    let client = mongo_client(dsn).await?;
    let collection = client
        .database(&request.database)
        .collection::<mongodb::bson::Document>(&request.collection);
    let started = Instant::now();

    let pipeline = request.pipeline.unwrap_or_default();
    let mut cursor = if pipeline.is_empty() {
        let filter = match request.filter.as_ref() {
            None | Some(Value::Null) => mongodb::bson::Document::new(),
            Some(value) => mongo_document(value)?,
        };
        collection
            .find(filter)
            .limit(limit)
            .await
            .map_err(|error| upstream("mongodb", error))?
    } else {
        let mut stages = Vec::with_capacity(pipeline.len());
        for stage in &pipeline {
            stages.push(mongo_document(stage)?);
        }
        collection
            .aggregate(stages)
            .await
            .map_err(|error| upstream("mongodb", error))?
    };

    let mut rows: Vec<Vec<Value>> = Vec::new();
    let mut truncated = false;
    while let Some(document) = cursor
        .try_next()
        .await
        .map_err(|error| upstream("mongodb", error))?
    {
        if rows.len() as i64 >= limit {
            truncated = true;
            break;
        }
        let json = mongodb::bson::Bson::Document(document).into_relaxed_extjson();
        let encoded = serde_json::to_string(&json).map_err(|error| upstream("mongodb", error))?;
        rows.push(vec![Value::String(encoded)]);
    }

    Ok(QueryResult {
        columns: vec![QueryColumn {
            name: "document".into(),
            type_name: "json".into(),
        }],
        row_count: rows.len(),
        rows,
        truncated,
        duration_ms: started.elapsed().as_millis() as i64,
    })
}

fn mongo_document(value: &Value) -> AppResult<mongodb::bson::Document> {
    match value {
        Value::Object(_) => {
            mongodb::bson::to_document(value).map_err(|error| upstream("mongodb", error))
        }
        _ => Err(bad_request("mongodb documents must be JSON objects")),
    }
}

async fn schema_mongo(dsn: &str) -> AppResult<Vec<SchemaTable>> {
    let client = mongo_client(dsn).await?;
    let mut databases = client
        .list_database_names()
        .await
        .map_err(|error| upstream("mongodb", error))?;
    databases.sort();

    let mut tables = Vec::new();
    for database in databases {
        if matches!(database.as_str(), "admin" | "config" | "local") {
            continue;
        }
        let db = client.database(&database);
        let mut collections = match db.list_collection_names().await {
            Ok(collections) => collections,
            Err(_) => continue,
        };
        collections.sort();
        for collection in collections {
            let mut table = SchemaTable {
                schema: database.clone(),
                name: collection.clone(),
                columns: Vec::new(),
            };
            if let Ok(Some(sample)) = db
                .collection::<mongodb::bson::Document>(&collection)
                .find_one(mongodb::bson::Document::new())
                .await
            {
                let mut keys = sample.keys().cloned().collect::<Vec<_>>();
                keys.sort();
                for key in keys {
                    if let Some(value) = sample.get(&key) {
                        table.columns.push(SchemaColumn {
                            name: key,
                            type_name: bson_type_name(value).to_string(),
                            nullable: false,
                            primary: false,
                        });
                    }
                }
            }
            tables.push(table);
            if tables.len() >= MAX_SCHEMA_TABLES {
                return Ok(tables);
            }
        }
    }
    Ok(tables)
}

fn bson_type_name(value: &mongodb::bson::Bson) -> &'static str {
    use mongodb::bson::Bson;
    match value {
        Bson::Double(_) => "float64",
        Bson::String(_) => "string",
        Bson::Array(_) => "primitive.A",
        Bson::Document(_) => "primitive.M",
        Bson::Boolean(_) => "bool",
        Bson::Null => "<nil>",
        Bson::RegularExpression(_) => "primitive.Regex",
        Bson::JavaScriptCode(_) => "primitive.JavaScript",
        Bson::JavaScriptCodeWithScope(_) => "primitive.CodeWithScope",
        Bson::Int32(_) => "int32",
        Bson::Int64(_) => "int64",
        Bson::Timestamp(_) => "primitive.Timestamp",
        Bson::Binary(_) => "primitive.Binary",
        Bson::ObjectId(_) => "primitive.ObjectID",
        Bson::DateTime(_) => "primitive.DateTime",
        Bson::Symbol(_) => "primitive.Symbol",
        Bson::Decimal128(_) => "primitive.Decimal128",
        Bson::Undefined => "primitive.Undefined",
        Bson::MaxKey => "primitive.MaxKey",
        Bson::MinKey => "primitive.MinKey",
        Bson::DbPointer(_) => "primitive.DBPointer",
    }
}

// ---------------------------------------------------------------------------
// Redis
// ---------------------------------------------------------------------------

fn redis_client(dsn: &str) -> AppResult<redis::Client> {
    let dsn = if dsn.contains("://") {
        dsn.to_string()
    } else {
        format!("redis://{dsn}")
    };
    redis::Client::open(dsn).map_err(|error| upstream("redis", error))
}

async fn test_redis(dsn: &str) -> AppResult<()> {
    let client = redis_client(dsn)?;
    let mut connection = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|error| upstream("redis", error))?;
    redis::cmd("PING")
        .query_async::<redis::Value>(&mut connection)
        .await
        .map_err(|error| upstream("redis", error))?;
    Ok(())
}

async fn query_redis(dsn: &str, query: &str, max_rows: usize) -> AppResult<QueryResult> {
    let args = parse_redis_command(query)?;
    let Some(command) = args.first() else {
        return Err(bad_request("redis command is required"));
    };
    let client = redis_client(dsn)?;
    let mut connection = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|error| upstream("redis", error))?;
    let started = Instant::now();
    let mut cmd = redis::cmd(command);
    for argument in args.iter().skip(1) {
        cmd.arg(argument.clone());
    }
    let reply = cmd
        .query_async::<redis::Value>(&mut connection)
        .await
        .map_err(|error| upstream("redis", error))?;
    let (columns, rows, truncated) = redis_result(reply, max_rows);
    Ok(QueryResult {
        columns,
        row_count: rows.len(),
        rows,
        truncated,
        duration_ms: started.elapsed().as_millis() as i64,
    })
}

fn redis_result(reply: redis::Value, max_rows: usize) -> (Vec<QueryColumn>, Vec<Vec<Value>>, bool) {
    use redis::Value as RedisValue;
    match reply {
        RedisValue::Array(items) | RedisValue::Set(items) => {
            let truncated = items.len() > max_rows;
            let items = if truncated {
                items.into_iter().take(max_rows).collect::<Vec<_>>()
            } else {
                items
            };
            if matches!(items.first(), Some(RedisValue::Array(_))) {
                let columns = vec![
                    QueryColumn {
                        name: "key".into(),
                        type_name: String::new(),
                    },
                    QueryColumn {
                        name: "value".into(),
                        type_name: String::new(),
                    },
                ];
                let mut rows = Vec::new();
                for item in items {
                    if let RedisValue::Array(pair) = item {
                        if pair.len() >= 2 {
                            rows.push(vec![
                                redis_scalar(pair.first().unwrap_or(&RedisValue::Nil)),
                                redis_scalar(pair.get(1).unwrap_or(&RedisValue::Nil)),
                            ]);
                        }
                    }
                }
                (columns, rows, truncated)
            } else {
                let columns = vec![QueryColumn {
                    name: "value".into(),
                    type_name: String::new(),
                }];
                let rows = items
                    .iter()
                    .map(|item| vec![redis_scalar(item)])
                    .collect::<Vec<_>>();
                (columns, rows, truncated)
            }
        }
        RedisValue::Map(pairs) => {
            let mut pairs = pairs
                .into_iter()
                .map(|(key, value)| (redis_scalar(&key), value))
                .collect::<Vec<_>>();
            pairs.sort_by(|left, right| {
                value_as_string(Some(&left.0)).cmp(&value_as_string(Some(&right.0)))
            });
            let truncated = pairs.len() > max_rows;
            let columns = vec![
                QueryColumn {
                    name: "key".into(),
                    type_name: String::new(),
                },
                QueryColumn {
                    name: "value".into(),
                    type_name: String::new(),
                },
            ];
            let rows = pairs
                .into_iter()
                .take(max_rows)
                .map(|(key, value)| vec![key, redis_scalar(&value)])
                .collect::<Vec<_>>();
            (columns, rows, truncated)
        }
        other => {
            let columns = vec![QueryColumn {
                name: "value".into(),
                type_name: String::new(),
            }];
            (columns, vec![vec![redis_scalar(&other)]], false)
        }
    }
}

fn redis_scalar(value: &redis::Value) -> Value {
    use redis::Value as RedisValue;
    match value {
        RedisValue::Nil => Value::Null,
        other => Value::String(redis_text(other)),
    }
}

fn redis_text(value: &redis::Value) -> String {
    use redis::Value as RedisValue;
    match value {
        RedisValue::Nil => "<nil>".into(),
        RedisValue::Int(value) => value.to_string(),
        RedisValue::BulkString(value) => String::from_utf8_lossy(value).into_owned(),
        RedisValue::SimpleString(value) => value.clone(),
        RedisValue::Okay => "OK".into(),
        RedisValue::Double(value) => value.to_string(),
        RedisValue::Boolean(value) => value.to_string(),
        RedisValue::VerbatimString { text, .. } => text.clone(),
        RedisValue::Attribute { data, .. } => redis_text(data),
        RedisValue::Array(items) | RedisValue::Set(items) => format!(
            "[{}]",
            items.iter().map(redis_text).collect::<Vec<_>>().join(" ")
        ),
        RedisValue::Map(pairs) => format!(
            "map[{}]",
            pairs
                .iter()
                .map(|(key, value)| format!("{}:{}", redis_text(key), redis_text(value)))
                .collect::<Vec<_>>()
                .join(" ")
        ),
        other => format!("{other:?}"),
    }
}

async fn schema_redis(dsn: &str) -> AppResult<Vec<SchemaTable>> {
    let client = redis_client(dsn)?;
    let mut connection = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|error| upstream("redis", error))?;
    redis::cmd("SCAN")
        .arg(0)
        .arg("MATCH")
        .arg("*")
        .arg("COUNT")
        .arg(1)
        .query_async::<redis::Value>(&mut connection)
        .await
        .map_err(|error| upstream("redis", error))?;
    Ok(vec![SchemaTable {
        schema: "redis".into(),
        name: "keys".into(),
        columns: vec![SchemaColumn {
            name: "key".into(),
            type_name: "string".into(),
            nullable: false,
            primary: false,
        }],
    }])
}

fn parse_redis_command(input: &str) -> AppResult<Vec<String>> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut escaped = false;
    let flush = |args: &mut Vec<String>, current: &mut String| {
        if !current.is_empty() {
            args.push(std::mem::take(current));
        }
    };
    for character in input.chars() {
        if escaped {
            current.push(character);
            escaped = false;
            continue;
        }
        if character == '\\' {
            escaped = true;
            continue;
        }
        if let Some(active) = quote {
            if character == active {
                quote = None;
            } else {
                current.push(character);
            }
            continue;
        }
        match character {
            '\'' | '"' => quote = Some(character),
            ' ' | '\t' | '\n' | '\r' => flush(&mut args, &mut current),
            _ => current.push(character),
        }
    }
    if escaped {
        current.push('\\');
    }
    if quote.is_some() {
        return Err(bad_request("unterminated quote"));
    }
    flush(&mut args, &mut current);
    Ok(args)
}

// ---------------------------------------------------------------------------
// Cassandra / ScyllaDB
// ---------------------------------------------------------------------------

struct CassandraTarget {
    host: String,
    keyspace: String,
}

fn parse_cassandra_dsn(dsn: &str) -> AppResult<CassandraTarget> {
    let parsed =
        Url::parse(dsn).map_err(|error| bad_request(format!("invalid cassandra DSN: {error}")))?;
    if parsed.scheme() != "cassandra" {
        return Err(bad_request("cassandra DSN must start with cassandra://"));
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| bad_request("cassandra DSN is missing a host"))?;
    let host = match parsed.port() {
        Some(port) => format!("{host}:{port}"),
        None => format!("{host}:9042"),
    };
    Ok(CassandraTarget {
        host,
        keyspace: parsed.path().trim_start_matches('/').to_string(),
    })
}

async fn cassandra_session(dsn: &str) -> AppResult<scylla::client::session::Session> {
    let target = parse_cassandra_dsn(dsn)?;
    let mut builder = scylla::client::session_builder::SessionBuilder::new()
        .known_node(target.host.as_str())
        .connection_timeout(CONNECT_TIMEOUT);
    if !target.keyspace.is_empty() {
        builder = builder.use_keyspace(target.keyspace, true);
    }
    builder
        .build()
        .await
        .map_err(|error| upstream("cassandra", error))
}

async fn test_cassandra(dsn: &str) -> AppResult<()> {
    let session = cassandra_session(dsn).await?;
    session
        .query_unpaged("SELECT release_version FROM system.local", &[])
        .await
        .map_err(|error| upstream("cassandra", error))?;
    Ok(())
}

async fn query_cassandra(dsn: &str, query: &str, max_rows: usize) -> AppResult<QueryResult> {
    let session = cassandra_session(dsn).await?;
    let started = Instant::now();
    let work = async {
        let statement = scylla::statement::Statement::new(query).with_page_size(max_rows as i32);
        let pager = session
            .query_iter(statement, &[])
            .await
            .map_err(|error| upstream("cassandra", error))?;
        let mut stream = pager
            .rows_stream::<scylla::value::Row>()
            .map_err(|error| upstream("cassandra", error))?;
        let columns = stream
            .column_specs()
            .iter()
            .map(|spec| QueryColumn {
                name: spec.name().to_string(),
                type_name: cql_type_name(spec.typ()),
            })
            .collect::<Vec<_>>();
        let mut rows: Vec<Vec<Value>> = Vec::new();
        let mut truncated = false;
        while let Some(row) = stream.next().await {
            let row = row.map_err(|error| upstream("cassandra", error))?;
            if rows.len() >= max_rows {
                truncated = true;
                break;
            }
            let mut values = Vec::with_capacity(columns.len());
            for value in row.columns {
                values.push(cql_value(value));
            }
            values.resize(columns.len(), Value::Null);
            rows.push(values);
        }
        Ok(QueryResult {
            columns,
            row_count: rows.len(),
            rows,
            truncated,
            duration_ms: started.elapsed().as_millis() as i64,
        })
    };
    tokio::time::timeout(QUERY_TIMEOUT, work)
        .await
        .map_err(|_| upstream("cassandra", "query timed out"))?
}

async fn schema_cassandra(dsn: &str) -> AppResult<Vec<SchemaTable>> {
    let session = cassandra_session(dsn).await?;
    let statement = scylla::statement::Statement::new(
        "SELECT keyspace_name, table_name, column_name, type
         FROM system_schema.columns",
    )
    .with_page_size(1000);
    let pager = session
        .query_iter(statement, &[])
        .await
        .map_err(|error| upstream("cassandra", error))?;
    let mut stream = pager
        .rows_stream::<scylla::value::Row>()
        .map_err(|error| upstream("cassandra", error))?;

    let mut tables = Vec::new();
    let mut index: HashMap<String, usize> = HashMap::new();
    while let Some(row) = stream.next().await {
        let row = row.map_err(|error| upstream("cassandra", error))?;
        let keyspace = cql_string(row.columns.first().and_then(|value| value.as_ref()));
        let table = cql_string(row.columns.get(1).and_then(|value| value.as_ref()));
        let column = cql_string(row.columns.get(2).and_then(|value| value.as_ref()));
        let type_name = cql_string(row.columns.get(3).and_then(|value| value.as_ref()));
        if keyspace.is_empty() || table.is_empty() || column.is_empty() {
            continue;
        }
        if matches!(
            keyspace.as_str(),
            "system" | "system_schema" | "system_auth" | "system_distributed" | "system_traces"
        ) {
            continue;
        }
        let key = format!("{keyspace}.{table}");
        let position = match index.get(&key) {
            Some(position) => *position,
            None => {
                tables.push(SchemaTable {
                    schema: keyspace.clone(),
                    name: table.clone(),
                    columns: Vec::new(),
                });
                let position = tables.len() - 1;
                index.insert(key, position);
                position
            }
        };
        tables[position].columns.push(SchemaColumn {
            name: column,
            type_name,
            nullable: false,
            primary: false,
        });
    }
    Ok(tables)
}

fn cql_value(value: Option<scylla::value::CqlValue>) -> Value {
    use scylla::value::CqlValue;
    let Some(value) = value else {
        return Value::Null;
    };
    match value {
        CqlValue::Ascii(value) | CqlValue::Text(value) => Value::String(value),
        CqlValue::Boolean(value) => Value::Bool(value),
        CqlValue::Blob(value) => normalize_bytes(&value),
        CqlValue::Counter(value) => json_integer(value.0),
        CqlValue::Decimal(value) => {
            let (bytes, scale) = value.as_signed_be_bytes_slice_and_exponent();
            Value::String(signed_decimal_string(bytes, scale))
        }
        CqlValue::Date(value) => {
            let days = value.0 as i64 - (1_i64 << 31);
            match chrono::NaiveDate::from_ymd_opt(1970, 1, 1)
                .and_then(|epoch| epoch.checked_add_signed(chrono::Duration::days(days)))
            {
                Some(date) => Value::String(format_naive_date(date)),
                None => Value::String(days.to_string()),
            }
        }
        CqlValue::Double(value) => json_number(value),
        CqlValue::Duration(value) => Value::String(format!(
            "{}mo{}d{}ns",
            value.months, value.days, value.nanoseconds
        )),
        CqlValue::Empty => Value::String(String::new()),
        CqlValue::Float(value) => json_number(value as f64),
        CqlValue::Int(value) => json_integer(value as i64),
        CqlValue::BigInt(value) => json_integer(value),
        CqlValue::Timestamp(value) => {
            match chrono::DateTime::<chrono::Utc>::from_timestamp_millis(value.0) {
                Some(timestamp) => Value::String(format_utc_datetime(timestamp)),
                None => Value::String(value.0.to_string()),
            }
        }
        CqlValue::Inet(value) => Value::String(value.to_string()),
        CqlValue::List(values) | CqlValue::Set(values) | CqlValue::Vector(values) => Value::Array(
            values
                .into_iter()
                .map(|value| cql_value(Some(value)))
                .collect(),
        ),
        CqlValue::Map(pairs) => {
            let mut object = JsonMap::new();
            for (key, value) in pairs {
                object.insert(cql_key(&key), cql_value_value(value));
            }
            Value::Object(object)
        }
        CqlValue::UserDefinedType { fields, .. } => {
            let mut object = JsonMap::new();
            for (name, value) in fields {
                object.insert(name, cql_value(value));
            }
            Value::Object(object)
        }
        CqlValue::SmallInt(value) => json_integer(value as i64),
        CqlValue::TinyInt(value) => json_integer(value as i64),
        CqlValue::Time(value) => {
            let nanoseconds = value.0;
            Value::String(format!(
                "{:02}:{:02}:{:02}.{:09}",
                nanoseconds / 3_600_000_000_000,
                nanoseconds / 60_000_000_000 % 60,
                nanoseconds / 1_000_000_000 % 60,
                nanoseconds % 1_000_000_000
            ))
        }
        CqlValue::Timeuuid(value) => Value::String(value.to_string()),
        CqlValue::Tuple(values) => Value::Array(values.into_iter().map(cql_value).collect()),
        CqlValue::Uuid(value) => Value::String(value.to_string()),
        CqlValue::Varint(value) => {
            Value::String(signed_decimal_string(value.as_signed_bytes_be_slice(), 0))
        }
        other => Value::String(format!("{other:?}")),
    }
}

fn cql_value_value(value: scylla::value::CqlValue) -> Value {
    cql_value(Some(value))
}

fn cql_key(value: &scylla::value::CqlValue) -> String {
    match cql_value_value(value.clone()) {
        Value::String(value) => value,
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn cql_string(value: Option<&scylla::value::CqlValue>) -> String {
    match value {
        Some(scylla::value::CqlValue::Text(value))
        | Some(scylla::value::CqlValue::Ascii(value)) => value.clone(),
        Some(value) => match cql_value_value(value.clone()) {
            Value::String(value) => value,
            Value::Null => String::new(),
            other => other.to_string(),
        },
        None => String::new(),
    }
}

fn cql_type_name(value: &scylla::frame::response::result::ColumnType) -> String {
    use scylla::frame::response::result::{CollectionType, ColumnType, NativeType};
    match value {
        ColumnType::Native(native) => match native {
            NativeType::Ascii => "ascii",
            NativeType::Boolean => "boolean",
            NativeType::Blob => "blob",
            NativeType::Counter => "counter",
            NativeType::Date => "date",
            NativeType::Decimal => "decimal",
            NativeType::Double => "double",
            NativeType::Duration => "duration",
            NativeType::Float => "float",
            NativeType::Int => "int",
            NativeType::BigInt => "bigint",
            NativeType::Text => "text",
            NativeType::Timestamp => "timestamp",
            NativeType::Inet => "inet",
            NativeType::SmallInt => "smallint",
            NativeType::TinyInt => "tinyint",
            NativeType::Time => "time",
            NativeType::Timeuuid => "timeuuid",
            NativeType::Uuid => "uuid",
            NativeType::Varint => "varint",
            _ => "unknown",
        }
        .to_string(),
        ColumnType::Collection { typ, .. } => match typ {
            CollectionType::List(element) => format!("list<{}>", cql_type_name(element)),
            CollectionType::Set(element) => format!("set<{}>", cql_type_name(element)),
            CollectionType::Map(key, value) => {
                format!("map<{}, {}>", cql_type_name(key), cql_type_name(value))
            }
            _ => "collection".into(),
        },
        ColumnType::Vector { typ, dimensions } => {
            format!("vector<{}, {}>", cql_type_name(typ), dimensions)
        }
        ColumnType::UserDefinedType { definition, .. } => definition.name.to_string(),
        ColumnType::Tuple(types) => format!(
            "tuple<{}>",
            types
                .iter()
                .map(cql_type_name)
                .collect::<Vec<_>>()
                .join(", ")
        ),
        _ => "unknown".into(),
    }
}

/// Convert a signed big-endian two's-complement integer into a decimal string.
fn signed_decimal_string(bytes: &[u8], scale: i32) -> String {
    if bytes.is_empty() {
        return "0".into();
    }
    let negative = bytes[0] & 0x80 != 0;
    let mut magnitude = bytes.to_vec();
    if negative {
        for byte in magnitude.iter_mut() {
            *byte = !*byte;
        }
        for byte in magnitude.iter_mut().rev() {
            let (value, carry) = byte.overflowing_add(1);
            *byte = value;
            if !carry {
                break;
            }
        }
    }
    while magnitude.len() > 1 && magnitude[0] == 0 {
        magnitude.remove(0);
    }
    let mut digits: Vec<u8> = vec![0];
    for byte in magnitude {
        let mut carry = byte as u32;
        for digit in digits.iter_mut() {
            let value = (*digit as u32) * 256 + carry;
            *digit = (value % 10) as u8;
            carry = value / 10;
        }
        while carry > 0 {
            digits.push((carry % 10) as u8);
            carry /= 10;
        }
    }
    while digits.len() > 1 && *digits.last().unwrap_or(&0) == 0 {
        digits.pop();
    }
    let mut output: String = digits
        .iter()
        .rev()
        .map(|digit| char::from(b'0' + *digit))
        .collect();
    if output == "0" {
        return output;
    }
    if scale > 0 {
        let scale = scale as usize;
        if output.len() <= scale {
            output = format!("0.{}{}", "0".repeat(scale - output.len()), output);
        } else {
            output.insert(output.len() - scale, '.');
        }
    } else if scale < 0 {
        output.push_str(&"0".repeat((-scale) as usize));
    }
    if negative {
        output.insert(0, '-');
    }
    output
}

// ---------------------------------------------------------------------------
// Elasticsearch
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct EsRequest {
    #[serde(default)]
    index: String,
    #[serde(default)]
    body: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct EsResponse {
    #[serde(default)]
    hits: EsHits,
}

#[derive(Debug, Default, Deserialize)]
struct EsHits {
    #[serde(default)]
    hits: Vec<EsHit>,
}

#[derive(Debug, Deserialize)]
struct EsHit {
    #[serde(rename = "_index", default)]
    index: String,
    #[serde(rename = "_id", default)]
    id: String,
    #[serde(rename = "_source", default)]
    source: Value,
}

async fn test_elasticsearch(dsn: &str) -> AppResult<()> {
    let (url, auth) = elasticsearch_url(dsn, "/_cluster/health")?;
    let client = reqwest::Client::builder()
        .timeout(CONNECT_TIMEOUT)
        .build()
        .map_err(|error| upstream("elasticsearch", error))?;
    let mut request = client.get(url);
    if let Some((user, password)) = auth {
        request = request.basic_auth(user, Some(password));
    }
    let response = request
        .send()
        .await
        .map_err(|error| upstream("elasticsearch", error))?;
    if !response.status().is_success() {
        return Err(upstream("elasticsearch", response.status()));
    }
    Ok(())
}

async fn query_elasticsearch(dsn: &str, query: &str, max_rows: usize) -> AppResult<QueryResult> {
    let request: EsRequest = serde_json::from_str(query).map_err(|_| {
        bad_request("elasticsearch query must be JSON: {\"index\":\"logs-*\",\"body\":{...}}")
    })?;
    let body = match request.body {
        Some(value) => {
            serde_json::to_string(&value).map_err(|error| upstream("elasticsearch", error))?
        }
        None => r#"{"query":{"match_all":{}},"size":100}"#.to_string(),
    };
    let path = if request.index.is_empty() {
        "/_search".to_string()
    } else {
        format!("/{}/_search", encode_path_segment(&request.index))
    };
    let (url, auth) = elasticsearch_url(dsn, &path)?;
    let started = Instant::now();
    let client = reqwest::Client::builder()
        .timeout(QUERY_TIMEOUT)
        .build()
        .map_err(|error| upstream("elasticsearch", error))?;
    let mut builder = client
        .post(url)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(body);
    if let Some((user, password)) = auth {
        builder = builder.basic_auth(user, Some(password));
    }
    let response = builder
        .send()
        .await
        .map_err(|error| upstream("elasticsearch", error))?;
    let status = response.status();
    if !status.is_success() {
        let payload = response.text().await.unwrap_or_default();
        let payload = truncate_text(&payload, 4096);
        return Err(upstream(
            "elasticsearch",
            format!("{status}: {}", payload.trim()),
        ));
    }
    let payload: EsResponse = response
        .json()
        .await
        .map_err(|error| upstream("elasticsearch", error))?;
    let mut rows: Vec<Vec<Value>> = Vec::new();
    let mut truncated = false;
    for hit in payload.hits.hits {
        if rows.len() >= max_rows {
            truncated = true;
            break;
        }
        let source = match hit.source {
            Value::Null => String::new(),
            value => {
                serde_json::to_string(&value).map_err(|error| upstream("elasticsearch", error))?
            }
        };
        rows.push(vec![
            Value::String(hit.index),
            Value::String(hit.id),
            Value::String(source),
        ]);
    }
    Ok(QueryResult {
        columns: vec![
            QueryColumn {
                name: "_index".into(),
                type_name: "string".into(),
            },
            QueryColumn {
                name: "_id".into(),
                type_name: "string".into(),
            },
            QueryColumn {
                name: "_source".into(),
                type_name: "json".into(),
            },
        ],
        row_count: rows.len(),
        rows,
        truncated,
        duration_ms: started.elapsed().as_millis() as i64,
    })
}

async fn schema_elasticsearch(dsn: &str) -> AppResult<Vec<SchemaTable>> {
    let (url, auth) = elasticsearch_url(dsn, "/_cat/indices?format=json&h=index")?;
    let client = reqwest::Client::builder()
        .timeout(CONNECT_TIMEOUT)
        .build()
        .map_err(|error| upstream("elasticsearch", error))?;
    let mut request = client.get(url);
    if let Some((user, password)) = auth {
        request = request.basic_auth(user, Some(password));
    }
    let response = request
        .send()
        .await
        .map_err(|error| upstream("elasticsearch", error))?;
    if !response.status().is_success() {
        return Err(upstream("elasticsearch", response.status()));
    }
    let indices: Vec<Value> = response
        .json()
        .await
        .map_err(|error| upstream("elasticsearch", error))?;
    let mut tables = Vec::new();
    for item in indices {
        let Some(name) = item.get("index").and_then(Value::as_str) else {
            continue;
        };
        if name.is_empty() {
            continue;
        }
        tables.push(SchemaTable {
            schema: "elasticsearch".into(),
            name: name.to_string(),
            columns: vec![
                SchemaColumn {
                    name: "_id".into(),
                    type_name: "string".into(),
                    nullable: false,
                    primary: false,
                },
                SchemaColumn {
                    name: "_source".into(),
                    type_name: "json".into(),
                    nullable: false,
                    primary: false,
                },
            ],
        });
    }
    tables.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(tables)
}

fn elasticsearch_url(dsn: &str, path: &str) -> AppResult<(String, Option<(String, String)>)> {
    let mut url = Url::parse(dsn)
        .map_err(|error| bad_request(format!("invalid elasticsearch DSN: {error}")))?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err(bad_request(
            "elasticsearch DSN must start with http:// or https://",
        ));
    }
    let auth = if url.username().is_empty() {
        None
    } else {
        Some((
            percent_decode(url.username()),
            percent_decode(url.password().unwrap_or("")),
        ))
    };
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_query(None);
    url.set_fragment(None);
    let base = url.as_str().trim_end_matches('/').to_string();
    Ok((format!("{base}{path}"), auth))
}

fn encode_path_segment(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~' | b'*' | b',') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

fn truncate_text(value: &str, limit: usize) -> String {
    if value.len() <= limit {
        return value.to_string();
    }
    let mut end = limit;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    value[..end].to_string()
}

// ---------------------------------------------------------------------------
// Neo4j
// ---------------------------------------------------------------------------

async fn neo4j_graph(dsn: &str) -> AppResult<neo4rs::Graph> {
    let mut url =
        Url::parse(dsn).map_err(|error| bad_request(format!("invalid neo4j DSN: {error}")))?;
    let user = if url.username().is_empty() {
        None
    } else {
        Some(percent_decode(url.username()))
    };
    let password = percent_decode(url.password().unwrap_or(""));
    let _ = url.set_username("");
    let _ = url.set_password(None);
    let mut builder = neo4rs::ConfigBuilder::default().uri(url.as_str());
    if let Some(user) = user {
        builder = builder.user(user).password(password);
    }
    let config = builder.build().map_err(|error| upstream("neo4j", error))?;
    neo4rs::Graph::connect(config)
        .await
        .map_err(|error| upstream("neo4j", error))
}

async fn test_neo4j(dsn: &str) -> AppResult<()> {
    let graph = neo4j_graph(dsn).await?;
    graph
        .run(neo4rs::Query::new("RETURN 1".into()))
        .await
        .map_err(|error| upstream("neo4j", error))
}

async fn query_neo4j(dsn: &str, query: &str, max_rows: usize) -> AppResult<QueryResult> {
    let graph = neo4j_graph(dsn).await?;
    let started = Instant::now();
    let work = async {
        let mut stream = graph
            .execute(neo4rs::Query::new(query.to_string()))
            .await
            .map_err(|error| upstream("neo4j", error))?;
        let mut columns: Vec<QueryColumn> = Vec::new();
        let mut rows: Vec<Vec<Value>> = Vec::new();
        let mut truncated = false;
        while let Some(row) = stream
            .next()
            .await
            .map_err(|error| upstream("neo4j", error))?
        {
            if rows.len() >= max_rows {
                truncated = true;
                break;
            }
            let values: BTreeMap<String, Value> =
                row.to().map_err(|error| upstream("neo4j", error))?;
            if columns.is_empty() {
                columns = values
                    .keys()
                    .map(|name| QueryColumn {
                        name: name.clone(),
                        type_name: String::new(),
                    })
                    .collect();
            }
            let mut row_values = Vec::with_capacity(columns.len());
            for column in &columns {
                row_values.push(values.get(&column.name).cloned().unwrap_or(Value::Null));
            }
            rows.push(row_values);
        }
        Ok(QueryResult {
            columns,
            row_count: rows.len(),
            rows,
            truncated,
            duration_ms: started.elapsed().as_millis() as i64,
        })
    };
    tokio::time::timeout(QUERY_TIMEOUT, work)
        .await
        .map_err(|_| upstream("neo4j", "query timed out"))?
}

async fn schema_neo4j(dsn: &str) -> AppResult<Vec<SchemaTable>> {
    let graph = neo4j_graph(dsn).await?;
    let mut stream = graph
        .execute(neo4rs::Query::new(
            "CALL db.labels() YIELD label RETURN label ORDER BY label".into(),
        ))
        .await
        .map_err(|error| upstream("neo4j", error))?;
    let mut tables = Vec::new();
    while let Some(row) = stream
        .next()
        .await
        .map_err(|error| upstream("neo4j", error))?
    {
        let label: String = row.get("label").map_err(|error| upstream("neo4j", error))?;
        tables.push(SchemaTable {
            schema: "neo4j".into(),
            name: label,
            columns: vec![SchemaColumn {
                name: "node".into(),
                type_name: "node".into(),
                nullable: false,
                primary: false,
            }],
        });
    }
    Ok(tables)
}

// ---------------------------------------------------------------------------
// SQL row editing
// ---------------------------------------------------------------------------

fn valid_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }
    chars.all(|character| character.is_ascii_alphanumeric() || character == '_' || character == '$')
}

fn validate_row_change(change: &RowChange, require_key: bool) -> AppResult<()> {
    if !valid_identifier(&change.table) {
        return Err(bad_request("invalid table name"));
    }
    if !change.schema.is_empty() && !valid_identifier(&change.schema) {
        return Err(bad_request("invalid schema name"));
    }
    let values = change.values.as_ref().map_or(0, HashMap::len);
    if values == 0 && !require_key {
        return Err(bad_request("no values"));
    }
    if let Some(values) = &change.values {
        for column in values.keys() {
            if !valid_identifier(column) {
                return Err(bad_request(format!("invalid column name: {column}")));
            }
        }
    }
    if let Some(keys) = &change.key {
        for column in keys.keys() {
            if !valid_identifier(column) {
                return Err(bad_request(format!("invalid key column: {column}")));
            }
        }
    }
    if require_key && change.key.as_ref().is_none_or(HashMap::is_empty) {
        return Err(bad_request("row key is required"));
    }
    Ok(())
}

fn sorted_entries(values: &Option<HashMap<String, Value>>) -> Vec<(String, Value)> {
    let mut entries = values
        .as_ref()
        .map(|values| {
            values
                .iter()
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    entries.sort_by(|left, right| left.0.cmp(&right.0));
    entries
}

fn quote_columns(driver: &str, columns: &[&str]) -> String {
    columns
        .iter()
        .map(|column| quote_ident(driver, column))
        .collect::<Vec<_>>()
        .join(", ")
}

fn quote_ident(driver: &str, value: &str) -> String {
    match driver {
        "mysql" => format!("`{}`", value.replace('`', "``")),
        "sqlserver" => format!("[{}]", value.replace(']', "]]")),
        _ => format!("\"{}\"", value.replace('"', "\"\"")),
    }
}

fn qualified(driver: &str, schema: &str, table: &str) -> String {
    if schema.is_empty() {
        quote_ident(driver, table)
    } else {
        format!(
            "{}.{}",
            quote_ident(driver, schema),
            quote_ident(driver, table)
        )
    }
}

fn placeholder(driver: &str, index: usize) -> String {
    match driver {
        "postgres" => format!("${index}"),
        "oracle" => format!(":{index}"),
        "sqlserver" => format!("@P{index}"),
        _ => "?".into(),
    }
}

fn placeholders(driver: &str, count: usize) -> Vec<String> {
    (1..=count)
        .map(|index| placeholder(driver, index))
        .collect()
}

async fn row_placeholders(
    driver: &str,
    dsn: &str,
    schema: &str,
    table: &str,
    columns: &[&str],
) -> AppResult<Vec<String>> {
    if driver == "postgres" {
        let types = postgres_column_types(dsn, schema, table).await?;
        return Ok(columns
            .iter()
            .enumerate()
            .map(|(index, column)| match types.get(*column) {
                Some(type_name) if !type_name.is_empty() => {
                    format!("${}::{}", index + 1, type_name)
                }
                _ => format!("${}", index + 1),
            })
            .collect());
    }
    Ok(placeholders(driver, columns.len()))
}

async fn postgres_column_types(
    dsn: &str,
    schema: &str,
    table: &str,
) -> AppResult<HashMap<String, String>> {
    let pool = open_pg(dsn, false).await?;
    let rows = sqlx::query(
        "SELECT a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod)
         FROM pg_catalog.pg_attribute a
         JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relname = $1
           AND (($2 <> '' AND n.nspname = $2)
                OR ($2 = '' AND pg_catalog.pg_table_is_visible(c.oid)))
           AND a.attnum > 0
           AND NOT a.attisdropped",
    )
    .bind(table)
    .bind(schema)
    .fetch_all(&pool)
    .await
    .map_err(|error| upstream("postgres", error));
    pool.close().await;
    let rows = rows?;
    let mut types = HashMap::with_capacity(rows.len());
    for row in rows {
        let name: String = row.try_get(0)?;
        let type_name: String = row.try_get(1)?;
        types.insert(name, type_name);
    }
    Ok(types)
}

async fn execute_sql(driver: &str, dsn: &str, sql: &str, params: &[Value]) -> AppResult<u64> {
    match driver {
        "postgres" => {
            let pool = open_pg(dsn, false).await?;
            let mut query = sqlx::query(sql);
            for param in params {
                query = bind_pg(query, param);
            }
            let result = query
                .execute(&pool)
                .await
                .map_err(|error| upstream("postgres", error));
            pool.close().await;
            Ok(result?.rows_affected())
        }
        "mysql" => {
            let pool = open_mysql(dsn).await?;
            let mut query = sqlx::query(sql);
            for param in params {
                query = bind_mysql(query, param);
            }
            let result = query
                .execute(&pool)
                .await
                .map_err(|error| upstream("mysql", error));
            pool.close().await;
            Ok(result?.rows_affected())
        }
        "sqlite" => {
            let pool = open_sqlite(dsn, false).await?;
            let mut query = sqlx::query(sql);
            for param in params {
                query = bind_sqlite(query, param);
            }
            let result = query
                .execute(&pool)
                .await
                .map_err(|error| upstream("sqlite", error));
            pool.close().await;
            Ok(result?.rows_affected())
        }
        "sqlserver" => execute_sqlserver(dsn, sql, params).await,
        "oracle" => execute_oracle(dsn, sql, params).await,
        "clickhouse" => execute_clickhouse(dsn, sql, params).await,
        _ => Err(AppError::UnsupportedDriver),
    }
}

/// An untyped SQL NULL for PostgreSQL.
///
/// Binding `Option::<String>::None` makes PostgreSQL infer a `TEXT` parameter,
/// which then fails for nullable integer, boolean or JSON columns during row
/// edits. The `unknown` pseudo-type lets the server infer the target type.
struct PgNull;

impl sqlx::Type<Postgres> for PgNull {
    fn type_info() -> sqlx::postgres::PgTypeInfo {
        sqlx::postgres::PgTypeInfo::with_name("unknown")
    }
}

impl<'q> sqlx::Encode<'q, Postgres> for PgNull {
    fn encode_by_ref(&self, _buffer: &mut PgArgumentBuffer) -> Result<IsNull, BoxDynError> {
        Ok(IsNull::Yes)
    }
}

fn bind_pg<'q>(
    query: SqlxQuery<'q, Postgres, PgArguments>,
    value: &Value,
) -> SqlxQuery<'q, Postgres, PgArguments> {
    match value {
        Value::Null => query.bind(PgNull),
        Value::Bool(value) => query.bind(*value),
        Value::Number(number) => {
            if let Some(value) = number.as_i64() {
                query.bind(value)
            } else if let Some(value) = number.as_u64() {
                query.bind(value as f64)
            } else {
                query.bind(number.as_f64().unwrap_or_default())
            }
        }
        Value::String(value) => query.bind(value.clone()),
        Value::Array(_) | Value::Object(_) => query.bind(sqlx::types::Json(value.clone())),
    }
}

fn bind_mysql<'q>(
    query: SqlxQuery<'q, MySql, MySqlArguments>,
    value: &Value,
) -> SqlxQuery<'q, MySql, MySqlArguments> {
    match value {
        Value::Null => query.bind(Option::<String>::None),
        Value::Bool(value) => query.bind(*value),
        Value::Number(number) => {
            if let Some(value) = number.as_i64() {
                query.bind(value)
            } else if let Some(value) = number.as_u64() {
                query.bind(value)
            } else {
                query.bind(number.as_f64().unwrap_or_default())
            }
        }
        Value::String(value) => query.bind(value.clone()),
        Value::Array(_) | Value::Object(_) => query.bind(sqlx::types::Json(value.clone())),
    }
}

fn bind_sqlite<'q>(
    query: SqlxQuery<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>>,
    value: &Value,
) -> SqlxQuery<'q, Sqlite, sqlx::sqlite::SqliteArguments<'q>> {
    match value {
        Value::Null => query.bind(Option::<String>::None),
        Value::Bool(value) => query.bind(*value),
        Value::Number(number) => {
            if let Some(value) = number.as_i64() {
                query.bind(value)
            } else if let Some(value) = number.as_u64() {
                query.bind(value as f64)
            } else {
                query.bind(number.as_f64().unwrap_or_default())
            }
        }
        Value::String(value) => query.bind(value.clone()),
        Value::Array(_) | Value::Object(_) => {
            query.bind(serde_json::to_string(value).unwrap_or_default())
        }
    }
}

async fn execute_sqlserver(dsn: &str, sql: &str, params: &[Value]) -> AppResult<u64> {
    let mut client = open_sqlserver(dsn).await?;
    let mut query = tiberius::Query::new(sql);
    for param in params {
        query = bind_tds(query, param);
    }
    let result = query
        .execute(&mut client)
        .await
        .map_err(|error| upstream("sqlserver", error))
        .map(|result| result.total());
    let _ = client.close().await;
    result
}

fn bind_tds<'a>(mut query: tiberius::Query<'a>, value: &Value) -> tiberius::Query<'a> {
    match value {
        Value::Null => query.bind(Option::<String>::None),
        Value::Bool(value) => query.bind(*value),
        Value::Number(number) => {
            if let Some(value) = number.as_i64() {
                query.bind(value)
            } else if let Some(value) = number.as_u64() {
                if let Ok(value) = i64::try_from(value) {
                    query.bind(value)
                } else {
                    query.bind(value as f64)
                }
            } else {
                query.bind(number.as_f64().unwrap_or_default())
            }
        }
        Value::String(value) => query.bind(value.clone()),
        Value::Array(_) | Value::Object(_) => {
            query.bind(serde_json::to_string(value).unwrap_or_default())
        }
    }
    query
}

async fn execute_oracle(dsn: &str, sql: &str, params: &[Value]) -> AppResult<u64> {
    let connection = open_oracle(dsn).await?;
    let values = params.iter().map(oracle_parameter).collect::<Vec<_>>();
    let result = connection.execute(sql, &values).await;
    let result = match result {
        Ok(result) => match connection.commit().await {
            Ok(()) => Ok(result.rows_affected),
            Err(error) => Err(upstream("oracle", error)),
        },
        Err(error) => Err(upstream("oracle", error)),
    };
    let _ = connection.close().await;
    result
}

fn oracle_parameter(value: &Value) -> oracle_rs::Value {
    match value {
        Value::Null => oracle_rs::Value::Null,
        Value::Bool(value) => oracle_rs::Value::Boolean(*value),
        Value::Number(number) => {
            if let Some(value) = number.as_i64() {
                oracle_rs::Value::Integer(value)
            } else {
                oracle_rs::Value::Float(number.as_f64().unwrap_or_default())
            }
        }
        Value::String(value) => oracle_rs::Value::String(value.clone()),
        Value::Array(_) | Value::Object(_) => oracle_rs::Value::Json(value.clone()),
    }
}

async fn execute_clickhouse(dsn: &str, sql: &str, params: &[Value]) -> AppResult<u64> {
    let client = clickhouse_client(dsn)?;
    let mut query = client.query(sql);
    for param in params {
        query = bind_clickhouse(query, param);
    }
    query
        .execute()
        .await
        .map_err(|error| upstream("clickhouse", error))?;
    Ok(0)
}

// ---------------------------------------------------------------------------
// Shared value helpers
// ---------------------------------------------------------------------------

fn value_as_string(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(value)) => value.clone(),
        Some(Value::Null) | None => String::new(),
        Some(other) => other.to_string(),
    }
}

fn value_as_i64(value: Option<&Value>) -> i64 {
    match value {
        Some(Value::Number(number)) => number.as_i64().unwrap_or_default(),
        Some(Value::String(value)) => value.parse().unwrap_or_default(),
        Some(Value::Bool(value)) => i64::from(*value),
        _ => 0,
    }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let high = hex_digit(bytes[index + 1]);
            let low = hex_digit(bytes[index + 2]);
            if let (Some(high), Some(low)) = (high, low) {
                output.push(high * 16 + low);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&output).into_owned()
}

fn hex_digit(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}
