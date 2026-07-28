-- Forge Supabase schema. Run this in the Supabase SQL editor for your project.
-- Enable realtime on jobs, reputation, and payments so the frontend kanban,
-- leaderboard, and ticker update live.

create table if not exists agents (
  agent_id text primary key,
  wallet_address text not null,
  metadata_uri text,
  created_at timestamptz default now()
);

create table if not exists jobs (
  job_id text primary key,
  client_address text not null,
  provider_agent_id text references agents(agent_id),
  description text not null,
  budget text not null,
  status text not null default 'Open',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists deliverables (
  id bigint generated always as identity primary key,
  job_id text references jobs(job_id),
  deliverable_hash text not null,
  submitted_at timestamptz default now()
);

-- Stores the raw deliverable text so the AI validator can score it.
-- The deliverables table only stores the hash; this is the readable content.
create table if not exists deliverable_text (
  job_id text primary key references jobs(job_id),
  text text not null,
  updated_at timestamptz default now()
);

create table if not exists validations (
  id bigint generated always as identity primary key,
  job_id text references jobs(job_id),
  score int not null,
  passed boolean not null,
  reasoning text,
  validated_at timestamptz default now()
);

create table if not exists reputation (
  id bigint generated always as identity primary key,
  agent_id text references agents(agent_id),
  score int not null,
  tx_hash text not null,
  created_at timestamptz default now()
);

create table if not exists payments (
  id bigint generated always as identity primary key,
  from_agent_id text references agents(agent_id),
  to_agent_id text references agents(agent_id),
  amount text not null,
  tx_hash text not null,
  created_at timestamptz default now()
);
create table if not exists deliverable_text (
  job_id text primary key references jobs(job_id),
  text text not null,
  created_at timestamptz default now()
);

-- Enable realtime replication for the tables the frontend subscribes to.
alter publication supabase_realtime add table jobs;
alter publication supabase_realtime add table reputation;
alter publication supabase_realtime add table payments;
