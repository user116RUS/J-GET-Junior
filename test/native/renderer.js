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
 function mouse(node,type,point){var b=node.getBoundingClientRect();var e=new MouseEvent(type,{bubbles:true,cancelable:true,button:0,buttons:type==='mousedown'?1:0,clientX:point?point.x:b.left+b.width/2,clientY:point?point.y:b.top+b.height/2});node.dispatchEvent(e);return e;}
 function capture(name){return wait(250).then(function(){return new Promise(function(ok,bad){try{require('electron').remote.getCurrentWindow().capturePage(function(img){try{fs.writeFileSync(root+'/'+name+'.png',img.toPNG());ok();}catch(e){bad(e);}});}catch(e){bad(e);}});});}
 function foreground(){var w=require('electron').remote.getCurrentWindow();w.show();w.focus();w.webContents.focus();return until(function(){return !document.hidden&&document.hasFocus();},6000).then(function(){report.focus={hidden:document.hidden,hasFocus:document.hasFocus()};});}
 function firstMovement(trigger){return new Promise(function(ok,bad){if(document.hidden||!document.hasFocus())return bad(Error('Foreground input measurement requires a visible focused window'));var before={x:sprite.xcoor,y:sprite.ycoor};var original=sprite.setPos;var start=performance.now();var result={before:before,syntheticDOM:true};var timeout=setTimeout(function(){sprite.setPos=original;bad(Error('No first movement within 2500 ms; focus='+document.hasFocus()+', hidden='+document.hidden));},2500);sprite.setPos=function(x,y){var value=original.apply(this,arguments);if(x!==before.x||y!==before.y){sprite.setPos=original;clearTimeout(timeout);result.firstMovementMs=performance.now()-start;result.after={x:this.xcoor,y:this.ycoor};ok(result);}return value;};try{trigger();result.handlerMs=performance.now()-start;}catch(e){sprite.setPos=original;clearTimeout(timeout);bad(e);}});}
 function nativeInputChecks(scripts){
  if(process.platform!=='darwin'&&process.env.JGET_QA_INPUT!=='1'){
   report.inputLatency={skipped:true,reason:'Foreground DOM input checks are opt-in outside macOS (JGET_QA_INPUT=1).'};
   return Promise.resolve();
  }
  var Menu=require('./src/editor/blocks/Menu.js').default;
  var Library=require('./src/editor/ui/Library.js').default;
  var Palette=require('./src/editor/ui/Palette.js').default;
  var Events=require('./src/utils/Events.js').default;
  var spaceBlock=scripts.getBlocksType(['onkey']).filter(function(b){return b.getArgValue()==='ArrowLeft';})[0];
  return foreground().then(function(){
   mouse(spaceBlock.arg.div,'mousedown');
   var space=document.querySelector('.keyboard-menu [data-key="Space"]');
   assert(space&&space.textContent==='Пробел','native keyboard picker contains Пробел');
   var rect=space.getBoundingClientRect();var menu=Menu.openMenu.getBoundingClientRect();report.spaceMenuBounds={viewport:{width:window.innerWidth,height:window.innerHeight},frame:document.getElementById('frame').getBoundingClientRect().toJSON?document.getElementById('frame').getBoundingClientRect().toJSON():String(document.getElementById('frame').getBoundingClientRect()),menu:{left:menu.left,top:menu.top,right:menu.right,bottom:menu.bottom},choice:{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom}};
   assert(rect.width>0&&rect.height>0&&rect.left>=menu.left&&rect.right<=menu.right+1&&rect.bottom<=menu.bottom+1,'Space picker choice fits inside visible menu');
   return capture('space-picker').then(function(){mouse(space,'mousedown');assert(spaceBlock.getArgValue()==='Space'&&spaceBlock.arg.keyLabel.textContent==='Пробел','native menu selection updates Space block and label');assert(spaceBlock.arg.keyLabel.scrollWidth<=spaceBlock.arg.keyLabel.clientWidth+1,'Space block label is not clipped');return capture('space-block');});
  }).then(function(){
   if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();
   var e=new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true});
   return firstMovement(function(){document.body.dispatchEvent(e);if(!e.defaultPrevented)throw Error('DOM Space keydown did not reach keyboard handler');}).then(function(result){report.spaceInput=result;assert(e.defaultPrevented,'real DOM Space keydown reaches keyboard handler');assert(result.after.y<result.before.y,'Space keydown moves sprite upward');SJ.runtime.stopThreads();});
  }).then(function(){
   Library.open('costumes');
   return until(function(){var n=document.getElementById('scrollarea');return n&&n.childElementCount>1;},5000);
  }).then(function(){
   var before=performance.now();mouse(document.querySelector('#libframe .cancelicon'),'mousedown');
   assert(!SJ.onHold&&document.getElementById('frame').style.display!=='none','library cancel leaves editor ready in same event turn');
   mouse(document.getElementById('selectors').childNodes[2].childNodes[0],'mousedown');
   assert(Palette.numcat===1,'category changes immediately after library cancel');
   report.cancelToCategoryMs=performance.now()-before;
   report.inputLatency={syntheticDOM:true,click:[],flag:[]};
   var sequence=Promise.resolve();
   for(var n=0;n<5;n++)sequence=sequence.then(function(){
    SJ.runtime.stopThreads();sprite.goHome();target.setPos(420,300);
    var stage=SJ.stage;var b=stage.div.getBoundingClientRect();
    var point={x:b.left+sprite.xcoor*stage.stageScale,y:b.top+sprite.ycoor*stage.stageScale};
    var pressAt=performance.now();mouse(stage.div,'mousedown',point);var pressMs=performance.now()-pressAt;
    assert(Events.dragthumbnail&&Events.dragthumbnail.owner===sprite,'synthetic stage press hit-tests the intended character');
    return firstMovement(function(){mouse(stage.div,'mouseup',point);}).then(function(result){result.pressHandlerMs=pressMs;report.inputLatency.click.push(result);SJ.runtime.stopThreads();return wait(50);});
   });
   for(var j=0;j<5;j++)sequence=sequence.then(function(){
    SJ.runtime.stopThreads();sprite.goHome();target.setPos(420,300);
    return firstMovement(function(){mouse(document.getElementById('go'),'mousedown');}).then(function(result){report.inputLatency.flag.push(result);SJ.runtime.stopThreads();return wait(50);});
   });
   return sequence;
  }).then(function(){
   ['click','flag'].forEach(function(kind){var samples=report.inputLatency[kind].map(function(r){return r.firstMovementMs;}).sort(function(a,b){return a-b;});report.inputLatency[kind+'SummaryMs']={min:samples[0],median:samples[2],max:samples[4]};});
   log('foreground synthetic character-click and green-flag timing collected (five runs each)');
   return capture('input-stage');
  });
 }
 function projectSoundChecks(){var helper={exports:{}};new Function('require','module','exports',fs.readFileSync(root+'/project-sounds.js','utf8'))(require,helper,helper.exports);return helper.exports({phase:report.phase,SJ:SJ,Project:Project,report:report,assert:assert,wait:wait,until:until,mouse:mouse,capture:capture,sprite:sprite,target:target,root:root,requireApp:require});}
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
   return projectSoundChecks();
  }
  target=SJ.stage.currentPage.addSprite(sprite.scale,sprite.md5,'QA Target');
  return until(function(){return !SJ.onHold;},10000).then(function(){
   target.homex=420;target.homey=300;target.setPos(420,300);
   var scripts=document.getElementById(sprite.id+'_scripts').owner;
   scripts.recreateStrip([['onkey','ArrowRight',40,40],['forward',1,120,40]]);
   scripts.recreateStrip([['onkey','я',40,140],['up',1,120,140]]);
   scripts.recreateStrip([['ontouchsprite',target.id,40,240],['forward',1,120,240]]);
   scripts.recreateStrip([['onflag','null',330,40],['playsnd','library/cat.wav',410,40]]);
   scripts.recreateStrip([['onkey','ArrowLeft',330,140],['up',1,410,140]]);
   scripts.recreateStrip([['onclick','null',330,240],['forward',1,410,240]]);
   scripts.recreateStrip([['onflag','null',40,340],['forward',1,120,340]]);
   SJ.stage.currentPage.setCurrentSprite(sprite);
   require('./src/editor/ui/Thumbs.js').default.selectThisSprite(sprite);
   SJ.onHold=false;
   var x=sprite.xcoor;assert(SJ.runtime.startKeyScripts('ArrowRight'),'native ArrowRight trigger starts');
   return wait(2500).then(function(){report.keyboard={before:x,after:sprite.xcoor,interval:SJ.runtime.intervalId,threads:SJ.runtime.threadsRunning.map(function(t){return {sprite:t.spr.id,running:t.isRunning,block:t.thisblock&&t.thisblock.blocktype,first:t.firstBlock.blocktype};})};fs.writeFileSync(root+'/keyboard-debug.json',JSON.stringify(report.keyboard,null,2));assert(sprite.xcoor>x,'native keyboard script moves sprite');SJ.runtime.stopThreads();
    target.setPos(sprite.xcoor,sprite.ycoor);assert(sprite.touchingSprite(target.id),'target collision detected natively');target.setPos(420,300);assert(!sprite.touchingSprite(target.id),'distant target does not collide');
   }).then(function(){return nativeInputChecks(scripts);}).then(projectSoundChecks);
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
