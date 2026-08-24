//! Real-time Alert Rule Engine
//!
//! Evaluates incoming broadcast intelligence events against active user keyword rules
//! and generates triggered dispatch actions for downstream bot channels.

use serde::{Deserialize, Serialize};
use crate::models::IntelEvent;

/// User-configured keyword alert rule.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AlertRule {
    pub id: String,
    pub name: Option<String>,
    pub keywords: Vec<String>,
    pub webhook_url: Option<String>,
    pub telegram_chat_id: Option<String>,
    pub min_confidence: Option<f64>,
}

impl AlertRule {
    /// Creates a new alert rule with given keywords.
    pub fn new(
        id: impl Into<String>,
        keywords: Vec<String>,
        telegram_chat_id: Option<String>,
        webhook_url: Option<String>,
    ) -> Self {
        Self {
            id: id.into(),
            name: None,
            keywords,
            webhook_url,
            telegram_chat_id,
            min_confidence: None,
        }
    }
}

/// Alert event fired when an incoming event matches one or more rule keywords.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TriggeredAlert {
    pub rule_id: String,
    pub rule_name: Option<String>,
    pub matched_keywords: Vec<String>,
    pub event_id: String,
    pub stream_id: String,
    pub channel_name: String,
    pub timestamp: f64,
    pub text_snippet: String,
    pub telegram_chat_id: Option<String>,
    pub webhook_url: Option<String>,
}

/// Evaluates an IntelEvent against a set of AlertRules.
///
/// Returns all triggered alerts with matched keywords (case-insensitive).
pub fn evaluate_rules(event: &IntelEvent, rules: &[AlertRule]) -> Vec<TriggeredAlert> {
    let lower_text = event.text.to_lowercase();
    let mut triggered: Vec<TriggeredAlert> = Vec::new();

    for rule in rules {
        // Optional confidence threshold filter
        if let Some(min_conf) = rule.min_confidence {
            if event.confidence < min_conf {
                continue;
            }
        }

        let mut matched: Vec<String> = Vec::new();
        for kw in &rule.keywords {
            let kw_lower = kw.trim().to_lowercase();
            if !kw_lower.is_empty() && lower_text.contains(&kw_lower) {
                matched.push(kw.clone());
            }
        }

        if !matched.is_empty() {
            triggered.push(TriggeredAlert {
                rule_id: rule.id.clone(),
                rule_name: rule.name.clone(),
                matched_keywords: matched,
                event_id: event.event_id.clone(),
                stream_id: event.stream_id.clone(),
                channel_name: event.channel_name.clone(),
                timestamp: event.timestamp,
                text_snippet: event.text.clone(),
                telegram_chat_id: rule.telegram_chat_id.clone(),
                webhook_url: rule.webhook_url.clone(),
            });
        }
    }

    triggered
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_evaluate_rules_matching() {
        let rule1 = AlertRule::new(
            "rule_oil",
            vec!["OPEC".into(), "crude oil".into(), "barrel".into()],
            Some("123456789".into()),
            None,
        );

        let rule2 = AlertRule::new(
            "rule_tech",
            vec!["Nvidia".into(), "semiconductor".into()],
            None,
            Some("https://webhook.site/test".into()),
        );

        let event = IntelEvent::from_transcript(
            "stream1",
            "bloomberg",
            12.5,
            "BREAKING: OPEC announces surprise cut in crude oil production quotas.",
            0.96,
            "en",
            "en",
        );

        let rules = vec![rule1, rule2];
        let triggered = evaluate_rules(&event, &rules);

        assert_eq!(triggered.len(), 1);
        assert_eq!(triggered[0].rule_id, "rule_oil");
        assert_eq!(triggered[0].matched_keywords.len(), 2);
        assert!(triggered[0].matched_keywords.contains(&"OPEC".to_string()));
        assert!(triggered[0].matched_keywords.contains(&"crude oil".to_string()));
        assert_eq!(triggered[0].telegram_chat_id, Some("123456789".into()));
    }

    #[test]
    fn test_evaluate_rules_case_insensitive() {
        let rule = AlertRule::new(
            "rule_fed",
            vec!["FEDERAL RESERVE".into(), "INFLATION".into()],
            Some("123".into()),
            None,
        );

        let event = IntelEvent::from_transcript(
            "stream2",
            "reuters",
            5.0,
            "Federal reserve chair signals inflation is approaching target.",
            0.99,
            "en",
            "en",
        );

        let triggered = evaluate_rules(&event, &[rule]);
        assert_eq!(triggered.len(), 1);
        assert_eq!(triggered[0].matched_keywords.len(), 2);
    }

    #[test]
    fn test_evaluate_rules_no_match() {
        let rule = AlertRule::new("rule_sports", vec!["championship".into(), "soccer".into()], None, None);
        let event = IntelEvent::from_transcript("stream1", "cnbc", 1.0, "Tech stocks rally on earnings beat.", 0.95, "en", "en");

        let triggered = evaluate_rules(&event, &[rule]);
        assert!(triggered.is_empty());
    }
}
