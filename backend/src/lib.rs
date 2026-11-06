pub mod app;
pub mod features;
pub mod platform;

pub use app::server;
pub use features::auth::service as auth;
pub use features::database_connections::service as database;
pub use features::debug::service as debug;
pub use features::integrations::email::service as email;
pub use features::notifications::service as push;
pub use features::providers::service as ai;
pub use features::terminals::service as terminal;
pub use features::updates::service as update;
pub use features::workspace::service as workspace;
pub use platform::config;
pub use platform::crypto;
pub use platform::errors;
pub use platform::events;
pub use platform::model;
pub use platform::processes;
pub use platform::store;

pub const VERSION: &str = update::VERSION;

pub async fn start_embedded(config: config::Config) -> errors::AppResult<server::EmbeddedServer> {
    server::start_embedded(config).await
}

pub async fn serve(config: config::Config) -> errors::AppResult<()> {
    server::serve(config).await
}
