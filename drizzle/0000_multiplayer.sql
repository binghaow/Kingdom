CREATE TABLE `multiplayer_rooms` (
  `id` text PRIMARY KEY NOT NULL,
  `revision` integer DEFAULT 0 NOT NULL,
  `expires_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `payload` blob NOT NULL
);
--> statement-breakpoint
CREATE INDEX `multiplayer_rooms_expires` ON `multiplayer_rooms` (`expires_at`);
