export const numericTransformer = {
  to: (value: number): string => value.toString(),
  from: (value: string | number): number =>
    typeof value === 'number' ? value : parseFloat(value),
};
