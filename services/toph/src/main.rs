use anyhow::Result;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_writer(std::io::stderr)
        .init();

    if let Err(error) = run().await {
        tracing::error!(%error, "toph stopped");
        eprintln!("toph: {error:#}");
        std::process::exit(1);
    }
}

async fn run() -> Result<()> {
    let config = toph_server::config::Config::load()?;
    toph_server::serve(config).await?;
    Ok(())
}
