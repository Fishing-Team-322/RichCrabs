use std::time::Duration;

use deadpool_redis::{redis, Config, Pool, Runtime};
use thiserror::Error;
use tokio::time::timeout;

const CONSUME_JOIN_TICKET_LUA: &str = r#"
local value = redis.call('GET', KEYS[1])
if value then
    redis.call('DEL', KEYS[1])
end
return value
"#;

const INCR_WITH_TTL_LUA: &str = r#"
local value = redis.call('INCR', KEYS[1])
if value == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return value
"#;

#[derive(Debug, Clone)]
pub struct RedisClient {
    pool: Pool,
    command_timeout: Duration,
    max_retries: u32,
    retry_backoff: Duration,
}

#[derive(Debug, Error)]
pub enum RedisClientError {
    #[error("failed to create redis pool: {0}")]
    PoolCreate(#[from] deadpool_redis::CreatePoolError),
    #[error("failed to get redis connection: {0}")]
    Pool(#[from] deadpool_redis::PoolError),
    #[error("redis command failed: {0}")]
    Redis(#[from] redis::RedisError),
    #[error("redis operation timed out after {0:?}")]
    Timeout(Duration),
}

impl RedisClient {
    pub fn new(
        redis_url: impl AsRef<str>,
        max_pool_size: usize,
        command_timeout: Duration,
        max_retries: u32,
        retry_backoff: Duration,
    ) -> Result<Self, RedisClientError> {
        let cfg = Config::from_url(redis_url.as_ref());
        let pool = cfg.create_pool(Some(Runtime::Tokio1))?;
        pool.resize(max_pool_size);

        Ok(Self {
            pool,
            command_timeout,
            max_retries,
            retry_backoff,
        })
    }

    pub async fn set_unique_pin(
        &self,
        key: &str,
        value: &str,
        ttl: Duration,
    ) -> Result<bool, RedisClientError> {
        let ttl_seconds = ttl.as_secs().max(1);

        let mut attempt = 0;
        loop {
            let mut conn = self.get_connection().await?;
            let mut command = redis::cmd("SET");
            command
                .arg(key)
                .arg(value)
                .arg("NX")
                .arg("EX")
                .arg(ttl_seconds);
            let command = command.query_async::<Option<String>>(&mut conn);

            match timeout(self.command_timeout, command).await {
                Ok(Ok(value)) => return Ok(value.is_some()),
                Ok(Err(err)) if attempt < self.max_retries => {
                    attempt += 1;
                    let _ = err;
                    tokio::time::sleep(self.retry_backoff).await;
                }
                Ok(Err(err)) => return Err(RedisClientError::Redis(err)),
                Err(_) if attempt < self.max_retries => {
                    attempt += 1;
                    tokio::time::sleep(self.retry_backoff).await;
                }
                Err(_) => return Err(RedisClientError::Timeout(self.command_timeout)),
            }
        }
    }

    pub async fn set_with_ttl(
        &self,
        key: &str,
        value: &str,
        ttl: Duration,
    ) -> Result<(), RedisClientError> {
        let ttl_seconds = ttl.as_secs().max(1);

        let mut attempt = 0;
        loop {
            let mut conn = self.get_connection().await?;
            let mut command = redis::cmd("SET");
            command.arg(key).arg(value).arg("EX").arg(ttl_seconds);
            let command = command.query_async::<()>(&mut conn);

            match timeout(self.command_timeout, command).await {
                Ok(Ok(())) => return Ok(()),
                Ok(Err(err)) if attempt < self.max_retries => {
                    attempt += 1;
                    let _ = err;
                    tokio::time::sleep(self.retry_backoff).await;
                }
                Ok(Err(err)) => return Err(RedisClientError::Redis(err)),
                Err(_) if attempt < self.max_retries => {
                    attempt += 1;
                    tokio::time::sleep(self.retry_backoff).await;
                }
                Err(_) => return Err(RedisClientError::Timeout(self.command_timeout)),
            }
        }
    }

    pub async fn get_value(&self, key: &str) -> Result<Option<String>, RedisClientError> {
        let mut attempt = 0;
        loop {
            let mut conn = self.get_connection().await?;
            let mut command = redis::cmd("GET");
            command.arg(key);
            let command = command.query_async::<Option<String>>(&mut conn);

            match timeout(self.command_timeout, command).await {
                Ok(Ok(value)) => return Ok(value),
                Ok(Err(err)) if attempt < self.max_retries => {
                    attempt += 1;
                    let _ = err;
                    tokio::time::sleep(self.retry_backoff).await;
                }
                Ok(Err(err)) => return Err(RedisClientError::Redis(err)),
                Err(_) if attempt < self.max_retries => {
                    attempt += 1;
                    tokio::time::sleep(self.retry_backoff).await;
                }
                Err(_) => return Err(RedisClientError::Timeout(self.command_timeout)),
            }
        }
    }

    pub async fn increment_with_ttl(
        &self,
        key: &str,
        ttl: Duration,
    ) -> Result<u64, RedisClientError> {
        let ttl_seconds = ttl.as_secs().max(1);

        let mut attempt = 0;
        loop {
            let mut conn = self.get_connection().await?;
            let mut command = redis::cmd("EVAL");
            command
                .arg(INCR_WITH_TTL_LUA)
                .arg(1)
                .arg(key)
                .arg(ttl_seconds);
            let command = command.query_async::<u64>(&mut conn);

            match timeout(self.command_timeout, command).await {
                Ok(Ok(value)) => return Ok(value),
                Ok(Err(err)) if attempt < self.max_retries => {
                    attempt += 1;
                    let _ = err;
                    tokio::time::sleep(self.retry_backoff).await;
                }
                Ok(Err(err)) => return Err(RedisClientError::Redis(err)),
                Err(_) if attempt < self.max_retries => {
                    attempt += 1;
                    tokio::time::sleep(self.retry_backoff).await;
                }
                Err(_) => return Err(RedisClientError::Timeout(self.command_timeout)),
            }
        }
    }

    pub async fn consume_join_ticket(
        &self,
        ticket_key: &str,
    ) -> Result<Option<String>, RedisClientError> {
        let mut attempt = 0;
        loop {
            let mut conn = self.get_connection().await?;
            let mut command = redis::cmd("EVAL");
            command.arg(CONSUME_JOIN_TICKET_LUA).arg(1).arg(ticket_key);
            let command = command.query_async::<Option<String>>(&mut conn);

            match timeout(self.command_timeout, command).await {
                Ok(Ok(value)) => return Ok(value),
                Ok(Err(err)) if attempt < self.max_retries => {
                    attempt += 1;
                    let _ = err;
                    tokio::time::sleep(self.retry_backoff).await;
                }
                Ok(Err(err)) => return Err(RedisClientError::Redis(err)),
                Err(_) if attempt < self.max_retries => {
                    attempt += 1;
                    tokio::time::sleep(self.retry_backoff).await;
                }
                Err(_) => return Err(RedisClientError::Timeout(self.command_timeout)),
            }
        }
    }

    async fn get_connection(&self) -> Result<deadpool_redis::Connection, RedisClientError> {
        timeout(self.command_timeout, self.pool.get())
            .await
            .map_err(|_| RedisClientError::Timeout(self.command_timeout))?
            .map_err(RedisClientError::from)
    }
}
