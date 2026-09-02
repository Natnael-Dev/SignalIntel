//! Telegram Bot API Dispatcher
//!
//! Posts real-time broadcast alerts directly to Telegram channels/chats.

use async_trait::async_trait;
use std::env;
use tracing::{debug, error, info};

use crate::{ChannelError, ChannelProvider};

/// Dispatcher for Telegram Bot API.
#[derive(Debug, Clone)]
pub struct TelegramChannel {
    bot_token: Option<String>,
    client: reqwest::Client,
}

impl TelegramChannel {
    /// Creates a new TelegramChannel reading TELEGRAM_BOT_TOKEN from environment.
    pub fn new(token: Option<String>) -> Self {
        let bot_token = token.or_else(|| env::var("TELEGRAM_BOT_TOKEN").ok());
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .unwrap_or_default();

        Self { bot_token, client }
    }
}

impl Default for TelegramChannel {
    fn default() -> Self {
        Self::new(None)
    }
}

#[async_trait]
impl ChannelProvider for TelegramChannel {
    async fn send_message(&self, target: &str, text: &str) -> Result<(), ChannelError> {
        let token = match &self.bot_token {
            Some(t) if !t.trim().is_empty() => t,
            _ => {
                debug!(
                    "TELEGRAM_BOT_TOKEN not configured; simulating Telegram alert to chat [{}]",
                    target
                );
                return Ok(());
            }
        };

        let url = format!("https://api.telegram.org/bot{}/sendMessage", token);
        let payload = serde_json::json!({
            "chat_id": target,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": true
        });

        let resp = self
            .client
            .post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(ChannelError::Network)?;

        if resp.status().is_success() {
            info!(
                "Successfully dispatched Telegram alert to chat [{}]",
                target
            );
            Ok(())
        } else {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            error!("Telegram API error {}: {}", status, body);
            Err(ChannelError::Dispatch(format!(
                "Telegram API responded with {}: {}",
                status, body
            )))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_telegram_unconfigured_simulation() {
        let channel = TelegramChannel::new(None);
        let res = channel.send_message("12345", "Test alert").await;
        assert!(res.is_ok());
    }
}
