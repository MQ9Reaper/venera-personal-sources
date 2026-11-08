import test from 'node:test';
import assert from 'node:assert/strict';
import { runtime } from './fantia-runtime.mjs';

const dateCases = [
    ['Thu, 29 Oct 2026 21:08:09 +0900', '2026-10-29T21:08:09+09:00'],
    ['Tue, 27 Oct 2026 00:15:00 +0900', '2026-10-27T00:15:00+09:00'],
    ['Wed, 28 Oct 2026 21:08:09 +0900', '2026-10-28T21:08:09+09:00'],
    ['29 Oct 2026 21:08:09 +0900', '2026-10-29T21:08:09+09:00'],
    ['Thu, 29 Oct 2026 21:08:09 GMT', '2026-10-29T21:08:09Z'],
    ['Thu, 29 Oct 2026 21:08:09 -0530', '2026-10-29T21:08:09-05:30'],
    ['2026-10-29T21:08:09+09:00', '2026-10-29T21:08:09+09:00'],
    ['2026-10-29T21:08:09+0900', '2026-10-29T21:08:09+09:00'],
    ['2026-10-29 21:08:09', '2026-10-29T21:08:09'],
    ['2026-10-29T12:08:09.123456789Z', '2026-10-29T12:08:09.123456Z'],
    ['2026-10-29', '2026-10-29'],
    ['Thu, 29 Feb 2024 21:08:09 +0900', '2024-02-29T21:08:09+09:00'],
    [null, null], [undefined, null], ['', null], ['unsupported Thu timestamp', null],
    ['2026-02-29T21:08:09Z', null], ['2026-10-29T25:00:00Z', null],
    ['2026-10-29T21:08:09+0960', null], ['Thu, 29 Xxx 2026 21:08:09 +0900', null],
    [{}, null], ['31 Apr 2026 21:08:09 +0900', null]
];
for (const [input, expected] of dateCases) {
    test('Fantia date normalization: ' + String(input), () => {
        const { source } = runtime();
        assert.equal(source.normalizeTime(input), expected);
    });
}

test('Prime screenshot regression reaches comic details with valid ISO timestamps', async () => {
    const { source } = runtime();
    source.post = async () => ({
        id: 1234567, title: 'Date regression', post_contents: [],
        posted_at: 'Thu, 29 Oct 2026 21:08:09 +0900',
        converted_at: 'Tue, 03 Nov 2026 10:11:12 +0900'
    });
    const details = await source.comic.loadInfo('1234567');
    assert.equal(details.uploadTime, '2026-10-29T21:08:09+09:00');
    assert.equal(details.updateTime, '2026-11-03T10:11:12+09:00');
    assert.equal(new Date(details.uploadTime).toISOString(), '2026-10-29T12:08:09.000Z');
});

test('invalid update dates fall back to the valid publication date', () => {
    const { source } = runtime();
    const details = source.details({
        id: 1234567, title: 'Fallback', post_contents: [],
        posted_at: '2026-10-29T21:08:09+09:00', converted_at: 'bad Thu date'
    });
    assert.equal(details.updateTime, details.uploadTime);
});

test('unrecognized dates are omitted instead of breaking comic details', () => {
    const { source } = runtime();
    const details = source.details({
        id: 1234567, title: 'No dates', post_contents: [],
        posted_at: 'bad Thu date', converted_at: 'bad Tue date'
    });
    assert.equal(details.uploadTime, null);
    assert.equal(details.updateTime, null);
    assert.equal(details.title, 'No dates');
});
