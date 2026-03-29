-- PawVerify D1 Database Schema
-- Run these commands after creating your D1 database

-- Rate limiting table
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0,
  expires_at TEXT NOT NULL
);

-- Email registrations (no PII beyond email)
CREATE TABLE IF NOT EXISTS emails (
  email TEXT PRIMARY KEY,
  registered_at TEXT NOT NULL
);

-- Anonymous usage events (no user identification)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  data TEXT,
  logged_at TEXT NOT NULL
);

-- Community scam reports (pending moderation)
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  breed TEXT,
  platform TEXT,
  location TEXT,
  payment TEXT,
  description TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  status TEXT DEFAULT 'pending_review'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rate_limits_expires ON rate_limits(expires_at);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_logged ON events(logged_at);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_breed ON reports(breed);
