// 학교 정보의 '예시 문제' 글(data/school-profiles/*-sample-exams.json)을 시험지 보관함의 문제 시험으로 저장한다.
// 저장되면 시험 관리 > 시험지 보관함에서 학생용·교사용·답안지만으로 인쇄할 수 있다.
// 실행: npm run add-sample-exams -- data/school-profiles/파일이름.json [--dry-run]
//   제목이 같은 시험이 이미 있으면 건너뛴다 (선생님이 고친 시험 보호). 기존 시험은 바꾸거나 지우지 않는다.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const CHOICES = ['①', '②', '③', '④', '⑤']

interface QuestionData {
  type: string
  question: string
  options?: string[]
  answer: string
  explanation?: string
  passage?: string
  source: 'school_sample_exam'
}
interface ParsedExam {
  title: string
  questions: { question_data: QuestionData; points: number }[]
  totalPoints: number
}

function loadEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  }
  return env
}

function questionType(stem: string): string {
  if (/뜻으로 가장|뜻이 가장/.test(stem)) return 'vocab'
  if (/^대화/.test(stem)) return 'mc'
  if (/어법상|용법|쓰임|처럼 생략|문장과 뜻|문장의 뜻|^다음 빈칸/.test(stem)) return 'grammar'
  return 'reading'
}

export function parseSampleExam(text: string): ParsedExam {
  const lines = text.replace(/\r/g, '').split('\n')
  const head = lines[0].match(/^\[(.+?) 예시\] 선택형 (\d+)문항\(각 (\d+)점, \d+점\) \+ 서(?:·논)?술형 (\d+)문항\(각 (\d+)점, \d+점\)/)
  if (!head) throw new Error(`머리글을 읽지 못했습니다: ${lines[0]}`)
  const [, name, mcCount, mcPoints, essayCount, essayPoints] = head

  const keyAt = lines.indexOf('[정답]')
  const mcAt = lines.indexOf('[선택형]')
  const essayAt = lines.findIndex((l) => /^\[서(·논)?술형\]$/.test(l))
  if (keyAt < 0 || mcAt < 0 || essayAt < 0) throw new Error(`${name}: [선택형]·[서술형]·[정답] 구역이 필요합니다.`)

  // 정답표: "1 ② / 2 ① / 9 ⑤ (설명)" 줄, 서술형은 "14 답", "채점…" 줄
  const keyLines = lines.slice(keyAt + 1).filter((l) => l.trim())
  const answers = new Map<number, { mark?: string; text: string; explanation?: string }>()
  for (const part of keyLines[0].split(' / ')) {
    const m = part.match(/^(\d+) ([①②③④⑤])(?: \((.+)\))?$/)
    if (!m) throw new Error(`${name}: 정답표를 읽지 못했습니다: ${part}`)
    answers.set(Number(m[1]), { mark: m[2], text: '', explanation: m[3] })
  }
  const rubric = keyLines.find((l) => /채점\(/.test(l))
  for (const line of keyLines.slice(1)) {
    const m = line.match(/^(\d+) (.+)$/)
    if (!m) continue
    const isSample = m[2].startsWith('예시 답안')
    answers.set(Number(m[1]), { text: m[2], explanation: isSample ? rubric : undefined })
  }

  const questions: ParsedExam['questions'] = []
  let passage: string | undefined
  let current: { num: number; stem: string[]; options: string[]; essay: boolean } | null = null

  const flush = () => {
    if (!current) return
    const { num, options, essay } = current
    const key = answers.get(num)
    if (!key) throw new Error(`${name}: ${num}번 정답이 없습니다.`)
    if (num !== questions.length + 1) throw new Error(`${name}: 문항 번호가 이어지지 않습니다 (${num}번).`)
    const stem = current.stem.join('\n').trim()
    const type = essay ? 'essay' : questionType(stem)
    // 어법 빈칸 문장은 따옴표로 감싼다 → 인쇄할 때 지문의 같은 자리도 빈칸이 되어 정답이 안 보인다 (lib/grammarLeak.ts)
    const question = type === 'grammar' ? stem.replace(/^(?!.*")(.*_{3,}.*)$/m, '"$1"') : stem
    let answer = key.text
    if (!essay) {
      const index = CHOICES.indexOf(key.mark ?? '')
      if (options.length !== 5 || index < 0) throw new Error(`${name}: ${num}번 보기·정답이 잘못되었습니다.`)
      answer = options[index]
    }
    questions.push({
      points: Number(essay ? essayPoints : mcPoints),
      question_data: {
        type,
        question,
        ...(essay ? {} : { options }),
        answer,
        ...(key.explanation ? { explanation: key.explanation } : {}),
        // 지문 없는 공통 문항은 앞 지문을 다시 찍지 않는다
        ...(passage ? { passage } : {}),
        source: 'school_sample_exam',
      },
    })
    current = null
  }

  const readSection = (from: number, to: number, essay: boolean) => {
    let i = from
    while (i < to) {
      const line = lines[i]
      const passageHead = line.match(/^(〈지문 [A-Z]〉)/)
      if (passageHead) {
        flush()
        const body: string[] = []
        i++
        while (i < to && !/^\d+\. /.test(lines[i])) {
          if (lines[i].trim()) body.push(lines[i])
          i++
        }
        passage = `${passageHead[1]}\n${body.join('\n')}`
        continue
      }
      if (line.startsWith('〈공통〉')) {
        flush()
        passage = undefined
      } else if (/^\d+\. /.test(line)) {
        flush()
        const m = line.match(/^(\d+)\. (.*)$/)!
        current = { num: Number(m[1]), stem: [m[2]], options: [], essay }
      } else if (current && CHOICES.includes(line[0] ?? '')) {
        current.options.push(line.slice(2))
      } else if (current && line.trim()) {
        current.stem.push(line)
      }
      i++
    }
    flush()
  }

  readSection(mcAt + 1, essayAt, false)
  passage = undefined
  readSection(essayAt + 1, keyAt, true)

  const expected = Number(mcCount) + Number(essayCount)
  if (questions.length !== expected) throw new Error(`${name}: 문항 수가 ${questions.length}개입니다 (기대 ${expected}개).`)
  const totalPoints = questions.reduce((sum, q) => sum + q.points, 0)
  if (totalPoints !== 100) throw new Error(`${name}: 총점이 ${totalPoints}점입니다.`)
  return { title: `[예시] ${name}`, questions, totalPoints }
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('사용법: npm run add-sample-exams -- data/school-profiles/파일이름.json [--dry-run]')
    process.exit(1)
  }
  const dryRun = process.argv.includes('--dry-run')
  const input = JSON.parse(readFileSync(resolve(process.cwd(), filePath), 'utf-8')) as {
    schools: Record<string, { sample_exam: { text: string } }>
  }
  const exams = Object.values(input.schools).map((s) => parseSampleExam(s.sample_exam.text))
  for (const exam of exams) {
    const types: Record<string, number> = {}
    for (const q of exam.questions) types[q.question_data.type] = (types[q.question_data.type] ?? 0) + 1
    const passages = new Set(exam.questions.map((q) => q.question_data.passage).filter(Boolean)).size
    console.log(`${exam.title}: ${exam.questions.length}문항 ${exam.totalPoints}점, 지문 ${passages}개, ${JSON.stringify(types)}`)
  }

  const env = loadEnvLocal()
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: env.SUPABASE_LOGIN_EMAIL,
    password: env.SUPABASE_LOGIN_PASSWORD,
  })
  if (authError || !auth.user) {
    console.error('로그인 실패:', authError?.message)
    process.exit(1)
  }
  const userId = auth.user.id

  for (const exam of exams) {
    const { data: found, error: findError } = await supabase.from('exams').select('id').eq('user_id', userId).eq('title', exam.title)
    if (findError) {
      console.error('시험 찾기 실패:', findError.message)
      process.exit(1)
    }
    if (found && found.length > 0) {
      console.log(`이미 있어 건너뜀: ${exam.title}`)
      continue
    }
    if (dryRun) {
      console.log(`새로 만들 예정: ${exam.title}`)
      continue
    }
    const { data: created, error: examError } = await supabase
      .from('exams')
      .insert({ user_id: userId, title: exam.title, total_questions: exam.questions.length, max_score: exam.totalPoints, exam_type: 'problem' })
      .select('id')
      .single()
    if (examError || !created) {
      console.error(`${exam.title} 시험 만들기 실패:`, examError?.message)
      process.exit(1)
    }
    const rows = exam.questions.map((q, i) => ({ exam_id: created.id, user_id: userId, question_data: q.question_data, sort_order: i, points: q.points }))
    const { error: questionError } = await supabase.from('exam_questions').insert(rows)
    if (questionError) {
      // 방금 만든 빈 시험만 되돌린다
      await supabase.from('exams').delete().eq('id', created.id).eq('user_id', userId)
      console.error(`${exam.title} 문항 저장 실패:`, questionError.message)
      process.exit(1)
    }
    console.log(`저장: ${exam.title} /tests/${created.id}`)
  }
  console.log(dryRun ? '시험 실행이라 저장하지 않았습니다.' : '저장 완료')
}

main()
