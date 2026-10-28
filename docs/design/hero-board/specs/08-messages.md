# 08 — Messages

**Routes/source:** `/messages`, `/messages/[conversationId]`; `ThreadRow`, `listThreads`, existing conversation creation/permissions, unread provider and composer. Keep hiring-linked communication and team membership rules.

**Order:** concise **Messages** header with compose only when authorized → conversation rows with avatar, title/campaign, one-line snippet, trailing time and unread marker → dock. Avoid a large explanatory masthead above every populated list. White list, subtle dividers, no nested card shadows. On desktop, use the existing thread/list architecture appropriately, not a giant mobile list floating in blank space.

**Geometry:** proposed 40px avatar, 14px row padding and 10px gap; title 16/24 semibold (bold when unread), snippet 14/20, time 12/16; 44px minimum compose target. One line for preview with full content in the thread. Long names must not push time/badge offscreen.

**Data/replacements:** worker/contact avatar uses actual permitted name initials; campaign image only when supported. No arbitrary worker faces. Preserve unread counts, frozen/read-only state and the valid startable-conversation section. Workers do not gain unrestricted compose solely because the reference has a pencil icon.

**Copy:** **No conversations yet.** Preserve the existing truthful worker explanation about messaging after hire. No-message thread: **No messages yet**. Read-only: **Read-only**. Error state uses the real retry path. Keep notification distinctions rather than merging job or campaign notices into fabricated chats.

**Acceptance:** empty, unread, read, frozen, startable, blocked/error, large unread count; thread sending/failed/retry, keyboard open and attachments if applicable. Unread updates do not move rows under focus. New compact styling preserves scroll position, accessible names and server permissions. Messages owns thread URLs in the dock.
