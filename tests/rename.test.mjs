import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as tick } from 'node:timers/promises';
const { parseHTML } = createRequire(import.meta.url)('linkedom');
const code = readFileSync(new URL('../frontend.js', import.meta.url), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function harness() {
  const { document, window } = parseHTML('<html><body><div id="tab"></div></body></html>');
  window.HTMLInputElement.prototype.select = () => {};
  window.setTimeout = setTimeout; window.clearTimeout = clearTimeout;
  const names = { current: 'Current chat', other: 'Inactive branch' }, writes = [], routes = [], events = {};
  let heldWrite, fail = false, heldRead, heldTrees;
  let active = { chatId: 'current', characterId: 'character' }, subscriber;
  const root = document.getElementById('tab');
  const tree = () => ({ id: 'current', name: names.current, created_at: 1, updated_at: 2, message_count: 4, children: [{ id: 'other', name: names.other, created_at: 2, updated_at: 3, message_count: 2, children: [] }] });
  const response = value => ({ ok: true, json: async () => structuredClone(value) });
  const ctx = {
    dom: { addStyle: () => () => {} },
    ui: { registerDrawerTab: () => ({ root, destroy: () => {}, setBadge: () => {}, onActivate: () => () => {} }) },
    state: { get: () => active, subscribe: (_, handler) => { subscriber = handler; return () => {}; } },
    events: { on: (event, handler) => { events[event] = handler; return () => {}; } },
    host: { surfaces: { invoke: (_, args) => { routes.push(args.chatId); } } }
  };
  const context = { document, window, console, AbortController, DOMException, ctx,
    fetch: async (path, options) => {
      if (options.method === 'PUT') {
        writes.push({ path, options, name: JSON.parse(options.body).name });
        if (heldWrite) { const wait = heldWrite; heldWrite = undefined; await wait.promise; }
        if (fail) return { ok: false, status: 500 };
        const id = decodeURIComponent(path.split('/').at(-1)); names[id] = JSON.parse(options.body).name;
        return response({ id, name: names[id] });
      }
      if (path.includes('/character-chats/')) {
        if (heldRead) { const wait = heldRead; heldRead = undefined; return wait.promise; }
        return response(Object.entries(names).map(([id, name]) => ({ id, name, created_at: 1, updated_at: 2, message_count: 2 })));
      }
      if (path.endsWith('/tree')) { const snapshot = tree(); if (heldTrees) await heldTrees.promise; return response(snapshot); }
      throw new Error('Unexpected request: ' + path);
    }
  };
  runInNewContext(code.replace(/export\s*\{\s*setup\s*\};?\s*$/, '') + '\nglobalThis.dispose = setup(ctx);', context);
  await tick(); await tick();
  const click = element => { assert.ok(element, 'control exists'); element.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })); };
  const fill = value => { const input = root.querySelector('.cct-rename-input'); input.value = value; input.dispatchEvent(new window.Event('input', { bubbles: true })); };
  const key = value => { const event = new window.Event('keydown', { bubbles: true, cancelable: true }); event.key = value; root.querySelector('.cct-rename-input').dispatchEvent(event); };
  const edit = name => click([...root.querySelectorAll('.cct-rename')].find(button => button.getAttribute('aria-label') === 'Rename ' + name));
  return { root, click, fill, key, edit, writes, routes, names, events,
    holdWrite() { const request = deferred(); heldWrite = request; return request; },
    failWrite(value) { fail = value; },
    holdRead() { const request = deferred(); heldRead = request; return { resolve: value => request.resolve(response(value)) }; },
    holdTrees() { const request = deferred(); heldTrees = request; return { resolve() { heldTrees = undefined; request.resolve(); } }; },
    switchCharacter() { active = { chatId: 'different', characterId: 'different-character' }; subscriber(active); },
    dispose: context.dispose
  };
}
test('rename an inactive branch without opening it or changing the active marker', async () => {
  const h = await harness(); h.edit('Inactive branch'); h.fill('  New branch name  ');
  h.click(h.root.querySelector('.cct-rename-save')); await tick();
  assert.equal(h.writes[0].path, '/api/v1/chats/other');
  assert.equal(h.writes[0].options.method, 'PUT'); assert.equal(h.writes[0].name, 'New branch name');
  assert.deepEqual(h.routes, []);
  assert.equal(h.root.querySelector('[data-current="true"] .cct-name').textContent, 'Current chat');
  assert.ok([...h.root.querySelectorAll('.cct-name')].some(item => item.textContent === 'New branch name'));
  h.events.CHAT_CREATED(); await tick(); await tick();
  assert.ok([...h.root.querySelectorAll('.cct-name')].some(item => item.textContent === 'New branch name'));
});
test('Cancel and Escape keep the old name and make no write request', async () => {
  const h = await harness(); h.edit('Inactive branch'); h.fill('Discard'); h.click(h.root.querySelector('.cct-rename-cancel'));
  assert.equal(h.root.querySelector('.cct-rename-input'), null);
  h.edit('Inactive branch'); h.fill('Discard again'); h.key('Escape');
  assert.equal(h.writes.length, 0); assert.equal(h.names.other, 'Inactive branch');
});
test('Enter saves a name and repeated saves are blocked while waiting', async () => {
  const h = await harness(), request = h.holdWrite(); h.edit('Inactive branch'); h.fill('Renamed'); h.key('Enter');
  assert.equal(h.root.querySelector('.cct-rename-save').disabled, true);
  assert.equal(h.root.querySelector('.cct-rename-input').disabled, true);
  assert.equal(h.writes.length, 1); request.resolve(); await tick();
  assert.equal(h.names.other, 'Renamed');
});
test('blank names are rejected without sending a request', async () => {
  const h = await harness(); h.edit('Inactive branch'); h.fill('  ');
  assert.equal(h.root.querySelector('.cct-rename-save').disabled, true); h.key('Enter');
  assert.equal(h.writes.length, 0); assert.match(h.root.querySelector('[role="alert"]').textContent, /Enter a chat name/);
});
test('failed saves retain the draft, report the error, and can be retried', async () => {
  const h = await harness(); h.failWrite(true); h.edit('Inactive branch'); h.fill('Retry name'); h.key('Enter'); await tick();
  assert.equal(h.names.other, 'Inactive branch'); assert.equal(h.root.querySelector('.cct-rename-input').value, 'Retry name');
  assert.match(h.root.querySelector('[role="alert"]').textContent, /500/);
  h.failWrite(false); h.key('Enter'); await tick(); assert.equal(h.names.other, 'Retry name');
});
test('root chats can also be renamed and user text never becomes HTML', async () => {
  const h = await harness(); h.edit('Current chat'); h.fill('<img src=x onerror=alert(1)>'); h.key('Enter'); await tick();
  assert.equal(h.names.current, '<img src=x onerror=alert(1)>'); assert.equal(h.root.querySelector('img'), null); assert.deepEqual(h.routes, []);
});
test('an ordinary open click still navigates, while a character switch safely closes the rename editor', async () => {
  const h = await harness(); h.click([...h.root.querySelectorAll('.cct-open')].find(button => button.textContent.includes('Inactive branch')));
  assert.deepEqual(h.routes, ['other']); h.edit('Inactive branch'); h.fill('Pending'); h.switchCharacter(); await tick(); await tick();
  assert.equal(h.root.querySelector('.cct-rename-input'), null); assert.equal(h.writes.length, 0);
});
test('a refresh started during a save cannot restore an older name after the save succeeds', async () => {
  const h = await harness(), write = h.holdWrite(); h.edit('Inactive branch'); h.fill('Latest'); h.key('Enter');
  const trees = h.holdTrees(); h.events.CHAT_CREATED(); await tick();
  write.resolve(); await tick(); trees.resolve(); await tick(); await tick();
  assert.ok([...h.root.querySelectorAll('.cct-name')].some(item => item.textContent === 'Latest'));
  assert.deepEqual(h.routes, []);
});
test('renaming another chat does not undo a name subsequently changed elsewhere', async () => {
  const h = await harness(); h.edit('Current chat'); h.fill('First rename'); h.key('Enter'); await tick();
  h.names.current = 'Changed elsewhere'; h.events.CHAT_CREATED(); await tick(); await tick();
  h.edit('Inactive branch'); h.fill('Other rename'); h.key('Enter'); await tick();
  assert.equal(h.root.querySelector('[data-current="true"] .cct-name').textContent, 'Changed elsewhere');
});
export { harness };

