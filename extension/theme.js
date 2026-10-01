globalThis.seiApplyTheme=root=>{
 const parse=value=>{const hex=value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i);if(hex){const h=hex[1].length===3?hex[1].split('').map(c=>c+c).join(''):hex[1];return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));}const rgb=value.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, /]+([\d.]+))?\s*\)$/);return rgb&&(!rgb[4]||Number(rgb[4])===1)?rgb.slice(1,4).map(Number):null;};
 let signature='';
 const luminance=rgb=>rgb.map(c=>{const v=c/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
 const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
 const update=()=>{
   const vars=getComputedStyle(document.documentElement),header=document.querySelector('#navInfraBarraNavegacao');
   let rgb=parse(vars.getPropertyValue('--infra-esquema-cor-barra-sistema'))||parse(header?getComputedStyle(header).backgroundColor:'')||[248,250,249];
   const text=header?.querySelector('#spnInfraIdentificacaoSistema,.infraTituloLogoSistema,#lnkInfraMenuSistema');
   const official=parse(vars.getPropertyValue('--infra-esquema-cor-barra-sistema-texto'))||parse(text?getComputedStyle(text).color:'');
   let foreground=contrast(rgb,[0,0,0])>=contrast(rgb,[255,255,255])?'#000000':'#ffffff';
   if(official&&contrast(rgb,official)>=3){
     const base=rgb.slice(),toward=luminance(official)>.5?0:255;
     for(let step=1;contrast(rgb,official)<4.5&&step<=40;step++)rgb=base.map(c=>Math.round(c+(toward-c)*step/100));
     if(contrast(rgb,official)>=4.5)foreground=`rgb(${official.join(',')})`;
   }
   const native=document.querySelector('#divInfraBarraComandosSuperior .infraButton');const s=native?getComputedStyle(native):null;
   let activeRgb=rgb.map(c=>Math.round(c*.7));while(contrast(activeRgb,[255,255,255])<4.5)activeRgb=activeRgb.map(c=>Math.floor(c*.9));
   const values={'--so-theme-bg':`rgb(${rgb.join(',')})`,'--so-theme-fg':foreground,'--so-button-bg':s?.backgroundColor||'#ffffff','--so-button-fg':s?.color||'#495057','--so-button-border':s?.borderColor||'#666666','--so-native-font':s?.font||'13px Arial, sans-serif','--so-native-padding':s?.padding||'4px 9px','--so-native-radius':s?.borderRadius||'4px'};
   values['--so-active-bg']=`rgb(${activeRgb.join(',')})`;values['--so-active-fg']='#ffffff';
   const next=JSON.stringify(values);if(next===signature)return;signature=next;for(const [key,value] of Object.entries(values))root.style.setProperty(key,value);
 };
 let scheduled=false;const schedule=()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;update();});};
 const attributes=new MutationObserver(schedule);for(const e of [document.documentElement,document.body,document.querySelector('#navInfraBarraNavegacao'),document.querySelector('#navInfraBarraNavegacao #spnInfraIdentificacaoSistema'),document.querySelector('#divInfraBarraComandosSuperior')])if(e)attributes.observe(e,{attributes:true,attributeFilter:['class','style','data-bs-theme','data-theme']});
 const headObserver=new MutationObserver(schedule);if(document.head)headObserver.observe(document.head,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['href','media','disabled']});
 document.addEventListener('load',schedule,true);window.addEventListener('pageshow',schedule);update();
 window.addEventListener('pagehide',()=>{attributes.disconnect();headObserver.disconnect();document.removeEventListener('load',schedule,true);window.removeEventListener('pageshow',schedule);},{once:true});
};
