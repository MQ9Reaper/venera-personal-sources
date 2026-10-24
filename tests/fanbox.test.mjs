import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { runtime, json } from './fanbox-runtime.mjs';

const plain = x => JSON.parse(JSON.stringify(x));
const image = n => ({ id: String(n), originalUrl: 'https://downloads.fanbox.cc/images/post/' + n + '.png?signature=test', extension: 'png' });
const post = (extra = {}) => ({
    id: '123', creatorId: 'example', title: 'Example comic', type: 'image',
    user: { name: 'Creator' }, isRestricted: false, feeRequired: 500,
    publishedDatetime: '2026-10-24T12:00:00+09:00',
    coverImageUrl: 'https://pixiv.pximg.net/fanbox/cover.jpg',
    body: { images: [image(2), image(1)], text: 'Test description' }, ...extra
});

test('Venera source metadata and source-specific key', () => {
    const { source: s } = runtime();
    assert.equal(s.key, 'fanbox_personal');
    assert.equal(s.url, 'https://raw.githubusercontent.com/MQ9Reaper/venera-personal-sources/main/fanbox.js');
    assert.equal(s.explore[0].type, 'multiPageComicList');
    assert.equal(typeof s.explore[0].loadNext, 'function');
});

test('accepts both creator URL styles, numeric posts and creator IDs', () => {
    const { source: s } = runtime();
    for (const url of ['https://example.fanbox.cc/posts/123', 'https://www.fanbox.cc/@example/posts/123?x=1', '123']) {
        assert.equal(s.parseInput(url).postId, '123');
    }
    for (const url of ['https://example.fanbox.cc/', 'https://www.fanbox.cc/@example', '@example', 'creator:example']) {
        assert.equal(s.parseInput(url).creatorId, 'example');
    }
    for (const url of ['https://fanbox.cc.evil/@example', 'https://api.fanbox.cc/', 'a title', 'https://example.fanbox.cc@evil.test/posts/123']) {
        assert.equal(s.parseInput(url), null);
    }
});

test('API sends required headers and preserves signed images', async () => {
    const r = runtime(async () => json({ body: { post: post() } }));
    const info = await r.source.comic.loadInfo('123');
    assert.deepEqual(plain(info.chapters), { cover: '公开封面／预览', body: '正文图片' });
    assert.equal(info.url, 'https://www.fanbox.cc/@example/posts/123');
    const ep = await r.source.comic.loadEp('123', 'body');
    assert.deepEqual(plain(ep.images), [image(2).originalUrl, image(1).originalUrl]);
    assert.equal(r.calls[0].headers.Origin, 'https://www.fanbox.cc');
    assert.equal(r.calls[0].headers.Referer, 'https://www.fanbox.cc/');
    assert.ok(r.calls.every(c => c.http_method === 'GET'));
});

test('supports old unwrapped and new wrapped post.info envelopes', async () => {
    for (const body of [post(), { post: post() }]) {
        const r = runtime(async () => json({ body }));
        assert.equal((await r.source.post('123')).id, '123');
    }
    const r = runtime(async () => json({ body: post({ id: '999' }) }));
    await assert.rejects(r.source.post('123'), /格式变化/);
});

test('restricted bodies are never read, even if the server includes image URLs', async () => {
    const p = post({ isRestricted: true });
    const r = runtime(async () => json({ body: p }));
    const info = await r.source.comic.loadInfo('123');
    assert.deepEqual(plain(info.chapters), { cover: '公开封面／预览' });
    assert.match(info.description, /无法读取正文/);
    await assert.rejects(r.source.comic.loadEp('123', 'body'), /确认支援权限/);
    assert.deepEqual(plain(r.source.images(post({ body: null }))), []);
});

test('opening a chapter fetches fresh permission and signed URLs', async () => {
    let p = post();
    const r = runtime(async () => json({ body: p }));
    await r.source.comic.loadInfo('123');
    p = post({ isRestricted: true, body: null });
    await assert.rejects(r.source.comic.loadEp('123', 'body'), /确认支援权限/);
    assert.equal(r.calls.length, 2);
});

test('article block order overrides map order; unreferenced images are ignored', () => {
    const { source: s } = runtime();
    const p = post({ type: 'article', body: {
        blocks: [{ type: 'image', imageId: 'b' }, { type: 'p', text: 'hello' }, { type: 'file', fileId: 'f' }, { type: 'image', imageId: 'a' }, { type: 'image', imageId: 'b' }],
        imageMap: { a: image(1), b: image(2), unused: image(99) },
        fileMap: { f: { extension: 'png', url: image(3).originalUrl } }
    } });
    assert.deepEqual(plain(s.images(p)), [image(2).originalUrl, image(3).originalUrl, image(1).originalUrl]);
    assert.match(s.details(p).description, /hello/);
});

test('ZIP, PDF and video files do not become reader pages', () => {
    const { source: s } = runtime();
    const p = post({ type: 'file', body: { files: ['zip', 'pdf', 'mp4', 'jpg'].map((extension, i) => ({ extension, url: image(i).originalUrl })) } });
    assert.deepEqual(plain(s.images(p)), [image(3).originalUrl]);
});

test('legacy HTML images are filtered and HTML resources disposed', () => {
    const r = runtime();
    const p = post({ body: { html: '<a href="https://downloads.fanbox.cc/a.png">a</a><img data-src-original="https://pixiv.pximg.net/b.jpg"><a href="https://evil.test/c.png">bad</a>' } });
    assert.deepEqual(plain(r.source.images(p)), ['https://downloads.fanbox.cc/a.png', 'https://pixiv.pximg.net/b.jpg']);
    assert.equal(r.docs.size, 0);
});

test('feed follows service cursors and rejects another host or endpoint', async () => {
    let nextUrl = 'https://api.fanbox.cc/post.listHome?limit=20&maxId=123';
    const r = runtime(async () => json({ body: { items: [post()], nextUrl } }));
    assert.equal((await r.source.explore[0].loadNext(null)).next, nextUrl);
    nextUrl = null;
    assert.equal((await r.source.explore[0].loadNext('https://api.fanbox.cc/post.listHome?limit=20&maxId=123')).next, null);
    await assert.rejects(r.source.feed('home', 'https://evil.test/post.listHome'), /不受支持/);
    await assert.rejects(r.source.feed('home', 'https://api.fanbox.cc/post.listSupporting'), /不受支持/);
    nextUrl = 'https://api.fanbox.cc/post.listHome?limit=20';
    await assert.rejects(r.source.feed('home', null), /重复/);
});

test('creator pagination accepts old arrays and new wrappers, caching cursor pages', async () => {
    for (const wrapped of [true, false]) {
        let pagesRequested = 0;
        const urls = [1, 2].map(n => 'https://api.fanbox.cc/post.listCreator?creatorId=example&page=' + n);
        const r = runtime(async m => {
            if (m.url.includes('post.paginateCreator')) { pagesRequested++; return json({ body: wrapped ? { pageUrls: urls } : urls }); }
            return json({ body: wrapped ? { posts: [post()] } : [post()] });
        });
        assert.equal((await r.source.search.load('@example', [], 1)).maxPage, 2);
        assert.equal((await r.source.search.load('@example', [], 2)).comics.length, 1);
        assert.equal(pagesRequested, 1);
        assert.equal((await r.source.creatorPosts('example', 3)).comics.length, 0);
    }
});

test('following and supported creators merge into compatible navigation targets', async () => {
    const r = runtime(async m => {
        if (m.url.includes('user.countUnreadMessages')) return json({ body: 0 });
        if (m.url.includes('creator.listFollowing')) return json({ body: { creators: [
            { creatorId: 'example', user: { name: 'A' } }, { creatorId: 'other', user: { name: 'B' } }
        ] } });
        return json({ body: { plans: [{ creatorId: 'example', user: { name: 'A' } }] } });
    });
    await r.source.syncCreators();
    assert.equal(r.data.creators.length, 2);
    assert.deepEqual(plain(r.source.categories(true)[0].target), { page: 'search', attributes: { text: 'creator:example' } });
    assert.equal(r.source.categories(false)[0].label, 'B');
});

test('a failed creator sync keeps the previous cache', async () => {
    const r = runtime(async m => m.url.includes('user.countUnreadMessages') ? json({ body: 0 }) : m.url.includes('creator.listFollowing') ? json({ body: [] }) : { status: 403, body: '' });
    r.data.creators = [{ id: 'previous' }];
    await assert.rejects(r.source.syncCreators(), /拒绝访问/);
    assert.equal(r.data.creators[0].id, 'previous');
});

test('cookie login validates the API; failure restores previous cookies', async () => {
    let valid = true;
    const r = runtime(async () => valid ? json({ body: 0 }) : { status: 400, body: '' });
    const login = r.source.account.loginWithCookies.validate;
    assert.equal(await login(['FANBOXSESSID=bad']), false);
    r.data.creators = [{ id: 'old-account' }];
    assert.equal(await login(['test-session']), true);
    assert.equal(r.data.creators, undefined);
    valid = false;
    assert.equal(await login(['wrong-session']), false);
    assert.equal(r.cookies.find(c => c.name === 'FANBOXSESSID').value, 'test-session');
    r.source.account.logout();
    assert.equal(r.cookies.length, 0);
    assert.equal(JSON.stringify(r.data).includes('session'), false);
});

test('imports host-only WebView session for API/downloads, never to pximg', async () => {
    const r = runtime(async (m, cookies) => {
        assert.ok(cookies.some(c => c.name === 'FANBOXSESSID')); return json({ body: 0 });
    });
    vm.runInContext('Network.setCookies("https://www.fanbox.cc/", [new Cookie({name:"FANBOXSESSID",value:"test-host-session",domain:"www.fanbox.cc"})])', r.context);
    await r.source.checkAuth();
    const forPximg = vm.runInContext('Network.getCookies("https://pixiv.pximg.net/")', r.context);
    assert.equal(forPximg.length, 0);
    assert.equal(r.cookies.find(c => c.domain === '.fanbox.cc').value, 'test-host-session');
});

test('manual login replaces host-only sessions instead of validating the previous account', async () => {
    const r = runtime(async (m, cookies) => {
        const sessions = cookies.filter(c => c.name === 'FANBOXSESSID');
        assert.equal(sessions.length, 1);
        assert.equal(sessions[0].value, 'new-account');
        return json({ body: 0 });
    });
    vm.runInContext('Network.setCookies("https://www.fanbox.cc/", [new Cookie({name:"FANBOXSESSID",value:"old-account",domain:"www.fanbox.cc"})])', r.context);
    assert.equal(await r.source.account.loginWithCookies.validate(['new-account']), true);
});

test('an existing API session is preserved instead of replaced by a stale host-only cookie', async () => {
    const r = runtime(async (m, cookies) => {
        assert.equal(cookies.find(c => c.name === 'FANBOXSESSID').value, 'rotated-api-session');
        return json({ body: 0 });
    });
    vm.runInContext('Network.setCookies("https://www.fanbox.cc/", [new Cookie({name:"FANBOXSESSID",value:"older-session",domain:"www.fanbox.cc"})]); Network.setCookies("https://api.fanbox.cc/", [new Cookie({name:"FANBOXSESSID",value:"rotated-api-session",domain:"api.fanbox.cc"})]);', r.context);
    await r.source.checkAuth();
});

test('WebView only completes an auth return, and does not claim API validation', () => {
    const r = runtime(), w = r.source.account.loginWithWebview;
    assert.equal(w.checkStatus('https://www.fanbox.cc/'), false);
    assert.equal(w.checkStatus('https://www.fanbox.cc/auth/start'), false);
    assert.equal(w.checkStatus('https://accounts.pixiv.net/login'), false);
    assert.equal(w.checkStatus('https://evil.test/'), false);
    assert.equal(w.checkStatus('https://www.fanbox.cc/'), true);
    w.onLoginSuccess();
    assert.equal(w.checkStatus('https://www.fanbox.cc/'), false);
    assert.match(r.messages.at(-1).message, /检查登录状态/);
});

test('untrusted media and API URLs are rejected without making a request', async () => {
    const r = runtime();
    for (const url of ['https://api.fanbox.cc.evil/post.info?postId=1', 'https://api.fanbox.cc@evil.test/post.info', 'https://api.fanbox.cc/post.delete', '//evil.test/post.info']) {
        await assert.rejects(r.source.api(url), /不受支持/);
    }
    for (const url of ['https://evil.test/a.jpg', 'https://downloads.fanbox.cc.evil/a.png', 'javascript:alert(1)', 'https://pixiv.pximg.net@evil.test/a.jpg']) {
        await assert.rejects(r.source.comic.onImageLoad(url), /不支持/);
    }
    assert.equal(r.calls.length, 0);
    const config = await r.source.comic.onImageLoad(image(1).originalUrl);
    assert.equal(config.headers.Referer, 'https://www.fanbox.cc/');
    assert.equal(config.headers.Cookie, undefined);
});

test('errors are actionable and never echo response bodies or cookies', async () => {
    for (const [status, pattern] of [[400, /会话无效/], [401, /会话无效/], [403, /拒绝访问/], [404, /不存在/], [429, /过于频繁/]]) {
        const r = runtime(async () => ({ status, body: 'sensitive-marker' }));
        await assert.rejects(r.source.checkAuth(), pattern);
    }
    const r = runtime(async () => ({ status: 200, body: '<html>challenge</html>' }));
    await assert.rejects(r.source.checkAuth(), /返回网页/);
});

test('optional live public post response matches the detail/image schema', { skip: !process.env.FANBOX_PUBLIC_POST }, () => {
    const data = JSON.parse(fs.readFileSync(process.env.FANBOX_PUBLIC_POST));
    const p = data.body.post || data.body;
    const { source } = runtime();
    assert.ok(source.details(p).title);
    assert.ok(source.images(p).length > 0);
});
