(() => {
  if(globalThis.seiOrganizerLifecycle){globalThis.seiOrganizerLifecycle.reconcile();return;}
  let current=null,queued=false;
  function context(){
    const url=new URL(location.href),table=document.querySelector('#tblProtocolosBlocos'),form=document.querySelector('#frmRelBlocoProtocoloLista');
    const internal=/Processos do Bloco Interno/i.test(document.title)||Array.from(document.querySelectorAll('h1')).some(h=>/Processos do Bloco Interno/i.test(h.textContent));
    if(url.searchParams.get('acao')!=='rel_bloco_protocolo_listar'||!internal||!table||!form)return null;
    const user=document.querySelector('a#lnkUsuarioSistema');let unit;try{unit=new URL(user?.getAttribute('href'),location.href).searchParams.get('infra_unidade_atual');}catch{}
    const block=url.searchParams.get('id_bloco'),org=(user?.title||'').match(/\/([^()]+)\)$/)?.[1];
    if(unit!==globalThis.SEI_ORGANIZADOR_CONFIG?.unitId||!/^\d+$/.test(unit||'')||!/^\d+$/.test(block||'')||(org&&org!=='SEPM'))return null;
    return {table,form,key:unit+':'+block};
  }
  function reconcile(){
    queued=false;const next=context();
    if(current&&(!next||next.table!==current.table||next.form!==current.form||next.key!==current.key)){current.dispose();current=null;}
    if(!next)return;
    if(current){if(!current.root.isConnected)current.restore();return;}
    try{current=mount(next);}catch(error){console.error('SEI Organizador: falha na inicialização',error);}
  }
  function schedule(){if(queued)return;queued=true;queueMicrotask(reconcile);}
  const lifecycleObserver=new MutationObserver(schedule);lifecycleObserver.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('pageshow',()=>{lifecycleObserver.observe(document.documentElement,{childList:true,subtree:true});schedule();});
  window.addEventListener('pagehide',()=>{lifecycleObserver.disconnect();current?.dispose();current=null;});
  window.addEventListener('popstate',schedule);window.addEventListener('hashchange',schedule);
  globalThis.seiOrganizerLifecycle={reconcile};reconcile();
  function mount(initial){
  let disposed=false;const cleanups=[],originalRows=new Map();
  function listen(target,type,fn,options){target.addEventListener(type,fn,options);cleanups.push(()=>target.removeEventListener(type,fn,options));}
  function observe(observer,target,options){observer.observe(target,options);cleanups.push(()=>observer.disconnect());return observer;}
  const url=new URL(location.href);
  if(url.searchParams.get('acao')!=='rel_bloco_protocolo_listar')return;
  const internalBlockPage=/Processos do Bloco Interno/i.test(document.title)||Array.from(document.querySelectorAll('h1')).some(h=>/Processos do Bloco Interno/i.test(h.textContent));
  if(!internalBlockPage)return;
  const table=document.querySelector('#tblProtocolosBlocos'),form=document.querySelector('#frmRelBlocoProtocoloLista');
  if(!table||!form||document.querySelector('#sei-organizador'))return;
  const user=document.querySelector('a#lnkUsuarioSistema');
  let unit;try{unit=new URL(user?.getAttribute('href'),location.href).searchParams.get('infra_unidade_atual');}catch{}
  const block=url.searchParams.get('id_bloco');if(unit!==globalThis.SEI_ORGANIZADOR_CONFIG?.unitId||!/^\d+$/.test(unit||'')||!/^\d+$/.test(block||''))return;
  const match=(user?.title||'').match(/^(.+)\s+\(([^/()]+)\/([^()]+)\)$/);
  const actor=match?{name:match[1].trim(),login:match[2],org:match[3]}:{name:'Usuário não identificado',login:'',org:''};
  if(match&&actor.org!=='SEPM')return;
  const root=document.createElement('section');root.id='sei-organizador';root.setAttribute('aria-label','Organização por assunto');
  const anchor=document.querySelector('#divInfraAreaPaginacaoSuperior')||document.querySelector('#divInfraAreaTabela')||table;anchor.before(root);
  let state={version:0,tabs:[],assignments:{}},active=null,statusFilter='all',ready=false,busy=false,lastVersion=-1;
  const toolbar=document.createElement('div'),tabs=document.createElement('div'),status=document.createElement('p'),history=document.createElement('div');tabs.setAttribute('role','tablist');status.setAttribute('role','status');root.append(tabs,toolbar,status,history);
  const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.className='infraButton';b.textContent=label;b.onclick=fn;return b;};
  let historyOpen=false,historyGeneration=0,historyRequest=null;
  history.id='so-history-panel';history.hidden=true;history.setAttribute('role','region');history.setAttribute('aria-label','Histórico de alterações');
  function updateHistoryToggle(){const b=toolbar.querySelector('[aria-controls="so-history-panel"]');if(b){b.setAttribute('aria-expanded',String(historyOpen));b.textContent=historyOpen?'Fechar histórico':'Histórico';}history.hidden=!historyOpen;}
  function closeHistory(){historyOpen=false;historyGeneration++;history.replaceChildren();updateHistoryToggle();}
  const unassigned='__unassigned__';
  const summary=document.createElement('p');summary.className='so-summary';root.insertBefore(summary,toolbar);
  const topbar=document.createElement('div');topbar.className='so-topbar';topbar.append(tabs);root.prepend(topbar);
  const viewing=document.createElement('span');viewing.className='so-viewing';viewing.setAttribute('role','status');topbar.append(viewing);
  summary.id='so-count-description';tabs.setAttribute('aria-describedby',summary.id);tabs.title='Contagens apenas dos processos carregados na página e pesquisa atuais';
  toolbar.className='so-toolbar';topbar.append(toolbar);cleanups.push(seiApplyTheme(root));
  form.classList.add('so-block-page');
  const description=form.querySelector('#txtDescricao'),descriptionLabel=form.querySelector('#lblDescricao'),searchPanel=form.querySelector('#divInfraAreaDados'),search=form.querySelector('#txtPalavrasPesquisaRelBlocoProtocolo'),searchLabel=form.querySelector('#lblPalavrasPesquisa');
  if(description?.parentElement===form&&descriptionLabel?.parentElement===form&&searchPanel?.parentElement===form&&search?.parentElement===searchPanel&&searchLabel?.parentElement===searchPanel&&searchPanel.children.length===2){
    const lineBreak=descriptionLabel.nextElementSibling?.tagName==='BR'?descriptionLabel.nextElementSibling:null;
    const nodes=[descriptionLabel,...(lineBreak?[lineBreak]:[]),description,searchPanel];
    const positions=nodes.map(node=>{const marker=document.createComment('so-native-field');node.before(marker);return {node,marker};});
    const fields=document.createElement('div');fields.className='so-block-fields';positions[0].marker.before(fields);
    const group=document.createElement('div');group.className='so-block-field';group.append(descriptionLabel,...(lineBreak?[lineBreak]:[]),description);searchPanel.classList.add('so-block-field');fields.append(group,searchPanel);
    cleanups.push(()=>{for(const {node,marker} of positions)marker.replaceWith(node);searchPanel.classList.remove('so-block-field');fields.remove();});
  }
  const pagination=document.getElementById('divInfraAreaPaginacaoSuperior');
  if(pagination){const compactPagination=()=>pagination.classList.toggle('so-empty-pagination',pagination.children.length===0&&!pagination.textContent.trim());compactPagination();observe(new MutationObserver(compactPagination),pagination,{childList:true,subtree:true,characterData:true});}
  root.after(history);
  let tableHeaderFrame=null;
  function scheduleTableHeader(){if(disposed||tableHeaderFrame!==null)return;tableHeaderFrame=(window.requestAnimationFrame||window.setTimeout)(()=>{tableHeaderFrame=null;if(!disposed)updateTableHeader();});}
  function updateTableHeader(){
    const header=Array.from(table.rows).find(r=>r.querySelector('th'));if(!header)return;
    // Move the original cells within their table, so native controls and horizontal scrolling stay intact.
    const rect=table.getBoundingClientRect(),height=header.getBoundingClientRect().height;
    const naturalTop=rect.top+header.offsetTop;
    const offset=Math.max(0,Math.min(root.getBoundingClientRect().bottom-naturalTop,rect.bottom-height-naturalTop));
    table.style.setProperty('--so-table-header-shift',offset+'px');
    for(const cell of header.cells)cell.classList.add('so-floating-header');
  }
  function stickyOffset(){
    let scrollContainer=null;for(let e=root.parentElement;e&&e!==document.body;e=e.parentElement){if(/auto|scroll/.test(getComputedStyle(e).overflowY)){scrollContainer=e;break;}}
    const edge=scrollContainer?scrollContainer.getBoundingClientRect().top+scrollContainer.clientTop:0;
    let offset=0;for(const id of ['divInfraBarraSistema','navInfraBarraNavegacao']){const header=document.getElementById(id);if(!header)continue;const style=getComputedStyle(header),rect=header.getBoundingClientRect();if(scrollContainer||['fixed','sticky'].includes(style.position))offset=Math.max(offset,rect.bottom-edge);}
    root.style.setProperty('--so-sticky-top',Math.max(0,offset)+'px');
    scheduleTableHeader();
  }
  stickyOffset();listen(window,'resize',stickyOffset);listen(window,'scroll',stickyOffset,true);
  if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(stickyOffset);cleanups.push(()=>observer.disconnect());observer.observe(root);observer.observe(table);for(const id of ['divInfraBarraSistema','navInfraBarraNavegacao','divInfraAreaTelaD']){const e=document.getElementById(id);if(e)observer.observe(e);}}
  let contextMenu=null,contextReturn=null;
  function closeMenu(restore=false){contextMenu?.remove();contextMenu=null;if(restore)contextReturn?.focus();contextReturn=null;}
  function openMenu(event,control=null){
    closeMenu();
    if(!ready||busy||!state.tabs.length||(!control&&event.target.closest('a,button,input,select,textarea,[contenteditable=true]')))return;
    const target=rows().find(r=>r.row===event.target.closest('tr'));
    if(!target||target.row.hidden)return;
    event.preventDefault();contextReturn=control||target.row;
    const menu=document.createElement('div');contextMenu=menu;menu.className='so-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label',`Classificar processo ${target.number||target.id}`);
    const title=document.createElement('p');title.textContent=`Classificar ${target.number||'Identificador interno '+target.id}`;menu.append(title);
    for(const folder of state.tabs){const assigned=(state.assignments[target.id]||[]).includes(folder.id);const type=assigned?'unassign':'assign';const b=button(`${assigned?'✓ Retirar de':'Atribuir a'} ${folder.name}`,async()=>{closeMenu(true);await change({type,tabId:folder.id,processIds:[target.id],processNumbers:{[target.id]:target.number}});});b.setAttribute('role','menuitemcheckbox');b.setAttribute('aria-checked',String(assigned));b.dataset.action=type;menu.append(b);}
    root.append(menu);const rect=menu.getBoundingClientRect();const x=event.clientX||contextReturn.getBoundingClientRect().left,y=event.clientY||contextReturn.getBoundingClientRect().bottom;
    menu.style.left=Math.max(8,Math.min(x,window.innerWidth-rect.width-8))+'px';menu.style.top=Math.max(8,Math.min(y,window.innerHeight-rect.height-8))+'px';menu.querySelector('button')?.focus();
    menu.addEventListener('keydown',e=>{const items=Array.from(menu.querySelectorAll('button'));const index=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next].focus();}if(e.key==='Tab')closeMenu();});
  }
  listen(table,'contextmenu',openMenu);
  listen(table,'keydown',e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10'))openMenu(e);});
  listen(document,'pointerdown',e=>{if(contextMenu&&!contextMenu.contains(e.target))closeMenu();});
  listen(document,'keydown',e=>{if(e.key==='Escape'&&contextMenu){e.preventDefault();closeMenu(true);}});
  listen(window,'scroll',()=>closeMenu(),true);listen(window,'resize',()=>closeMenu());
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
  function injectColumns(loaded){
    const header=Array.from(table.rows).find(r=>r.querySelector('th'));
    if(!header)return;
    const native=Array.from(header.cells).filter(c=>!c.dataset.soColumn);
    const names=native.map(c=>c.textContent.trim());const typeIndex=names.indexOf('Tipo');
    if(typeIndex<0||native.some(c=>c.colSpan!==1))return;
    const groups=table.querySelectorAll('colgroup');if(groups.length>1||(groups.length&&Array.from(groups[0].children).filter(c=>!c.dataset.soColumn).length!==native.length)||(groups.length&&Array.from(groups[0].children).some(c=>c.span!==1)))return;
    if(!names[0]){native[0].classList.add('so-col-selection');for(const {row} of loaded)row.querySelector('input[type="checkbox"]')?.closest('td')?.classList.add('so-col-selection');}
    const cellFor=(row,name)=>row.querySelector(`td[data-label="${name}"]`)||Array.from(row.cells).filter(c=>!c.dataset.soColumn)[names.indexOf(name)];
    for(const [name,kind] of [['Seq.','sequence'],['Processo','process'],['Tipo','type'],['Anotações','notes'],['Ações','actions']]){const h=native[names.indexOf(name)];h?.classList.add('so-col-'+kind);for(const {row} of loaded)cellFor(row,name)?.classList.add('so-col-'+kind);}
    const columns=active===null?[['subject','Assunto'],['status','Status']]:[['status','Status']];
    if(active!==null)for(const cell of table.querySelectorAll('[data-so-column="subject"]'))cell.remove();
    let after=native[typeIndex];
    for(const [key,label] of columns){let h=header.querySelector(`[data-so-column="${key}"]`);if(!h){h=document.createElement('th');h.className=native[typeIndex].className;h.classList.remove('so-col-type');h.classList.add('so-col-'+key);h.dataset.soColumn=key;h.scope='col';h.textContent=label;after.after(h);}after=h;}
    const group=table.querySelector('colgroup');if(group){let previous=Array.from(group.children).filter(c=>!c.dataset.soColumn)[typeIndex];for(const [key] of columns){let col=group.querySelector(`[data-so-column="${key}"]`);if(!col){col=document.createElement('col');col.dataset.soColumn=key;previous.after(col);}previous=col;}}
    for(const {row,id} of loaded){const type=cellFor(row,'Tipo');if(!type||Array.from(row.cells).some(c=>c.colSpan!==1))continue;let previous=type;
      for(const [key,label] of columns){let cell=row.querySelector(`[data-so-column="${key}"]`);if(!cell){cell=document.createElement('td');cell.dataset.soColumn=key;cell.dataset.label=label;cell.className='so-col-'+key;previous.after(cell);}previous=cell;}
      const cell=row.querySelector('[data-so-column="subject"]');if(!cell)continue;const folders=ready?state.tabs.filter(t=>(state.assignments[id]||[]).includes(t.id)):null;
      const signature=JSON.stringify(folders?.map(t=>t.name)??null);if(cell.dataset.soSubjects!==signature){cell.dataset.soSubjects=signature;cell.replaceChildren();const names=folders?.map(t=>t.name);const label=document.createElement('button');label.type='button';label.className='so-subject-label';label.textContent=names?.length?names[0]:ready?'Sem assunto':'Não sincronizado';label.setAttribute('aria-haspopup','menu');label.addEventListener('click',e=>{e.stopPropagation();openMenu(e,label);});label.addEventListener('contextmenu',e=>{e.stopPropagation();openMenu(e,label);});label.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.stopPropagation();openMenu(e,label);}});cell.append(label);if(names?.length>1){const more=document.createElement('span');more.className='so-subject-more';more.textContent=`mais ${names.length-1}`;cell.append(more);}cell.title=names?.length?names.join('\n'):label.textContent;cell.setAttribute('aria-label',names?.length?`Assuntos: ${names.join(', ')}`:label.textContent);}
      const control=cell.querySelector('.so-subject-label');control.disabled=!ready||busy||!state.tabs.length;control.setAttribute('aria-label',`Alterar assuntos do processo ${processNumber(row.querySelector('a[href*="id_procedimento="]'))}: ${cell.getAttribute('aria-label')}`);control.title=!state.tabs.length?'Crie um assunto para classificar':cell.title+' · Clique para atribuir ou retirar assuntos';
    }
    for(const row of table.rows){if(row===header||loaded.some(r=>r.row===row))continue;for(const c of row.cells){if(!c.dataset.soOriginalSpan&&c.colSpan===native.length)c.dataset.soOriginalSpan=String(c.colSpan);if(c.dataset.soOriginalSpan)c.colSpan=Number(c.dataset.soOriginalSpan)+columns.length;}}
    table.classList.add('so-organized-table');let container=table.parentElement;if(container===form){container=document.createElement('div');table.before(container);container.append(table);}container.classList.add('so-table-scroll');
  }
  function injectStatusMarkers(loaded){for(const target of loaded){
    const cell=target.row.querySelector('[data-so-column="status"]');if(!cell)continue;
    let marker=target.row.querySelector('.so-status-marker');if(marker&&marker.parentElement!==cell)cell.append(marker);
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
    const loaded=rows(),valid=new Set(state.tabs.map(t=>t.id));injectColumns(loaded);injectCopyButtons(loaded);injectStatusMarkers(loaded);const ids=new Set(loaded.map(r=>r.id));
    const links=id=>(state.assignments[id]||[]).filter(t=>valid.has(t));
    const empty=[...ids].filter(id=>!links(id).length).length;
    const matchesStatus=id=>statusFilter==='all'||!statusKnown()||(state.statuses[id]||'none')===statusFilter;
    for(const {row,id,check} of loaded){if(!originalRows.has(row))originalRows.set(row,{hidden:row.hidden,tabindex:row.getAttribute('tabindex'),popup:row.getAttribute('aria-haspopup')});if(!row.hasAttribute('tabindex'))row.tabIndex=0;row.setAttribute('aria-haspopup','menu');const hide=(ready&&!!active&&(active===unassigned?links(id).length>0:!links(id).includes(active)))||!matchesStatus(id);row.hidden=hide;if(hide&&check)check.checked=false;}
    for(const b of tabs.querySelectorAll('[role=tab]')){const key=b.dataset.tab;if(key==='general'){delete b.dataset.count;b.setAttribute('aria-label','Geral — mostrar todos os processos');b.title=active?'Mostrar todos os processos carregados nesta página':'Todos os processos carregados nesta página';continue;}const count=!ready?'—':[...ids].filter(id=>matchesStatus(id)&&(key===unassigned?!links(id).length:links(id).includes(key))).length;b.dataset.count=String(count);b.setAttribute('aria-label',`${b.textContent}: ${count} processos carregados nesta página`);}
    summary.textContent=ready?`${ids.size} processos carregados nesta página · ${ids.size-empty} com assunto · ${empty} sem assunto. Contagens limitadas à página e pesquisa atuais.`:`${ids.size} processos carregados nesta página · classificações desconhecidas sem sincronização.`;
    viewing.textContent=`Visualizando: ${!active?'todos os processos':active===unassigned?'Sem assunto':state.tabs.find(t=>t.id===active)?.name||'todos os processos'}${statusFilter==='all'?'':' · '+seiStatusLabels[statusFilter]} · ${loaded.filter(r=>!r.row.hidden).length}/${ids.size} carregados${statusKnown()?'':' · Status indisponível'}`;viewing.title=viewing.textContent;
    for(const option of toolbar.querySelectorAll('.so-status-filter option')){const base=option.value==='all'?'Todos os status':seiStatusLabels[option.value];const eligible=[...ids].filter(id=>!active||(active===unassigned?!links(id).length:links(id).includes(active)));const count=statusKnown()?eligible.filter(id=>option.value==='all'||(state.statuses[id]||'none')===option.value).length:'—';const text=base+' ('+count+')';if(option.textContent!==text)option.textContent=text;}
    scheduleTableHeader();
  }
  function render(){if(disposed)return;closeMenu();if(active&&active!==unassigned&&!state.tabs.some(t=>t.id===active))active=null;tabs.replaceChildren();for(const t of [{id:null,name:'Geral'},{id:unassigned,name:'Sem assunto'},...state.tabs]){const b=button(t.name,()=>{active=t.id;render();});b.dataset.tab=t.id||'general';b.disabled=t.id!==null&&!ready;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(t.id===active));tabs.append(b);}toolbar.replaceChildren();const add=button('+ Criar assunto',async()=>{const name=prompt('Nome do assunto');if(name)await change({type:'create',name});});toolbar.append(add);
    if(active&&active!==unassigned){toolbar.append(button('Renomear',async()=>{const name=prompt('Novo nome',state.tabs.find(t=>t.id===active).name);if(name)await change({type:'rename',tabId:active,name});}),button('Excluir aba',async()=>{if(confirm('Excluir esta aba e suas classificações? Os processos permanecem no Geral.'))await change({type:'delete',tabId:active});}));}
    const select=document.createElement('select');select.className='so-status-filter';select.setAttribute('aria-label','Filtrar por status manual');for(const [value,label] of [['all','Todos os status'],...Object.entries(seiStatusLabels)]){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}select.value=statusFilter;select.onchange=()=>{statusFilter=select.value;render();};toolbar.append(select);
    const historyButton=button('Histórico',()=>historyOpen?closeHistory():showHistory());historyButton.setAttribute('aria-controls',history.id);toolbar.append(historyButton);for(const b of toolbar.querySelectorAll('button,select'))b.disabled=!ready||busy;select.disabled=!statusKnown()||busy;historyButton.disabled=!historyOpen&&(!ready||busy);updateHistoryToggle();for(const b of history.querySelectorAll('.so-undo-record'))b.disabled=busy||!ready||b.dataset.undoable!=='true';filter();}
  const ownRecord=h=>!!actor.login.trim()&&actor.login.trim().toLowerCase()===(h.actor?.login||'').trim().toLowerCase()&&actor.org.trim().toLowerCase()===(h.actor?.org||'').trim().toLowerCase();
  async function undoSelected(selected){
    if(!ready||busy)return;busy=true;render();
    try{
      const latestState=await api(),items=await api({history:true});if(disposed)return;
      const latest=items.find(h=>h.id===selected.id);if(!latest)throw new Error('A alteração não está mais disponível no histórico.');
      if(!ownRecord(latest))throw new Error('Você só pode desfazer suas próprias alterações.');
      if(latest.undoable!==true)throw new Error(latest.undoReason||'Este registro não pode ser desfeito.');
      if(!Number.isInteger(latest.id))throw new Error('Histórico sem identificador seguro. Atualize o serviço antes de desfazer.');
      if(items[0]?.version!==latestState.version)throw new Error('O histórico mudou durante a consulta. Abra o histórico e confira novamente.');
      state=latestState;
      const description=seiHistoryText(seiResolveHistory([latest],state)[0],Object.fromEntries(rows().map(r=>[r.id,r.number])));
      if(!confirm(`Desfazer esta alteração compartilhada do bloco?\n\n${description}\nAutor: ${latest.actor?.name||latest.actor?.login||'Usuário não identificado'}\n\nIsso afeta todos os colegas. Confirmar?`))return;
      const next=await api({body:{version:latestState.version,actor,action:{type:'undo',historyId:latest.id}}});if(disposed)return;state=next;status.textContent='Alteração desfeita.';
    }catch(e){if(!disposed)status.textContent='Não foi possível desfazer: '+e.message;}
    finally{busy=false;if(!disposed){render();if(historyOpen)await showHistory();}}
  }
  async function api(extra={}){if(disposed)throw new Error('Página substituída');const result=await chrome.runtime.sendMessage({type:'api',unit,block,...extra});if(result.error)throw new Error(result.error);return result.data;}
  async function refresh(){if(busy)return;try{const next=await api();if(disposed||busy)return;if(next.version>=state.version)state=next;ready=true;if(!statusKnown())statusFilter='all';lastVersion=state.version;render();status.textContent='';}catch(e){if(disposed)return;closeMenu();ready=false;active=null;statusFilter='all';render();status.textContent='Sem sincronização: '+e.message+' · Geral preservado.';}}
  async function change(action){if(!ready||busy)return;busy=true;render();try{const next=await api({body:{version:state.version,actor,action}});if(disposed)return;state=next;lastVersion=state.version;status.textContent='Alteração salva.';}catch(e){status.textContent=e.message;}finally{busy=false;render();}await refresh();}
  async function showHistory(){
    historyOpen=true;const generation=++historyGeneration;updateHistoryToggle();history.replaceChildren();const loading=document.createElement('p');loading.textContent='Carregando histórico…';history.append(loading);
    if(!historyRequest)historyRequest=api({history:true}).finally(()=>{historyRequest=null;});
    try{const items=await historyRequest;if(!historyOpen||generation!==historyGeneration)return;loading.remove();for(const h of seiResolveHistory(items,state)){const p=document.createElement('p');p.className='so-history-entry so-history-'+(['create','delete','assign','unassign','rename','undo','status'].includes(h.action.type)?h.action.type:'unknown');const parts=seiHistoryText(h,Object.fromEntries(rows().map(r=>[r.id,r.number]))).split(' · ');p.append(parts[0]+' · ');const user=document.createElement('span');user.className='so-history-user';user.textContent=h.actor?.login||'Usuário não identificado';user.title=h.actor?.name&&h.actor.name!=='Usuário não identificado'?`${h.actor.name} (${h.actor.login||''}${h.actor.org?'/'+h.actor.org:''})`:'Nome completo não disponível neste registro';p.append(user,' · '+parts.slice(2).join(' · '));if(h.undoReason)p.title=h.undoReason;if(items.some(item=>item.action.type==='undo'&&item.action.historyId===h.id)){const undone=document.createElement('span');undone.className='so-history-reverted';undone.textContent=' · Desfeita';p.append(undone);}if(ownRecord(h)&&h.action.type!=='undo'&&h.undoable===true){const undo=button('Desfazer',()=>undoSelected(h));undo.classList.add('so-undo-record');undo.dataset.undoable=String(h.undoable===true);undo.disabled=busy||!ready||h.undoable!==true;undo.title=h.undoable===true?'Desfazer somente esta alteração':h.undoReason||'Este registro não pode ser desfeito';p.append(undo);}history.append(p);}}catch(e){if(historyOpen&&generation===historyGeneration)loading.textContent='Não foi possível carregar: '+e.message;}
  }
  observe(new MutationObserver(()=>filter()),table,{childList:true,subtree:true});render();refresh();const timer=setInterval(()=>{reconcile();if(!disposed&&!document.hidden)refresh();},10000);cleanups.push(()=>clearInterval(timer));
  function restore(){const destination=document.querySelector('#divInfraAreaPaginacaoSuperior')||document.querySelector('#divInfraAreaTabela')||table;destination.before(root);root.after(history);stickyOffset();}
  function dispose(){if(disposed)return;disposed=true;closeMenu();historyGeneration++;for(const cleanup of cleanups)if(typeof cleanup==='function')cleanup();root.remove();history.remove();form.classList.remove('so-block-page');
    table.querySelectorAll('[data-so-column],.so-copy-number,.so-copy-feedback,.so-status-marker').forEach(e=>e.remove());
    table.querySelectorAll('.so-floating-header').forEach(e=>e.classList.remove('so-floating-header'));table.style.removeProperty('--so-table-header-shift');table.classList.remove('so-organized-table');table.parentElement?.classList.remove('so-table-scroll');table.querySelectorAll('[class]').forEach(e=>{for(const name of Array.from(e.classList))if(name.startsWith('so-col-'))e.classList.remove(name);});for(const [row,original] of originalRows){row.hidden=original.hidden;for(const [attr,value] of [['tabindex',original.tabindex],['aria-haspopup',original.popup]])if(value===null)row.removeAttribute(attr);else row.setAttribute(attr,value);}
    table.querySelectorAll('[data-so-original-span]').forEach(e=>{e.colSpan=Number(e.dataset.soOriginalSpan);delete e.dataset.soOriginalSpan;});
  }
  return {table,form,key:initial.key,root,restore,dispose};
  }
})();











