-- search_path 고정 (function_search_path_mutable WARN 해소)
alter function public.is_club_member(uuid) set search_path = '';
alter function public.is_club_admin(uuid) set search_path = '';

-- handle_new_user는 auth.users 트리거 전용, 공개 RPC로 호출될 필요 없음
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- is_club_member/is_club_admin은 RLS 정책 평가를 위해 authenticated에는 유지, anon만 차단
revoke execute on function public.is_club_member(uuid) from anon;
revoke execute on function public.is_club_admin(uuid) from anon;
