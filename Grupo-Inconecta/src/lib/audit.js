import { randomUUID } from 'node:crypto';
export async function audit(db,userId,acao,entidade,entidadeId,detalhes={}) {
 await db.execute({sql:'INSERT INTO auditoria (id,usuario_id,acao,entidade,entidade_id,detalhes_json) VALUES (?,?,?,?,?,?)',args:[randomUUID(),userId,acao,entidade,entidadeId,JSON.stringify(detalhes)]});
}
