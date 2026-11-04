// Vercel Preview 빌드를 시험용 Supabase 로 고정하고, 운영 값이 섞이면 빌드를 멈춘다 (next.config.js 에서 호출).
// Production 과 내 컴퓨터 빌드에서는 아무것도 하지 않는다.
// NEXT_PUBLIC_ 값과 env 로 지정한 값은 빌드할 때 코드에 박히므로, Vercel 변수를 고치지 않아도 Preview 에만 적용된다.
// 값은 config/previewSupabase.json 한 곳. 비어 있으면 Preview 빌드는 전부 실패한다.
const settings = require('./previewSupabase.json');

const refOf = (url) => (url || '').trim().match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/i)?.[1]?.toLowerCase();

// Preview 빌드에서 Vercel 변수 대신 코드에 넣을 값
function previewEnvOverrides(env = process.env, allowed = settings) {
  if (env.VERCEL_ENV !== 'preview' || !allowed.allowedRef) return {};
  return {
    NEXT_PUBLIC_SUPABASE_URL: `https://${allowed.allowedRef}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: allowed.anonKey || '',
    ANTHROPIC_API_KEY: allowed.previewAnthropicKey,
  };
}

// env 는 Vercel 이 준 값이다. Preview 에서는 지금 운영 값이 들어 있으므로, 시험용 값과 같으면 잘못 등록한 것이다.
function previewGuardProblems(env, allowed = settings) {
  if (env.VERCEL_ENV !== 'preview') return [];
  const problems = [];
  if (!allowed.allowedRef) problems.push('config/previewSupabase.json 에 시험용 프로젝트가 아직 없습니다.');
  else if (allowed.allowedRef === refOf(env.NEXT_PUBLIC_SUPABASE_URL)) problems.push('등록된 시험용 프로젝트가 Vercel 의 운영 주소와 같습니다.');
  if (!allowed.anonKey) problems.push('config/previewSupabase.json 에 시험용 공개 키가 없습니다.');
  else if (allowed.anonKey === env.NEXT_PUBLIC_SUPABASE_ANON_KEY) problems.push('등록된 공개 키가 Vercel 의 운영 키와 같습니다.');
  if (/service_role|^sb_secret_/.test(decodedKey(allowed.anonKey))) problems.push('공개 키 칸에 비밀키가 들어 있습니다.');
  if (!allowed.previewAnthropicKey || allowed.previewAnthropicKey.startsWith('sk-')) problems.push('Preview 용 AI 값이 잘못되었습니다.');
  return problems;
}

// 예전 형식(JWT) 키는 안쪽에 역할이 적혀 있어 풀어서 함께 검사한다
function decodedKey(key) {
  if (!key) return '';
  try {
    return `${key} ${Buffer.from(key.split('.')[1] || '', 'base64url').toString('utf8')}`;
  } catch {
    return key;
  }
}

function assertPreviewSafe(env = process.env) {
  if (env.VERCEL_ENV !== 'preview') return;
  const problems = previewGuardProblems(env);
  // 값은 로그에 남기지 않는다
  if (problems.length) throw new Error(`[preview-guard] Preview 빌드를 중단합니다.\n- ${problems.join('\n- ')}\ndocs/test-db-preview-setup.md 를 확인하세요.`);
  console.log('[preview-guard] 통과: 시험용 Supabase 로 빌드합니다.');
}

// 만들어진 결과물에 들어가면 안 되는 값 = Vercel 이 준 운영 값과 실제 AI 키
function forbiddenValues(env, allowed = settings) {
  if (env.VERCEL_ENV !== 'preview') return [];
  const values = [refOf(env.NEXT_PUBLIC_SUPABASE_URL), env.NEXT_PUBLIC_SUPABASE_ANON_KEY, env.ANTHROPIC_API_KEY, env.SUPABASE_SERVICE_ROLE_KEY];
  return values.filter((v) => v && v !== allowed.allowedRef && v !== allowed.anonKey && v !== allowed.previewAnthropicKey);
}

// 빌드 결과 파일 전체를 검사하는 webpack 플러그인. 운영 값이 하나라도 나오면 빌드 실패.
class PreviewBuildScanPlugin {
  constructor(forbidden) {
    this.forbidden = forbidden;
  }

  apply(compiler) {
    compiler.hooks.emit.tap('PreviewBuildScanPlugin', (compilation) => {
      for (const [name, asset] of Object.entries(compilation.assets)) {
        const text = asset.source().toString();
        if (this.forbidden.some((v) => text.includes(v))) {
          // 값은 로그에 남기지 않는다
          compilation.errors.push(new Error(`[preview-guard] 빌드 결과 ${name} 에 운영 값이 들어 있어 Preview 빌드를 중단합니다.`));
        }
      }
    });
  }
}

function withPreviewScan(webpackConfig, env = process.env) {
  const forbidden = forbiddenValues(env);
  if (forbidden.length) webpackConfig.plugins.push(new PreviewBuildScanPlugin(forbidden));
  return webpackConfig;
}

module.exports = { assertPreviewSafe, forbiddenValues, previewEnvOverrides, previewGuardProblems, withPreviewScan };
