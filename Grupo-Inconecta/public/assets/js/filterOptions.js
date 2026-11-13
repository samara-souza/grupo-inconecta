// Opções padronizadas dos filtros do diretório, aniversários e conexões.
// Funções puras: sem chamadas ao banco e sem dependências do navegador.
export const MONTHS_PT = Object.freeze([
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]);

const validPeriod = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
const periodIndex = period => {
  const [year, month] = period.split('-').map(Number);
  return year * 12 + month - 1;
};
const periodValue = index => {
  const year = Math.floor(index / 12);
  const month = index % 12 + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
};

export function periodFilterOptions(selected, { includeAll = false, referenceMonth, recentMonths = 48 } = {}) {
  if (!validPeriod(referenceMonth)) throw new TypeError('Mês de referência inválido.');
  if (!Number.isInteger(recentMonths) || recentMonths < 1) throw new TypeError('Intervalo de meses inválido.');
  const selectedPeriod = validPeriod(selected) ? selected : '';
  const latest = Math.max(periodIndex(referenceMonth), selectedPeriod ? periodIndex(selectedPeriod) : -Infinity);
  const earliest = Math.min(periodIndex(referenceMonth) - recentMonths + 1,
    selectedPeriod ? periodIndex(selectedPeriod) : Infinity);
  const options = [includeAll ? `<option value="" ${selectedPeriod ? '' : 'selected'}>Todos os meses</option>` : ''];
  let yearGroup = null;
  for (let index = latest; index >= earliest; index--) {
    const value = periodValue(index);
    const year = value.slice(0, 4);
    if (year !== yearGroup) {
      if (yearGroup !== null) options.push('</optgroup>');
      options.push(`<optgroup label="${year}">`);
      yearGroup = year;
    }
    options.push(`<option value="${value}" ${value === selectedPeriod ? 'selected' : ''}>${MONTHS_PT[Number(value.slice(5)) - 1]} de ${year}</option>`);
  }
  if (yearGroup !== null) options.push('</optgroup>');
  return options.join('');
}

export function birthdayFilterOptions(selectedMonth) {
  const selected = String(selectedMonth || '').padStart(2, '0');
  return MONTHS_PT.map((name, index) => {
    const value = String(index + 1).padStart(2, '0');
    return `<option value="${value}" ${selected === value ? 'selected' : ''}>${name}</option>`;
  }).join('');
}
