'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabaseBrowser'

type BrandType = 'logo' | 'signature'

export default function SettingsPage() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [email, setEmail] = useState<string | null>(null)

  const [logoVersion, setLogoVersion] = useState(0)
  const [signatureVersion, setSignatureVersion] = useState(0)
  const [uploading, setUploading] = useState<BrandType | null>(null)
  const [uploadMessage, setUploadMessage] = useState<
    Record<BrandType, { type: 'success' | 'error'; text: string } | null>
  >({ logo: null, signature: null })

  const logoInputRef = useRef<HTMLInputElement>(null)
  const signatureInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
    })
  }, [])

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: '비밀번호는 6자 이상이어야 합니다.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: '새 비밀번호가 서로 일치하지 않습니다.' })
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })

      if (error) {
        setMessage({ type: 'error', text: '비밀번호 변경에 실패했습니다: ' + error.message })
        return
      }

      setMessage({ type: 'success', text: '비밀번호가 성공적으로 변경되었습니다.' })
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      setMessage({ type: 'error', text: '서버와 통신 중 문제가 발생했어요.' })
    } finally {
      setLoading(false)
    }
  }

  async function handleBrandUpload(type: BrandType, file: File) {
    setUploading(type)
    setUploadMessage((prev) => ({ ...prev, [type]: null }))

    try {
      const formData = new FormData()
      formData.append('type', type)
      formData.append('file', file)

      const res = await fetch('/api/settings/brand-upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        setUploadMessage((prev) => ({ ...prev, [type]: { type: 'error', text: data.error ?? '업로드에 실패했습니다.' } }))
        return
      }

      setUploadMessage((prev) => ({ ...prev, [type]: { type: 'success', text: '업로드가 완료되었습니다.' } }))
      if (type === 'logo') setLogoVersion((v) => v + 1)
      else setSignatureVersion((v) => v + 1)
    } catch {
      setUploadMessage((prev) => ({ ...prev, [type]: { type: 'error', text: '서버와 통신 중 문제가 발생했어요.' } }))
    } finally {
      setUploading(null)
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="mb-6 text-xl font-semibold text-gray-800">설정</h1>

      {/* 계정 정보 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-medium text-gray-700">계정 정보</h2>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-gray-600">이메일</span>
          <span className="text-sm text-gray-800">{email ?? '불러오는 중...'}</span>
        </div>
        <form action="/logout" method="POST">
          <button
            type="submit"
            className="w-full rounded border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            로그아웃
          </button>
        </form>
      </div>

      {/* 로고 / 서명 이미지 업로드 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-medium text-gray-700">로고 · 서명 이미지</h2>

        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm text-gray-600">로고 이미지</label>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={logoVersion}
                src={`/brand/logo.png?v=${logoVersion}`}
                alt="현재 로고"
                className="h-12 w-12 rounded border border-gray-200 object-contain"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
              />
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleBrandUpload('logo', file)
                }}
                className="flex-1 text-sm"
              />
            </div>
            {uploadMessage.logo && (
              <p className={`mt-1 text-sm ${uploadMessage.logo.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {uploading === 'logo' ? '업로드 중...' : uploadMessage.logo.text}
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm text-gray-600">서명 이미지</label>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={signatureVersion}
                src={`/brand/signature.png?v=${signatureVersion}`}
                alt="현재 서명"
                className="h-12 w-12 rounded border border-gray-200 object-contain"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
              />
              <input
                ref={signatureInputRef}
                type="file"
                accept="image/png"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleBrandUpload('signature', file)
                }}
                className="flex-1 text-sm"
              />
            </div>
            {uploadMessage.signature && (
              <p className={`mt-1 text-sm ${uploadMessage.signature.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {uploading === 'signature' ? '업로드 중...' : uploadMessage.signature.text}
              </p>
            )}
          </div>
        </div>
        <p className="mt-4 text-xs text-gray-400">PNG 파일만 업로드할 수 있어요. (최대 5MB)</p>
      </div>

      {/* 비밀번호 변경 */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-medium text-gray-700">비밀번호 변경</h2>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-gray-600">새 비밀번호</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="6자 이상 입력"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-600">새 비밀번호 확인</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="다시 한 번 입력"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {message && (
            <p className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? '변경 중...' : '비밀번호 변경'}
          </button>
        </form>
      </div>
    </div>
  )
}
