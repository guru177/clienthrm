use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatSpace {
    pub id: i64,
    pub organization_id: i64,
    pub kind: String,
    pub name: Option<String>,
    pub slug: Option<String>,
    pub description: Option<String>,
    pub topic: Option<String>,
    pub is_private: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub department_id: Option<i64>,
    pub created_by: Option<i64>,
    pub member_count: i64,
    pub unread_count: i64,
    pub last_message_at: Option<String>,
    pub last_message_preview: Option<String>,
    pub dm_members: Option<Vec<ChatMember>>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMember {
    pub user_id: i64,
    pub name: String,
    pub email: String,
    pub photo: Option<String>,
    pub is_online: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: i64,
    pub space_id: i64,
    pub user_id: i64,
    pub user_name: String,
    pub user_email: String,
    pub user_photo: Option<String>,
    pub parent_id: Option<i64>,
    pub content: String,
    pub is_edited: bool,
    pub is_deleted: bool,
    pub is_pinned: bool,
    pub is_starred: bool,
    pub thread_count: i64,
    pub reactions: Vec<ChatReaction>,
    pub attachments: Vec<ChatAttachment>,
    pub mentions: Vec<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatReaction {
    pub emoji: String,
    pub count: i64,
    pub user_ids: Vec<i64>,
    pub reacted_by_me: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatAttachment {
    pub id: i64,
    pub file_name: String,
    pub file_url: String,
    pub file_size: i64,
    pub mime_type: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateChannelBody {
    pub name: String,
    pub description: Option<String>,
    pub is_private: Option<bool>,
    pub member_ids: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateChannelBody {
    pub name: Option<String>,
    pub description: Option<String>,
    pub topic: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDmBody {
    pub user_ids: Vec<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SendMessageBody {
    pub content: String,
    pub parent_id: Option<i64>,
    pub attachment_ids: Option<Vec<i64>>,
    pub mentions: Option<Vec<i64>>,
}

#[derive(Debug, Deserialize)]
pub struct EditMessageBody {
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct ReactionBody {
    pub emoji: String,
}

#[derive(Debug, Deserialize)]
pub struct AddMembersBody {
    pub user_ids: Vec<i64>,
}

