(function(g){
  const mod=n=>((n%12)+12)%12;
  const sharp=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  const flat=['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
  const sol=['Dó','Dó♯','Ré','Ré♯','Mi','Fá','Fá♯','Sol','Sol♯','Lá','Lá♯','Si'];
  const chords=[['','maior',[0,4,7]],['m','menor',[0,3,7]],['5','power chord',[0,7]],['dim','diminuto',[0,3,6]],['aug','aumentado',[0,4,8]],['sus2','suspenso 2',[0,2,7]],['sus4','suspenso 4',[0,5,7]],['6','maior com sexta',[0,4,7,9]],['m6','menor com sexta',[0,3,7,9]],['7','sétima dominante',[0,4,7,10]],['maj7','maior com sétima maior',[0,4,7,11]],['m7','menor com sétima',[0,3,7,10]],['m(maj7)','menor com sétima maior',[0,3,7,11]],['m7♭5','meio diminuto',[0,3,6,10]],['dim7','diminuto com sétima',[0,3,6,9]],['add9','maior com nona adicionada',[0,2,4,7]],['madd9','menor com nona adicionada',[0,2,3,7]],['9','dominante com nona',[0,2,4,7,10]],['maj9','maior com nona',[0,2,4,7,11]],['m9','menor com nona',[0,2,3,7,10]],['7sus4','dominante suspenso',[0,5,7,10]],['11','dominante com décima primeira',[0,2,4,5,7,10]],['13','dominante com décima terceira',[0,2,4,5,7,9,10]]];
  const scales=[['Maior (jônio)',[0,2,4,5,7,9,11]],['Menor natural (eólio)',[0,2,3,5,7,8,10]],['Pentatônica maior',[0,2,4,7,9]],['Pentatônica menor',[0,3,5,7,10]],['Blues menor',[0,3,5,6,7,10]],['Dórico',[0,2,3,5,7,9,10]],['Frígio',[0,1,3,5,7,8,10]],['Lídio',[0,2,4,6,7,9,11]],['Mixolídio',[0,2,4,5,7,9,10]],['Lócrio',[0,1,3,5,6,8,10]],['Menor harmônica',[0,2,3,5,7,8,11]],['Menor melódica',[0,2,3,5,7,9,11]],['Tons inteiros',[0,2,4,6,8,10]],['Diminuta semitom–tom',[0,1,3,4,6,7,9,10]],['Cromática',[0,1,2,3,4,5,6,7,8,9,10,11]]];
  const tunings={standard:{name:'Padrão · E A D G B E',midi:[64,59,55,50,45,40]},dropd:{name:'Drop D · D A D G B E',midi:[64,59,55,50,45,38]},half:{name:'½ tom abaixo · E♭',midi:[63,58,54,49,44,39]},dadgad:{name:'DADGAD',midi:[62,57,55,50,45,38]},openg:{name:'Open G · D G D G B D',midi:[62,59,55,50,43,38]}};
  const name=(pc,notation='sharp')=>(notation==='flat'?flat:notation==='sol'?sol:sharp)[mod(pc)];
  const intervals=['1','♭2','2','♭3','3','4','♭5','5','♭6','6','♭7','7'];
  function analyze(midis,root=null){
    const pcs=[...new Set(midis.map(mod))].sort((a,b)=>a-b), bass=midis.length?mod(Math.min(...midis)):null;
    const results=[];
    if(pcs.length>=2)for(let r=0;r<12;r++)for(const [symbol,label,ints] of chords){if(ints.length===pcs.length&&ints.every(i=>pcs.includes(mod(r+i))))results.push({root:r,symbol,label,ints,bass,score:(r===root?100:0)+(r===bass?15:0)});}
    results.sort((a,b)=>b.score-a.score);
    const exact=[],compatible=[];
    if(pcs.length>=3)for(let r=0;r<12;r++)for(const [label,ints] of scales){if(root!==null&&root!==r)continue;if(pcs.every(p=>ints.includes(mod(p-r)))){const result={root:r,label,ints,missing:ints.length-pcs.length};(result.missing===0?exact:compatible).push(result);}}
    compatible.sort((a,b)=>a.missing-b.missing||Number(b.root===bass)-Number(a.root===bass));
    return {pcs,bass,chords:results,exact,compatible};
  }
  g.Music={mod,sharp,flat,name,chords,scales,tunings,intervals,analyze};
})(globalThis);
