# exam-app CLAUDE.md — 운영 제작서

## 프로젝트 개요

- **서비스**: 학생 성취도 보고서 자동 생성 시스템
- **스택**: Next.js 14 App Router, Supabase, Vercel
- **GitHub**: https://github.com/sinbi-83/exam-app
- **배포 브랜치**: `main` → Vercel 자동 배포

---

## 가장 중요한 원칙

1. **현재 작업 위치가 로컬 `exam-app` 폴더인지 먼저 확인한다.**
2. 클라우드 작업 공간이라면, 로컬 파일을 수정했다고 말하지 않는다.
3. **일반 수정 요청은 절대로 GitHub에 올리거나 Vercel에 배포하지 않는다.**
4. 사용자가 명시적으로 "휴대폰 앱에 올려줘", "Vercel에 올려줘", "배포해줘"라고 말할 때만 배포한다.
5. VS Code를 열 필요 없다. 파일 수정·저장·로컬 실행·오류 확인·GitHub 업로드는 Claude Code가 담당한다.
6. 원본 파일이 없으면 임의 SVG, 가짜 로고, 가짜 서명을 만들지 않는다. 누락 사실만 간단히 말한다.

---

## 약속된 말과 행동

| 향미님이 말하면 | Claude Code가 하는 것 |
|---|---|
| "이 부분 바꿔줘" / 일반 수정 | 로컬 파일만 수정. Git push 절대 안 함. "새로고침하면 확인할 수 있어요." |
| "내 컴퓨터에서 보여줘" / "로컬에서 확인할래" | `npm run dev` 실행 → `http://localhost:3000` 안내. GitHub/Vercel 반영 안 함. |
| "휴대폰 앱에 올려줘" / "배포해줘" / "Vercel에 올려줘" | 빌드 오류 확인 → 문제 없으면 GitHub push → Vercel 자동 배포 완료 확인 → 주소 안내 |
| "확인해줘" | 로컬 확인만. 휴대폰/Vercel 명시 시에만 배포. |

---

## 로컬 실행 명령 (package.json 기준)

```bash
npm run dev      # 개발 서버 시작 → http://localhost:3000
npm run build    # 빌드 오류 확인
npm run lint     # 코드 오류 확인
npm run start    # 빌드 후 실서버 실행
```

---

## 이미지·원본 파일 표준 경로

```
public/brand/logo.png       ← 로고 (원본: boston-logo-watermark.png)
public/brand/signature.png  ← 서명 (원본: 싸인.png)
```

- 모든 보고서는 위 두 파일을 동일하게 참조한다.
- 기존 파일(`boston-logo-watermark.png`, `싸인.png`)은 삭제하지 않는다.
- 새 원본이 들어오면: 실제 위치와 적용 대상을 한 줄로 알린 뒤 연결한다.
- 채팅 이미지는 실제 파일이 아닐 수 있다. 로컬에서 접근 가능한 파일만 복사한다.
- 파일을 찾을 수 없으면 SVG나 대체 그림을 만들지 않는다.

---

## 보고서 페이지 주요 파일

| 파일 | 역할 |
|---|---|
| `app/report/page.tsx` | 보고서 생성 폼 |
| `app/report/print/page.tsx` | 인쇄용 보고서 렌더링 |
| `public/brand/logo.png` | 헤더 로고 이미지 |
| `public/brand/signature.png` | 교사 서명 이미지 |

---

## 외부지문저장소 (API 호출 없음)

- 경로: `/external-passages` (목록), `/external-passages/[id]` (상세·편집·삭제), `/external-passages/[id]/print` (인쇄)
- DB 테이블: `passages` (Supabase, RLS로 본인 것만 접근)
- 이 기능은 Claude API/Anthropic API를 전혀 호출하지 않는다. 지문·문제는 미리 JSON으로 만들어
  `scripts/add-passage.ts`로 DB에 저장해두고, 화면은 저장된 데이터를 읽기/수정/삭제/인쇄만 한다.
- 태그 마크업 규칙(`tagged_body` 필드 안에서 사용):
  - `{{v:단어}}` → 🔵 어휘 (파란색 밑줄)
  - `{{g:구문|설명}}` → 🔴 어법 (빨간색, 마우스 오버 시 설명)
  - `{{t:구문}}` → 💚 주제 (초록색)

### 지문 JSON 저장 방법

1. `data/passages/README.md`의 형식대로 JSON 파일을 `data/passages/`에 만든다.
2. 저장 실행: `npm run add-passage -- data/passages/파일이름.json`
   (내부적으로 `.env.local`의 `SUPABASE_LOGIN_EMAIL` / `SUPABASE_LOGIN_PASSWORD`로 로그인한 뒤 insert)
3. `.env.local`에 `SUPABASE_LOGIN_EMAIL`, `SUPABASE_LOGIN_PASSWORD`를 향미님이 직접 채워야 한다
   (Claude Code는 채우지 않음). `.env.local`은 `.gitignore`에 포함되어 있어 GitHub에 올라가지 않는다.

### 향미님이 "○학년 ○○ 주제 지문 만들어서 저장해줘"라고 하면

지문 + 태그 마크업(`tagged_body`) + 문제 20개(`questions`) + 서술형 5개(`essays`)를
위 JSON 형식으로 `data/passages/`에 만들고 `add-passage.ts`로 저장한다. **API는 호출하지 않는다**
(Claude Code가 직접 JSON 내용을 작성한다).

---

## 안전 규칙

- 요청하지 않은 디자인 변경, 파일 삭제, 구조 변경, 라이브 배포 금지
- 기존 로고·서명·보고서 데이터·사용자 작성 내용 삭제 금지
- 수정 전 현재 파일과 기존 참조 확인
- 수정 후 로컬 오류 없는지 확인
- 배포 전 변경 목록 짧게 보여주기 (예: "로고 크기, 서명 위치 반영합니다.")
- 막히면 향미님이 해야 할 행동을 한 번에 하나만 설명

---

## 매일의 사용 흐름

1. "여기 글자와 색을 바꿔줘." → 로컬만 수정
2. 브라우저 `http://localhost:3000` 새로고침 → 결과 확인
3. 만족하면 "휴대폰 앱에 올려줘." → GitHub + Vercel 배포

> 로컬 주소는 내 컴퓨터에서만 열리는 작업용 미리보기. 새로고침해도 실제 앱은 안 바뀜.
> "휴대폰 앱에 올려줘" 이후 Vercel 주소 새로고침했을 때만 실제 앱이 바뀜.
