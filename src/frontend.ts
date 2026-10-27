import type { SpindleFrontendContext } from 'lumiverse-spindle-types'
import { buildForest, filterForest, treeSize, type ChatRecord, type ChatTree } from './model'

interface ActiveChatState { chatId: string | null; characterId: string | null }
interface ChatSummary {
  id: string
  name: string
  message_count: number
  created_at: number
  updated_at: number
}

interface ApiTreeNode {
  id: string
  name: string
  created_at: number
  updated_at: number
  message_count: number
  children?: ApiTreeNode[]
}

type HostContext = SpindleFrontendContext & {
  state?: {
    get?<T>(id: string): T
    subscribe?<T>(id: string, handler: (value: T) => void): () => void
  }
  getActiveChat?: () => { chatId?: string | null; characterId?: string | null } | null
  host?: {
    surfaces?: {
      invoke(ref: { kind: 'route'; id: '/chat/:chatId' }, params: { chatId: string }): void | Promise<void>
    }
  }
}

const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="6" cy="4" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="20" r="2"/><path d="M6 6v6a4 4 0 0 0 4 4h2"/><path d="M6 12h6a4 4 0 0 0 4-4"/><path d="m15 14 3 3-3 3"/></svg>`

const CSS = `
  .cct-panel{display:flex;flex-direction:column;gap:10px;padding-bottom:8px}
  .cct-tools{display:flex;gap:6px;align-items:center;position:sticky;top:0;z-index:4;background:var(--lumiverse-bg);padding-bottom:2px}
  .cct-search{min-width:0;flex:1;border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-bg-elevated);color:var(--lumiverse-text);font:inherit;font-size:12px;padding:8px 9px;outline:none}
  .cct-search:focus{border-color:var(--lumiverse-primary)}.cct-refresh,.cct-toggle-all{border:1px solid var(--lumiverse-border);border-radius:7px;background:var(--lumiverse-bg-elevated);color:var(--lumiverse-text-muted);font:inherit;font-size:12px;padding:8px 9px;cursor:pointer;white-space:nowrap}
  .cct-refresh:hover,.cct-toggle-all:hover{border-color:var(--lumiverse-border-hover);color:var(--lumiverse-text)}.cct-refresh:disabled,.cct-toggle-all:disabled{opacity:.5;cursor:not-allowed}
  .cct-summary{font-size:11px;color:var(--lumiverse-text-dim);padding:0 2px}.cct-list{display:flex;flex-direction:column;gap:6px}
  .cct-node-wrap{display:flex;flex-direction:column;gap:5px}.cct-children{display:flex;flex-direction:column;gap:5px;margin-left:12px;padding-left:12px;border-left:1px solid var(--lumiverse-border)}
  .cct-node{display:grid;grid-template-columns:24px minmax(0,1fr) auto;gap:8px;align-items:center;width:100%;padding:8px 9px;border:1px solid var(--lumiverse-border);border-radius:8px;background:var(--lumiverse-bg-elevated);color:var(--lumiverse-text)}
  .cct-node:hover{border-color:var(--lumiverse-border-hover);background:var(--lumiverse-fill-subtle)}.cct-node[data-current="true"]{border-color:var(--lumiverse-primary-050);background:var(--lumiverse-primary-010)}
  .cct-branch-toggle,.cct-glyph{display:grid;place-items:center;width:24px;height:24px;border:0;border-radius:6px;background:var(--lumiverse-fill-subtle);color:var(--lumiverse-text-muted);font:inherit;font-size:13px;padding:0}.cct-branch-toggle{cursor:pointer}.cct-branch-toggle:hover{background:var(--lumiverse-primary-020);color:var(--lumiverse-primary)}.cct-chevron{display:inline-block;transition:transform .15s ease}.cct-branch-toggle[aria-expanded="true"] .cct-chevron{transform:rotate(90deg)}
  .cct-open{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;min-width:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;padding:0;cursor:pointer}.cct-copy{min-width:0;display:flex;flex-direction:column;gap:2px}.cct-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12.5px;font-weight:500}.cct-meta{font-size:10.5px;color:var(--lumiverse-text-dim)}
  .cct-here{font-size:9px;font-weight:700;text-transform:uppercase;color:var(--lumiverse-primary);background:var(--lumiverse-primary-020);padding:2px 5px;border-radius:4px}.cct-empty{padding:42px 12px;text-align:center;color:var(--lumiverse-text-muted);font-size:12px;line-height:1.5}.cct-error{color:var(--lumiverse-danger,#d66)}
  .cct-rename{display:grid;place-items:center;width:30px;height:30px;border:1px solid var(--lumiverse-border);border-radius:6px;background:transparent;color:var(--lumiverse-text-muted);font:inherit;font-size:16px;cursor:pointer}.cct-rename:hover{color:var(--lumiverse-primary);border-color:var(--lumiverse-primary)}.cct-rename:disabled{opacity:.4;cursor:default}.cct-rename-editor{grid-column:2/-1;display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-width:0}.cct-rename-input{flex:1 1 140px;min-width:0;width:100%;border:1px solid var(--lumiverse-primary);border-radius:6px;background:var(--lumiverse-bg);color:var(--lumiverse-text);font:inherit;font-size:12px;padding:7px 8px}.cct-rename-save,.cct-rename-cancel{border:1px solid var(--lumiverse-border);border-radius:6px;background:var(--lumiverse-bg);color:var(--lumiverse-text);font:inherit;font-size:11px;padding:6px 9px;cursor:pointer}.cct-rename-save{border-color:var(--lumiverse-primary);color:var(--lumiverse-primary)}.cct-rename-save:disabled,.cct-rename-cancel:disabled{opacity:.5;cursor:default}.cct-rename-error{flex-basis:100%;font-size:11px;color:var(--lumiverse-danger,#d66)}
`

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function readActiveContext(ctx: HostContext): ActiveChatState {
  try {
    const state = ctx.state?.get?.<ActiveChatState>('chat.active')
    if (state) return {
      chatId: typeof state.chatId === 'string' ? state.chatId : null,
      characterId: typeof state.characterId === 'string' ? state.characterId : null,
    }
  } catch { /* older host */ }
  try {
    const active = ctx.getActiveChat?.()
    return {
      chatId: typeof active?.chatId === 'string' ? active.chatId : null,
      characterId: typeof active?.characterId === 'string' ? active.characterId : null,
    }
  } catch { return { chatId: null, characterId: null } }
}

async function fetchJson<T>(path: string, timeoutMs = 5000, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(path, {
      method: 'GET',
      credentials: 'same-origin',
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Lumiverse API returned ${response.status}`)
    return await response.json() as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('Lumiverse API timed out after 5 seconds')
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

function summaryRecord(summary: ChatSummary, characterId: string): ChatRecord {
  return {
    id: summary.id,
    character_id: characterId,
    name: summary.name || 'Untitled chat',
    metadata: {},
    created_at: summary.created_at,
    updated_at: summary.updated_at,
    message_count: summary.message_count,
  }
}

function normalizeTree(node: ApiTreeNode, characterId: string, summaries: Map<string, ChatSummary>): ChatTree {
  const summary = summaries.get(node.id)
  return {
    id: node.id,
    character_id: characterId,
    name: node.name || summary?.name || 'Untitled chat',
    metadata: {},
    created_at: node.created_at ?? summary?.created_at ?? 0,
    updated_at: node.updated_at ?? summary?.updated_at ?? 0,
    message_count: node.message_count ?? summary?.message_count,
    children: (node.children ?? []).map((child) => normalizeTree(child, characterId, summaries)),
  }
}

function collectIds(node: ChatTree, output: Set<string>): void {
  if (output.has(node.id)) return
  output.add(node.id)
  for (const child of node.children) collectIds(child, output)
}

async function loadCharacterForest(characterId: string): Promise<{ forest: ChatTree[]; count: number; partial: boolean }> {
  const summaries = await fetchJson<ChatSummary[]>(`/api/v1/chats/character-chats/${encodeURIComponent(characterId)}`)
  const summaryMap = new Map(summaries.map((chat) => [chat.id, chat]))
  if (!summaries.length) return { forest: [], count: 0, partial: false }

  const treeResults = await Promise.allSettled(
    summaries.map((chat) => fetchJson<ApiTreeNode>(`/api/v1/chats/${encodeURIComponent(chat.id)}/tree`)),
  )
  const roots = new Map<string, ChatTree>()
  let partial = false
  for (const result of treeResults) {
    if (result.status === 'fulfilled' && result.value?.id) {
      const tree = normalizeTree(result.value, characterId, summaryMap)
      roots.set(tree.id, tree)
    } else {
      partial = true
    }
  }

  const covered = new Set<string>()
  for (const root of roots.values()) collectIds(root, covered)
  for (const summary of summaries) {
    if (!covered.has(summary.id)) {
      const fallback = summaryRecord(summary, characterId) as ChatTree
      fallback.children = []
      roots.set(fallback.id, fallback)
    }
  }

  return {
    forest: [...roots.values()].sort((a, b) => b.updated_at - a.updated_at),
    count: summaries.length,
    partial,
  }
}

function relativeTime(timestamp: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp))
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(timestamp * 1000).toLocaleDateString()
}

export function setup(base: SpindleFrontendContext): () => void {
  const ctx = base as HostContext
  const disposers: Array<() => void> = []
  const initial = readActiveContext(ctx)
  let activeChatId = initial.chatId
  let activeCharacterId = initial.characterId
  let forest: ChatTree[] = []
  let allCount = 0
  let partialTrees = false
  let loading = false
  let error = ''
  let loadGeneration = 0
  const collapsedIds = new Set<string>()
  let renameEdit: { id: string; characterId: string | null; value: string; busy: boolean; error: string } | null = null
  let renameRevision = 0
  let destroyed = false
  const renamedNames = new Map<string, { name: string; revision: number }>()

  disposers.push(ctx.dom.addStyle(CSS))
  const tab = ctx.ui.registerDrawerTab({
    id: 'current-character-chats-v21',
    title: 'Current Character Chats',
    shortName: 'Chats',
    headerTitle: 'Character Chats',
    description: 'Browse every chat and branch for the current character',
    keywords: ['all chats', 'branch', 'tree', 'history', 'fork'],
    iconSvg: ICON,
  })
  disposers.push(() => tab.destroy())

  const panel = element('div', 'cct-panel')
  const tools = element('div', 'cct-tools')
  const search = element('input', 'cct-search')
  search.type = 'search'
  search.placeholder = 'Search this character’s chats…'
  const refresh = element('button', 'cct-refresh', 'Refresh')
  refresh.type = 'button'
  const toggleAll = element('button', 'cct-toggle-all', 'Collapse all')
  toggleAll.type = 'button'
  const summary = element('div', 'cct-summary')
  const list = element('div', 'cct-list')
  tools.append(search, toggleAll, refresh)
  panel.append(tools, summary, list)
  tab.root.appendChild(panel)

  const openChat = (chatId: string): void => {
    const surfaces = ctx.host?.surfaces
    if (!surfaces) {
      window.location.assign(`/chat/${encodeURIComponent(chatId)}`)
      return
    }
    const result = surfaces.invoke({ kind: 'route', id: '/chat/:chatId' }, { chatId })
    if (result instanceof Promise) void result.catch(() => window.location.assign(`/chat/${encodeURIComponent(chatId)}`))
  }

  const applyRenamedNames = (nodes: ChatTree[], since: number): void => {
    for (const node of nodes) {
      const rename = renamedNames.get(node.id)
      if (rename && rename.revision > since) node.name = rename.name
      applyRenamedNames(node.children, since)
    }
  }
  const saveRename = async (): Promise<void> => {
    const edit = renameEdit
    if (!edit || edit.busy) return
    const name = edit.value.trim()
    if (!name) { edit.error = 'Enter a chat name.'; render(); return }
    edit.busy = true; edit.error = ''; render()
    try {
      const result = await fetchJson<{ name?: string }>(`/api/v1/chats/${encodeURIComponent(edit.id)}`, 5000, { method: 'PUT', body: JSON.stringify({ name }) })
      if (destroyed) return
      const savedName = typeof result?.name === 'string' && result.name.trim() ? result.name : name
      renamedNames.set(edit.id, { name: savedName, revision: ++renameRevision })
      applyRenamedNames(forest, renameRevision - 1)
      if (renameEdit === edit) renameEdit = null
    } catch (reason) {
      if (destroyed) return
      if (renameEdit === edit) { edit.busy = false; edit.error = reason instanceof Error ? reason.message : 'Could not rename chat. Try again.' }
    }
    render()
  }

  const renderNode = (node: ChatTree): HTMLElement => {
    const wrap = element('div', 'cct-node-wrap')
    const row = element('div', 'cct-node')
    row.dataset.current = String(node.id === activeChatId)
    const hasChildren = node.children.length > 0
    const expanded = search.value.trim().length > 0 || !collapsedIds.has(node.id)
    if (hasChildren) {
      const branchToggle = element('button', 'cct-branch-toggle')
      branchToggle.type = 'button'
      branchToggle.setAttribute('aria-expanded', String(expanded))
      branchToggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} branches under ${node.name || 'Untitled chat'}`)
      branchToggle.title = expanded ? 'Collapse branches' : 'Expand branches'
      branchToggle.appendChild(element('span', 'cct-chevron', '›'))
      branchToggle.addEventListener('click', () => {
        if (collapsedIds.has(node.id)) collapsedIds.delete(node.id)
        else collapsedIds.add(node.id)
        render()
      })
      row.appendChild(branchToggle)
    } else {
      row.appendChild(element('span', 'cct-glyph', '●'))
    }

    const open = element('button', 'cct-open')
    open.type = 'button'
    open.addEventListener('click', () => openChat(node.id))
    const copy = element('span', 'cct-copy')
    copy.append(
      element('span', 'cct-name', node.name || 'Untitled chat'),
      element('span', 'cct-meta', `${typeof node.message_count === 'number' ? `${node.message_count} messages · ` : ''}${relativeTime(node.updated_at)}`),
    )
    open.appendChild(copy)
    if (node.id === activeChatId) open.appendChild(element('span', 'cct-here', 'Here'))
    row.appendChild(open)
    const rename = element('button', 'cct-rename', '✎')
    rename.type = 'button'; rename.title = 'Rename chat'
    rename.setAttribute('aria-label', `Rename ${node.name || 'Untitled chat'}`)
    rename.disabled = Boolean(renameEdit?.busy)
    rename.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation()
      renameEdit = { id: node.id, characterId: activeCharacterId, value: node.name || '', busy: false, error: '' }
      render()
      const input = list.querySelector<HTMLInputElement>('.cct-rename-input'); input?.focus(); input?.select()
    })
    row.appendChild(rename)
    if (renameEdit?.id === node.id && renameEdit.characterId === activeCharacterId) {
      const edit = renameEdit, editor = element('div', 'cct-rename-editor'), input = element('input', 'cct-rename-input')
      input.type = 'text'; input.value = edit.value; input.disabled = edit.busy
      input.setAttribute('aria-label', `New name for ${node.name || 'Untitled chat'}`)
      const save = element('button', 'cct-rename-save', edit.busy ? 'Saving…' : 'Save'), cancel = element('button', 'cct-rename-cancel', 'Cancel')
      save.type = cancel.type = 'button'; save.disabled = edit.busy || !edit.value.trim(); cancel.disabled = edit.busy
      input.addEventListener('input', () => { edit.value = input.value; save.disabled = edit.busy || !edit.value.trim() })
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void saveRename() }
        if (event.key === 'Escape' && !edit.busy) { event.preventDefault(); event.stopPropagation(); renameEdit = null; render() }
      })
      save.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); void saveRename() })
      cancel.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); renameEdit = null; render() })
      editor.append(input, save, cancel)
      if (edit.error) { const notice = element('div', 'cct-rename-error', edit.error); notice.setAttribute('role', 'alert'); editor.append(notice) }
      row.appendChild(editor)
    }
    wrap.appendChild(row)
    if (hasChildren && expanded) {
      const children = element('div', 'cct-children')
      for (const child of node.children) children.appendChild(renderNode(child))
      wrap.appendChild(children)
    }
    return wrap
  }

  const render = (): void => {
    refresh.disabled = loading
    const branchIds: string[] = []
    const collectBranchIds = (node: ChatTree): void => {
      if (node.children.length) branchIds.push(node.id)
      for (const child of node.children) collectBranchIds(child)
    }
    for (const root of forest) collectBranchIds(root)
    const allCollapsed = branchIds.length > 0 && branchIds.every((id) => collapsedIds.has(id))
    toggleAll.textContent = allCollapsed ? 'Expand all' : 'Collapse all'
    toggleAll.disabled = loading || branchIds.length === 0
    list.replaceChildren()
    if (loading) {
      summary.textContent = 'Character Chat Tree v2.3.0'
      list.appendChild(element('div', 'cct-empty', 'Contacting Lumiverse…'))
      return
    }
    if (error) {
      summary.textContent = 'Character Chat Tree v2.3.0'
      list.appendChild(element('div', 'cct-empty cct-error', `${error}. Press Refresh to try again.`))
      return
    }
    const filtered = filterForest(forest, search.value)
    const visible = filtered.reduce((total, root) => total + treeSize(root), 0)
    summary.textContent = search.value.trim()
      ? `${visible} of ${allCount} chats shown`
      : `${allCount} chats for this character${partialTrees ? ' · some branch trees unavailable' : ''} · v2.3.0`
    if (!filtered.length) {
      list.appendChild(element('div', 'cct-empty', allCount ? 'No chats match that search.' : 'No chats found for this character.'))
      return
    }
    for (const root of filtered) list.appendChild(renderNode(root))
  }

  const load = async (): Promise<void> => {
    const generation = ++loadGeneration
    const startedAtRenameRevision = renameRevision
    if (renameEdit && renameEdit.characterId !== activeCharacterId) renameEdit = null
    if (!activeCharacterId) {
      loading = false
      error = ''
      forest = []
      allCount = 0
      tab.setBadge(null)
      summary.textContent = 'Character Chat Tree v2.3.0'
      list.replaceChildren(element('div', 'cct-empty', 'Open a character chat first.'))
      return
    }
    const characterId = activeCharacterId
    loading = true
    error = ''
    render()
    try {
      const result = await loadCharacterForest(characterId)
      if (generation !== loadGeneration || characterId !== activeCharacterId) return
      forest = result.forest
      applyRenamedNames(forest, startedAtRenameRevision)
      allCount = result.count
      partialTrees = result.partial
      tab.setBadge(allCount ? String(allCount) : null)
    } catch (reason) {
      if (generation !== loadGeneration) return
      forest = []
      allCount = 0
      error = reason instanceof Error ? reason.message : 'Could not load character chats'
      tab.setBadge(null)
    } finally {
      if (generation === loadGeneration) {
        loading = false
        render()
      }
    }
  }

  search.addEventListener('input', render)
  toggleAll.addEventListener('click', () => {
    const branchIds: string[] = []
    const collectBranchIds = (node: ChatTree): void => {
      if (node.children.length) branchIds.push(node.id)
      for (const child of node.children) collectBranchIds(child)
    }
    for (const root of forest) collectBranchIds(root)
    if (branchIds.every((id) => collapsedIds.has(id))) collapsedIds.clear()
    else for (const id of branchIds) collapsedIds.add(id)
    render()
  })
  refresh.addEventListener('click', () => void load())
  disposers.push(tab.onActivate(() => {
    const current = readActiveContext(ctx)
    activeChatId = current.chatId
    if (current.characterId !== activeCharacterId) {
      activeCharacterId = current.characterId
      collapsedIds.clear()
      void load()
    } else render()
  }))

  if (ctx.state?.subscribe) {
    try {
      disposers.push(ctx.state.subscribe<ActiveChatState>('chat.active', (current) => {
        const characterChanged = current.characterId !== activeCharacterId
        activeChatId = current.chatId
        activeCharacterId = current.characterId
        if (characterChanged) {
          collapsedIds.clear()
          void load()
        }
        else render()
      }))
    } catch { /* older host */ }
  }
  for (const event of ['CHAT_CREATED', 'CHAT_DELETED'] as const) {
    disposers.push(ctx.events.on(event, () => void load()))
  }

  void load()
  return () => {
    destroyed = true
    loadGeneration += 1
    for (const dispose of disposers.reverse()) {
      try { dispose() } catch { /* best-effort teardown */ }
    }
  }
}


