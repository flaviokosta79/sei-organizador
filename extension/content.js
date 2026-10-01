(() => {
  const url=new URL(location.href);
  if(url.searchParams.get('acao')!=='rel_bloco_protocolo_listar'||url.searchParams.get('acao_origem')!=='bloco_interno_listar')return;
  const table=document.querySelector('#tblProtocolosBlocos'),form=document.querySelector('#frmRelBlocoProtocoloLista');
  if(!table||!form||document.querySelector('#sei-organizador'))return;
  const user=document.querySelector('a#lnkUsuarioSistema');
  let unit;try{unit=new URL(user?.getAttribute('href'),location.href).searchParams.get('infra_unidade_atual');}catch{}
  const block=url.searchParams.get('id_bloco');if(!/^\d+$/.test(unit||'')||!/^\d+$/.test(block||''))return;
  const match=(user?.title||'').match(/^(.+)\s+\(([^/()]+)\/([^()]+)\)$/);
  const actor=match?{name:match[1].trim(),login:match[2],org:match[3]}:{name:'Usuário não identificado',login:'',org:''};
  if(match&&actor.org!=='SEPM')return;
  const root=document.createElement('section');root.id='sei-organizador';root.setAttribute('aria-label','Organização por assunto');
  const anchor=document.querySelector('#divInfraAreaPaginacaoSuperior')||document.querySelector('#divInfraAreaTabela');anchor.before(root);
  let state={version:0,tabs:[],assignments:{}},active=null,ready=false,busy=false,lastVersion=-1;
  const toolbar=document.createElement('div'),tabs=document.createElement('div'),status=document.createElement('p'),history=document.createElement('div');tabs.setAttribute('role','tablist');status.setAttribute('role','status');root.append(tabs,toolbar,status,history);
  const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.className='infraButton';b.textContent=label;b.onclick=fn;return b;};
  let historyOpen=false,historyGeneration=0,historyRequest=null;
  history.id='so-history-panel';history.hidden=true;history.setAttribute('role','region');history.setAttribute('aria-label','Histórico de alterações');
  function updateHistoryToggle(){const b=toolbar.querySelector('[aria-controls="so-history-panel"]');if(b){b.setAttribute('aria-expanded',String(historyOpen));b.textContent=historyOpen?'Fechar histórico':'Histórico';}history.hidden=!historyOpen;}
  function closeHistory(){historyOpen=false;historyGeneration++;history.replaceChildren();updateHistoryToggle();}
  const unassigned='__unassigned__';
  const summary=document.createElement('p');summary.className='so-summary';root.insertBefore(summary,toolbar);
  const topbar=document.createElement('div');topbar.className='so-topbar';topbar.append(tabs);root.prepend(topbar);
  summary.id='so-count-description';tabs.setAttribute('aria-describedby',summary.id);tabs.title='Contagens apenas dos processos carregados na página e pesquisa atuais';
  toolbar.className='so-toolbar';topbar.append(toolbar);seiApplyTheme(root);
  form.classList.add('so-block-page');
  const pagination=document.getElementById('divInfraAreaPaginacaoSuperior');
  if(pagination){const compactPagination=()=>pagination.classList.toggle('so-empty-pagination',pagination.children.length===0&&!pagination.textContent.trim());compactPagination();new MutationObserver(compactPagination).observe(pagination,{childList:true,subtree:true,characterData:true});}
  root.after(history);
  function stickyOffset(){
    let scrollContainer=null;for(let e=root.parentElement;e&&e!==document.body;e=e.parentElement){if(/auto|scroll/.test(getComputedStyle(e).overflowY)){scrollContainer=e;break;}}
    const edge=scrollContainer?scrollContainer.getBoundingClientRect().top+scrollContainer.clientTop:0;
    let offset=0;for(const id of ['divInfraBarraSistema','navInfraBarraNavegacao']){const header=document.getElementById(id);if(!header)continue;const style=getComputedStyle(header),rect=header.getBoundingClientRect();if(scrollContainer||['fixed','sticky'].includes(style.position))offset=Math.max(offset,rect.bottom-edge);}
    root.style.setProperty('--so-sticky-top',Math.max(0,offset)+'px');
  }
  stickyOffset();window.addEventListener('resize',stickyOffset);window.addEventListener('scroll',stickyOffset,true);
  if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(stickyOffset);for(const id of ['divInfraBarraSistema','navInfraBarraNavegacao','divInfraAreaTelaD']){const e=document.getElementById(id);if(e)observer.observe(e);}}
  let contextMenu=null,contextReturn=null;
  function closeMenu(restore=false){contextMenu?.remove();contextMenu=null;if(restore)contextReturn?.focus();contextReturn=null;}
  function openMenu(event){
    closeMenu();
    if(!ready||busy||!state.tabs.length||event.target.closest('a,button,input,select,textarea,[contenteditable=true]'))return;
    const target=rows().find(r=>r.row===event.target.closest('tr'));
    if(!target||target.row.hidden)return;
    event.preventDefault();contextReturn=target.row;
    const menu=document.createElement('div');contextMenu=menu;menu.className='so-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',`Classificar processo ${target.number||target.id}`);
    const title=document.createElement('p');title.textContent=`Classificar ${target.number||'Identificador interno '+target.id}`;menu.append(title);
    for(const folder of state.tabs){const assigned=(state.assignments[target.id]||[]).includes(folder.id);const type=assigned?'unassign':'assign';const b=button(`${assigned?'✓ Retirar de':'Atribuir a'} ${folder.name}`,async()=>{closeMenu(true);await change({type,tabId:folder.id,processIds:[target.id],processNumbers:{[target.id]:target.number}});});b.setAttribute('role','menuitemcheckbox');b.setAttribute('aria-checked',String(assigned));b.dataset.action=type;menu.append(b);}
    root.append(menu);const rect=menu.getBoundingClientRect();const x=event.clientX||target.row.getBoundingClientRect().left,y=event.clientY||target.row.getBoundingClientRect().top;
    menu.style.left=Math.max(8,Math.min(x,window.innerWidth-rect.width-8))+'px';menu.style.top=Math.max(8,Math.min(y,window.innerHeight-rect.height-8))+'px';menu.querySelector('button')?.focus();
    menu.addEventListener('keydown',e=>{const items=Array.from(menu.querySelectorAll('button'));const index=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();}if(e.key==='Tab')closeMenu();});
  }
  table.addEventListener('contextmenu',openMenu);
  table.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))openMenu(e);});
  document.addEventListener('pointerdown',e=>{if(contextMenu&&!contextMenu.contains(e.target))closeMenu();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&contextMenu){e.preventDefault();closeMenu(true);}});
  window.addEventListener('scroll',()=>closeMenu(),true);window.addEventListener('resize',()=>closeMenu());
  const processNumber=a=>a.textContent.replace(/\s+/g,' ').trim();
  function rows(){return Array.from(table.querySelectorAll('tr')).flatMap(row=>{const a=row.querySelector('a[href*="id_procedimento="]');if(!a)return [];try{const id=new URL(a.getAttribute('href'),location.href).searchParams.get('id_procedimento');return /^\d+$/.test(id||'')?[{row,id,link:a,number:processNumber(a),check:row.querySelector('input[type="checkbox"]')}]:[];}catch{return [];}});}
  function injectCopyButtons(loaded){for(const {link} of loaded){
    if(link.nextElementSibling?.classList.contains('so-copy-number'))continue;
    const b=document.createElement('button');b.type='button';b.className='so-copy-number';b.textContent='⧉';b.setAttribute('aria-label','Copiar número do processo');b.title='Copiar número do processo';
    const feedback=document.createElement('span');feedback.className='so-copy-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    let timer;
    b.addEventListener('click',async e=>{e.preventDefault();e.stopPropagation();if(b.disabled)return;b.disabled=true;clearTimeout(timer);feedback.textContent='';try{const number=processNumber(link);if(!number||!navigator.clipboard?.writeText)throw new Error('Clipboard indisponível');await navigator.clipboard.writeText(number);feedback.textContent='Copiado';}catch{feedback.textContent='Não foi possível copiar. Selecione o número manualmente.';}finally{b.disabled=false;timer=setTimeout(()=>{feedback.textContent='';},feedback.textContent==='Copiado'?1000:4000);}});
    b.addEventListener('contextmenu',e=>e.stopPropagation());link.after(b,feedback);
  }}
  const statusIcons={none:'○',attention:'⚠',follow:'👁',urgent:'🔴',archive:'📁'};
  function statusKnown(){return ready&&state.statuses&&typeof state.statuses==='object';}
  function injectStatusMarkers(loaded){for(const target of loaded){
    const cell=target.row.querySelector('td[data-label="Anotações"]')||(target.row.cells.length===6?target.row.cells[4]:null);if(!cell)continue;
    let marker=cell.querySelector('.so-status-marker');
    if(!marker){marker=document.createElement('button');marker.type='button';marker.className='so-status-marker';marker.setAttribute('aria-haspopup','menu');marker.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openStatus(target,marker);});marker.addEventListener('contextmenu',e=>e.stopPropagation());cell.prepend(marker);}
    const value=statusKnown()?(state.statuses[target.id]||'none'):null;const text=value?`${statusIcons[value]||'○'} ${seiStatusLabels[value]||'Status desconhecido'}`:'○ Status indisponível';
    if(marker.textContent!==text)marker.textContent=text;marker.dataset.status=value||'unknown';marker.disabled=!statusKnown()||busy;marker.title=value?`Status manual: ${seiStatusLabels[value]}. Clique para alterar.`:'Status não sincronizado. Reinicie o serviço atualizado ou verifique a conexão.';marker.setAttribute('aria-label',`${text} · ${target.number}`);
  }}
  function openStatus(target,marker){
    closeMenu();if(!statusKnown()||busy)return;contextReturn=marker;
    const menu=document.createElement('div');contextMenu=menu;menu.className='so-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',`Status manual de ${target.number}`);
    const title=document.createElement('p');title.textContent=`Status manual · ${target.number}`;menu.append(title);
    for(const [value,label] of Object.entries(seiStatusLabels)){const item=button(`${statusIcons[value]} ${label}`,async()=>{closeMenu(true);await change({type:'status',status:value,processIds:[target.id],processNumbers:{[target.id]:target.number}});});item.setAttribute('role','menuitemradio');item.setAttribute('aria-checked',String((state.statuses[target.id]||'none')===value));menu.append(item);}
    root.append(menu);const pos=marker.getBoundingClientRect(),rect=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(pos.left,innerWidth-rect.width-8))+'px';menu.style.top=Math.max(8,Math.min(pos.bottom,innerHeight-rect.height-8))+'px';menu.querySelector('button').focus();
    menu.addEventListener('keydown',e=>{const items=Array.from(menu.querySelectorAll('button')),i=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}if(e.key==='Tab')closeMenu();});
  }
  function filter(){
    const loaded=rows(),valid=new Set(state.tabs.map(t=>t.id));injectCopyButtons(loaded);injectStatusMarkers(loaded);const ids=new Set(loaded.map(r=>r.id));
    const links=id=>(state.assignments[id]||[]).filter(t=>valid.has(t));
    const empty=[...ids].filter(id=>!links(id).length).length;
    for(const {row,id,check} of loaded){if(!row.hasAttribute('tabindex'))row.tabIndex=0;row.setAttribute('aria-haspopup','menu');const hide=ready&&!!active&&(active===unassigned?links(id).length>0:!links(id).includes(active));row.hidden=hide;if(hide&&check)check.checked=false;}
    for(const b of tabs.querySelectorAll('[role=tab]')){const key=b.dataset.tab;if(key==='general'){delete b.dataset.count;b.setAttribute('aria-label','Geral — mostrar todos os processos');b.title=active?'Mostrar todos os processos carregados nesta página':'Todos os processos carregados nesta página';continue;}const count=!ready?'—':key===unassigned?empty:[...ids].filter(id=>links(id).includes(key)).length;b.dataset.count=String(count);b.setAttribute('aria-label',`${b.textContent}: ${count} processos carregados nesta página`);}
    summary.textContent=ready?`${ids.size} processos carregados nesta página · ${ids.size-empty} com assunto · ${empty} sem assunto. Contagens limitadas à página e pesquisa atuais.`:`${ids.size} processos carregados nesta página · classificações desconhecidas sem sincronização.`;
  }
  function render(){closeMenu();if(active&&active!==unassigned&&!state.tabs.some(t=>t.id===active))active=null;tabs.replaceChildren();for(const t of [{id:null,name:'Geral'},{id:unassigned,name:'Sem assunto'},...state.tabs]){const b=button(t.name,()=>{active=t.id;render();});b.dataset.tab=t.id||'general';b.disabled=t.id!==null&&!ready;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(t.id===active));tabs.append(b);}toolbar.replaceChildren();const add=button('+ Criar assunto',async()=>{const name=prompt('Nome do assunto');if(name)await change({type:'create',name});});toolbar.append(add);
    if(active&&active!==unassigned){toolbar.append(button('Renomear',async()=>{const name=prompt('Novo nome',state.tabs.find(t=>t.id===active).name);if(name)await change({type:'rename',tabId:active,name});}),button('Excluir aba',async()=>{if(confirm('Excluir esta aba e suas classificações? Os processos permanecem no Geral.'))await change({type:'delete',tabId:active});}));}
    const historyButton=button('Histórico',()=>historyOpen?closeHistory():showHistory());historyButton.setAttribute('aria-controls',history.id);toolbar.append(historyButton,button('Desfazer última alteração',()=>change({type:'undo'})),button('Atualizar',refresh));for(const b of toolbar.querySelectorAll('button,select'))b.disabled=!ready||busy;toolbar.querySelectorAll('button').forEach(b=>{if(b.textContent==='Atualizar')b.disabled=busy;});historyButton.disabled=!historyOpen&&(!ready||busy);updateHistoryToggle();filter();}
  async function api(extra={}){const result=await chrome.runtime.sendMessage({type:'api',unit,block,...extra});if(result.error)throw new Error(result.error);return result.data;}
  async function refresh(){if(busy)return;try{const next=await api();if(next.version>=state.version)state=next;ready=true;lastVersion=state.version;render();status.textContent='';}catch(e){closeMenu();ready=false;active=null;render();status.textContent='Sem sincronização: '+e.message+' · Geral preservado.';}}
  async function change(action){if(!ready||busy)return;busy=true;render();try{state=await api({body:{version:state.version,actor,action}});lastVersion=state.version;status.textContent='Alteração salva.';}catch(e){status.textContent=e.message;}finally{busy=false;render();}await refresh();}
  async function showHistory(){
    historyOpen=true;const generation=++historyGeneration;updateHistoryToggle();history.replaceChildren();const loading=document.createElement('p');loading.textContent='Carregando histórico…';history.append(loading);
    if(!historyRequest)historyRequest=api({history:true}).finally(()=>{historyRequest=null;});
    try{const items=await historyRequest;if(!historyOpen||generation!==historyGeneration)return;loading.remove();for(const h of seiResolveHistory(items,state)){const p=document.createElement('p');p.className='so-history-entry so-history-'+(['create','delete','assign','unassign','rename','undo','status'].includes(h.action.type)?h.action.type:'unknown');p.textContent=seiHistoryText(h,Object.fromEntries(rows().map(r=>[r.id,r.number])));history.append(p);}}catch(e){if(historyOpen&&generation===historyGeneration)loading.textContent='Não foi possível carregar: '+e.message;}
  }
  new MutationObserver(()=>filter()).observe(table,{childList:true,subtree:true});render();refresh();const timer=setInterval(()=>{if(!document.hidden)refresh();},10000);window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
})();











