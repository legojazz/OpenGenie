import { useTranslation } from '../i18n/useTranslation'

interface Props {
  value: boolean
  onChange: (value: boolean) => void
}

const FEATURES = ['ECS viewer', 'Files sidebar', 'Git sidebar', 'Console output']

const ADVANCED_TEXT = '高级模式面向软件工程师和游戏开发者。它会添加：'

const FULL_DESC = '高级模式面向软件工程师和游戏开发者。它会添加：ECS 查看器、文件侧边栏、Git 侧边栏、控制台输出。即使不启用高级视图，你也能创建任何内容。'

/**
 * Shown on both the welcome screen and the editor title bar (left of the
 * settings gear) so its state — and meaning — stays consistent everywhere.
 *
 * The whole row is a single `<button role="switch">` (not a label wrapping a
 * separate button) so the entire "Advanced" text is clickable and hoverable,
 * not just the switch itself.
 *
 * The hover explanation is real markup shown via the `.has-tooltip` CSS
 * pattern, not the native `title` attribute — `title` silently never shows
 * in this app's frameless macOS window.
 */
export function AdvancedToggle({ value, onChange }: Props): React.JSX.Element {
  const t = useTranslation()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={FULL_DESC}
      className="toggle-row has-tooltip"
      onClick={() => onChange(!value)}
    >
      <span className="toggle-label">高级</span>
      <span className={value ? 'toggle-switch on' : 'toggle-switch'}>
        <span className="toggle-switch-knob" />
      </span>
      <div className="tooltip-bubble">
        <p>高级模式面向软件工程师和游戏开发者。</p>
        <p>它会添加：</p>
        <ul>
          {FEATURES.map((feature) => (
            <li key={feature}>{t(feature)}</li>
          ))}
        </ul>
        <p>即使不启用高级视图，你也能创建任何内容。</p>
      </div>
    </button>
  )
}
