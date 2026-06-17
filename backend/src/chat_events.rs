use serde_json::Value;
use tokio::sync::broadcast;

/// Real-time events for team chat (WebSocket).
#[derive(Clone)]
pub struct ChatEvents {
    tx: broadcast::Sender<String>,
}

impl ChatEvents {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(1024);
        Self { tx }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.tx.subscribe()
    }

    pub fn emit(&self, org_id: i64, event_type: &str, payload: Value) {
        let mut msg = payload;
        if let Some(obj) = msg.as_object_mut() {
            obj.insert("type".to_string(), Value::String(event_type.to_string()));
            obj.insert("organization_id".to_string(), Value::Number(org_id.into()));
            obj.insert(
                "ts".to_string(),
                Value::String(chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()),
            );
        }
        if let Ok(text) = serde_json::to_string(&msg) {
            let _ = self.tx.send(text);
        }
    }
}
