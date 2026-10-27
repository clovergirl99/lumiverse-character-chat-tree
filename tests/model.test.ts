import { describe, expect, test } from 'bun:test'
import { buildForest, filterForest, mergeEnrichment, treeSize, type ChatRecord } from '../src/model'

const chat = (id: string, parent?: string, extra: Partial<ChatRecord> = {}): ChatRecord => ({
  id,
  character_id: 'character-1',
  name: id,
  metadata: parent ? { branched_from: parent } : {},
  created_at: id.charCodeAt(0),
  updated_at: id.charCodeAt(0),
  ...extra,
})

describe('buildForest', () => {
  test('shows ordinary chats even when none of them has a branch', () => {
    const forest = buildForest([chat('a'), chat('b'), chat('c')])
    expect(forest.map((node) => node.id)).toEqual(['c', 'b', 'a'])
    expect(forest.every((node) => node.children.length === 0)).toBeTrue()
  })

  test('builds every conversation tree and keeps orphaned branches visible', () => {
    const forest = buildForest([chat('a'), chat('b', 'a'), chat('c', 'b'), chat('x', 'missing')])
    expect(forest.map((node) => node.id)).toEqual(['x', 'a'])
    expect(forest[1]!.children[0]!.id).toBe('b')
    expect(forest[1]!.children[0]!.children[0]!.id).toBe('c')
    expect(forest.reduce((sum, root) => sum + treeSize(root), 0)).toBe(4)
  })

  test('does not recurse through a branch cycle', () => {
    const forest = buildForest([chat('a', 'b'), chat('b', 'a'), chat('c')])
    expect(forest.reduce((sum, root) => sum + treeSize(root), 0)).toBe(3)
  })
})

test('filterForest preserves ancestors of a matching branch', () => {
  const forest = buildForest([chat('a'), chat('b', 'a', { name: 'Special branch' })])
  const filtered = filterForest(forest, 'special')
  expect(filtered[0]?.id).toBe('a')
  expect(filtered[0]?.children[0]?.id).toBe('b')
})

test('mergeEnrichment fills visible counts and character names onto hidden chats', () => {
  const result = mergeEnrichment(
    [chat('a'), chat('b')],
    [{ id: 'a', character_id: 'character-1', character_name: 'Alice', message_count: 9 }],
  )
  expect(result[0]?.message_count).toBe(9)
  expect(result[1]?.character_name).toBe('Alice')
})

