# Supabase DB (planner sync)

이 앱은 `public.planner_state` 테이블에 **유저별로 전체 플래너 데이터를 JSON으로 저장**해서 동기화합니다.

## 최초 1회 세팅

Supabase Dashboard → SQL Editor → `supabase/migrations/20260503_000001_create_planner_state.sql` 내용을 실행하세요.

## 보안(RLS)

- 인증된 유저만 접근 가능
- `user_id = auth.uid()` 인 행만 select/insert/update 가능

