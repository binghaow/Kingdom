-- P3 lockstep relay (server/lockstep/http.cjs also creates these on first use).
CREATE TABLE IF NOT EXISTS lockstep_rooms (id TEXT PRIMARY KEY NOT NULL, start_at INTEGER NOT NULL, period INTEGER NOT NULL, sealed INTEGER NOT NULL DEFAULT -1, delay INTEGER NOT NULL DEFAULT 2, setup TEXT NOT NULL, seats TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'playing', desync TEXT, expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS lockstep_seats (room TEXT NOT NULL, seat INTEGER NOT NULL, team INTEGER NOT NULL, token TEXT NOT NULL, human INTEGER NOT NULL DEFAULT 1, seen INTEGER NOT NULL DEFAULT 0, at INTEGER NOT NULL DEFAULT -1, rtt INTEGER, PRIMARY KEY (room, seat));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS lockstep_cmds (room TEXT NOT NULL, seat INTEGER NOT NULL, seq INTEGER NOT NULL, turn INTEGER NOT NULL, cmd TEXT NOT NULL, PRIMARY KEY (room, seat, seq));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS lockstep_cmds_turn ON lockstep_cmds (room, turn);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS lockstep_hashes (room TEXT NOT NULL, step INTEGER NOT NULL, hash TEXT NOT NULL, agree INTEGER NOT NULL, bad TEXT, PRIMARY KEY (room, step));
