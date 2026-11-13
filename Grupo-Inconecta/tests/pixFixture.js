// Payload sintético APENAS para testes; não é uma cobrança bancária.
export function samplePix(amount='100.00'){
 const tlv=(id,val)=>id+String(val.length).padStart(2,'0')+val;
 const merchant=tlv('00','BR.GOV.BCB.PIX')+tlv('01','teste@example.invalid');
 const payload=tlv('00','01')+tlv('01','11')+tlv('26',merchant)+tlv('52','0000')+tlv('53','986')+tlv('54',amount)+tlv('58','BR')+tlv('59','ESTELA TESTES')+tlv('60','CURITIBA')+tlv('62',tlv('05','***'))+'6304';
 let crc=0xffff;for(const char of payload){crc^=char.charCodeAt(0)<<8;for(let i=0;i<8;i++)crc=crc&0x8000?((crc<<1)^0x1021)&0xffff:(crc<<1)&0xffff;}
 return payload+crc.toString(16).padStart(4,'0').toUpperCase();
}
