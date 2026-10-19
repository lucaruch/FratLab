'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const M=Music, esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=(s,f)=>`${s}:${f}`, split=k=>k.split(':').map(Number);
const defaultState={selected:['0:5','0:8','1:5','1:8','2:5','2:7','3:5','3:7','4:5','4:7','5:5','5:8'],tuning:'standard',root:9,region:'3:9',mode:'scale',notation:'sharp',left:false,allNotes:false,intervals:false,title:'Pentatônica de Lá menor — shape 1',student:'',notes:'Comece devagar. Localize as tônicas em dourado e pratique o shape subindo e descendo.',id:null};
let state=structuredClone(defaultState), saved=[],undoStack=[],redoStack=[],presetTab='chords',storageOK=true;
try{const draft=JSON.parse(localStorage.getItem('fretlab.draft'));if(draft&&Array.isArray(draft.selected)&&M.tunings[draft.tuning])state={...state,...draft};saved=JSON.parse(localStorage.getItem('fretlab.shapes'))||[];if(!Array.isArray(saved))saved=[];}catch{storageOK=false;}
function validateState(){state.selected=[...new Set(state.selected.filter(k=>/^([0-5]):([0-9]|1[0-9]|2[0-4])$/.test(k)))];if(!M.tunings[state.tuning])state.tuning='standard';if(!['free','chord','scale'].includes(state.mode))state.mode='free';if(!['sharp','flat','sol'].includes(state.notation))state.notation='sharp';if(state.root!==null&&(!Number.isInteger(state.root)||state.root<0||state.root>11))state.root=null;if(!['0:12','0:5','3:9','5:12','9:17','12:24','0:24'].includes(state.region))state.region='0:12';}
validateState();
function persist(){try{localStorage.setItem('fretlab.draft',JSON.stringify(state));return true;}catch{storageOK=false;$('.autosave').textContent='Armazenamento indisponível. Exporte para guardar.';return false;}}
let toastTimer;function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function change(fn){undoStack.push(structuredClone(state));if(undoStack.length>80)undoStack.shift();redoStack=[];fn();validateState();render();persist();}
function history(dir){const from=dir==='undo'?undoStack:redoStack,to=dir==='undo'?redoStack:undoStack;if(!from.length)return;to.push(structuredClone(state));state=from.pop();stopAudio();render();persist();}
function midis(){return state.selected.map(k=>{const[s,f]=split(k);return M.tunings[state.tuning].midi[s]+f;});}
function analysis(){return M.analyze(midis(),state.root);}
function tonic(){const a=analysis();return state.root??a.chords[0]?.root??a.exact[0]?.root??null;}
function n(pc){return M.name(pc,state.notation);}
function chordName(c){return n(c.root)+c.symbol+(c.bass!==c.root?'/'+n(c.bass):'');}
function scaleName(s){return n(s.root)+' '+s.label.charAt(0).toLowerCase()+s.label.slice(1);}
function autoTitle(){const a=analysis();return (state.mode==='scale'?a.exact[0]&&scaleName(a.exact[0]):a.chords[0]&&chordName(a.chords[0]))||(a.chords[0]&&chordName(a.chords[0]))||(a.exact[0]&&scaleName(a.exact[0]))||'Shape livre';}
function boardSVG({exporting=false,mini=false}={}){
  const [start,end]=state.region.split(':').map(Number),count=end-start+1,w=Math.max(900,90+count*65),h=306,pad=67,right=18,cell=(w-pad-right)/count,y0=59,dy=36,root=tonic();
  const xFor=f=>state.left?w-right-(f-start+.5)*cell:pad+(f-start+.5)*cell;
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Braço de guitarra, casas ${start} a ${end}; primeira corda em cima" style="font-family:Arial,sans-serif">`];
  if(!exporting)parts.push(`<defs><linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#38312e"/><stop offset=".48" stop-color="#292522"/><stop offset="1" stop-color="#3a302a"/></linearGradient><linearGradient id="metal"><stop stop-color="#8d908d"/><stop offset=".5" stop-color="#d1d1c9"/><stop offset="1" stop-color="#646964"/></linearGradient></defs>`);
  parts.push(`<rect x="${pad}" y="34" width="${w-pad-right}" height="231" rx="7" fill="${exporting?'#fbfbf8':'url(#wood)'}" ${exporting?'stroke="#d6dfd8"':''}/>`);
  if(!exporting)for(let j=0;j<18;j++)parts.push(`<path d="M ${pad} ${40+j*12} Q ${w*.4} ${44+j*12} ${w-right} ${40+j*12}" stroke="#b69b79" stroke-opacity=".045" fill="none"/>`);
  for(let f=start;f<=end;f++){
    const x=xFor(f);parts.push(`<text x="${x}" y="20" text-anchor="middle" fill="${[3,5,7,9,12,15,17,19,21,24].includes(f)?'#64736d':'#a1aaa5'}" font-size="12" font-weight="${f%12===0?'700':'400'}">${f===0?'SOLTA':f}</text>`);
    if(f<end){const edge=x+(state.left?-cell/2:cell/2);parts.push(`<rect x="${edge-1}" y="34" width="${f===0?5:2}" height="231" fill="${exporting?'#bcc6bf':f===0?'#e1ddcb':'url(#metal)'}"/>`);}
    if([3,5,7,9,15,17,19,21].includes(f))parts.push(`<circle cx="${x}" cy="149" r="5.5" fill="${exporting?'#dce4df':'#a6a196'}" opacity=".4"/>`);
    if(f>0&&f%12===0)for(const yy of[113,185])parts.push(`<circle cx="${x}" cy="${yy}" r="5.5" fill="${exporting?'#dce4df':'#a6a196'}" opacity=".5"/>`);
    if([3,5,7,9,12,15,17,19,21,24].includes(f))parts.push(`<circle cx="${x}" cy="282" r="${f%12===0?3:2}" fill="#bdc8c2"/>`);
  }
  M.tunings[state.tuning].midi.forEach((m,s)=>{
    const y=y0+s*dy;parts.push(`<text x="${pad-31}" y="${y+5}" fill="#7f8e87" text-anchor="middle" font-size="14" font-weight="600">${esc(n(m))}</text><text x="${pad-50}" y="${y+4}" fill="#acb6b0" text-anchor="middle" font-size="8">${s+1}</text>`);
    parts.push(`<line x1="${pad}" y1="${y+1.2}" x2="${w-right}" y2="${y+1.2}" stroke="${exporting?'#e1e7e2':'#050505'}" stroke-width="${1+s*.37}" opacity=".6"/><line x1="${pad}" y1="${y}" x2="${w-right}" y2="${y}" stroke="${exporting?'#8c9a91':'#a3a29a'}" stroke-width="${.8+s*.38}"/>`);
    for(let f=start;f<=end;f++){
      const k=key(s,f),selected=state.selected.includes(k),pc=M.mod(m+f),isRoot=pc===root,x=xFor(f),label=n(pc),interval=root===null?'':M.intervals[M.mod(pc-root)];
      let mark='';
      if(selected){mark=`<circle cx="${x}" cy="${y}" r="17" fill="${isRoot?'#f3c56d':'#16a58c'}" stroke="${isRoot?'#ffdf9e':'#51cbb0'}" stroke-width="1.3"/><text x="${x}" y="${y+4.6}" text-anchor="middle" fill="${isRoot?'#624816':'#fff'}" font-size="${label.length>3?12:15}" font-weight="700">${esc(label)}</text>`;if(state.intervals&&interval)mark+=`<rect x="${x+9}" y="${y-23}" width="19" height="13" rx="4" fill="${exporting?'#e5eee8':'#56574d'}"/><text x="${x+18.5}" y="${y-13.4}" text-anchor="middle" fill="${exporting?'#53675a':'#f7f5eb'}" font-size="8">${esc(interval)}</text>`;}
      else if(state.allNotes)mark=`<circle cx="${x}" cy="${y}" r="13" fill="${exporting?'#edf3ee':'#3c4037'}"/><text x="${x}" y="${y+4}" text-anchor="middle" fill="${isRoot?'#d9b96a':exporting?'#93a399':'#a0aaa1'}" font-size="11">${esc(label)}</text>`;
      if(exporting||mini)parts.push(mark);else parts.push(`<g class="fret-cell" role="button" tabindex="0" data-key="${k}" aria-pressed="${selected}" aria-label="${s+1}ª corda, ${f===0?'solta':'casa '+f}, nota ${esc(label)}, ${selected?'selecionada':'não selecionada'}"><title>${s+1}ª corda · ${f===0?'solta':'casa '+f} · ${esc(label)}</title><rect class="hit" x="${x-cell/2+2}" y="${y-18}" width="${cell-4}" height="36" rx="4" fill="transparent"/>${mark}</g>`);
    }
  });parts.push('</svg>');return parts.join('');
}
function renderAnalysis(){
  const a=analysis(),r=tonic();
  if(!a.pcs.length){$('#analysis').innerHTML='<div class="analysis-empty"><span class="empty-icon">♬</span><h3>A próxima ideia começa aqui.</h3><p>Selecione notas no braço ou carregue um dos exemplos abaixo.</p></div>';return;}
  const scaleFirst=state.mode==='scale'&&a.exact.length,main=scaleFirst?a.exact[0]:a.chords[0]||a.exact[0],isChord=main&&'symbol'in main;
  const big=main?(isChord?chordName(main):n(main.root)):a.pcs.length===1?n(a.pcs[0]):'Em construção';
  const sub=main?(isChord?main.label:main.label):a.pcs.length===1?'Uma nota. O começo de uma ideia.':'Nenhuma correspondência exata no catálogo.';
  let html=`<div><div class="analysis-kicker">${main?(isChord?'ACORDE IDENTIFICADO':'ESCALA IDENTIFICADA'):'SUAS NOTAS'}</div><h2 class="chord-name">${esc(big)}</h2><p class="chord-description">${esc(sub)}</p>${main?'<span class="match-badge">✓ Correspondência exata</span>':''}${isChord&&main.bass!==main.root?`<p class="analysis-hint">Inversão com ${esc(n(main.bass))} no baixo.</p>`:''}</div><div><div class="analysis-separator"></div><div class="analysis-subtitle"><span class="tiny-label">NOTAS DO SHAPE</span><span>${state.selected.length} posições</span></div><div class="note-chips">${a.pcs.map(p=>`<span class="note-chip ${p===r?'root':''}">${esc(n(p))}<small>${r===null?'nota':esc(M.intervals[M.mod(p-r)])}</small></span>`).join('')}</div></div>`;
  const otherChords=a.chords.filter(c=>c!==main),otherExact=a.exact.filter(s=>s!==main);
  if(otherChords.length)html+=`<div><div class="analysis-separator"></div><span class="tiny-label">${isChord?'OUTRAS LEITURAS':'TAMBÉM FORMA ACORDE'}</span>${otherChords.slice(0,3).map(c=>`<button class="result-link" data-root="${c.root}">${esc(chordName(c))}<small>${esc(c.label)}</small></button>`).join('')}</div>`;
  if(otherExact.length)html+=`<div><div class="analysis-separator"></div><span class="tiny-label">ESCALAS EXATAS</span>${otherExact.slice(0,3).map(s=>`<button class="result-link" data-root="${s.root}">${esc(scaleName(s))}</button>`).join('')}</div>`;
  if(!a.exact.length&&a.compatible.length){html+=`<div><div class="analysis-separator"></div><span class="tiny-label">ESCALAS QUE CONTÊM ESTAS NOTAS</span>${a.compatible.slice(0,3).map(s=>`<button class="result-link" data-root="${s.root}">${esc(scaleName(s))}<small>+${s.missing} notas</small></button>`).join('')}<p class="analysis-hint">Compatíveis com a seleção. Faltam notas para formar a escala inteira.</p></div>`;}
  html+=`<div class="analysis-info"><span>ⓘ</span><span>${state.root===null?'A mesma coleção de notas pode ter mais de um nome. Defina a tônica para orientar a análise.':'Tônica definida: '+esc(n(state.root))+'. Escalas são comparadas por notas, sem depender da posição no braço.'}</span></div>`;$('#analysis').innerHTML=html;
}
function render(){
  $('#fretboard').innerHTML=boardSVG();$('#fretboard svg').style.minWidth=(state.region==='0:24'?'1530px':state.notation==='sol'?'800px':'690px');
  $('#tuning').value=state.tuning;$('#root').value=state.root===null?'auto':state.root;$('#region').value=state.region;$('#notation').value=state.notation;
  $('#allNotes').checked=state.allNotes;$('#intervals').checked=state.intervals;$('#leftHand').setAttribute('aria-pressed',state.left);
  $$('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===state.mode));
  $('#modeHelp').textContent={free:'Clique nas casas para adicionar ou remover notas.',chord:'Uma nota por corda. Clique novamente para remover.',scale:'Selecione várias notas e defina a tônica.'}[state.mode];
  const [start,end]=state.region.split(':').map(Number),hidden=state.selected.filter(k=>{const f=split(k)[1];return f<start||f>end;}).length;
  $('#hiddenNotes').textContent=hidden?`${hidden} fora da região`:'';$('#hiddenNotes').title='As notas fora da região continuam na análise e na reprodução. Amplie a região para visualizá-las.';
  $('#undo').disabled=!undoStack.length;$('#redo').disabled=!redoStack.length;$('#play').disabled=!state.selected.length;
  $('#shapeTitle').value=state.title;$('#student').value=state.student;$('#lessonNotes').value=state.notes;$('#saveShape').textContent=state.id?'✓ Atualizar shape':'＋ Salvar shape';$('#savedCount').textContent=saved.length;
  renderAnalysis();if(!storageOK)$('.autosave').textContent='Armazenamento indisponível. Exporte para guardar.';
}
function selectPosition(k){change(()=>{if(state.selected.includes(k))state.selected=state.selected.filter(x=>x!==k);else{if(state.mode==='chord')state.selected=state.selected.filter(x=>split(x)[0]!==split(k)[0]);state.selected.push(k);}});if(audioCtx&&audioCtx.state==='running'){const[s,f]=split(k);pluck(M.tunings[state.tuning].midi[s]+f,audioCtx.currentTime,.6);}}
$('#fretboard').addEventListener('click',e=>{const cell=e.target.closest('[data-key]');if(cell)selectPosition(cell.dataset.key);});
$('#fretboard').addEventListener('keydown',e=>{const cell=e.target.closest('[data-key]');if(!cell)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();const k=cell.dataset.key;selectPosition(k);$(`[data-key="${k}"]`)?.focus();}else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();let[s,f]=split(cell.dataset.key);if(e.key==='ArrowLeft')f+=state.left?1:-1;if(e.key==='ArrowRight')f+=state.left?-1:1;if(e.key==='ArrowUp')s--;if(e.key==='ArrowDown')s++;$(`[data-key="${key(s,f)}"]`)?.focus();}});
$('#tuning').innerHTML=Object.entries(M.tunings).map(([k,v])=>`<option value="${k}">${v.name}</option>`).join('');
for(let i=0;i<12;i++){$('#root').insertAdjacentHTML('beforeend',`<option value="${i}">${M.sharp[i]}${M.sharp[i]!==M.flat[i]?' / '+M.flat[i]:''}</option>`);$('#generateRoot').insertAdjacentHTML('beforeend',`<option value="${i}">${M.sharp[i]}</option>`);}
$('#generateRoot').value=9;
$('#tuning').onchange=e=>change(()=>{stopAudio();state.tuning=e.target.value;toast('Afinação alterada. As posições foram mantidas; as notas foram recalculadas.');});
$('#root').onchange=e=>change(()=>{state.root=e.target.value==='auto'?null:Number(e.target.value);});
$('#region').onchange=e=>change(()=>state.region=e.target.value);$('#notation').onchange=e=>change(()=>state.notation=e.target.value);
$('#allNotes').onchange=e=>change(()=>state.allNotes=e.target.checked);$('#intervals').onchange=e=>change(()=>state.intervals=e.target.checked);$('#leftHand').onclick=()=>change(()=>state.left=!state.left);
$('#clear').onclick=()=>{stopAudio();change(()=>{state.selected=[];state.id=null;state.title='';state.notes='';});};
$('#undo').onclick=()=>history('undo');$('#redo').onclick=()=>history('redo');
$$('[data-mode]').forEach(b=>b.onclick=()=>change(()=>{state.mode=b.dataset.mode;if(state.mode==='chord'){const strings=new Set();state.selected=state.selected.filter(k=>{const s=split(k)[0];if(strings.has(s))return false;strings.add(s);return true;});}}));
$('#analysis').onclick=e=>{const b=e.target.closest('[data-root]');if(b)change(()=>state.root=Number(b.dataset.root));};
for(const [id,prop]of[['shapeTitle','title'],['student','student'],['lessonNotes','notes']])$('#'+id).oninput=e=>{state[prop]=e.target.value;persist();};
function transpose(delta){if(!state.selected.length)return toast('Selecione notas para transpor.');const frets=state.selected.map(k=>split(k)[1]);if(Math.min(...frets)+delta<0||Math.max(...frets)+delta>24)return toast('O shape alcançou o limite do braço (casas 0–24).');change(()=>{state.selected=state.selected.map(k=>{const[s,f]=split(k);return key(s,f+delta);});if(state.root!==null)state.root=M.mod(state.root+delta);state.title='';state.id=null;const[a,b]=state.region.split(':').map(Number);if(state.selected.some(k=>{const f=split(k)[1];return f<a||f>b;}))state.region='0:24';});}
$('#transposeUp').onclick=()=>transpose(1);$('#transposeDown').onclick=()=>transpose(-1);
const chordPresets=[{label:'C',sub:'Dó maior',frets:[0,1,0,2,3,-1],root:0},{label:'G',sub:'Sol maior',frets:[3,0,0,0,2,3],root:7},{label:'D',sub:'Ré maior',frets:[2,3,2,0,-1,-1],root:2},{label:'Am',sub:'Lá menor',frets:[0,1,2,2,0,-1],root:9},{label:'Em',sub:'Mi menor',frets:[0,0,0,2,2,0],root:4}];
const scalePresets=[{label:'Am',sub:'Pentatônica menor',root:9,index:3},{label:'C',sub:'Escala maior',root:0,index:0},{label:'A',sub:'Blues menor',root:9,index:4},{label:'D',sub:'Modo dórico',root:2,index:5},{label:'G',sub:'Mixolídio',root:7,index:8}];
function miniChord(frets){let s='<svg class="mini-diagram" viewBox="0 0 80 62" aria-hidden="true">';for(let i=0;i<6;i++)s+=`<line x1="${15+i*10}" y1="12" x2="${15+i*10}" y2="57" stroke="#d3ded8" stroke-width=".8"/>`;for(let f=0;f<5;f++)s+=`<line x1="15" y1="${12+f*11}" x2="65" y2="${12+f*11}" stroke="#b6c9bd" stroke-width="${f===0?2:1}"/>`;frets.slice().reverse().forEach((f,i)=>s+=f>0?`<circle cx="${15+i*10}" cy="${6+f*11}" r="3.4" fill="#23947b"/>`:`<text x="${15+i*10}" y="7" text-anchor="middle" font-family="Arial" font-size="6" fill="#84988c">${f===0?'○':'×'}</text>`);return s+'</svg>';}
function miniScale(root,index){let s='<svg class="mini-diagram" viewBox="0 0 95 62" aria-hidden="true">';for(let i=0;i<6;i++){s+=`<line x1="7" y1="${9+i*9}" x2="88" y2="${9+i*9}" stroke="#c5d7cb" stroke-width=".8"/>`;for(let f=5;f<=8;f++)if(M.scales[index][1].includes(M.mod(M.tunings.standard.midi[i]+f-root)))s+=`<circle cx="${17+(f-5)*20}" cy="${9+i*9}" r="3.5" fill="${M.mod(M.tunings.standard.midi[i]+f)===root?'#dfb562':'#23947b'}"/>`;}for(let f=0;f<5;f++)s+=`<line x1="${7+f*20}" y1="9" x2="${7+f*20}" y2="54" stroke="#d3ded8" stroke-width=".8"/>`;return s+'</svg>';}
function renderPresets(){const presets=presetTab==='chords'?chordPresets:scalePresets;$('#presets').innerHTML=presets.map((p,i)=>`<button class="preset-card" data-preset="${i}"><strong>${p.label}</strong><span>${p.sub}</span>${presetTab==='chords'?miniChord(p.frets):miniScale(p.root,p.index)}</button>`).join('');$('#generateType').innerHTML=(presetTab==='chords'?M.chords:M.scales).map((c,i)=>`<option value="${i}">${esc(presetTab==='chords'?c[1]:c[0])}</option>`).join('');}
$$('[data-preset-tab]').forEach(b=>b.onclick=()=>{presetTab=b.dataset.presetTab;$$('[data-preset-tab]').forEach(x=>x.classList.toggle('selected',x===b));renderPresets();});
$('#presets').onclick=e=>{const b=e.target.closest('[data-preset]');if(!b)return;const p=(presetTab==='chords'?chordPresets:scalePresets)[Number(b.dataset.preset)];if(presetTab==='chords')change(()=>{state.tuning='standard';state.root=p.root;state.mode='chord';state.selected=p.frets.flatMap((f,s)=>f<0?[]:[key(s,f)]);state.region='0:5';state.title=p.sub+' — acorde aberto';state.id=null;state.notes='';});else loadScale(p.root,p.index);};
function loadScale(root,index){let end=8;change(()=>{state.root=root;state.mode='scale';state.id=null;state.notes='';state.title=M.name(root)+' — '+M.scales[index][0];const ints=M.scales[index][1];for(end=8;end<=16;end++){state.selected=[];for(let s=0;s<6;s++)for(let f=5;f<=end;f++)if(ints.includes(M.mod(M.tunings[state.tuning].midi[s]+f-root)))state.selected.push(key(s,f));if(new Set(midis().map(M.mod)).size===ints.length)break;}state.region=end<=9?'3:9':end<=12?'5:12':'0:24';});toast(`Notas da escala nas casas 5–${end}. Você pode ampliar o shape.`);}
function loadChord(root,index){
  const ints=M.chords[index][2],tune=M.tunings[state.tuning].midi;
  // Search compact voicings: one position per string, <= four frets, every chord tone present.
  let best=null;
  for(let start=0;start<=12;start++){
    const options=tune.map(m=>[-1,...Array.from({length:5},(_,i)=>start+i).filter(f=>ints.includes(M.mod(m+f-root)))]);
    const walk=(s,frets,mask,count)=>{if(s===6){if(count<Math.max(3,ints.length)||mask!==(1<<ints.length)-1)return;const active=frets.filter(f=>f>=0),positive=active.filter(f=>f>0);if(positive.length&&Math.max(...positive)-Math.min(...positive)>4)return;const notes=frets.flatMap((f,i)=>f>=0?[tune[i]+f]:[]),bass=M.mod(Math.min(...notes));const score=start*1.2+(6-count)*1.6+(bass===root?0:6)+positive.reduce((a,b)=>a+b,0)*.05;if(!best||score<best.score)best={score,frets:[...frets],start};return;}for(const f of options[s]){const idx=ints.indexOf(M.mod(tune[s]+f-root));walk(s+1,[...frets,f],f<0?mask:mask|(1<<idx),count+(f>=0?1:0));}};walk(0,[],0,0);
  }
  if(!best)return toast('Não encontramos uma digitação compacta para este acorde e afinação. Experimente outro tipo.');
  change(()=>{state.selected=best.frets.flatMap((f,s)=>f<0?[]:[key(s,f)]);state.root=root;state.mode='chord';state.id=null;state.title=M.name(root)+M.chords[index][0]+' — '+M.chords[index][1];state.notes='';state.region=Math.max(...best.frets)<=5?'0:5':Math.max(...best.frets)<=12?'0:12':'0:24';});toast('Digitação sugerida. Ajuste as posições conforme o conforto da mão.');
}
$('#generate').onclick=()=>{const r=Number($('#generateRoot').value),i=Number($('#generateType').value);presetTab==='chords'?loadChord(r,i):loadScale(r,i);};
function showView(view){const lib=view==='library';$('#studioView').hidden=lib;$('#libraryView').hidden=!lib;$('#navStudio').classList.toggle('active',!lib);$('#navLibrary').classList.toggle('active',lib);$('.page-title').hidden=lib;if(lib)renderLibrary();}
$('#navStudio').onclick=()=>showView('studio');$('#navLibrary').onclick=()=>showView('library');
$('#newShape').onclick=()=>{change(()=>{state.id=null;state.selected=[];state.title='';state.student='';state.notes='';state.root=null;state.mode='free';});showView('studio');};
$('#saveShape').onclick=()=>{if(!state.selected.length)return toast('Marque pelo menos uma nota antes de salvar.');const previous=structuredClone(saved),oldId=state.id;state.title=state.title.trim()||autoTitle();state.id=state.id||('shape-'+Date.now()+'-'+Math.random().toString(36).slice(2,7));const record={...structuredClone(state),updated:new Date().toISOString()};const i=saved.findIndex(s=>s.id===state.id);i<0?saved.unshift(record):saved.splice(i,1,record);try{localStorage.setItem('fretlab.shapes',JSON.stringify(saved));}catch{saved=previous;state.id=oldId;return toast('Não foi possível salvar neste navegador. Exporte o material para guardar.');}persist();render();toast(i<0?'Shape salvo em Meus shapes.':'Shape atualizado.');};
function renderLibrary(){
  $('#savedShapes').innerHTML=saved.length?saved.map(s=>{const previous=state;let svg='';try{state={...defaultState,...s};validateState();svg=boardSVG({exporting:true});}finally{state=previous;}return `<article class="saved-card"><span class="tiny-label">${esc(M.tunings[s.tuning]?.name||'Guitarra')}</span><h3>${esc(s.title||'Shape livre')}</h3><p>${esc(s.student?'Aluno(a): '+s.student:'Sua coleção de ideias')} · ${new Date(s.updated).toLocaleDateString('pt-BR')}</p>${svg}<button class="button small" data-load="${esc(s.id)}">Abrir no estúdio ↗</button><button class="text-button" data-delete="${esc(s.id)}">Excluir</button></article>`;}).join(''):'<div class="library-empty"><div class="empty-icon">♬</div><h3>Uma coleção só sua.</h3><p>Crie um shape no estúdio e clique em “Salvar shape”.</p></div>';
}
let deletedShape=null;
$('#savedShapes').onclick=e=>{const load=e.target.closest('[data-load]'),del=e.target.closest('[data-delete]');if(load){const s=saved.find(x=>x.id===load.dataset.load);if(s){change(()=>state={...defaultState,...structuredClone(s)});showView('studio');toast('Shape carregado.');}}if(del){const id=del.dataset.delete,i=saved.findIndex(x=>x.id===id);if(i<0)return;deletedShape={item:saved[i],index:i};const next=saved.filter(x=>x.id!==id);try{localStorage.setItem('fretlab.shapes',JSON.stringify(next));saved=next;if(state.id===id)state.id=null;persist();$('#savedCount').textContent=saved.length;renderLibrary();toast('Shape excluído. Ctrl+Z nesta tela para restaurar.');}catch{toast('Não foi possível excluir o shape.');}}};
let audioCtx=null,activeVoices=[],audioTimer=null;
function pluck(midi,when,duration=1.8){if(!audioCtx)return;const osc=audioCtx.createOscillator(),gain=audioCtx.createGain(),filter=audioCtx.createBiquadFilter();osc.type='triangle';osc.frequency.value=440*2**((midi-69)/12);filter.type='lowpass';filter.frequency.setValueAtTime(3600,when);filter.frequency.exponentialRampToValueAtTime(550,when+duration);gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(.13,when+.006);gain.gain.exponentialRampToValueAtTime(.001,when+duration);osc.connect(filter);filter.connect(gain);gain.connect(audioCtx.destination);osc.start(when);osc.stop(when+duration+.03);activeVoices.push(osc);osc.onended=()=>activeVoices=activeVoices.filter(v=>v!==osc);}
function stopAudio(){activeVoices.forEach(o=>{try{o.stop();}catch{}});activeVoices=[];clearTimeout(audioTimer);$('#play').textContent='▶';$('#play').setAttribute('aria-label','Ouvir notas selecionadas');$('#audioStatus').textContent='Uma ideia também precisa soar bem.';}
$('#play').onclick=async()=>{if(activeVoices.length){stopAudio();return;}try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();await audioCtx.resume();let notes=midis(),mode=$('#playMode').value;if(!notes.length)return;if(mode==='ascending'||mode==='descending')notes=[...new Set(notes)].sort((a,b)=>mode==='ascending'?a-b:b-a);else notes.sort((a,b)=>a-b);const step=60/Number($('#tempo').value)/2,start=audioCtx.currentTime+.04;notes.forEach((m,i)=>pluck(m,start+(mode==='together'?i*.018:i*step)));$('#play').textContent='■';$('#play').setAttribute('aria-label','Parar reprodução');$('#audioStatus').textContent='Reproduzindo · som sintetizado';audioTimer=setTimeout(stopAudio,((mode==='together'?notes.length*.018:(notes.length-1)*step)+1.9)*1000);}catch{toast('O áudio não pôde iniciar. Verifique o som e as permissões do navegador.');}};
$('#tempo').oninput=e=>$('#tempoValue').textContent=e.target.value+' BPM';
$('#lessonMode').onclick=()=>{document.body.classList.toggle('lesson-mode');if(document.body.classList.contains('lesson-mode')){showView('studio');toast('Modo aula ativado. Pressione Esc para sair.');}};
$('#exitLesson').onclick=()=>document.body.classList.remove('lesson-mode');
$('#help').onclick=()=>$('#helpDialog').showModal();$('#closeHelp').onclick=()=>$('#helpDialog').close();
document.addEventListener('keydown',e=>{if(e.key==='Escape'){document.body.classList.remove('lesson-mode');stopAudio();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)){e.preventDefault();if(!$('#libraryView').hidden&&deletedShape){const previous=[...saved];saved.splice(deletedShape.index,0,deletedShape.item);try{localStorage.setItem('fretlab.shapes',JSON.stringify(saved));deletedShape=null;$('#savedCount').textContent=saved.length;renderLibrary();toast('Shape restaurado.');}catch{saved=previous;toast('Não foi possível restaurar.');}}else history(e.shiftKey?'redo':'undo');}});
// Exports are generated locally: a high-resolution PNG and a real downloadable PDF.
function wrapLines(text,max=100){const lines=[];for(const line of String(text).split('\n')){let current='';for(const word of line.split(' ')){if(current.length+word.length>max&&current){lines.push(current);current=word;}else current+=(current?' ':'')+word;}lines.push(current);}return lines;}
function exportSVG(){
  const include=$('#exportNotes').checked,a=analysis(),title=state.title.trim()||autoTitle(),subtitle=a.chords[0]?chordName(a.chords[0])+' · '+a.chords[0].label:a.exact[0]?scaleName(a.exact[0]):'Shape livre · '+a.pcs.map(n).join(' · '),notes=include?wrapLines(state.notes,112):[];
  // Expand the exported region to include all selected positions.
  const previous=state.region,frets=state.selected.map(k=>split(k)[1]);if(frets.length){const [lo,hi]=previous.split(':').map(Number);if(Math.min(...frets)<lo||Math.max(...frets)>hi)state.region='0:24';}
  let board;try{board=boardSVG({exporting:true});}finally{state.region=previous;}
  const vb=board.match(/viewBox="0 0 (\d+) (\d+)"/),bw=Number(vb[1]),bh=Number(vb[2]),width=Math.max(1400,bw+100),scale=(width-100)/bw,boardH=bh*scale;
  const titleLines=wrapLines(title,Math.floor((width-100)/24)),headerH=185+titleLines.length*47+(include&&state.student?34:0),bodyY=headerH+boardH+26,height=Math.ceil(bodyY+137+notes.length*27+(notes.length?38:0));
  const embedded=board.replace('<svg ',`<svg x="50" y="${headerH}" `).replace(/width="\d+" height="\d+" role=/,`width="${width-100}" height="${boardH}" role=`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="font-family:Arial,sans-serif"><rect width="100%" height="100%" fill="white"/><text x="55" y="49" fill="#078a73" font-size="23" font-weight="700">fretlab.</text><text x="${width-55}" y="47" text-anchor="end" fill="#89968f" font-size="13">MATERIAL DE AULA · GUITARRA</text><line x1="55" y1="70" x2="${width-55}" y2="70" stroke="#e5ece7"/>${titleLines.map((l,i)=>`<text x="55" y="${124+i*47}" font-size="36" font-weight="700" fill="#243d31">${esc(l)}</text>`).join('')}<text x="55" y="${133+titleLines.length*47}" font-size="18" fill="#708479">${esc(subtitle)}</text>${include&&state.student?`<text x="55" y="${164+titleLines.length*47}" font-size="18" fill="#708479">Aluno(a): ${esc(state.student)}</text>`:''}${embedded}<text x="55" y="${bodyY}" font-size="17" fill="#4f6a5c">Notas: ${esc(a.pcs.map(n).join(' · '))}</text><text x="55" y="${bodyY+32}" font-size="16" fill="#7a8d82">${esc(M.tunings[state.tuning].name)} · ${tonic()===null?'Tônica automática':'Tônica: '+esc(n(tonic()))} · Dourado = tônica · Verde = nota · Corda sem marcação = não tocar</text>${notes.length?`<line x1="55" y1="${bodyY+57}" x2="${width-55}" y2="${bodyY+57}" stroke="#e5ece7"/><text x="55" y="${bodyY+90}" fill="#5d7467" font-size="13" font-weight="700">ANOTAÇÕES DA AULA</text>${notes.map((l,i)=>`<text x="55" y="${bodyY+122+i*27}" font-size="18" fill="#667e6f">${esc(l)}</text>`).join('')}`:''}<text x="55" y="${height-28}" fill="#a0ada5" font-size="12">Criado no FretLab · ${new Date().toLocaleDateString('pt-BR')} · Primeira corda (mais aguda) em cima</text></svg>`;
}
$('#exportOpen').onclick=()=>{if(!state.selected.length)return toast('Selecione notas para criar o seu material.');$('#exportDialog').showModal();prepareExports();};
$('#exportNotes').onchange=()=>prepareExports();
// Draw the generated geometric diagram directly on canvas. No Image/blob URL
// decoding or external resources are needed, so the canvas remains origin-clean.
function raster(svg=exportSVG()){
  const parsed=new DOMParser().parseFromString(svg,'image/svg+xml');
  if(parsed.querySelector('parsererror'))throw Error('Não foi possível ler o diagrama.');
  const root=parsed.documentElement,canvas=document.createElement('canvas');
  canvas.width=Math.ceil(Number(root.getAttribute('width'))*1.5);canvas.height=Math.ceil(Number(root.getAttribute('height'))*1.5);
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Seu navegador não disponibilizou a área de desenho.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.scale(1.5,1.5);
  function paint(el,parentW,parentH){
    const attr=(name,fallback=0)=>{const value=el.getAttribute(name);return value===null?fallback:parseFloat(value);};
    const length=(name,total)=>{const value=el.getAttribute(name)||'0';return value.endsWith('%')?parseFloat(value)*total/100:parseFloat(value);};
    const tag=el.localName;ctx.save();ctx.globalAlpha*=attr('opacity',1);
    ctx.fillStyle=el.getAttribute('fill')||'#000';ctx.strokeStyle=el.getAttribute('stroke')||'transparent';ctx.lineWidth=attr('stroke-width',1);
    if(tag==='svg'){
      const vb=(el.getAttribute('viewBox')||`0 0 ${parentW} ${parentH}`).split(/\s+/).map(Number),w=length('width',parentW)||vb[2],h=length('height',parentH)||vb[3];
      ctx.translate(attr('x'),attr('y'));ctx.scale(w/vb[2],h/vb[3]);ctx.translate(-vb[0],-vb[1]);
      for(const child of el.children)paint(child,vb[2],vb[3]);
    }else if(tag==='rect'||tag==='circle'){
      ctx.beginPath();if(tag==='circle')ctx.arc(attr('cx'),attr('cy'),attr('r'),0,Math.PI*2);
      else if(ctx.roundRect&&attr('rx'))ctx.roundRect(attr('x'),attr('y'),length('width',parentW),length('height',parentH),attr('rx'));
      else ctx.rect(attr('x'),attr('y'),length('width',parentW),length('height',parentH));
      if(el.getAttribute('fill')!=='none')ctx.fill();if(el.hasAttribute('stroke'))ctx.stroke();
    }else if(tag==='line'){
      ctx.beginPath();ctx.moveTo(attr('x1'),attr('y1'));ctx.lineTo(attr('x2'),attr('y2'));ctx.stroke();
    }else if(tag==='text'){
      ctx.font=`${el.getAttribute('font-weight')||'400'} ${attr('font-size',16)}px Arial, sans-serif`;
      ctx.textAlign=({middle:'center',end:'right'})[el.getAttribute('text-anchor')]||'left';ctx.textBaseline='alphabetic';ctx.fillText(el.textContent,attr('x'),attr('y'));
    }else if(tag==='g'){for(const child of el.children)paint(child,parentW,parentH);}
    ctx.restore();
  }
  paint(root,Number(root.getAttribute('width')),Number(root.getAttribute('height')));return canvas;
}
function canvasBlob(canvas,type){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('A geração do arquivo demorou demais. Tente novamente.')),20000);try{canvas.toBlob(blob=>{clearTimeout(timer);blob?resolve(blob):reject(Error('O navegador não conseguiu gerar o arquivo.'));},type,.95);}catch(error){clearTimeout(timer);reject(error);}});}
let exportGeneration=0,exportUrls=[];
function resetExportLinks(){for(const id of['exportPng','exportPdf','openPng','openPdf']){const a=$('#'+id);a.removeAttribute('href');a.removeAttribute('download');a.setAttribute('aria-disabled','true');}$('#exportFallback').hidden=true;}
async function prepareExports(){
  const generation=++exportGeneration;resetExportLinks();$('#exportRetry').hidden=true;$('#exportStatus').textContent='Preparando sua imagem e seu PDF…';
  // Retain previous URLs while another tab or the browser download may still use them.
  const previousUrls=exportUrls;exportUrls=[];setTimeout(()=>previousUrls.forEach(url=>URL.revokeObjectURL(url)),300000);
  try{
    const svg=exportSVG();$('#exportPreview').innerHTML=svg;
    const name=(state.title.trim()||autoTitle()).replace(/[^\p{L}\p{N}\s_-]/gu,'').trim().replace(/\s+/g,'-').slice(0,85)||'fretlab-shape';
    await new Promise(resolve=>setTimeout(resolve,0));if(generation!==exportGeneration)return;
    const canvas=raster(svg),[png,jpeg]=await Promise.all([canvasBlob(canvas,'image/png'),canvasBlob(canvas,'image/jpeg')]);
    const pdf=makePDF(new Uint8Array(await jpeg.arrayBuffer()),canvas.width,canvas.height);if(generation!==exportGeneration)return;
    for(const [type,blob]of[['png',png],['pdf',pdf]]){
      const url=URL.createObjectURL(blob);exportUrls.push(url);const link=$('#export'+(type==='png'?'Png':'Pdf')),open=$('#open'+(type==='png'?'Png':'Pdf'));
      link.href=url;link.download=name+'.'+type;link.removeAttribute('aria-disabled');open.href=url;open.removeAttribute('aria-disabled');
    }
    $('#exportStatus').textContent='Arquivos prontos. Escolha abaixo para baixar.';$('#exportFallback').hidden=false;
  }catch(error){if(generation!==exportGeneration)return;resetExportLinks();$('#exportStatus').textContent='Não foi possível gerar os arquivos. '+(error.message||'Tente novamente.');$('#exportRetry').hidden=false;}
}
$('#exportRetry').onclick=()=>prepareExports();
for(const id of['exportPng','exportPdf'])$('#'+id).addEventListener('click',event=>{if(!event.currentTarget.hasAttribute('href'))event.preventDefault();});
function makePDF(jpeg,w,h){
  const enc=new TextEncoder(),parts=[],offsets=[0];let length=0;const add=v=>{const bytes=typeof v==='string'?enc.encode(v):v;parts.push(bytes);length+=bytes.length;},obj=(id,content)=>{offsets[id]=length;add(`${id} 0 obj\n${content}\nendobj\n`);};
  const landscape=w>h*1.1,pw=landscape?841.89:595.28,ph=landscape?595.28:841.89,scale=Math.min((pw-44)/w,(ph-44)/h),iw=w*scale,ih=h*scale,x=(pw-iw)/2,y=(ph-ih)/2;
  add('%PDF-1.4\n');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');obj(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4]=length;add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);add(jpeg);add('\nendstream\nendobj\n');const stream=`q\n${iw.toFixed(3)} 0 0 ${ih.toFixed(3)} ${x.toFixed(3)} ${y.toFixed(3)} cm\n/Im0 Do\nQ\n`;obj(5,`<< /Length ${enc.encode(stream).length} >>\nstream\n${stream}endstream`);const xref=length;add('xref\n0 6\n0000000000 65535 f \n');for(let i=1;i<6;i++)add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);return new Blob(parts,{type:'application/pdf'});
}
renderPresets();render();persist();
