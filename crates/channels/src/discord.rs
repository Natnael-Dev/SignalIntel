//! Discord Webhook & Bot Channel (Stub)
//!
//! Pending official Discord Bot API integration.

use crate::{ChannelError, ChannelProvider};
use async_trait::async_trait;

/// Discord Channel Dispatcher (Coming Soon).
#[derive(Debug, Clone, Default)]
pub struct DiscordChannel;

impl DiscordChannel {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl ChannelProvider for DiscordChannel {
    async fn send_message(&self, _target: &str, _text: &str) -> Result<(), ChannelError> {
        Err(ChannelError::ComingSoon(
            "WhatsApp/Discord integration pending",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_discord_stub_returns_coming_soon() {
        let channel = DiscordChannel::new();
        let result = channel.send_message("channel_123", "Hello Discord").await;
        match result {
            Err(ChannelError::ComingSoon(msg)) => {
                assert_eq!(msg, "WhatsApp/Discord integration pending")
            }
            _ => panic!("Expected ComingSoon error"),
        }
    }
}
