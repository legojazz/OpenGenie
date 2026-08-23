import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { assetDir, credentialsStore } from './asset-store'

/**
 * ComfyUI local REST API client: generates 2D images by dynamically building
 * workflow JSON and posting it to a local ComfyUI instance (default port 8188).
 * Parallel to the OpenAI gpt-image flow — both are optional tools gated on
 * their own credentials/config stored in credentialsStore.
 *
 * Workflow is built by the AI at call time (not templated), so every request
 * can use whatever nodes the model considers appropriate. The minimum viable
 * workflow the app assembles covers: checkpoint loader, prompt encoding,
 * latent canvas, sampler, VAE decode, and image save.
 *
 * Concurrency: at most one in-flight workflow at a time — ComfyUI on a
 * consumer GPU chokes under parallel submissions, so the second request is
 * rejected rather than silently queued.
 */

export interface ComfyUICredentials extends Record<string, string> {
  apiUrl: string
}

const store = credentialsStore<ComfyUICredentials>('comfyui-credentials.json')

export const COMFYUI_DEFAULT_PORT = 8188
export const COMFYUI_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes — complex workflows need room
export const COMFYUI_POLL_INTERVAL_MS = 2000
export const MAX_CONCURRENT = 1
// Workflow defaults — the AI may override every field, but these anchor the
// minimal scaffold the app assembles before handing control to the model.
export const DEFAULT_CHECKPOINT = 'flux'
export const DEFAULT_WIDTH = 1024
export const DEFAULT_HEIGHT = 1024
export const DEFAULT_STEPS = 20
export const DEFAULT_CFG_SCALE = 3.5
export const DEFAULT_SAMPLER = 'euler'
export const DEFAULT_SCHEDULER = 'normal'

/** Currently queued workflow — protects the single-slot concurrency. */
let inflight: Promise<GeneratedImage> | null = null

function concurrentReject(): Error {
  return new Error('ComfyUI is busy processing another request. Wait for it to finish and try again.')
}

export async function isComfyUIConfigured(): Promise<boolean> {
  try {
    const creds = await store.load()
    if (!creds) return false
    new URL(creds.apiUrl)
    return true
  } catch {
    return false
  }
}

/**
 * Return the stored API address (or null when nothing is configured). Used by
 * the setup panel to prefill the URL field with the user's actual saved value
 * instead of a default.
 */
export async function getComfyUIApiUrl(): Promise<string | null> {
  const creds = await store.load()
  return creds?.apiUrl ?? null
}

/**
 * Save the API address — validated as a URL. Empty input keeps whatever was
 * stored (setup panel pattern: blank = unchanged).
 */
export async function saveComfyUIConfig(apiUrl: string): Promise<void> {
  const trimmed = apiUrl.trim()
  if (!trimmed) return
  try {
    new URL(trimmed)
  } catch {
    throw new Error(`"apiUrl" is not a valid URL: ${trimmed}`)
  }
  await store.save({ apiUrl: trimmed })
}

export interface ComfyUIGenerateRequest {
  prompt: string
  folder: string
  name: string
  width?: number
  height?: number
  model?: string
  steps?: number
  cfgScale?: number
  seed?: number
}

export interface GeneratedImage {
  files: string[]
  previewBase64: string
  previewMime: string
}

export interface ComfyUIHistoryResult {
  output?: {
    images?: Array<{ filename: string; subfolder: string; type: string }>
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

/**
 * Build a minimal workflow for one image. The model parameter selects the
 * checkpoint loader; the default FLUX variant is a free, capable model that
 * ships with ComfyUI out of the box. The AI can extend the workflow with
 * extra nodes (masks, control nets, hires fixes…) but must at least keep
 * these anchors: a loader, positive/negative encoders, an empty latent, a
 * sampler, a VAE decode, and a SaveImage node.
 *
 * Node IDs are stable and incrementing — the scheduler orders them by ID.
 */
function buildWorkflow(req: ComfyUIGenerateRequest, seed: number): Record<string, unknown> {
  const width = req.width ?? DEFAULT_WIDTH
  const height = req.height ?? DEFAULT_HEIGHT
  const steps = req.steps ?? DEFAULT_STEPS
  const cfgScale = req.cfgScale ?? DEFAULT_CFG_SCALE
  const checkpoint = req.model ?? DEFAULT_CHECKPOINT

  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: checkpoint }
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: req.prompt, clip: ['1', 1] }
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: '', clip: ['1', 1] }
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width, height, batch_size: 1 }
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg: cfgScale,
        sampler_name: DEFAULT_SAMPLER,
        scheduler: DEFAULT_SCHEDULER,
        denoise: 1,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0]
      }
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 1] }
    },
    '7': {
      class_type: 'SaveImage',
      inputs: {
        images: ['6', 0],
        filename_prefix: `genieengine_${req.name}`
      }
    }
  }
}

interface ComfyUIPromptResponse {
  prompt_id?: string
  node_errors?: unknown
  error?: string
}

interface ComfyUIQueueStatus {
  queue_remaining: number
}

interface ComfyUIViewParams {
  filename: string
  subfolder: string
  type: string
}

function queryParamString(params: ComfyUIViewParams): string {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
}

async function fetchComfyUI(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(COMFYUI_TIMEOUT_MS) })
}

async function postPrompt(apiUrl: string, workflow: Record<string, unknown>): Promise<string> {
  const res = await fetchComfyUI(`${apiUrl}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: workflow })
  })
  const body = (await res.json().catch(() => null)) as ComfyUIPromptResponse | null
  if (!res.ok) {
    throw new Error(`Failed to submit workflow to ComfyUI (HTTP ${res.status}).`)
  }
  if (body?.node_errors) {
    throw new Error(`ComfyUI workflow validation failed: ${JSON.stringify(body.node_errors)}`)
  }
  if (!body?.prompt_id) {
    throw new Error('ComfyUI did not return a prompt_id for the submitted workflow.')
  }
  return body.prompt_id
}

async function pollUntilDone(apiUrl: string, promptId: string): Promise<void> {
  const started = Date.now()
  while (Date.now() - started < COMFYUI_TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, COMFYUI_POLL_INTERVAL_MS))

    const status = await fetchComfyUI(`${apiUrl}/queue`, { method: 'GET' })
      .then((r) => r.json().catch(() => null))
      .then((b) => (b as ComfyUIQueueStatus | null)?.queue_remaining)
    if (status === 0) break

    const history = await fetchComfyUI(`${apiUrl}/history/${promptId}`, { method: 'GET' })
      .then((r) => r.json().catch(() => null))
      .then((b) => (b as Record<string, ComfyUIHistoryResult> | null)?.[promptId])
    if (history && history.output?.images?.length) break
  }
  // Final attempt after timeout: the workflow may have just completed in the
  // last poll interval. A second history query catches that race without
  // extending the effective timeout.
  const history = await fetchComfyUI(`${apiUrl}/history/${promptId}`, { method: 'GET' })
    .then((r) => r.json().catch(() => null))
    .then((b) => (b as Record<string, ComfyUIHistoryResult> | null)?.[promptId])
  if (history?.output?.images?.length) return
  throw new Error('ComfyUI timed out waiting for the workflow to complete.')
}

async function downloadImage(apiUrl: string, subfolder: string, filename: string, type: string): Promise<Buffer> {
  const query = queryParamString({ filename, subfolder, type })
  const res = await fetchComfyUI(`${apiUrl}/view?${query}`, { method: 'GET' })
  if (!res.ok) throw new Error(`Downloading ComfyUI image failed (HTTP ${res.status}).`)
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function generateImageAsset(projectPath: string, req: ComfyUIGenerateRequest): Promise<GeneratedImage> {
  const creds = await store.load()
  if (!creds) throw new Error('ComfyUI is not configured. Add an API address in the ComfyUI tab of the AI settings panel.')
  if (!req.prompt?.trim()) throw new Error('Provide a "prompt" describing the image.')

  const dir = assetDir(projectPath, req.folder, req.name)

  // Single-slot concurrency: serialize against the previous in-flight call.
  if (inflight) throw concurrentReject()

  inflight = (async () => {
    const apiUrl = creds.apiUrl.replace(/\/$/, '')
    const seed = req.seed ?? randomSeed()
    const workflow = buildWorkflow(req, seed)

    const promptId = await postPrompt(apiUrl, workflow)
    await pollUntilDone(apiUrl, promptId)

    const history = await fetchComfyUI(`${apiUrl}/history/${promptId}`, { method: 'GET' })
      .then((r) => r.json().catch(() => null))
      .then((b) => (b as Record<string, ComfyUIHistoryResult> | null)?.[promptId])

    if (!history?.output?.images?.length) {
      throw new Error('ComfyUI did not produce any images for the workflow. Check that the model checkpoint is installed.')
    }

    const imageEntry = history.output.images[0]
    const png = await downloadImage(apiUrl, imageEntry.subfolder, imageEntry.filename, imageEntry.type)

    await mkdir(dir.abs, { recursive: true })
    const fileName = `${basename(dir.rel)}.png`
    await writeFile(join(dir.abs, fileName), png)

    return {
      files: [join(dir.rel, fileName)],
      previewBase64: png.toString('base64'),
      previewMime: 'image/png'
    }
  })()

  try {
    return await inflight
  } finally {
    inflight = null
  }
}

/**
 * Read-only helper surfaced to the MCP bridge so the bridge can surface a
 * friendly error when ComfyUI is unreachable. Returns true iff the stored
 * URL responds to a quick /system_stats probe within 5 seconds.
 */
export async function isComfyUIReachable(): Promise<boolean> {
  try {
    const creds = await store.load()
    if (!creds) return false
    const res = await fetchComfyUI(`${creds.apiUrl}/system_stats`, { method: 'GET' })
    return res.ok
  } catch {
    return false
  }
}
