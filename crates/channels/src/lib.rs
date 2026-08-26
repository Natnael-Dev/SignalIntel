//! Omnichannel Alert Dispatch Engine
//!
//! Provides extensible ChannelProvider traits for routing broadcast alerts
//! to messaging platforms (Telegram, WhatsApp, Discord, Webhooks).

use async_trait::async_trait;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ChannelError {
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("Authentication error: {0}")]
    Auth(String),
    #[error("Feature coming soon: {0}")]
    ComingSoon(&'static str),
    #[error("Dispatch failed: {0}")]
    Dispatch(String),
}

/// Abstract provider interface for omnichannel messaging services.
#[async_trait]
pub trait ChannelProvider: Send + Sync {
    /// Dispatches a notification text to a target user/channel identifier.
    async fn send_message(&self, target: &str, text: &str) -> Result<(), ChannelError>;
}

pub mod telegram;
pub mod whatsapp;
pub mod discord;

pub use telegram::TelegramChannel;
pub use whatsapp::WhatsAppChannel;
pub use discord::DiscordChannel;
