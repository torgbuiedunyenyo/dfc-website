const postgres = require('postgres');

let sql = null;
let schemaReady = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS content (
  key         text PRIMARY KEY,
  kind        text NOT NULL DEFAULT 'html',
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id          serial PRIMARY KEY,
  slug        text UNIQUE NOT NULL,
  title       text NOT NULL,
  status      text NOT NULL DEFAULT 'past',
  layout      text NOT NULL DEFAULT 'detail',
  thumbnail   text,
  body_html   text NOT NULL DEFAULT '',
  sort_order  int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id          serial PRIMARY KEY,
  title       text NOT NULL,
  start_date  date NOT NULL,
  end_date    date,
  link        text,
  published   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media (
  id          text PRIMARY KEY,
  filename    text,
  mime        text NOT NULL,
  size        int NOT NULL,
  data        bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS versions (
  id          serial PRIMARY KEY,
  entity_type text NOT NULL,
  entity_key  text NOT NULL,
  action      text NOT NULL DEFAULT 'update',
  snapshot    jsonb NOT NULL,
  author      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS versions_entity_idx ON versions (entity_type, entity_key, id DESC);

CREATE TABLE IF NOT EXISTS sessions (
  token       text PRIMARY KEY,
  author      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
`;

function getSql() {
  if (!sql) {
    const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!url) throw new Error('POSTGRES_URL / DATABASE_URL is not set');
    sql = postgres(url, {
      max: 1,
      prepare: false,
      idle_timeout: 20,
      connect_timeout: 15,
      ssl: 'require',
    });
  }
  return sql;
}

async function db() {
  const client = getSql();
  if (!schemaReady) schemaReady = client.unsafe(SCHEMA);
  await schemaReady;
  return client;
}

// Record a new version of an entity. snapshot is the entity's NEW full state
// (for deletes, the last state before deletion so it can be restored).
async function recordVersion(client, entityType, entityKey, action, snapshot, author) {
  await client`
    INSERT INTO versions (entity_type, entity_key, action, snapshot, author)
    VALUES (${entityType}, ${String(entityKey)}, ${action}, ${client.json(snapshot)}, ${author || null})
  `;
}

module.exports = { db, getSql, recordVersion, SCHEMA };
