-- Net lobby v2: open-room list + 4-character room codes (server/lobby.cjs also creates these on first use).
CREATE TABLE IF NOT EXISTS multiplayer_lobby (id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL UNIQUE, listed INTEGER NOT NULL DEFAULT 1, waiting INTEGER NOT NULL DEFAULT 1, host TEXT NOT NULL, nation TEXT NOT NULL, map TEXT NOT NULL, capacity INTEGER NOT NULL, joined INTEGER NOT NULL, lockstep INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, seen_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS multiplayer_lobby_open ON multiplayer_lobby (listed, waiting, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS multiplayer_lobby_expires ON multiplayer_lobby (expires_at);
