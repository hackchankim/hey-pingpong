-- PUBLIC 의사 롤을 통한 암묵적 EXECUTE 상속을 제거하고, RLS 평가에 필요한 authenticated에만 명시 부여
revoke execute on function public.is_club_member(uuid) from public;
revoke execute on function public.is_club_admin(uuid) from public;

grant execute on function public.is_club_member(uuid) to authenticated;
grant execute on function public.is_club_admin(uuid) to authenticated;
