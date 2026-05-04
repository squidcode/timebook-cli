import { describe, it, expect } from 'vitest';
import { parseGetCallback, describeScope } from './login.js';

const url = (qs: string) => new URL(`http://127.0.0.1:65535/callback?${qs}`);

describe('parseGetCallback', () => {
  it('reads token from ?secret= (current web app)', () => {
    const payload = parseGetCallback(url('secret=tbk_abc&state=xyz'));
    expect(payload).toEqual({
      token: 'tbk_abc',
      state: 'xyz',
      tokenName: undefined,
      tokenPrefix: undefined,
      tokenId: undefined,
    });
  });

  it('falls back to ?token= for legacy builds', () => {
    const payload = parseGetCallback(url('token=tbk_abc&state=xyz'));
    expect(payload?.token).toBe('tbk_abc');
    expect(payload?.state).toBe('xyz');
  });

  it('prefers ?secret= when both are present', () => {
    const payload = parseGetCallback(url('secret=new&token=old&state=xyz'));
    expect(payload?.token).toBe('new');
  });

  it('returns null when state is missing', () => {
    expect(parseGetCallback(url('secret=tbk_abc'))).toBeNull();
  });

  it('returns null when token and secret are both missing', () => {
    expect(parseGetCallback(url('state=xyz'))).toBeNull();
  });

  it('returns null on empty query string', () => {
    expect(parseGetCallback(url(''))).toBeNull();
  });

  it('passes through optional metadata fields', () => {
    const payload = parseGetCallback(
      url('secret=tbk_abc&state=xyz&tokenName=Laptop&tokenPrefix=tbk_8b&tokenId=42'),
    );
    expect(payload).toMatchObject({
      tokenName: 'Laptop',
      tokenPrefix: 'tbk_8b',
      tokenId: '42',
    });
  });
});

describe('describeScope', () => {
  it('returns "all" when no scopes', () => {
    expect(describeScope(undefined, undefined)).toBe('all clients & projects');
    expect(describeScope([], [])).toBe('all clients & projects');
  });

  it('describes clients-only scope', () => {
    expect(describeScope(['c1'], [])).toBe('1 client');
    expect(describeScope(['c1', 'c2'], undefined)).toBe('2 clients');
  });

  it('describes projects-only scope', () => {
    expect(describeScope(undefined, ['p1'])).toBe('1 project');
    expect(describeScope([], ['p1', 'p2', 'p3'])).toBe('3 projects');
  });

  it('describes mixed scope', () => {
    expect(describeScope(['c1'], ['p1', 'p2'])).toBe('1 client, 2 projects');
  });
});
