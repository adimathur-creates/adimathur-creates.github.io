const fs=require('fs'),path=require('path');
const src=f=>fs.readFileSync(path.join(__dirname,'src',f),'utf8');
const wrap=f=>`(function(){var module={exports:{}};\n${src(f)}\n;Object.assign(window,module.exports);})();`;
const js=['amount.js','engine.js','cases.js','sim.js'].map(wrap).join('\n')+'\n'+src('app.js');
const html=src('page.html').replace('/*__SCRIPTS__*/',()=>js.replace(/<\/script/gi,'<\\/script'));
const out=path.join(__dirname,'dist','paytm-agent-safe-links');
fs.mkdirSync(out,{recursive:true}); fs.writeFileSync(path.join(out,'index.html'),html);
console.log('built',html.length,'bytes');
