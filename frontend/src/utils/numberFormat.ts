export const formatHectaresPtBr = (valueHa: number): string => {
  const formatter = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatter.format(valueHa)} ha`;
};
