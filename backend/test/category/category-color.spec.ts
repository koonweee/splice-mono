import {
  generateCategoryColor,
  isCategoryColor,
  normalizeCategoryColor,
} from '../../src/category/category-color';

describe('category color helpers', () => {
  it('normalizes valid short and long hex colors', () => {
    expect(normalizeCategoryColor('#ABC')).toBe('#aabbcc');
    expect(normalizeCategoryColor(' #A1B2C3 ')).toBe('#a1b2c3');
  });

  it('rejects non-hex colors', () => {
    expect(isCategoryColor('#12')).toBe(false);
    expect(isCategoryColor('red')).toBe(false);
    expect(() => normalizeCategoryColor('rgb(1, 2, 3)')).toThrow(
      'Category color must be a valid hex color',
    );
  });

  it('generates opaque six-digit hex colors', () => {
    expect(generateCategoryColor()).toMatch(/^#[0-9a-f]{6}$/);
  });
});
