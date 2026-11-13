/**
 * Relatório de Conexões Convertidas.
 * Agrega diretamente no Turso: não transfere observações, negociações individuais
 * ou a tabela completa para o navegador. Os filtros por data usam limites
 * [início, próximo mês) para aproveitar os índices existentes.
 */
import { nextYearMonth } from '../lib/validation.js';

export function addMonths(month, delta){
 const [year,mm]=month.split('-').map(Number);
 const n=year*12+(mm-1)+delta;
 const y=Math.floor(n/12),m=n-y*12+1;
 return `${y}-${String(m).padStart(2,'0')}`;
}

export function connectionReportQueries({mes='',papel='empresa',membro='',referencia}){
 const field=papel==='visitante'?'c.visitante_membro_id':'c.empresa_membro_id';
 const conditions=[],args=[];
 if(membro){conditions.push(`${field}=?`);args.push(membro);}
 if(mes){conditions.push('c.data_fechamento>=? AND c.data_fechamento<?');args.push(mes+'-01',nextYearMonth(mes)+'-01');}
 const where=conditions.length?'WHERE '+conditions.join(' AND '):'';
 // Ao selecionar um participante, somente a contagem e a evolução serão exibidas.
 // Evita somas, COUNT DISTINCT e agrupamentos sem utilidade nesse modo.
 const detailColumns=membro?'':`,
 COUNT(c.valor_centavos) AS com_valor,
 COALESCE(SUM(c.valor_centavos),0) AS valor_total_centavos,
 COUNT(DISTINCT c.empresa_membro_id) AS empresas_com_conexoes,
 COUNT(DISTINCT c.visitante_membro_id) AS visitantes_unicos`;
 const overview={sql:`SELECT COUNT(*) AS total${detailColumns}
 FROM conexoes_convertidas c ${where}`,args};
 const grouped='COUNT(*) AS total';
 const byCompany=membro?null:{sql:`SELECT c.empresa_membro_id AS membro_id,u.nome AS membro,e.nome AS empresa,${grouped}
 FROM conexoes_convertidas c
 LEFT JOIN membros m ON m.id=c.empresa_membro_id
 LEFT JOIN usuarios u ON u.id=m.usuario_id
 LEFT JOIN empresas e ON e.membro_id=m.id ${where}
 GROUP BY c.empresa_membro_id ORDER BY total DESC,e.nome LIMIT 5`,args};
 const byVisitor=membro?null:{sql:`SELECT c.visitante_membro_id AS membro_id,u.nome AS membro,e.nome AS empresa,${grouped}
 FROM conexoes_convertidas c
 LEFT JOIN membros m ON m.id=c.visitante_membro_id
 LEFT JOIN usuarios u ON u.id=m.usuario_id
 LEFT JOIN empresas e ON e.membro_id=m.id ${where}
 GROUP BY c.visitante_membro_id ORDER BY total DESC,u.nome LIMIT 5`,args};
 // Mantém o filtro de membro, mas exibe 6 meses para dar contexto à evolução.
 const reference=mes||referencia;
 const start=addMonths(reference,-5)+'-01';
 const end=nextYearMonth(reference)+'-01';
 const trendConditions=[...(membro?[`${field}=?`]:[]),'c.data_fechamento>=? AND c.data_fechamento<?'];
 const evolution={sql:`SELECT substr(c.data_fechamento,1,7) AS mes,COUNT(*) AS total
 FROM conexoes_convertidas c WHERE ${trendConditions.join(' AND ')}
 GROUP BY substr(c.data_fechamento,1,7) ORDER BY mes`,args:[...(membro?[membro]:[]),start,end]};
 return {overview,byCompany,byVisitor,evolution};
}

export function formatConnectionReport({overview,byCompany,byVisitor,evolution,mes='',papel='',membro='',referencia}){
 const total=Number(overview?.total||0);
 const detailed=!membro;
 const comValor=detailed?Number(overview?.com_valor||0):null;
 const totalCentavos=detailed?Number(overview?.valor_total_centavos||0):null;
 const empresas=detailed?Number(overview?.empresas_com_conexoes||0):null;
 const visitantes=detailed?Number(overview?.visitantes_unicos||0):null;
 const rows=a=>a.map(x=>({membroId:x.membro_id,membro:x.membro,empresa:x.empresa,total:Number(x.total||0)}));
 const map=new Map(evolution.map(x=>[x.mes,x]));
 const ref=mes||referencia;
 return {
  filtros:{mes,papel,membro},
  resumo:{total,comValor,semValor:detailed?total-comValor:null,valorTotalCentavos:totalCentavos,
   ticketMedioCentavos:detailed&&comValor?Math.round(totalCentavos/comValor):null,
   mediaPorEmpresa:detailed?(empresas?Number((total/empresas).toFixed(2)):0):null,
   empresasComConexoes:empresas,visitantesUnicos:visitantes,
   percentualComValor:detailed?(total?Number((comValor*100/total).toFixed(1)):0):null},
  rankingEmpresas:rows(byCompany),rankingVisitantes:rows(byVisitor),
  evolucao:Array.from({length:6},(_,i)=>{
    const month=addMonths(ref,i-5),x=map.get(month);
    return {mes:month,total:Number(x?.total||0)};
  })
 };
}
