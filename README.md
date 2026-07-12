# AI 영어 시험문제 출제 프로그램 - 설치 안내

터미널이나 VS Code 없이, 웹사이트 클릭만으로 배포하는 방법입니다.

## 1. GitHub에 코드 올리기
1. github.com 가입 → 오른쪽 위 `+` → `New repository`
2. 이름을 `exam-app` 으로 정하고 `Create repository`
3. 저장소 페이지에서 `Add file` → `Upload files` 클릭
4. 이 zip 파일의 압축을 풀어서 나온 모든 파일과 폴더를 통째로 끌어다 놓기(드래그)
5. 맨 아래 `Commit changes` 클릭

## 2. Vercel로 배포하기
1. vercel.com 가입 (GitHub 계정으로 로그인 추천)
2. `Add New` → `Project` → 방금 만든 `exam-app` 저장소 선택 → `Import`
3. `Environment Variables`에서 아래 3개를 입력 (값은 3, 4단계에서 발급):
   - `ANTHROPIC_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. `Deploy` 클릭 → 몇 분 기다리면 `https://exam-app-xxxx.vercel.app` 같은 주소 완성

## 3. Anthropic API 키 발급
1. console.anthropic.com 가입/로그인
2. `API Keys` 메뉴 → `Create Key`
3. 생성된 키(sk-ant-로 시작)를 복사해서 Vercel의 `ANTHROPIC_API_KEY`에 붙여넣기

## 4. Supabase 설정
1. supabase.com 가입 → `New project` 생성 (이름, 비밀번호 설정)
2. 왼쪽 메뉴 `SQL Editor` → `New query`
3. 이 프로젝트의 `supabase/schema.sql` 파일 내용 전체를 복사해서 붙여넣고 `Run`
4. 왼쪽 메뉴 `Project Settings` → `API`
5. `Project URL` → Vercel의 `NEXT_PUBLIC_SUPABASE_URL`에 붙여넣기
6. `anon public` 키 → Vercel의 `NEXT_PUBLIC_SUPABASE_ANON_KEY`에 붙여넣기

## 5. 다시 배포
Vercel에서 환경변수를 새로 입력했다면, `Deployments` 탭 → 맨 위 배포 → `⋯` → `Redeploy`

## 완성!
Vercel이 알려준 주소로 들어가면 프로그램이 바로 열립니다.
