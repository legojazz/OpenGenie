import { useEffect, useRef, useState } from 'react'
import type { AspectMode, GameState, ProjectInfo } from '../../../shared/types'
import logo from '../assets/logo.png'
import { AdvancedToggle } from './AdvancedToggle'
import { DiscordButton } from './DiscordButton'
import {
  AspectAnyIcon,
  CheckIcon,
  ChevronIcon,
  GearIcon,
  HomeIcon,
  MonitorIcon,
  PhoneLandscapeIcon,
  PhonePortraitIcon,
  ShareIcon
} from './Icons'
import { useTranslation } from '../i18n/useTranslation'

interface Props {
  project: ProjectInfo | null
  gameState: GameState
  aspect: AspectMode
  onSetAspect: (mode: AspectMode) => void
  onPlay: () => void
  onStop: () => void
  onHome: () => void
  onExport: () => void
  onOpenSettings: () => void
  advancedMode: boolean
  onToggleAdvancedMode: (value: boolean) => void
}

const ASPECT_OPTIONS: {
  mode: AspectMode
  label: string
  shortLabel: string
  icon: React.JSX.Element
}[] = [
  { mode: 'any', label: '任意比例', shortLabel: '任意', icon: <AspectAnyIcon size={14} /> },
  {
    mode: 'desktop',
    label: '桌面/电视，标准 16:9',
    shortLabel: '桌面',
    icon: <MonitorIcon size={14} />
  },
  {
    mode: 'mobile-portrait',
    label: '手机竖屏',
    shortLabel: '竖屏',
    icon: <PhonePortraitIcon size={14} />
  },
  {
    mode: 'mobile-landscape',
    label: '手机横屏',
    shortLabel: '横屏',
    icon: <PhoneLandscapeIcon size={14} />
  }
]

/** Run/Stop with an aspect-ratio picker on the caret — usable while running too. */
function RunControls({
  gameState,
  aspect,
  onSetAspect,
  onPlay,
  onStop
}: Pick<Props, 'gameState' | 'aspect' | 'onSetAspect' | 'onPlay' | 'onStop'>): React.JSX.Element {
  const t = useTranslation()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { status } = gameState
  const btnKind = status === 'stopped' ? 'btn-play' : 'btn-stop'
  const currentAspect = ASPECT_OPTIONS.find((o) => o.mode === aspect)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div className="run-split" ref={menuRef}>
      <button
        className={`btn ${btnKind} run-caret`}
        title={t('Game preview aspect ratio')}
        onClick={() => setOpen((v) => !v)}
      >
        {currentAspect?.icon}
        <span className="run-caret-label">{currentAspect?.shortLabel}</span>
        <span className="caret-down">
          <ChevronIcon size={10} />
        </span>
      </button>
      {status === 'stopped' ? (
        <button className="btn btn-play run-main" onClick={onPlay}>
          {t('Run')}
        </button>
      ) : (
        <button className="btn btn-stop run-main" onClick={onStop}>
          {status === 'starting' ? t('Cancel') : t('Stop')}
        </button>
      )}
      {open && (
        <div className="run-menu">
          <div className="run-menu-title">{t('Preview aspect ratio')}</div>
          {ASPECT_OPTIONS.map((option) => (
            <button
              key={option.mode}
              className={option.mode === aspect ? 'run-menu-item selected' : 'run-menu-item'}
              onClick={() => {
                onSetAspect(option.mode)
                setOpen(false)
              }}
            >
              <span className="run-menu-icon">{option.icon}</span>
              <span className="run-menu-label">{option.label}</span>
              {option.mode === aspect && (
                <span className="run-menu-check">
                  <CheckIcon size={12} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function TitleBar({
  project,
  gameState,
  aspect,
  onSetAspect,
  onPlay,
  onStop,
  onHome,
  onExport,
  onOpenSettings,
  advancedMode,
  onToggleAdvancedMode
}: Props): React.JSX.Element {
  const t = useTranslation()
  const { status } = gameState
  return (
    <header className="titlebar">
      <div className="titlebar-left">
        {project && (
          <button className="icon-btn" title={t('Back to projects')} onClick={onHome}>
            <HomeIcon />
          </button>
        )}
        <span className="brand">
          <img src={logo} alt="" className="brand-mark-img" /> GenieEngine
        </span>
        {project && (
          <>
            <span className="titlebar-sep">/</span>
            <span className="titlebar-project">{project.name}</span>
          </>
        )}
      </div>

      <div className="titlebar-center">
        {project && (
          <RunControls gameState={gameState} aspect={aspect} onSetAspect={onSetAspect} onPlay={onPlay} onStop={onStop} />
        )}
      </div>

      <div className="titlebar-right">
        {project && status !== 'stopped' && (
          <span className="status-pill">
            <span className={status === 'running' ? 'status-dot running' : 'status-dot starting'} />
            {status !== 'running' ? t('Starting…') : gameState.mode === 'test' ? t('AI testing') : t('Running')}
          </span>
        )}
        {project && <AdvancedToggle value={advancedMode} onChange={onToggleAdvancedMode} />}
        {project && (
          <button
            className="icon-btn"
            title={t('AI settings (coding agent, 2D & 3D asset generation)')}
            onClick={onOpenSettings}
          >
            <GearIcon size={14} />
          </button>
        )}
        {project && <DiscordButton />}
        {project && (
          <button className="btn btn-ghost btn-sm" title={t('Export your game')} onClick={onExport}>
            <ShareIcon size={13} /> {t('Export your game')}
          </button>
        )}
      </div>
    </header>
  )
}
