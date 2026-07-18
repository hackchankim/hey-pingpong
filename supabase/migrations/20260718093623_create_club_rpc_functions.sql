-- 클럽 생성/초대코드 가입 RPC (Task 005)
-- club_members는 직접 INSERT 정책이 없으므로(20260718085935 마이그레이션 참고),
-- 이 두 SECURITY DEFINER 함수를 통해서만 club_members 행을 생성할 수 있다.

-- ---------------------------------------------------------------------------
-- create_club: 클럽 생성 + 생성자를 owner로 등록
-- ---------------------------------------------------------------------------
create or replace function public.create_club(
  p_name text,
  p_slug text,
  p_description text default null
)
returns json
language plpgsql
security definer
as $$
declare
  v_owner_id uuid := auth.uid();
  v_invite_code text;
  v_club public.clubs%rowtype;
  v_member public.club_members%rowtype;
  v_attempt int := 0;
  v_constraint text;
begin
  if v_owner_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- invite_code는 함수 내부에서 랜덤 생성. unique violation(코드 충돌) 시 최대 5회 재시도.
  -- slug unique violation은 재시도로 해결되지 않으므로 즉시 예외를 그대로 전파해
  -- 클라이언트(Server Action)가 "이미 사용 중인 URL" 에러로 구분 처리할 수 있게 한다.
  loop
    v_attempt := v_attempt + 1;
    v_invite_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));

    begin
      insert into public.clubs (name, slug, description, owner_id, invite_code)
      values (p_name, p_slug, p_description, v_owner_id, v_invite_code)
      returning * into v_club;

      exit; -- 성공 시 재시도 루프 탈출
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;

      if v_constraint = 'clubs_slug_key' then
        raise;
      end if;

      if v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  -- 생성자를 owner로 club_members에 등록 (같은 함수 트랜잭션 내에서 처리 — 중간 실패 시 clubs insert까지 자동 롤백)
  insert into public.club_members (club_id, user_id, role, status)
  values (v_club.id, v_owner_id, 'owner', 'active')
  returning * into v_member;

  return json_build_object(
    'club', json_build_object(
      'id', v_club.id,
      'name', v_club.name,
      'slug', v_club.slug,
      'description', v_club.description,
      'owner_id', v_club.owner_id,
      'invite_code', v_club.invite_code,
      'invite_code_enabled', v_club.invite_code_enabled,
      'plan', v_club.plan,
      'initial_rating', v_club.initial_rating,
      'logo_url', v_club.logo_url,
      'created_at', v_club.created_at,
      'updated_at', v_club.updated_at
    ),
    'membership', json_build_object(
      'id', v_member.id,
      'club_id', v_member.club_id,
      'user_id', v_member.user_id,
      'role', v_member.role,
      'status', v_member.status,
      'joined_at', v_member.joined_at
    )
  );
end;
$$;

alter function public.create_club(text, text, text) set search_path = '';
grant execute on function public.create_club(text, text, text) to authenticated;
revoke execute on function public.create_club(text, text, text) from anon, public;

-- ---------------------------------------------------------------------------
-- join_club_with_code: 초대코드로 클럽 가입
-- ---------------------------------------------------------------------------
create or replace function public.join_club_with_code(
  p_invite_code text
)
returns json
language plpgsql
security definer
as $$
declare
  -- 신원은 항상 auth.uid()로 재확인한다. 호출자가 넘긴 값을 신원 근거로 쓰지 않는다
  -- (shrimp-rules.md 원칙) — 그래서 이 함수는 user_id 파라미터를 받지 않는다.
  v_user_id uuid := auth.uid();
  v_club public.clubs%rowtype;
  v_existing public.club_members%rowtype;
  v_member public.club_members%rowtype;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_club
  from public.clubs
  where invite_code = p_invite_code
    and invite_code_enabled = true;

  if not found then
    return json_build_object('success', false, 'error', 'invalid_code');
  end if;

  select * into v_existing
  from public.club_members
  where club_id = v_club.id
    and user_id = v_user_id;

  if found then
    if v_existing.status = 'banned' then
      return json_build_object('success', false, 'error', 'banned');
    end if;

    return json_build_object('success', false, 'error', 'already_member');
  end if;

  insert into public.club_members (club_id, user_id, role, status)
  values (v_club.id, v_user_id, 'member', 'active')
  returning * into v_member;

  return json_build_object(
    'success', true,
    'club', json_build_object(
      'id', v_club.id,
      'name', v_club.name,
      'slug', v_club.slug,
      'description', v_club.description,
      'owner_id', v_club.owner_id,
      'invite_code', v_club.invite_code,
      'invite_code_enabled', v_club.invite_code_enabled,
      'plan', v_club.plan,
      'initial_rating', v_club.initial_rating,
      'logo_url', v_club.logo_url,
      'created_at', v_club.created_at,
      'updated_at', v_club.updated_at
    ),
    'membership', json_build_object(
      'id', v_member.id,
      'club_id', v_member.club_id,
      'user_id', v_member.user_id,
      'role', v_member.role,
      'status', v_member.status,
      'joined_at', v_member.joined_at
    )
  );
end;
$$;

alter function public.join_club_with_code(text) set search_path = '';
grant execute on function public.join_club_with_code(text) to authenticated;
revoke execute on function public.join_club_with_code(text) from anon, public;
