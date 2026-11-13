// Pesquisa exclusivamente na lista de membros já recebida pelo navegador.
// Nenhuma tecla digitada dispara consulta ao Turso.
const normalize = value => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();

export function memberDisplay(member) {
  return `${String(member?.nome || '').trim()} — ${String(member?.empresa || 'Empresa não cadastrada').trim()}`;
}

export function filterMembers(members, term, limit = 20) {
  if (!Array.isArray(members) || !Number.isInteger(limit) || limit < 1) return [];
  const words = normalize(term).split(/\s+/).filter(Boolean);
  return members.filter(member => {
    const searchable = normalize(memberDisplay(member));
    return words.every(word => searchable.includes(word));
  }).slice(0, limit);
}

export function isBirthdayToday(member, dateIso) {
  const match = /^(\d{4})-(\d\d)-(\d\d)$/.exec(String(dateIso || ''));
  return Boolean(match && String(member?.mes).padStart(2, '0') === match[2]
    && String(member?.dia).padStart(2, '0') === match[3]);
}
