export type ContextSource = 'api' | 'fixed' | 'fallback' | 'stale'

export type ContextValues = {
  patronCount: number
  lastPatron: string | null
  highestBidder: string | null
  highestBid: number
  bidCount: number
}

export type NetworkedContext = ContextValues & {
  collection: string | null
  tokenId: string | null
  available: boolean
  source: ContextSource
}

export type LoadOptions = {
  collection?: string
  tokenId?: string | number | bigint
  fixed?: ContextValues
  fallback?: Partial<ContextValues>
  apiBaseUrl?: string
  timeoutMs?: number
  fetch?: typeof globalThis.fetch
  onError?: (error: NetworkedContextError) => void
}

export type WatchOptions = LoadOptions & {
  intervalMs?: number
}

export class NetworkedContextError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkedContextError'
  }
}

declare global {
  var NETWORKED_CONTEXT: NetworkedContext | undefined
}

const API_BASE_URL = 'https://api.networked.art'
const ADDRESS = /^0x[0-9a-f]{40}$/i
const PARAMS = {
  collection: 'networked_collection',
  tokenId: 'networked_token_id',
  mode: 'networked_mode',
  patronCount: 'networked_patron_count',
  lastPatron: 'networked_last_patron',
  highestBidder: 'networked_highest_bidder',
  highestBid: 'networked_highest_bid',
  bidCount: 'networked_bid_count',
} as const

type Identity = { collection: string | null; tokenId: string | null }
type Resolved = { context: NetworkedContext; error?: NetworkedContextError }

function address(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null
  const normalized = String(value).toLowerCase()
  if (!ADDRESS.test(normalized))
    throw new NetworkedContextError(`Invalid ${field}`)
  return normalized
}

function integer(value: unknown, field: string): number {
  const normalized =
    typeof value === 'string' && value !== '' ? Number(value) : value
  if (!Number.isSafeInteger(normalized) || Number(normalized) < 0) {
    throw new NetworkedContextError(`Invalid ${field}`)
  }
  return Number(normalized)
}

function tokenId(value: unknown): string {
  if (
    typeof value === 'number' &&
    (!Number.isSafeInteger(value) || value < 0)
  ) {
    throw new NetworkedContextError('Invalid token id')
  }
  const normalized = String(value)
  if (!/^\d+$/.test(normalized))
    throw new NetworkedContextError('Invalid token id')
  return BigInt(normalized).toString()
}

function values(
  input: Partial<ContextValues>,
  complete: boolean,
): ContextValues {
  const required = (key: keyof ContextValues) => {
    if (complete && (!(key in input) || input[key] === undefined)) {
      throw new NetworkedContextError(`Missing ${key}`)
    }
    return input[key]
  }
  return {
    patronCount: integer(required('patronCount') ?? 0, 'patron count'),
    lastPatron: address(required('lastPatron'), 'last patron'),
    highestBidder: address(required('highestBidder'), 'highest bidder'),
    highestBid: integer(required('highestBid') ?? 0, 'highest bid'),
    bidCount: integer(required('bidCount') ?? 0, 'bid count'),
  }
}

function query() {
  return new URLSearchParams(globalThis.location?.search ?? '')
}

function urlIdentity(params: URLSearchParams): Identity | null {
  const rawCollection = params.get(PARAMS.collection)
  const rawTokenId = params.get(PARAMS.tokenId)
  if (rawCollection === null && rawTokenId === null) return null
  if (rawCollection === null || rawTokenId === null) {
    throw new NetworkedContextError('Incomplete token identity')
  }
  const collection = address(rawCollection, 'collection')
  if (!collection) throw new NetworkedContextError('Invalid collection')
  return { collection, tokenId: tokenId(rawTokenId) }
}

function explicitIdentity(options: LoadOptions): Identity | null {
  if (options.collection === undefined && options.tokenId === undefined)
    return null
  if (options.collection === undefined || options.tokenId === undefined) {
    throw new NetworkedContextError('Incomplete token identity')
  }
  const collection = address(options.collection, 'collection')
  if (!collection) throw new NetworkedContextError('Invalid collection')
  return { collection, tokenId: tokenId(options.tokenId) }
}

function fallbackContext(
  options: LoadOptions,
  identity: Identity = { collection: null, tokenId: null },
) {
  return {
    ...identity,
    ...values(options.fallback ?? {}, false),
    available: false,
    source: 'fallback' as const,
  }
}

function report(error: NetworkedContextError, options: LoadOptions) {
  options.onError?.(error)
  if (
    typeof globalThis.dispatchEvent === 'function' &&
    typeof CustomEvent === 'function'
  ) {
    globalThis.dispatchEvent(
      new CustomEvent('networked-context:error', { detail: error }),
    )
  }
}

function publish(context: NetworkedContext) {
  const frozen = Object.freeze(context)
  globalThis.NETWORKED_CONTEXT = frozen
  if (
    typeof globalThis.dispatchEvent === 'function' &&
    typeof CustomEvent === 'function'
  ) {
    globalThis.dispatchEvent(
      new CustomEvent('networked-context:change', { detail: frozen }),
    )
  }
  return frozen
}

function same(left: NetworkedContext | null, right: NetworkedContext) {
  return (
    !!left &&
    Object.keys(right).every(
      (key) =>
        left[key as keyof NetworkedContext] ===
        right[key as keyof NetworkedContext],
    )
  )
}

async function resolve(
  options: LoadOptions,
  signal?: AbortSignal,
): Promise<Resolved> {
  const params = query()
  let identity: Identity = { collection: null, tokenId: null }

  try {
    const explicit = explicitIdentity(options)

    if (options.fixed !== undefined) {
      identity = explicit ?? identity
      if (!explicit) {
        try {
          identity = urlIdentity(params) ?? identity
        } catch {
          // Explicit fixed values take precedence over malformed URL state.
        }
      }
      return {
        context: {
          ...identity,
          ...values(options.fixed, true),
          available: true,
          source: 'fixed',
        },
      }
    }

    identity = explicit ?? urlIdentity(params) ?? identity

    if (params.get(PARAMS.mode) === 'fixed') {
      const fixed: Partial<ContextValues> = {}
      for (const key of [
        'patronCount',
        'lastPatron',
        'highestBidder',
        'highestBid',
        'bidCount',
      ] as const) {
        const value = params.get(PARAMS[key])
        if (value === null) throw new NetworkedContextError(`Missing ${key}`)
        ;(fixed as Record<string, unknown>)[key] = value
      }
      return {
        context: {
          ...identity,
          ...values(fixed, true),
          available: true,
          source: 'fixed',
        },
      }
    }

    if (!identity.collection || identity.tokenId === null) {
      throw new NetworkedContextError('Token identity is unavailable')
    }

    const controller = new AbortController()
    const abort = () => controller.abort()
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    const timeout = globalThis.setTimeout(abort, options.timeoutMs ?? 3_000)

    try {
      const fetcher = options.fetch ?? globalThis.fetch
      if (!fetcher) throw new NetworkedContextError('Fetch is unavailable')
      const base = (options.apiBaseUrl ?? API_BASE_URL).replace(/\/$/, '')
      const response = await fetcher(
        `${base}/context/v1/${identity.collection}/${identity.tokenId}`,
        {
          credentials: 'omit',
          signal: controller.signal,
        },
      )
      if (!response.ok)
        throw new NetworkedContextError(
          `Context API returned ${response.status}`,
        )
      const body = (await response.json()) as Partial<ContextValues>
      return {
        context: {
          ...identity,
          ...values(body, true),
          available: true,
          source: 'api',
        },
      }
    } finally {
      globalThis.clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
  } catch (cause) {
    const error =
      cause instanceof NetworkedContextError
        ? cause
        : new NetworkedContextError('Unable to load context')
    report(error, options)
    try {
      return { context: fallbackContext(options, identity), error }
    } catch {
      return { context: fallbackContext({}, identity), error }
    }
  }
}

export async function load(options: LoadOptions = {}) {
  return publish((await resolve(options)).context)
}

export function watch(
  options: WatchOptions,
  listener: (context: NetworkedContext) => void,
) {
  let stopped = false
  let current: NetworkedContext | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined

  const schedule = () => {
    if (stopped || options.intervalMs === 0) return
    timer = globalThis.setTimeout(
      refresh,
      Math.max(250, options.intervalMs ?? 10_000),
    )
  }
  const refresh = async () => {
    // Cancel any pending poll so a visibility wake-up rejoins the single
    // chain instead of starting a second one that aborts this one's request.
    if (timer !== undefined) {
      globalThis.clearTimeout(timer)
      timer = undefined
    }
    if (stopped || globalThis.document?.hidden) return schedule()
    controller?.abort()
    controller = new AbortController()
    const result = await resolve(options, controller.signal)
    if (stopped) return
    let next = result.context
    if (result.error && current && current.source !== 'fallback') {
      next = { ...current, available: false, source: 'stale' }
    }
    if (!same(current, next)) {
      current = publish(next)
      listener(current)
    }
    schedule()
  }
  const visible = () => {
    if (!globalThis.document?.hidden) void refresh()
  }

  globalThis.document?.addEventListener('visibilitychange', visible)
  void refresh()

  return () => {
    stopped = true
    controller?.abort()
    if (timer !== undefined) globalThis.clearTimeout(timer)
    globalThis.document?.removeEventListener('visibilitychange', visible)
  }
}

export function toQuery(
  context: NetworkedContext,
  options: { fixed?: boolean } = {},
) {
  const params = new URLSearchParams()
  if (context.collection) params.set(PARAMS.collection, context.collection)
  if (context.tokenId !== null) params.set(PARAMS.tokenId, context.tokenId)
  if (options.fixed !== false) {
    params.set(PARAMS.mode, 'fixed')
    params.set(PARAMS.patronCount, String(context.patronCount))
    params.set(PARAMS.lastPatron, context.lastPatron ?? '')
    params.set(PARAMS.highestBidder, context.highestBidder ?? '')
    params.set(PARAMS.highestBid, String(context.highestBid))
    params.set(PARAMS.bidCount, String(context.bidCount))
  }
  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}
