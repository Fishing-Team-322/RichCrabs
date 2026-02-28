use std::path::Path;

use anyhow::Context;
use sqlx::{migrate::Migrator, PgPool};

const MIGRATION_LOCK_KEY: i64 = 4_242_424_242;

pub async fn run_migrations(pool: &PgPool, migrations_dir: &str) -> anyhow::Result<()> {
    let mut conn = pool
        .acquire()
        .await
        .context("failed to acquire database connection for migrations")?;

    sqlx::query("SELECT pg_advisory_lock($1)")
        .bind(MIGRATION_LOCK_KEY)
        .execute(&mut *conn)
        .await
        .context("failed to acquire migrations advisory lock")?;

    let result = async {
        let migrator = Migrator::new(Path::new(migrations_dir))
            .await
            .with_context(|| {
                format!("failed to load migrations from directory: {migrations_dir}")
            })?;

        migrator
            .run(&mut *conn)
            .await
            .context("failed to apply database migrations")
    }
    .await;

    let unlock_result = sqlx::query("SELECT pg_advisory_unlock($1)")
        .bind(MIGRATION_LOCK_KEY)
        .execute(&mut *conn)
        .await
        .context("failed to release migrations advisory lock");

    result?;
    unlock_result?;

    Ok(())
}
