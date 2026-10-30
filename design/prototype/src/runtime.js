const {screens, fixtures, copy}=window.PROTOTYPE;
const lookup=(object,key)=>key.split('.').reduce((o,k)=>o?.[k],object);
const params=()=>{const [screen,query]=(location.hash.slice(1)||'/record').split('?');return {screen:screen.replace(/^\//,''),query:new URLSearchParams(query)}};
function go(screen,extra={}){const current=params().query; for(const [k,v]of Object.entries(extra))current.set(k,v);location.hash=`/${screen}?${current}`}
window.Proto={go};
const map=document.querySelector('#map');screens.forEach(s=>{const a=document.createElement('a');a.href=`#/${s.id}`;a.textContent=s.title;map.append(a)});
function render(){let {screen,query}=params();const entry=screens.find(s=>s.id===screen)||screens[0];screen=entry.id;const state=query.get('state')||entry.states[0];const fixture=fixtures[query.get('fixture')||entry['default-fixture']]||{};
 const template=document.querySelector(`template[data-screen="${screen}"]`);const phone=document.querySelector('#phone');phone.replaceChildren(template.content.cloneNode(true));
 const width=query.get('device')==='iphone-se'?375:query.get('device')==='mp-750'?375:390;phone.style.width=`${width}px`;phone.style.height=query.get('device')==='iphone-se'?'667px':query.get('device')==='mp-750'?'812px':'844px';
 document.body.classList.toggle('capture',query.get('capture')==='1');
 phone.querySelectorAll('[data-when]').forEach(n=>n.hidden=!n.dataset.when.split(' ').includes(state));
 phone.querySelectorAll('[data-copy]').forEach(n=>n.textContent=lookup(copy,n.dataset.copy)??`[missing:${n.dataset.copy}]`);
 phone.querySelectorAll('[data-bind]').forEach(n=>{const value=lookup(fixture,n.dataset.bind);if(value!==undefined){if('value'in n)n.value=value;else n.textContent=value}});
 if(state==='many-songs'){const list=phone.querySelector('[data-list]');if(list)for(const song of fixture.songs||[]){const p=document.createElement('p');p.textContent=song.title;list.append(p)}}
 phone.querySelectorAll('[data-go]').forEach(n=>n.onclick=()=>{const [target,next]=n.dataset.go.split(':');go(target,{state:next||screens.find(s=>s.id===target).states[0]})});
 const states=document.querySelector('#states');states.innerHTML='';entry.states.forEach(value=>states.add(new Option(value,value,false,value===state)));states.onchange=()=>go(screen,{state:states.value});
 const f=document.querySelector('#fixtures');f.innerHTML='';Object.keys(fixtures).forEach(value=>f.add(new Option(value,value,false,value===(query.get('fixture')||entry['default-fixture']))));f.onchange=()=>go(screen,{fixture:f.value});document.querySelector('#devices').onchange=e=>go(screen,{device:e.target.value});
 window.__ready=true;window.__screen=screen;window.__state=state;
}
window.addEventListener('hashchange',render);render();
