// Convert the three approved SVG cover masters to native editable PPTX objects.
// Run with the artifact-tool workspace runtime. This is the Canva import source.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {Presentation, PresentationFile} from '@oai/artifact-tool';

const root=process.env.BLOG_ROOT || process.cwd();
const skill=process.env.PRESENTATION_SKILL_DIR;
if(!skill) throw new Error('Set PRESENTATION_SKILL_DIR to the active presentation skill');
const build=process.env.BLOG_COVER_BUILD || path.join(root,'.codex-quality/cover-master-build');
const output=path.join(root,'design/cover-masters/BlueDog-Cover-Masters.pptx');
await fs.mkdir(build,{recursive:true});
await fs.mkdir(path.dirname(output),{recursive:true});
const python=process.env.RUNTIME_PYTHON || 'python3';
const parse=`import sys,json,xml.etree.ElementTree as E
def visit(e, inherited):
 a={**inherited,**e.attrib};tag=e.tag.split('}')[-1]
 if tag in ('rect','line','circle','path','text'):
  rows.append({'tag':tag,'attrs':a,'text':''.join(e.itertext()) if tag=='text' else ''})
 for child in e:visit(child,a)
rows=[];visit(E.parse(sys.argv[1]).getroot(),{});print(json.dumps(rows,ensure_ascii=False))`;
const presentation=Presentation.create({slideSize:{width:1200,height:630}});
const num=(a,key,otherwise=0)=>Number(a[key]??otherwise);
function line(a){return {style:a['stroke-dasharray']?'dashed':'solid',fill:a.stroke||'none',width:num(a,'stroke-width',1)}}
function addPath(slide,a,name){
 const tokens=a.d.match(/[MLHVZ]|-?\d+(?:\.\d+)?/gi);
 const commands=[];let x=0,y=0,command;const points=[];
 for(let i=0;i<tokens.length;){
  if(/[MLHVZ]/i.test(tokens[i]))command=tokens[i++].toUpperCase();
  if(command==='Z'){commands.push({close:{}});command=null;continue;}
  if(command==='M'||command==='L'){
   x=Number(tokens[i++]);y=Number(tokens[i++]);
   commands.push(command==='M'?{moveTo:{x,y}}:{lineTo:{x,y}});
   if(command==='M')command='L';
  } else if(command==='H'){x=Number(tokens[i++]);commands.push({lineTo:{x,y}});}
  else if(command==='V'){y=Number(tokens[i++]);commands.push({lineTo:{x,y}});}
  else throw new Error(`Unsupported SVG path ${a.d}`);
  points.push({x,y});
 }
 const left=Math.min(...points.map(p=>p.x)),top=Math.min(...points.map(p=>p.y));
 const width=Math.max(1,Math.max(...points.map(p=>p.x))-left),height=Math.max(1,Math.max(...points.map(p=>p.y))-top);
 const translated=commands.map(c=>c.moveTo?{moveTo:{x:c.moveTo.x-left,y:c.moveTo.y-top}}:c.lineTo?{lineTo:{x:c.lineTo.x-left,y:c.lineTo.y-top}}:c);
 slide.shapes.add({geometry:'custom',name,position:{left,top,width,height},fill:a.fill||'none',line:line(a),customPaths:[{width,height,commands:translated}]});
}
const textWidths={'brand-name':500,'brand-strapline':310,'content-type':650,'publish-date':160,'author':300,'content-id':320,'domain':170,'topic-label':230};
for(const kind of ['analysis','guide','reading']){
 const svg=path.join(root,`static/branding/cover-${kind}.svg`);
 const rows=JSON.parse(execFileSync(python,['-c',parse,svg],{encoding:'utf8'}));
 const slide=presentation.slides.add();slide.background.fill='#f4f4f2';
 for(const [i,row] of rows.entries()){
  const a=row.attrs,name=`${kind}-${a.id||row.tag+'-'+i}`;
  if(row.tag==='text'){
   const size=num(a,'font-size',21),x=num(a,'x'),y=num(a,'y');
   const shape=slide.shapes.add({geometry:'textbox',name,position:{left:x,top:y-size*.87,width:textWidths[a.id]||(a.id?.startsWith('title-line')?700:230),height:size*1.35},fill:'none',line:{fill:'none',width:0}});
   shape.text=row.text;
   shape.text.style={fontSize:size,typeface:a['font-family']||'Arial',bold:num(a,'font-weight',400)>=600,color:a.fill||'#11151c',insets:0,wrap:'none',autoFit:'none',verticalAlignment:'top'};
  }else if(row.tag==='path')addPath(slide,a,name);
  else if(row.tag==='line'){
   addPath(slide,{...a,d:`M${a.x1} ${a.y1}L${a.x2} ${a.y2}`,fill:'none'},name);
  }else{
   const circle=row.tag==='circle',r=num(a,'r');
   slide.shapes.add({geometry:circle?'ellipse':'rect',name,
    position:{left:circle?num(a,'cx')-r:num(a,'x'),top:circle?num(a,'cy')-r:num(a,'y'),width:circle?r*2:num(a,'width'),height:circle?r*2:num(a,'height')},
    fill:a.fill||'none',line:line(a),...(a.rx?{borderRadius:num(a,'rx')}: {})});
  }
 }
 const png=await presentation.export({slide,format:'png',scale:1});
 await fs.writeFile(path.join(build,`${kind}.png`),new Uint8Array(await png.arrayBuffer()));
}
const candidate=path.join(build,'candidate.pptx');
await (await PresentationFile.exportPptx(presentation)).save(candidate);
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
const result=await finalizePresentation({workspaceDir:root,candidatePath:candidate,finalPath:output,
 pythonExecutable:python,
 integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
 layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
 layoutArgs:['--expected-slide-size-emu','11430000,6000750','--validate-heading-fit'],
 explicitTotalSlideCount:3,requiredNativeTableOwnerSlides:[],requiredNativeChartOwnerSlides:[],
 fontPolicy:{basis:'design',families:['Arial','PingFang SC']},verifyArtifactToolImport:true,
 receiptPath:path.join(build,'validation.json')});
console.log(JSON.stringify({output,result}));
