import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runtime, json, html, tokenPage } from './fantia-runtime.mjs';

const fixture = JSON.parse(fs.readFileSync(new URL('./post-photo.json', import.meta.url)));
const plain = x => JSON.parse(JSON.stringify(x));

test('imports using the Venera class convention and rejects foreign links', () => {
    const { source: s } = runtime();
    assert.equal(s.key, 'fantia_personal');
    assert.match(s.key, /^[a-zA-Z0-9_]+$/);
    assert.equal(s.comic.link.linkToId('https://fantia.jp/posts/123?x=1'), '123');
    assert.equal(s.comic.link.linkToId('https://fantia.jp.evil/posts/123'), null);
    assert.equal(s.absolute('https://fantia.jp@evil.example/x'), '');
    assert.equal(s.absolute('//cc.fantia.jp/uploads/x.png?Signature=a'), 'https://cc.fantia.jp/uploads/x.png?Signature=a');
    assert.equal(s.absolute('https://notfantia.jp/x'), '');
    assert.equal(s.absolute('data:image/png,x'), '');
});

test('post API preserves signed URLs and exposes only visible chapters', async () => {
    const r = runtime(async m => m.url.includes('/api/') ? json(fixture) : html(tokenPage));
    const d = await r.source.comic.loadInfo('1234567');
    assert.deepEqual(plain(d.chapters), { content_42: '测试图集' });
    assert.match(d.description, /当前账号不可读/);
    const ep = await r.source.comic.loadEp('1234567', 'content_42');
    assert.deepEqual(plain(ep.images), fixture.post.post_contents[0].post_content_photos.map(p => p.url.original));
    await assert.rejects(r.source.comic.loadEp('1234567', 'content_7554168'), /无此内容的阅读权限/);
    assert.equal(r.calls.find(c => c.url.includes('/api/')).headers['X-CSRF-Token'], 'test-csrf');
    assert.equal(r.docs.size, 0);
});

test('reader rechecks permissions after details; revoked chapter cannot be read', async () => {
    let revoked = false;
    const r = runtime(async m => {
        if (!m.url.includes('/api/')) return html(tokenPage);
        const p = structuredClone(fixture);
        if (revoked) p.post.post_contents[0].visible_status = 'catchable';
        return json(p);
    });
    await r.source.comic.loadInfo('1234567'); revoked = true;
    await assert.rejects(r.source.comic.loadEp('1234567', 'content_42'), /无此内容的阅读权限/);
});

test('blog image order, duplicates, attachments, and inaccessible blocks', () => {
    const { source: s } = runtime();
    const blog = { visible_status: 'visible', category: 'blog', comment: JSON.stringify({ ops: [
        { insert: 'Text' }, { insert: { fantiaImage: { original_url: '/uploads/a.png' } } },
        { insert: { image: 'https://cc.fantia.jp/b.jpg?Signature=x' } },
        { insert: { image: 'https://cc.fantia.jp/b.jpg?Signature=x' } },
        { insert: { image: 'https://evil.example/track.png' } }
    ] }) };
    assert.deepEqual(plain(s.contentImages(blog)), ['https://fantia.jp/uploads/a.png', 'https://cc.fantia.jp/b.jpg?Signature=x']);
    assert.deepEqual(plain(s.contentImages({ ...blog, visible_status: 'catchable' })), []);
    assert.deepEqual(plain(s.contentImages({ ...blog, comment: 'not JSON' })), []);
    assert.deepEqual(plain(s.contentImages({ visible_status: 'visible', category: 'file', filename: 'book.zip', download_uri: '/posts/1/download/2' })), []);
    assert.deepEqual(plain(s.contentImages({ visible_status: 'visible', category: 'file', filename: 'page.PNG', download_uri: '/posts/1/download/2' })), ['https://fantia.jp/posts/1/download/2']);
});

test('timeline pagination follows has_next and reports schema changes', async () => {
    let body = { posts: [fixture.post], has_next: true };
    const r = runtime(async m => m.url.includes('/api/') ? json(body) : html(tokenPage));
    assert.equal((await r.source.explore[0].load(3)).maxPage, 4);
    body.has_next = false;
    assert.equal((await r.source.explore[0].load(4)).maxPage, 4);
    body = { unexpected: [] };
    await assert.rejects(r.source.timeline(1), /动态接口格式变化/);
});

test('author HTML parser reads lazy images, deduplicates cards, and paginates', async () => {
    const page = tokenPage.replace('</body>', `<h1 class="fanclub-name">Example &amp; Creator</h1>
      <div class="post"><a class="link-block" href="/posts/100" title="A &amp; B"></a><div class="post-thumbnail"><img src="/loading.png" data-src="https://c.fantia.jp/uploads/cover.jpg"></div></div>
      <div class="post"><a class="link-block" href="/posts/100"></a></div>
      <a rel="next" href="?page=2">next</a></body>`);
    const r = runtime(async () => html(page));
    const result = await r.source.search.load('https://fantia.jp/fanclubs/1', [], 1);
    assert.equal(result.comics.length, 1);
    assert.equal(result.comics[0].title, 'A & B');
    assert.equal(result.comics[0].cover, 'https://c.fantia.jp/uploads/cover.jpg');
    assert.equal(result.maxPage, 2);
    assert.equal(r.data.fanclubNames['1'], 'Example & Creator');
    assert.equal(r.docs.size, 0);
});

test('following synchronization produces compatible category navigation', async () => {
    const r = runtime(async m => m.url.endsWith('/me/fanclubs') ? json({ fanclub_ids: [1, 2, 2, 'bad'] }) : m.url.endsWith('/me') ? json({ current_user: { id: 10 } }) : html(tokenPage));
    await r.source.refreshFollowing();
    const cats = r.source.category.parts[0].loader();
    assert.equal(cats.length, 2);
    assert.deepEqual(plain(cats[0].target), { page: 'search', attributes: { text: 'fanclub:1' } });
    assert.equal(r.calls.every(m => m.http_method === 'GET'), true);
});

test('cookie validation rolls back failures and clears previous account data on success', async () => {
    let valid = false;
    const r = runtime(async m => m.url.endsWith('/me') ? valid ? json({ id: 10 }) : { status: 401, body: '' } : html(tokenPage));
    const login = r.source.account.loginWithCookies.validate;
    assert.equal(await login(['_session_id=wrong-format']), false);
    assert.equal(await login(['expired-session']), false);
    assert.equal(r.cookies.length, 0);
    valid = true;
    r.data.followedFanclubs = ['99'];
    assert.equal(await login(['valid-test-session']), true);
    assert.equal(r.cookies[0].name, '_session_id');
    assert.equal(r.data.followedFanclubs, undefined);
    valid = false;
    assert.equal(await login(['invalid-new-session']), false);
    assert.equal(r.cookies[0].value, 'valid-test-session');
    r.source.account.logout();
    assert.equal(r.cookies.length, 0);
    assert.equal(JSON.stringify(r.data).includes('session'), false);
});

test('HTTP errors, HTML challenge, and unsupported searches have useful errors', async () => {
    for (const [status, pattern] of [[401,/登录已过期/], [403,/拒绝访问/], [404,/不存在/], [429,/过于频繁/], [500,/HTTP 500/]]) {
        const r = runtime(async () => ({ status, body: '' }));
        await assert.rejects(r.source.request('/api/v1/me', true), pattern);
    }
    const r = runtime(async () => html('<html>challenge</html>'));
    await assert.rejects(r.source.request('/api/v1/me', true), /返回网页而非 API 数据/);
    await assert.rejects(r.source.search.load('a keyword', [], 1), /暂不支持关键词搜索/);
    await assert.rejects(r.source.search.load('https://evil.example/posts/1', [], 1), /请粘贴/);
});

test('image resolver uses Fantia referer and resolves show_original_uri', async () => {
    const r = runtime(async () => html('<html><img src="https://cc.fantia.jp/uploads/photo.png?Signature=x"></html>'));
    const image = await r.source.comic.onImageLoad('https://fantia.jp/posts/123/post_content_photo/42', '123');
    assert.equal(image.url, 'https://cc.fantia.jp/uploads/photo.png?Signature=x');
    assert.equal(image.headers.Referer, 'https://fantia.jp/posts/123');
    assert.equal(image.headers.Cookie, undefined);
    assert.equal(r.docs.size, 0);
    await assert.rejects(r.source.comic.onImageLoad('https://evil.example/photo.png', '123'), /不属于 Fantia/);
});

test('optional live public author snapshot parses with the same selectors', { skip: !process.env.FANTIA_PUBLIC_HTML }, async () => {
    const r = runtime(async () => html(fs.readFileSync(process.env.FANTIA_PUBLIC_HTML, 'utf8')));
    const result = await r.source.fanclubPosts('1', 1);
    assert.ok(result.comics.length > 0);
    assert.equal(r.docs.size, 0);
});

test('optional live public post snapshot matches the API schema', { skip: !process.env.FANTIA_PUBLIC_POST }, async () => {
    const post = JSON.parse(fs.readFileSync(process.env.FANTIA_PUBLIC_POST, 'utf8')).post;
    const { source } = runtime();
    assert.equal(source.summary(post).id, String(post.id));
    assert.ok(source.details(post).title);
});
