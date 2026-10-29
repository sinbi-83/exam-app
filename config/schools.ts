// 학교 정보 폴더 (2026-10-29): 지역 → 학교 목록은 여기 고정, 학교마다 고쳐 쓰는 내용은 DB 표 school_profiles (school-profiles-migration.sql).
// 기본정보(이름·주소·공립/사립)는 확인된 출처에서만 넣는다. 확인 안 된 칸은 비워 두고 화면에서 채운다.

export type SchoolInfo = {
  slug: string
  name: string
  // 학생관리의 학교 이름(students.school_name)과 맞춰 볼 다른 이름 (예: "대구중")
  aliases: string[]
  address: string
  foundation: '공립' | '사립'
}

export type SchoolRegion = {
  slug: string
  name: string
  level: string
  source: { label: string; url: string; checkedAt: string }
  note?: string
  schools: SchoolInfo[]
}

export const SCHOOL_REGIONS: SchoolRegion[] = [
  {
    slug: 'daegu-namgu',
    name: '대구 남구',
    level: '중학교',
    source: {
      label: '남구청 관내 교육시설(중학교), 페이지 수정일 2024-07-08',
      url: 'https://nam.daegu.kr/index.do?menu_id=00000961',
      checkedAt: '2026-10-29',
    },
    note: '심인중학교는 달성군 다사읍으로 옮긴 것으로 보여 뺐어요(학교알리미 확인 전). 대구고 부설 방송통신중은 일반 중학교가 아니라서 뺐어요.',
    schools: [
      { slug: 'gyeongsang', name: '경상중학교', aliases: ['경상중'], address: '대구 남구 현충로48길 33', foundation: '공립' },
      { slug: 'gyeongil-girls', name: '경일여자중학교', aliases: ['경일여중', '경일여자중'], address: '대구 남구 효성로 37', foundation: '사립' },
      { slug: 'gyeonghye-girls', name: '경혜여자중학교', aliases: ['경혜여중', '경혜여자중'], address: '대구 남구 성당로18길 20', foundation: '공립' },
      { slug: 'daegu', name: '대구중학교', aliases: ['대구중'], address: '대구 남구 대봉로 120', foundation: '공립' },
      { slug: 'daemyeong', name: '대명중학교', aliases: ['대명중'], address: '대구 남구 앞산순환로 477', foundation: '공립' },
      { slug: 'hyeopseong-gyeongbok', name: '협성경복중학교', aliases: ['협성경복중', '경복중', '협성중'], address: '대구 남구 효성로 33', foundation: '사립' },
    ],
  },
]

// 학교 상세 화면의 칸 (순서대로 보인다). 칸마다 내용 + 확인됨/추정 표시
export const SCHOOL_PROFILE_SECTIONS = [
  { key: 'basic', label: '기본정보', placeholder: '남녀공학, 학급 수, 특징 (예: IB MYP 학교)' },
  { key: 'textbooks', label: '영어 교과서', placeholder: '학년별 출판사·저자 (예: 1학년 동아 윤정미)' },
  { key: 'exam_schedule', label: '시험 일정', placeholder: '학기별 중간·기말 날짜와 범위' },
  { key: 'evaluation', label: '평가 비율', placeholder: '지필·수행 %, 수행평가 내용' },
  { key: 'trends', label: '출제 경향 메모', placeholder: '서술형 비중, 외부지문 여부, 자주 나오는 유형 등' },
  { key: 'materials', label: '시험 자료', placeholder: '모의고사·기출 자료 메모 (자료 연결은 다음 단계)' },
  { key: 'sources', label: '출처·확인 날짜', placeholder: '학교 홈페이지, 학교알리미, 학생 확인 등 + 날짜' },
] as const

export type SchoolSectionKey = (typeof SCHOOL_PROFILE_SECTIONS)[number]['key']
export type SchoolSectionStatus = '' | 'confirmed' | 'estimated'
export type SchoolSection = { text: string; status: SchoolSectionStatus }
export type SchoolProfileContent = Partial<Record<SchoolSectionKey, SchoolSection>>

export function findRegion(slug: string): SchoolRegion | undefined {
  return SCHOOL_REGIONS.find((r) => r.slug === slug)
}

export function findSchool(regionSlug: string, schoolSlug: string): SchoolInfo | undefined {
  return findRegion(regionSlug)?.schools.find((s) => s.slug === schoolSlug)
}

const normalize = (name: string) => name.replace(/\s+/g, '').replace(/학교$/, '')

// 학생관리의 학교 이름이 이 학교인지 ("대구중", "대구중학교", "대구 중학교" 모두 같은 학교)
export function schoolMatchesName(school: SchoolInfo, studentSchoolName: string | null | undefined): boolean {
  const n = normalize(studentSchoolName ?? '')
  if (!n) return false
  return [school.name, ...school.aliases].some((alias) => normalize(alias) === n)
}

// 학생 학교 이름 → 학교 정보 화면 주소 (없으면 null)
export function schoolHrefForName(studentSchoolName: string | null | undefined): string | null {
  for (const region of SCHOOL_REGIONS) {
    const school = region.schools.find((s) => schoolMatchesName(s, studentSchoolName))
    if (school) return `/materials/schools/${region.slug}/${school.slug}`
  }
  return null
}
