import { TextDecoder, TextEncoder } from 'node:util';
import { parseV4Canonical, v4Canonical, decodeV4Utf8, BufferByteLength, v4Etag } from './OptionEWorkplanSubmitExactBodyV4Wire';
Object.assign(globalThis, { TextDecoder, TextEncoder });
describe('v4 independently strict wire', () => {
  test.each(['e\u0301', '\u00e9', '😀', '', 'Case', 'case', ' a ', '\n', '\u0000'])('preserves scalar %p', v => {
    const text = v4Canonical({ v }); expect(parseV4Canonical(text)).toEqual({v}); expect(decodeV4Utf8(new TextEncoder().encode(text))).toBe(text);
  });
  test('does not normalise combining or case', () => { expect(v4Canonical('é')).not.toBe(v4Canonical('e\u0301')); expect(v4Canonical('A')).not.toBe(v4Canonical('a')); });
  test.each(['\ufeff{}',' {}','{} ','{"b":1,"a":2}','{"a":1,"a":1}','{"a":{"x":1,"x":1}}',
    '{"a":"\\u0061"}', '{"a":"\\/"}', '{"a":-0}','{"a":1.0}','{"a":1e0}','{"a":1e400}',
    '{"a":9007199254740992}','{"a":"\\ud800"}','{"a":"\udfff"}','{"a":undefined}','{"a":NaN}','{"a":','{"a":true,"a":false}'])('rejects alternate/malformed representation %p', text => expect(() => parseV4Canonical(text)).toThrow());
  test.each([[0xef,0xbb,0xbf,0x7b,0x7d],[0xc0,0xaf],[0xed,0xa0,0x80],[0xf0,0x9f],[0xff]].map(bytes => [bytes]))('rejects malformed UTF8 %p', bytes => expect(() => decodeV4Utf8(Uint8Array.from(bytes))).toThrow());
  test('bounded UTF8 byte count includes astral and combining values', () => { expect(BufferByteLength('😀e\u0301')).toBe(7); expect(() => parseV4Canonical(v4Canonical('x'.repeat(56000)))).toThrow(); expect(parseV4Canonical(v4Canonical('x'.repeat(55998)))).toHaveLength(55998); });
  test('empty/null/missing/number/string remain distinct', () => { expect(new Set([{}, {a:null},{a:''},{a:1},{a:'1'}].map(v4Canonical)).size).toBe(5); });
  test.each(['*','"*"','','1',undefined,'"x\n"'])('rejects bad ETag %p', e => expect(v4Etag(e)).toBe(false));
});
