import { resolveReconnectAccountReplacement as resolve } from '../../src/bank-link/reconnect-account-identity';
const row = (
  id: string,
  externalAccountId: string,
  archivedAt: Date | null = null,
) => ({ id, externalAccountId, archivedAt });
const target = { accountId: 'selected', externalAccountId: 'old' };

describe('Explicit reconnect account identity', () => {
  it('replaces only the selected missing binding while all sibling IDs remain stable', () => {
    expect(
      resolve(
        [row('selected', 'old'), row('sibling', 'same')],
        ['same', 'new'],
        target,
      ),
    ).toEqual({
      accountId: 'selected',
      previousId: 'old',
      replacementId: 'new',
    });
  });
  it('infers the target for legacy single-account reconnect sessions', () => {
    expect(resolve([row('selected', 'old')], ['new'])).toMatchObject({
      accountId: 'selected',
      replacementId: 'new',
    });
  });
  it('is idempotent when the current IDs already match', () => {
    expect(resolve([row('selected', 'new')], ['new'], target)).toBeNull();
  });
  it('accepts unchanged multi-account links without inferring a replacement', () => {
    expect(resolve([row('a', 'a'), row('b', 'b')], ['a', 'b'])).toBeNull();
  });
  it.each([
    ['empty provider response', [row('selected', 'old')], []],
    ['multiple candidates', [row('selected', 'old')], ['new', 'other']],
    [
      'multiple missing accounts',
      [row('selected', 'old'), row('sibling', 'other')],
      ['new'],
    ],
    [
      'target is still present but a sibling disappeared',
      [row('selected', 'old'), row('sibling', 'other')],
      ['old', 'new'],
    ],
    [
      'archived account cannot become the replacement',
      [row('selected', 'old'), row('archived', 'new', new Date())],
      ['new'],
    ],
    ['duplicate provider IDs', [row('selected', 'old')], ['new', 'new']],
    ['stale captured binding', [row('selected', 'newer')], ['new']],
    ['archived target', [row('selected', 'old', new Date())], ['new']],
    ['unknown target', [row('different', 'old')], ['new']],
  ])('rejects %s', (_label, stored, returned) => {
    expect(() => resolve(stored, returned, target)).toThrow();
  });
  it('requires explicit target context on a multi-account connection with churn', () => {
    expect(() =>
      resolve(
        [row('selected', 'old'), row('sibling', 'same')],
        ['same', 'new'],
      ),
    ).toThrow('specific Splice account');
  });
});
