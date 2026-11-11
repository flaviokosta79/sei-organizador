import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const read=f=>readFileSync(new URL('../extension/'+f,import.meta.url),'utf8');
const settle=()=>new Promise(r=>setTimeout(r,20));
const native='<button onclick="infraMoverParaTopo()" id="btnInfraTopo" class="infraButton infraCorBarraSistema" style="display:none"><img src="/infra_css/svg/topo.svg?2.45.1" title="Voltar ao Topo" alt="Voltar ao Topo" tabindex="32767"></button>';
const page=html=>{const dom=new JSDOM(html,{url:'https://sei.rj.gov.br/sei/controlador.php?acao=x',runScripts:'outside-only'});dom.window.eval(read('scroll-bottom.js'));return dom.window;};

test('go-to-bottom button follows the native back-to-top button and scrolls the SEI area to the end',async()=>{
 const w=page(`<div id="divInfraAreaTelaD"></div>${native}`),d=w.document,top=d.querySelector('#btnInfraTopo'),base=d.querySelector('#sei-organizador-base');
 assert.equal(top.nextElementSibling,base);assert.equal(base.className,top.className);assert.equal(base.type,'button');
 assert.equal(base.querySelector('img').title,'Ir para o fim da página');assert.equal(base.getAttribute('onclick'),null);
 assert.equal(base.hidden,true);
 top.style.display='inline-block';await settle();assert.equal(base.hidden,false);
 top.style.display='none';await settle();assert.equal(base.hidden,true);
 const area=d.querySelector('#divInfraAreaTelaD'),calls=[];
 Object.defineProperty(area,'scrollHeight',{value:900});Object.defineProperty(area,'clientHeight',{value:300});
 area.scrollTo=o=>calls.push({...o});base.click();
 assert.deepEqual(calls,[{top:900,behavior:'smooth'}]);
 w.eval(read('scroll-bottom.js'));assert.equal(d.querySelectorAll('#sei-organizador-base').length,1);
 w.close(); // drops the pending 2 s timer of the page
});

test('without the SEI area the page itself is scrolled; without the native button nothing is added',()=>{
 const w=page(native),calls=[],el=w.document.scrollingElement||w.document.documentElement;
 Object.defineProperty(w.document,'scrollingElement',{value:el});Object.defineProperty(el,'scrollHeight',{value:1200});
 el.scrollTo=o=>calls.push({...o});w.document.querySelector('#sei-organizador-base').click();
 assert.deepEqual(calls,[{top:1200,behavior:'smooth'}]);
 assert.equal(page('<p>x</p>').document.querySelector('#sei-organizador-base'),null);
});

test('both buttons rest 2 s after the last scroll and come back on the next one, unless the pointer is on one',()=>{
 const dom=new JSDOM(`<div id="divInfraAreaTelaD"></div>${native}`,{url:'https://sei.rj.gov.br/sei/controlador.php?acao=x',runScripts:'outside-only'}),w=dom.window,d=w.document;
 const timers=[];w.setTimeout=(fn,ms)=>{timers.push({fn,ms});return timers.length;};w.clearTimeout=id=>{if(timers[id-1])timers[id-1].fn=null;};
 const fire=()=>{const last=timers.at(-1);assert.equal(last.ms,2000);const fn=last.fn;last.fn=null;assert.ok(fn);fn();};
 w.eval(read('scroll-bottom.js'));
 const idle=()=>d.documentElement.hasAttribute('data-so-scroll-idle'),area=d.querySelector('#divInfraAreaTelaD'),base=d.querySelector('#sei-organizador-base');
 area.dispatchEvent(new w.Event('scroll'));assert.equal(idle(),false);
 fire();assert.equal(idle(),true);
 area.dispatchEvent(new w.Event('scroll'));assert.equal(idle(),false);
 base.hidden=false;base.focus();assert.equal(d.activeElement,base);assert.equal(idle(),false);
 fire();assert.equal(idle(),true);
 base.matches=sel=>sel===':hover';area.dispatchEvent(new w.Event('scroll'));fire();assert.equal(idle(),false);
 delete base.matches;fire();assert.equal(idle(),true);
 assert.match(read('content.css'),/:root\[data-so-scroll-idle\] #sei-organizador-base \{\s*opacity: 0 !important;\s*pointer-events: none;/);
});

test('manifest loads the button only in the top page and the stylesheet puts it in the left corner',()=>{
 const top=JSON.parse(read('manifest.json')).content_scripts.at(-1);
 assert.ok(top.js.includes('scroll-bottom.js'));assert.equal(top.all_frames,undefined);
 const css=read('content.css');
 assert.match(css,/#sei-organizador-base \{\s*position: fixed;\s*left: 2\.2rem;\s*bottom: calc\(var\(--so-alerts-height, 0px\) \+ 1rem\);/);assert.doesNotMatch(css,/58px/);
 assert.match(read('monitor.js'),/--so-alerts-height:\$\{height\}px/);
});
