import { redirect } from 'next/navigation'
// 기본 입구는 오늘 대시보드. 이전 생성기는 /legacy/generator에서 보존한다.
export default function HomePage() { redirect('/dashboard') }