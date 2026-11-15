// Run only in a test copy of the packaged Electron app with isolated data paths.
(function(){
 var fs=require('fs'), root=process.env.JGET_QA_ROOT;
 var IO=require('./src/iPad/IO.js').default;
 var SJ=require('./src/editor/ScratchJr.js').default;
 var Project=require('./src/editor/ui/Project.js').default;
 var report={phase:process.env.JGET_QA_PHASE||'create',versions:process.versions,arch:process.arch,checks:[]};
 function log(s){report.checks.push(s);fs.writeFileSync(root+'/current.json',JSON.stringify(report,null,2));}
 function wait(ms){return new Promise(function(r){setTimeout(r,ms);});}
 function until(fn,ms){var start=Date.now();return new Promise(function(ok,bad){function poll(){try{if(fn())return ok();}catch(e){} if(Date.now()-start>ms)return bad(Error('wait timeout'));setTimeout(poll,100);}poll();});}
 function assert(v,m){if(!v)throw Error(m);log(m);}
 if(location.href.indexOf('index.html')>=0){
  if(report.phase==='create') IO.createProject({name:'Release QA',version:window.Settings.scratchJrVersion,mtime:Date.now().toString()},function(id){fs.writeFileSync(root+'/project-id.txt',String(id));window.location.href='editor.html?pmd5='+id+'&mode=edit';});
  else window.location.href='editor.html?pmd5='+fs.readFileSync(root+'/project-id.txt','utf8')+'&mode=edit';
  return {navigation:true};
 }
 if(location.href.indexOf('editor.html')<0)return {unexpected:location.href};
 var sprite,target,paintMD5;
 return until(function(){return SJ.stage&&SJ.stage.currentPage&&SJ.getSprite()&&!SJ.onHold&&Project.mediaCount===0&&!Project.error&&document.getElementById('backdrop').style.display==='none';},20000).then(function(){
  sprite=SJ.getSprite();assert(!!sprite,'editor opened with sprite');
  if(report.phase==='reopen'){
   var expected=JSON.parse(fs.readFileSync(root+'/expected.json','utf8'));
   sprite=document.getElementById(expected.id).owner;
   var actual=sprite.getData();var saved=Project.metadata.json;if(typeof saved==='string')saved=JSON.parse(saved);var stored=saved[saved.currentPage][expected.id];report.reopenedPosition={x:actual.xcoor,y:actual.ycoor,homeX:expected.homex,homeY:expected.homey,storedX:stored.xcoor,storedY:stored.ycoor};
   assert(actual.md5===expected.md5,'painted costume restored');
   assert(JSON.stringify(actual.scripts)===JSON.stringify(expected.scripts),'keyboard collision and sound scripts restored exactly');
   assert(stored.xcoor===expected.xcoor&&stored.ycoor===expected.ycoor,'runtime position persisted in saved project');
   assert(actual.xcoor===expected.homex&&actual.ycoor===expected.homey,'reopened stage returns to saved home position');
   return;
  }
  target=SJ.stage.currentPage.addSprite(sprite.scale,sprite.md5,'QA Target');
  return until(function(){return !SJ.onHold;},10000).then(function(){
   target.setPos(420,300);
   var scripts=document.getElementById(sprite.id+'_scripts').owner;
   scripts.recreateStrip([['onkey','ArrowRight',40,40],['forward',1,120,40]]);
   scripts.recreateStrip([['onkey','я',40,140],['up',1,120,140]]);
   scripts.recreateStrip([['ontouchsprite',target.id,40,240],['forward',1,120,240]]);
   scripts.recreateStrip([['onflag','null',330,40],['playsnd','library/cat.wav',410,40]]);
   SJ.stage.currentPage.currentSpriteName=sprite.id;
   SJ.onHold=false;
   var x=sprite.xcoor;assert(SJ.runtime.startKeyScripts('ArrowRight'),'native ArrowRight trigger starts');
   return wait(2500).then(function(){report.keyboard={before:x,after:sprite.xcoor,interval:SJ.runtime.intervalId,threads:SJ.runtime.threadsRunning.map(function(t){return {sprite:t.spr.id,running:t.isRunning,block:t.thisblock&&t.thisblock.blocktype,first:t.firstBlock.blocktype};})};fs.writeFileSync(root+'/keyboard-debug.json',JSON.stringify(report.keyboard,null,2));assert(sprite.xcoor>x,'native keyboard script moves sprite');SJ.runtime.stopThreads();
    target.setPos(sprite.xcoor,sprite.ycoor);assert(sprite.touchingSprite(target.id),'target collision detected natively');target.setPos(420,300);assert(!sprite.touchingSprite(target.id),'distant target does not collide');
   });
  }).then(function(){
   var Paint=require('./src/painteditor/Paint.js').default;
   var PaintUndo=require('./src/painteditor/PaintUndo.js').default;
   var previous=sprite.md5;
   Paint.open(false,sprite.md5,sprite.id,sprite.name,sprite.scale,sprite.w,sprite.h);
   return wait(700).then(function(){
    var circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('id','release_qa_circle');circle.setAttribute('cx','30');circle.setAttribute('cy','30');circle.setAttribute('r','12');circle.setAttribute('fill','#ff2458');document.getElementById('layer1').appendChild(circle);
    PaintUndo.record();assert(PaintUndo.hasChanges,'paint editor records a drawing change');
    Paint.backToProject({preventDefault:function(){},stopPropagation:function(){}});
    return until(function(){return sprite.md5!==previous&&!SJ.onHold&&document.getElementById('frame').style.display!=='none';},15000);
   }).then(function(){assert(/\.svg$/.test(sprite.md5),'paint editor saved new SVG costume');});
  });
 }).then(function(){
  var iOS=require('./src/iPad/iOS.js').default;
  var ScratchAudio=require('./src/utils/ScratchAudio.js').default;
  var SoundLibrary=require('./src/utils/SoundLibrary.js').default;
  var ids=SoundLibrary.entries.filter(function(x){return x.id!=='pop.mp3';}).map(function(x){return x.id;});
  var context=new (window.AudioContext||window.webkitAudioContext)();
  return Promise.all(ids.map(function(id){return new Promise(function(ok,bad){var src=iOS.getSoundSource(id);var raw=atob(src.split(',')[1]);var bytes=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);context.decodeAudioData(bytes.buffer,function(){ok();},bad);});})).then(function(){context.close();assert(ids.length===43,'all 43 sounds decode in native Electron');return new Promise(function(ok,bad){ScratchAudio.loadProjectSound('library/cat.wav',function(){var s=ScratchAudio.projectSounds['library/cat.wav'], a=window.tablet.currentAudio['library/cat.wav'];var began=false,t=setTimeout(function(){bad(Error('audio timeout'));},5000);a.onplaying=function(){began=true;};a.onended=function(){clearTimeout(t);assert(began,'native cat audio playing and ended');ok();};s.play();});});});
 }).then(function(){
  if(report.phase==='create'){
   SJ.storyStart('release test');report.expected=sprite.getData();fs.writeFileSync(root+'/expected.json',JSON.stringify(report.expected,null,2));
   // Leave the edit dirty. Main process closes the native window, exercising save-before-close.
   report.readyForClose=true;
  }else report.pass=true;
  fs.writeFileSync(root+'/'+report.phase+'.json',JSON.stringify(report,null,2));return report;
 }).catch(function(e){report.pass=false;report.error=String(e.stack||e);fs.writeFileSync(root+'/'+report.phase+'.json',JSON.stringify(report,null,2));return report;});
}())
