# Team Chat

## Overview

Slack-style messaging: public/private channels, direct messages, file attachments, reactions, pins, stars, and real-time WebSocket updates.

## Plan module

- **Key:** `chat`
- **Permissions:** `view-chat` (all chat API + WebSocket)

## Frontend

| Route | Page |
|-------|------|
| `/admin/chat` | `pages/admin/chat/index.tsx` |
| `/admin/chat/:spaceId` | Same (deep link to space) |

**Key files**

- `lib/chat-api.ts` — REST helpers
- `hooks/use-chat-ws.ts` — WebSocket connection
- `hooks/use-chat-notifications.ts` — desktop notifications
- `contexts/ChatNotificationContext.tsx`
- `lib/chat-notification-utils.ts`

## Backend

**Handler:** `handlers/chat.rs`, `handlers/files.rs` (attachments)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/chat/spaces` | List channels + DMs |
| POST | `/api/admin/chat/channels` | Create channel |
| PATCH | `/api/admin/chat/channels/{id}` | Update channel |
| POST | `/api/admin/chat/channels/{id}/join` | Join |
| POST | `/api/admin/chat/channels/{id}/leave` | Leave |
| POST | `/api/admin/chat/channels/{id}/members` | Add members |
| POST | `/api/admin/chat/dm` | Open DM space |
| GET/POST | `/api/admin/chat/spaces/{id}/messages` | History / send |
| POST | `/api/admin/chat/spaces/{id}/read` | Mark read |
| GET | `/api/admin/chat/spaces/{id}/pins` | Pinned messages |
| PATCH/DELETE | `/api/admin/chat/messages/{id}` | Edit / delete |
| POST | `/api/admin/chat/messages/{id}/reactions` | Emoji react |
| POST | `/api/admin/chat/messages/{id}/pin` | Pin |
| POST | `/api/admin/chat/messages/{id}/star` | Star |
| GET | `/api/admin/chat/search` | Search messages |
| GET | `/api/admin/chat/starred` | Starred list |
| GET | `/api/admin/chat/users` | Mention picker |
| POST | `/api/admin/chat/upload` | Attachment upload |
| GET | `/api/admin/chat/ws?token=` | WebSocket events |

Files served via `/api/admin/files/chat/{uuid}.ext`.

## Database

| Table | Purpose |
|-------|---------|
| `chat_spaces` | Channel / DM metadata |
| `chat_space_members` | Membership |
| `chat_messages` | Message body, author |
| `chat_message_reactions` | Emoji counts |
| `chat_message_attachments` | File metadata |
| `chat_pinned_messages` | Pins per space |
| `chat_starred_messages` | Per-user stars |

## Workflows

### Channel bootstrap

On org setup, `#general` and department channels may be auto-created.

### Send message

1. User types in space → `POST .../messages` or WS broadcast.
2. Attachments: upload first → insert message with file URL.
3. Other clients receive event on `/api/admin/chat/ws`.

### Security

- DOCX/XLSX inline previews sanitized with DOMPurify on frontend.
- Attachments require authenticated file API.

## Related modules

- [Users & Roles](users-roles.md) — avatars via `/api/admin/files/users/`
