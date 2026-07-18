-- clubs
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  invite_code text not null unique,
  invite_code_enabled boolean not null default true,
  plan text not null default 'free',
  initial_rating integer not null default 1500,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_clubs_owner_id on public.clubs (owner_id);

-- club_members
create type public.club_role as enum ('owner', 'admin', 'member');
create type public.member_status as enum ('active', 'banned');

create table public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.club_role not null default 'member',
  status public.member_status not null default 'active',
  joined_at timestamptz not null default now(),
  unique (club_id, user_id)
);
create index idx_club_members_club_id on public.club_members (club_id);
create index idx_club_members_user_id on public.club_members (user_id);

-- RLS 헬퍼 함수 (docs/schema-design.md 참고) — 두 테이블이 모두 존재한 뒤 정의
create or replace function public.is_club_member(target_club_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.club_members
    where club_id = target_club_id
      and user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.is_club_admin(target_club_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.club_members
    where club_id = target_club_id
      and user_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'admin')
  );
$$;

alter table public.clubs enable row level security;

create policy "clubs_select_member"
  on public.clubs for select
  using (public.is_club_member(id));

create policy "clubs_insert_owner"
  on public.clubs for insert
  with check (owner_id = auth.uid());

create policy "clubs_update_admin"
  on public.clubs for update
  using (public.is_club_admin(id));

create policy "clubs_delete_owner"
  on public.clubs for delete
  using (owner_id = auth.uid());

alter table public.club_members enable row level security;

create policy "club_members_select_member"
  on public.club_members for select
  using (public.is_club_member(club_id));

-- INSERT 정책 없음: join_club_with_code RPC(추후 구현) 전용 경로로만 가입 허용
create policy "club_members_update_admin"
  on public.club_members for update
  using (public.is_club_admin(club_id));

create policy "club_members_delete_admin_or_self"
  on public.club_members for delete
  using (public.is_club_admin(club_id) or user_id = auth.uid());
