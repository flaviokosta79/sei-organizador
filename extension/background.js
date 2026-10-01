chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
  if(msg?.type!=='api')return;
  (async()=>{
    if(!sender.tab?.url?.startsWith('https://sei.rj.gov.br/sei/controlador.php'))throw new Error('Origem não permitida');
    const {serviceUrl,unitId}=await chrome.storage.local.get(['serviceUrl','unitId']);
    if(!serviceUrl||!unitId)throw new Error('Configure o serviço nas opções da extensão');
    if(msg.unit!==unitId||!/^\d+$/.test(msg.block))throw new Error('Unidade ou bloco inválido');
    const base=new URL(serviceUrl);if(base.username||base.password||base.search||base.hash)throw new Error('URL de serviço inválida');
    if(base.protocol!=='https:'&&!(base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname)))throw new Error('Serviço exige HTTPS');
    const url=new URL(`/v1/units/${unitId}/blocks/${msg.block}${msg.history?'/history':''}`,base);
    const response=await fetch(url,{method:msg.body?'POST':'GET',credentials:'omit',referrerPolicy:'no-referrer',headers:msg.body?{'Content-Type':'application/json'}:{},body:msg.body?JSON.stringify(msg.body):undefined,signal:AbortSignal.timeout(10000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Serviço indisponível');return data;
  })().then(data=>reply({data}),e=>reply({error:e.message}));return true;
});
