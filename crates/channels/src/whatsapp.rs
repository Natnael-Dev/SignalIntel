//! WhatsApp Business API Channel (Stub)
//!
//! Pending official Meta WhatsApp Cloud API integration.

use async_trait::async_trait;
use crate::{ChannelError, ChannelProvider};

/// WhatsApp Business Channel Dispatcher (Coming Soon).
#[derive(Debug, Clone, Default)]
pub struct WhatsAppChannel;

impl WhatsAppChannel {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl ChannelProvider for WhatsAppChannel {
    async fn send_message(&self, _target: &str, _text: &str) -> Result<(), ChannelError> {
        Err(ChannelError::ComingSoon("WhatsApp/Discord integration pending"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_whatsapp_stub_returns_coming_soon() {
        let channel = WhatsAppChannel::new();
        let result = channel.send_message("+1234567890", "Hello WhatsApp").await;
        match result {
            Err(ChannelError::ComingSoon(msg)) => assert_eq!(msg, "WhatsApp/Discord integration pending"),
            _ => panic!("Expected ComingSoon error"),
        }
    }
}
