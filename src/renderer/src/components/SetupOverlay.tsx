import { useEffect, useState } from 'react'
import type {
  ModelSlotRequest,
  ModelSlotStatus,
  ReasoningEffort,
  SetupStatus,
  ThinkingMode
} from '../../../shared/types'
import { SparkIcon, XIcon } from './Icons'
import { useTranslation } from '../i18n/useTranslation'
import { COMFYUI_DEFAULT_PORT } from '../../../main/services/comfyui'

interface Props {
  status: SetupStatus
  onConfigured: (status: SetupStatus) => void
  /** Present when the panel was opened from the gear (already configured) — shows a close button. */
  onClose?: () => void
}

type SetupTab = 'agent' | '2d' | '3d' | 'comfyui'

const TABS: { id: SetupTab; label: string }[] = [
  { id: 'agent', label: '模型' },
  { id: '2d', label: '2D 资源生成（OpenAI，可选）' },
  { id: 'comfyui', label: '2D 资源生成（ComfyUI，可选）' },
  { id: '3d', label: '3D 资源生成（可选）' }
]

/** Mirrors the main process default — used to tell "same endpoint" from "own endpoint". */
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1'

type SlotId = 'medium' | 'large' | 'image'

/** The three model sections on the Models tab, in display (and key-sharing donor) order. */
const MODEL_SLOTS: { id: SlotId; title: string; hint: string; modelPlaceholder: string }[] = [
  {
    id: 'medium',
    title: '聊天模型 — Medium',
    hint: '用于日常规划和编写游戏代码的模型。支持任何 OpenAI 兼容的 API 端点。',
    modelPlaceholder: 'deepseek/deepseek-v4-pro'
  },
  {
    id: 'large',
    title: '聊天模型 — Large',
    hint: '用于处理复杂任务的重量级模型——在聊天框下拉菜单中切换。通常较慢，单条消息可能费用更高。',
    modelPlaceholder: 'z-ai/glm-5.2'
  },
  {
    id: 'image',
    title: '图像模型',
    hint: '助手的图像辅助功能——读取你附加的图像、用截图测试你的游戏——必须支持图像输入。',
    modelPlaceholder: 'moonshotai/kimi-k2.7-code'
  }
]

/** One model section's editable state (its key input stays hidden until revealed). */
interface SlotState {
  endpoint: string
  model: string
  apiKey: string
  thinking: ThinkingMode
  effort: ReasoningEffort
  /** True once the user asked to change an already-stored key. */
  keyRevealed: boolean
}

function initSlot(stored: ModelSlotStatus): SlotState {
  // An already-configured credential starts hidden behind a button — the
  // field only appears once the user explicitly asks to change it, so
  // opening the panel and hitting Save can never blank out a stored key.
  return {
    endpoint: stored.endpoint,
    model: stored.model,
    apiKey: '',
    thinking: stored.thinking,
    effort: stored.effort,
    keyRevealed: !stored.configured
  }
}

const THINKING_CHOICES: { value: ThinkingMode; label: string }[] = [
  { value: 'default', label: '默认（由模型决定）' },
  { value: 'enabled', label: '开启' },
  { value: 'disabled', label: '关闭' }
]

const EFFORT_CHOICES: { value: ReasoningEffort; label: string }[] = [
  { value: 'default', label: '默认（由模型决定）' },
  { value: 'low', label: '低' },
  { value: 'medium', label: '中等' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '极高' },
  { value: 'max', label: '最大' }
]

/**
 * Stands in for a credential input once it's already configured, so a
 * stored key is never blanked out by opening the panel and hitting Save —
 * the actual field only appears once the user asks to change it.
 */
function ConfiguredButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  const t = useTranslation()
  return (
    <button type="button" className="btn btn-ghost setup-configured-btn" onClick={onClick}>
      {t('Already configured. Click to update.')}
    </button>
  )
}

/**
 * One model's connection settings: endpoint + model + API key. The Models tab
 * shows three — the Medium and Large chat models plus the image-enabled model
 * that runs the image-reader / game-tester subagents.
 */
function ModelSection(props: {
  title: string
  hint: string
  endpoint: string
  onEndpoint: (v: string) => void
  model: string
  onModel: (v: string) => void
  modelPlaceholder: string
  thinking: ThinkingMode
  onThinking: (v: ThinkingMode) => void
  effort: ReasoningEffort
  onEffort: (v: ReasoningEffort) => void
  apiKey: string
  onApiKey: (v: string) => void
  keyPlaceholder: string
  keyHint?: string
  /** True while a stored key stays hidden behind the "already configured" button. */
  keyHidden: boolean
  /** Focus the key input when it appears (i.e. right after the reveal click). */
  keyAutoFocus?: boolean
  onRevealKey: () => void
  onSubmit: () => void
}): React.JSX.Element {
  const t = useTranslation()
  return (
    <div className="setup-section">
      <div>
        <span className="setup-section-title">{props.title}</span>
        <p className="setup-hint">{props.hint}</p>
      </div>

      <label className="setup-field">
        <span className="setup-label">{t('API endpoint')}</span>
        <input
          className="text-input"
          value={props.endpoint}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(e) => props.onEndpoint(e.target.value)}
          placeholder={OPENROUTER_ENDPOINT}
        />
      </label>

      <label className="setup-field">
        <span className="setup-label">{t('Model')}</span>
        <input
          className="text-input"
          value={props.model}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(e) => props.onModel(e.target.value)}
          placeholder={props.modelPlaceholder}
        />
      </label>

      <div className="setup-field-row">
        <label
          className="setup-field"
          title="Whether the model thinks before answering — sent as the standard OpenAI `thinking` field. Default sends nothing."
          aria-label={t('Thinking: sent as the standard OpenAI `thinking` field. Default sends nothing.')}
        >
          <span className="setup-label">{t('Thinking')}</span>
          <select
            className="setup-select"
            value={props.thinking}
            onChange={(e) => props.onThinking(e.target.value as ThinkingMode)}
          >
            {THINKING_CHOICES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label
          className="setup-field"
          title="How hard the model thinks — sent as the standard OpenAI `reasoning_effort` field. Default sends nothing; not every model accepts every level."
          aria-label={t('Reasoning effort: sent as the standard OpenAI `reasoning_effort` field.')}
        >
          <span className="setup-label">{t('Reasoning effort')}</span>
          <select
            className="setup-select"
            value={props.effort}
            onChange={(e) => props.onEffort(e.target.value as ReasoningEffort)}
          >
            {EFFORT_CHOICES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="setup-field">
        <span className="setup-label">{t('API key')}</span>
        {props.keyHidden ? (
          <ConfiguredButton onClick={props.onRevealKey} />
        ) : (
          <input
            className="text-input"
            type="password"
            value={props.apiKey}
            spellCheck={false}
            autoComplete="off"
            autoFocus={props.keyAutoFocus}
            onChange={(e) => props.onApiKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && props.onSubmit()}
            placeholder={props.keyPlaceholder}
          />
        )}
        {props.keyHint && <span className="setup-hint">{props.keyHint}</span>}
      </div>
    </div>
  )
}

/**
 * AI provider setup, shown over a darkened chat until the assistant is
 * connected (and reopenable later from the sidebar gear). Three tabs:
 * the models (any OpenAI-compatible endpoints — Medium and Large chat models
 * plus the image-enabled model behind the image-reader and game-tester
 * subagents), optional 2D asset generation (OpenAI gpt-image-1.5) and
 * optional 3D asset generation (Tencent HY 3D).
 */
export function SetupOverlay({ status, onConfigured, onClose }: Props): React.JSX.Element {
  const t = useTranslation()
  const [tab, setTab] = useState<SetupTab>('agent')
  const [slots, setSlots] = useState<Record<SlotId, SlotState>>(() => ({
    medium: initSlot(status.medium),
    large: initSlot(status.large),
    image: initSlot(status.image)
  }))
  const [tencentId, setTencentId] = useState('')
  const [tencentKey, setTencentKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [tencentRevealed, setTencentRevealed] = useState(!status.hy3dConfigured)
  const [openaiKeyRevealed, setOpenaiKeyRevealed] = useState(!status.gptImageConfigured)

  const [comfyuiUrl, setComfyuiUrl] = useState('')
  const [comfyuiUrlRevealed, setComfyuiUrlRevealed] = useState(!status.comfyuiConfigured)
  const [comfyuiBusy, setComfyuiBusy] = useState(false)
  const [comfyuiError, setComfyuiError] = useState<string | null>(null)

  // Seed the URL field from the stored address so an already-configured
  // ComfyUI instance shows its actual saved value (not a default) when the
  // tab is first viewed. Defaults to localhost:8188 when nothing is stored.
  useEffect(() => {
    if (status.comfyuiConfigured) {
      window.api.getComfyUIConfig().then((result) => {
        if (result.ok && result.data.apiUrl) {
          setComfyuiUrl(result.data.apiUrl)
        } else {
          setComfyuiUrl(`http://127.0.0.1:${COMFYUI_DEFAULT_PORT}`)
        }
      })
    }
  }, [status.comfyuiConfigured])

  const updateSlot = (id: SlotId, patch: Partial<SlotState>): void =>
    setSlots((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const norm = (endpoint: string): string => endpoint.trim() || OPENROUTER_ENDPOINT

  // A slot can vouch for a key of its own when one was typed now, or when a
  // stored one exists AND the endpoint hasn't changed (a stored key belongs
  // to the endpoint it was entered for). Keyless slots can instead share a
  // vouching slot's key by pointing at the same endpoint — the main process
  // copies it into the slot's own credential on save.
  const hasOwnKey = (id: SlotId): boolean =>
    !!slots[id].apiKey.trim() || (status[id].configured && norm(slots[id].endpoint) === norm(status[id].endpoint))
  const covered = (id: SlotId): boolean =>
    hasOwnKey(id) ||
    MODEL_SLOTS.some((other) => other.id !== id && norm(slots[other.id].endpoint) === norm(slots[id].endpoint) && hasOwnKey(other.id))

  const keyPlaceholder = (id: SlotId): string => {
    if (status[id].configured && norm(slots[id].endpoint) === norm(status[id].endpoint)) {
      return t('Leave blank to keep the stored key')
    }
    if (id !== 'medium' && norm(slots[id].endpoint) === norm(slots.medium.endpoint)) {
      return t('Leave blank to use the Medium model\'s API key')
    }
    return id === 'medium' && !status.medium.configured ? t('Your API key') : t('API key for this endpoint')
  }

  // Save applies every tab at once, so a validation error may concern a tab
  // the user isn't looking at — switch to it so the message makes sense.
  const fail = (message: string, where: SetupTab): void => {
    setError(message)
    setTab(where)
  }

  const saveComfyUI = async (): Promise<void> => {
    setComfyuiBusy(true)
    setComfyuiError(null)
    const result = await window.api.saveComfyUIConfig(comfyuiUrl)
    setComfyuiBusy(false)
    if (!result.ok) {
      setComfyuiError(result.error)
      return
    }
    if (result.data.configured) {
      onConfigured({ ...status, comfyuiConfigured: true })
    }
  }

  const save = async (): Promise<void> => {
    for (const { id, title } of MODEL_SLOTS) {
      if (!covered(id)) {
        fail(
          `"${title}" 没有可用的 API 密钥——请输入一个，或将其端点指向其他段的端点以共享密钥。`,
          'agent'
        )
        return
      }
    }
    if (!!tencentId.trim() !== !!tencentKey.trim()) {
      fail(t('Enter both the Tencent SecretId and SecretKey (or leave both blank).'), '3d')
      return
    }
    setBusy(true)
    setError(null)
    const slotRequest = (id: SlotId): ModelSlotRequest => ({
      endpoint: slots[id].endpoint,
      model: slots[id].model,
      apiKey: slots[id].apiKey,
      thinking: slots[id].thinking,
      effort: slots[id].effort
    })
    const result = await window.api.saveSetup({
      medium: slotRequest('medium'),
      large: slotRequest('large'),
      image: slotRequest('image'),
      tencentSecretId: tencentId,
      tencentSecretKey: tencentKey,
      openaiApiKey: openaiKey,
      comfyuiApiUrl: comfyuiUrl
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    const broken = MODEL_SLOTS.find(({ id }) => !result.data[id].configured)
    if (broken) {
      setError(`"${broken.title}" 端点仍然没有可用的凭据——请检查其 API 密钥。`)
    } else {
      onConfigured(result.data)
      onClose?.()
    }
  }

  return (
    <div className="setup-overlay">
      <div className="setup-card">
        {onClose && (
          <button className="icon-btn setup-close" onClick={onClose} title={t('Close')}>
            <XIcon size={12} />
          </button>
        )}
        <div className="setup-head">
          <span className="setup-icon">
            <SparkIcon size={18} />
          </span>
          <div>
            <h2 className="setup-title">{status.configured ? t('AI settings') : t('Connect your AI assistant')}</h2>
            <p className="setup-sub">
              GenieEngine 的助手由 OpenCode 驱动：Medium 和 Large 聊天模型可在每条消息间切换，
              加上图像辅助功能可读取你的图像并测试你的游戏。
            </p>
          </div>
        </div>

        <div className="setup-tabs" role="tablist">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`setup-tab${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'agent' && (
          <>
            {MODEL_SLOTS.map(({ id, title, hint, modelPlaceholder }) => (
              <ModelSection
                key={id}
                title={title}
                hint={hint}
                endpoint={slots[id].endpoint}
                onEndpoint={(v) => updateSlot(id, { endpoint: v })}
                model={slots[id].model}
                onModel={(v) => updateSlot(id, { model: v })}
                modelPlaceholder={modelPlaceholder}
                thinking={slots[id].thinking}
                onThinking={(v) => updateSlot(id, { thinking: v })}
                effort={slots[id].effort}
                onEffort={(v) => updateSlot(id, { effort: v })}
                apiKey={slots[id].apiKey}
                onApiKey={(v) => updateSlot(id, { apiKey: v })}
                keyPlaceholder={keyPlaceholder(id)}
                keyHint={
                  id === 'medium'
                    ? '本地存储在 OpenCode 的凭据文件中——永远不会离开你的设备或进入你的游戏代码。'
                    : undefined
                }
                keyHidden={status[id].configured && !slots[id].keyRevealed}
                keyAutoFocus={status[id].configured}
                onRevealKey={() => updateSlot(id, { keyRevealed: true })}
                onSubmit={() => void save()}
              />
            ))}
          </>
        )}

        {tab === 'comfyui' && (
          <>
            <span className="setup-hint">
              输入本地 ComfyUI 实例的 API 地址（默认端口 {COMFYUI_DEFAULT_PORT}），让助手通过动态构建 workflow JSON 生成 2D 图片并保存到游戏资源文件夹中。ComfyUI 必须在 GenieEngine 启动时处于运行状态。
            </span>

            <div className="setup-field">
              <span className="setup-label">{t('ComfyUI API address')}</span>
              {status.comfyuiConfigured && !comfyuiUrlRevealed ? (
                <ConfiguredButton onClick={() => setComfyuiUrlRevealed(true)} />
              ) : (
                <input
                  className="text-input"
                  value={comfyuiUrl}
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                  autoFocus={status.comfyuiConfigured}
                  onChange={(e) => setComfyuiUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void saveComfyUI()}
                  placeholder={`http://127.0.0.1:${COMFYUI_DEFAULT_PORT}`}
                />
              )}
            </div>

            {comfyuiError && <div className="error-banner small">{comfyuiError}</div>}

            <button
              className="btn btn-primary"
              disabled={busy || comfyuiBusy}
              onClick={() => void saveComfyUI()}
            >
              {comfyuiBusy ? t('Saving…') : t('Save')}
            </button>
          </>
        )}

        {tab === '2d' && (
          <>
            <span className="setup-hint">
              添加 OpenAI API 密钥以让助手生成 2D 美术资源——精灵图、图标、UI——以透明 1024×1024 PNG 格式保存到游戏资源文件夹中。目前仅支持 OpenAI 的 gpt-image-1.5 模型。
            </span>

            <div className="setup-field">
              <span className="setup-label">{t('OpenAI API key')}</span>
              {status.gptImageConfigured && !openaiKeyRevealed ? (
                <ConfiguredButton onClick={() => setOpenaiKeyRevealed(true)} />
              ) : (
                <input
                  className="text-input"
                  type="password"
                  value={openaiKey}
                  spellCheck={false}
                  autoComplete="off"
                  autoFocus={status.gptImageConfigured}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void save()}
                  placeholder={status.gptImageConfigured ? t('Leave blank to keep the stored key') : t('OpenAI API key placeholder')}
                />
              )}
            </div>
          </>
        )}

        {tab === '3d' && (
          <>
            <span className="setup-hint">
              添加腾讯云凭据以让助手生成 3D 模型并保存到游戏资源文件夹中。目前仅支持腾讯云的 HY 3D 模型。
            </span>

            {status.hy3dConfigured && !tencentRevealed ? (
              <div className="setup-field">
                <span className="setup-label">{t('Tencent credentials')}</span>
                <ConfiguredButton onClick={() => setTencentRevealed(true)} />
              </div>
            ) : (
              <>
                <label className="setup-field">
                  <span className="setup-label">{t('Tencent SecretId')}</span>
                  <input
                    className="text-input"
                    value={tencentId}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    autoFocus={status.hy3dConfigured}
                    onChange={(e) => setTencentId(e.target.value)}
                    placeholder={status.hy3dConfigured ? t('Leave blank to keep the stored value') : t('akid…')}
                  />
                </label>

                <label className="setup-field">
                  <span className="setup-label">{t('Tencent SecretKey')}</span>
                  <input
                    className="text-input"
                    type="password"
                    value={tencentKey}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) => setTencentKey(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void save()}
                    placeholder={status.hy3dConfigured ? t('Leave blank to keep the stored value') : t('Your Tencent Cloud SecretKey')}
                  />
                </label>
              </>
            )}
          </>
        )}

        {error && <div className="error-banner small">{error}</div>}

        <button className="btn btn-primary setup-connect" disabled={busy} onClick={() => void save()}>
          {busy ? t('Saving…') : status.configured ? t('Save') : t('Connect')}
        </button>
      </div>
    </div>
  )
}
