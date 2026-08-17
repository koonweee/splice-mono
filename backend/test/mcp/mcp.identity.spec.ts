import {
  googleSubjectFromAuth0Subject,
  resolveSpliceMcpUserId,
} from '../../src/mcp/mcp.identity';

describe('MCP Auth0 identity mapping', () => {
  it('accepts only the exact Auth0 Google namespace', () => {
    expect(googleSubjectFromAuth0Subject('google-oauth2|google-123')).toBe(
      'google-123',
    );
    expect(() => googleSubjectFromAuth0Subject('github|google-123')).toThrow(
      'Unsupported',
    );
    expect(() => googleSubjectFromAuth0Subject('google-oauth2|')).toThrow(
      'Malformed',
    );
    expect(() =>
      googleSubjectFromAuth0Subject('google-oauth2| subject'),
    ).toThrow('Malformed');
    expect(() =>
      googleSubjectFromAuth0Subject('google-oauth2|google|subject'),
    ).toThrow('Malformed');
    expect(() =>
      googleSubjectFromAuth0Subject('google-oauth2|google\nsubject'),
    ).toThrow('Malformed');
    expect(() =>
      googleSubjectFromAuth0Subject(`google-oauth2|${'x'.repeat(256)}`),
    ).toThrow('Malformed');
  });

  it('resolves an existing linked Google subject to its Splice user ID', async () => {
    const userService = {
      findByGoogleSubject: jest.fn().mockResolvedValue({ id: 'user-1' }),
    };

    await expect(
      resolveSpliceMcpUserId('google-oauth2|google-123', userService),
    ).resolves.toBe('user-1');
    expect(userService.findByGoogleSubject).toHaveBeenCalledWith('google-123');
  });

  it('fails closed for unknown identities', async () => {
    const userService = {
      findByGoogleSubject: jest.fn().mockResolvedValue(null),
    };

    await expect(
      resolveSpliceMcpUserId('google-oauth2|unknown', userService),
    ).rejects.toThrow('not linked');
  });

  it('does not query Splice for malformed or unsupported identities', async () => {
    const userService = { findByGoogleSubject: jest.fn() };

    await expect(
      resolveSpliceMcpUserId('auth0|subject', userService),
    ).rejects.toThrow('Unsupported');
    await expect(
      resolveSpliceMcpUserId('google-oauth2|subject|extra', userService),
    ).rejects.toThrow('Malformed');
    expect(userService.findByGoogleSubject).not.toHaveBeenCalled();
  });
});
