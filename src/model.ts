export interface ChatRecord {
  id: string
  character_id: string | null
  name: string
  metadata: Record<string, unknown>
  created_at: number
  updated_at: number
  character_name?: string
  message_count?: number
}

export interface ChatTree extends ChatRecord {
  children: ChatTree[]
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function parentId(chat: ChatRecord): string | null {
  return stringValue(chat.metadata?.branched_from)
}

export function buildForest(chats: readonly ChatRecord[]): ChatTree[] {
  const nodes = new Map<string, ChatTree>()
  for (const chat of chats) nodes.set(chat.id, { ...chat, children: [] })

  const roots: ChatTree[] = []
  for (const node of nodes.values()) {
    const parent = parentId(node)
    if (parent && parent !== node.id && nodes.has(parent)) nodes.get(parent)!.children.push(node)
    else roots.push(node)
  }

  // Malformed imported data can contain a parent cycle, which otherwise has no
  // root and would disappear. Promote one node from each unreachable component;
  // sortChildren then clips the edge that points back to an ancestor.
  const reachable = new Set<string>()
  const markReachable = (node: ChatTree): void => {
    if (reachable.has(node.id)) return
    reachable.add(node.id)
    for (const child of node.children) markReachable(child)
  }
  for (const root of roots) markReachable(root)
  for (const node of nodes.values()) {
    if (!reachable.has(node.id)) {
      roots.push(node)
      markReachable(node)
    }
  }

  const sortChildren = (node: ChatTree, ancestors = new Set<string>()): void => {
    if (ancestors.has(node.id)) return
    const nextAncestors = new Set(ancestors).add(node.id)
    node.children = node.children
      .filter((child) => !nextAncestors.has(child.id))
      .sort((a, b) => a.created_at - b.created_at || a.name.localeCompare(b.name))
    for (const child of node.children) sortChildren(child, nextAncestors)
  }

  roots.sort((a, b) => b.updated_at - a.updated_at || a.name.localeCompare(b.name))
  for (const root of roots) sortChildren(root)
  return roots
}

export function treeSize(node: ChatTree): number {
  return 1 + node.children.reduce((total, child) => total + treeSize(child), 0)
}

export function filterForest(forest: readonly ChatTree[], rawQuery: string): ChatTree[] {
  const query = rawQuery.trim().toLocaleLowerCase()
  if (!query) return [...forest]

  const visit = (node: ChatTree): ChatTree | null => {
    const children = node.children.map(visit).filter((child): child is ChatTree => child !== null)
    const ownText = `${node.name} ${node.character_name ?? ''}`.toLocaleLowerCase()
    return ownText.includes(query) || children.length ? { ...node, children } : null
  }

  return forest.map(visit).filter((node): node is ChatTree => node !== null)
}

export function mergeEnrichment(all: readonly ChatRecord[], recent: readonly Partial<ChatRecord>[]): ChatRecord[] {
  const byId = new Map(recent.filter((chat) => chat.id).map((chat) => [chat.id!, chat]))
  const characterNames = new Map<string, string>()
  for (const chat of recent) {
    if (chat.character_id && chat.character_name) characterNames.set(chat.character_id, chat.character_name)
  }
  return all.map((chat) => {
    const extra = byId.get(chat.id)
    return {
      ...chat,
      ...(extra?.character_name ? { character_name: extra.character_name } : {}),
      ...(typeof extra?.message_count === 'number' ? { message_count: extra.message_count } : {}),
      character_name: extra?.character_name
        ?? (chat.character_id ? characterNames.get(chat.character_id) : undefined),
    }
  })
}

