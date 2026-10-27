pub mod ai;
pub mod auth;
pub mod config;
pub mod crypto;
pub mod database;
pub mod errors;
pub mod events;
pub mod model;
pub mod opencode;
pub mod push;
pub mod server;
pub mod store;
pub mod terminal;
pub mod update;
pub mod workspace;

pub const VERSION: &str = update::VERSION;

pub async fn start_embedded(config: config::Config) -> errors::AppResult<server::EmbeddedServer> {
    server::start_embedded(config).await
}

pub async fn serve(config: config::Config) -> errors::AppResult<()> {
    server::serve(config).await
}
