import{NtfySignaling,createSessionSecret,normalizeSessionInput,sessionLabel}from"./signaling.js?v=0.3.0";
import{PeerSession}from"./peer.js?v=0.3.0";
import{TransferManager}from"./transfer.js?v=0.3.0";
const $=id=>document.getElementById(id);
const ui={home:$("home-view"),connection:$("connection-view"),workspace:$("workspace-view"),shell:$("app-shell"),status:$("global-status"),joinToggle:$("join-toggle-btn"),joinForm:$("join-form"),joinInput:$("join-input"),role:$("room-role"),title:$("room-title"),detail:$("room-detail"),shareActions:$("share-actions"),share:$("share-btn"),copy:$("copy-btn"),code:$("session-code"),peerOrb:$("peer-orb"),peerState:$("peer-state"),peerDetail:$("peer-detail"),path:$("path-badge"),transferArea:$("transfer-area"),dropZone:$("drop-zone"),fileInput:$("file-input"),transferCard:$("transfer-card"),transferName:$("transfer-name"),transferMeta:$("transfer-meta"),transferState:$("transfer-state"),progressBar:$("progress-bar"),progressText:$("progress-text"),speedText:$("speed-text"),transferActions:$("transfer-actions"),incoming:$("incoming-card"),incomingName:$("incoming-name"),incomingMeta:$("incoming-meta"),accept:$("accept-file-btn"),reject:$("reject-file-btn"),signalingState:$("signaling-state"),rtcState:$("rtc-state"),channelState:$("channel-state"),sinkState:$("sink-state"),debug:$("debug-log"),leave:$("leave-btn"),installBanner:$("install-banner"),installBtn:$("install-btn"),installCopy:$("install-copy"),installDismiss:$("install-dismiss"),qr:$("qr-display"),homeCode:$("home-session-code"),pairingStatus:$("pairing-status"),scan:$("scan-qr-btn"),homeShare:$("home-share-btn"),homeCopy:$("home-copy-btn"),newCode:$("new-code-btn"),scanner:$("scanner-layer"),scannerVideo:$("qr-video"),scannerStatus:$("scan-status"),scannerClose:$("scan-close-btn"),scannerImage:$("scan-image-input"),backToQr:$("back-to-qr-btn"),transferQr:$("transfer-qr-btn"),backToSession:$("back-to-session-btn"),connectionNew:$("connection-new-btn"),connectionCode:$("connection-code"),transferCode:$("transfer-session-code")};
let signaling=null,peer=null,transfers=null,secret="",shareUrl="",pendingIncoming=null,currentReceived=null,deferredInstallPrompt=null;
let generation=0,recoveryTimer=null,watchdog=null,networkRetry=null;
let scannerStream=null,scannerFrame=0,scannerOpen=false,scanCanvas=null;
let currentScene="pair",manualPairing=false,hasDiscoveredPeer=false;
const SAVE_KEY="shotbylove:v2:last-session",DEVICE_KEY="shotbylove:v2:device";
function saved(key){try{return localStorage.getItem(key)||""}catch{return""}}
function store(key,value){try{localStorage.setItem(key,value)}catch{}}
const deviceId=saved(DEVICE_KEY)||crypto.randomUUID();store(DEVICE_KEY,deviceId);
function log(message){const time=new Date().toLocaleTimeString([],{hour12:false});ui.debug.textContent+="["+time+"] "+message+"\n";ui.debug.scrollTop=ui.debug.scrollHeight}
function humanSize(bytes){const units=["B","KB","MB","GB","TB"];let value=bytes,i=0;while(value>=1024&&i<units.length-1){value/=1024;i++}const display=value>=100?value.toFixed(0):value>=10?value.toFixed(1):value.toFixed(2);return display+" "+units[i]}
function showScene(next,{manual=false,force=false}={}){
  if(!force&&manualPairing&&next!=="pair")return;
  if(next==="pair"&&manual)manualPairing=true;
  if(force&&next!=="pair")manualPairing=false;
  currentScene=next;
  const views={pair:ui.home,connecting:ui.connection,transfer:ui.workspace};
  for(const [name,element] of Object.entries(views)){
    const visible=name===next;
    element.classList.toggle("hidden",!visible);
    element.inert=!visible;
  }
  ui.shell.dataset.scene=next;
  const canReturn=Boolean(peer?.remoteId||peer?.channel?.readyState==="open"||hasDiscoveredPeer);
  ui.backToSession.classList.toggle("hidden",!canReturn);
  window.scrollTo?.(0,0);
}
function showQrManually(){showScene("pair",{manual:true,force:true})}
function returnToSession(){
  const online=peer?.channel?.readyState==="open";
  showScene(online?"transfer":hasDiscoveredPeer?"connecting":"pair",{force:true});
}
const isStandalone=()=>window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
if(isStandalone())document.body.classList.add("is-standalone");
window.matchMedia("(display-mode: standalone)").addEventListener?.("change",()=>{
  document.body.classList.toggle("is-standalone",isStandalone());
  if(isStandalone())ui.installBanner.classList.add("hidden");
});
function resetProgress(){ui.progressBar.style.width="0%";ui.progressText.textContent="0%";ui.speedText.textContent="—";ui.transferActions.innerHTML=""}
function showTransfer(meta,state){ui.transferCard.classList.remove("hidden");ui.transferName.textContent=meta.name;ui.transferMeta.textContent=humanSize(meta.size);ui.transferState.textContent=state;resetProgress()}
function updateProgress(detail){const pct=detail.total?Math.min(100,detail.loaded/detail.total*100):0;ui.progressBar.style.width=pct+"%";ui.progressText.textContent=pct.toFixed(pct<10?1:0)+"% · "+humanSize(detail.loaded)+" / "+humanSize(detail.total);ui.speedText.textContent=detail.rate;ui.transferState.textContent=detail.direction==="send"?"Sending":"Receiving"}
function addCancelButton(){ui.transferActions.innerHTML="";const button=document.createElement("button");button.className="ghost-button";button.textContent="취소";button.onclick=()=>transfers?.cancelActive();ui.transferActions.append(button)}

async function releaseReceived(){
  const current=currentReceived;
  currentReceived=null;
  if(!current)return;
  try{if(current.objectUrl)URL.revokeObjectURL(current.objectUrl)}catch{}
  try{await current.result?.cleanup?.()}catch{}
}

function asNamedFile(meta,blob){
  try{
    if(blob instanceof File&&blob.name===meta.name)return blob;
    return new File([blob],meta.name,{
      type:meta.type||blob.type||"application/octet-stream",
      lastModified:meta.lastModified||Date.now()
    });
  }catch{
    return blob;
  }
}

async function saveReceivedFile(){
  const current=currentReceived;
  if(!current)return;
  const {meta,result}=current;
  const blob=result.blob;
  ui.transferState.textContent="Saving…";

  try{
    if(typeof window.showSaveFilePicker==="function"){
      const handle=await window.showSaveFilePicker({suggestedName:meta.name});
      const writable=await handle.createWritable();
      if(typeof blob.stream==="function"){
        await blob.stream().pipeTo(writable);
      }else{
        await writable.write(blob);
        await writable.close();
      }
      ui.transferState.textContent="Saved";
      log("saved via File System Access");
      return;
    }

    const namedFile=asNamedFile(meta,blob);
    if(namedFile instanceof File&&typeof navigator.share==="function"&&typeof navigator.canShare==="function"&&navigator.canShare({files:[namedFile]})){
      await navigator.share({files:[namedFile],title:meta.name});
      ui.transferState.textContent="Saved / shared";
      log("native save/share sheet completed");
      return;
    }

    const downloadBlob=blob.type==="application/octet-stream"?blob:new Blob([blob],{type:"application/octet-stream"});
    const url=URL.createObjectURL(downloadBlob);
    if(current.objectUrl)URL.revokeObjectURL(current.objectUrl);
    current.objectUrl=url;

    const link=document.createElement("a");
    link.href=url;
    link.download=meta.name;
    link.target="_self";
    link.rel="noopener";
    document.body.append(link);
    link.click();
    link.remove();

    ui.transferState.textContent="Download started";
    log("browser download fallback triggered");

    setTimeout(()=>{
      if(currentReceived===current&&current.objectUrl===url){
        try{URL.revokeObjectURL(url)}catch{}
        current.objectUrl=null;
      }
    },120000);
  }catch(error){
    if(error?.name==="AbortError"){
      ui.transferState.textContent="저장 가능";
      log("save cancelled");
      return;
    }
    ui.transferState.textContent="Save failed";
    log("save error: "+(error?.message||String(error)));
  }
}

async function showReceivedFile(meta,result){
  await releaseReceived();
  currentReceived={meta,result,objectUrl:null};

  const button=document.createElement("button");
  button.className="small-button";
  const namedFile=asNamedFile(meta,result.blob);
  const canNativeShare=namedFile instanceof File&&typeof navigator.share==="function"&&typeof navigator.canShare==="function"&&navigator.canShare({files:[namedFile]});
  button.textContent=canNativeShare?"저장 / 공유":"파일 저장";
  button.type="button";
  button.onclick=saveReceivedFile;
  ui.transferActions.append(button);

  ui.transferState.textContent="Ready to save";
  log("receive complete via "+result.kind+" · ready to save");
}

function renderQR(){
  ui.qr.replaceChildren();
  if(typeof window.QRCode!=="function"){ui.qr.textContent="Use Copy link";return}
  try{new window.QRCode(ui.qr,{text:shareUrl,width:220,height:220,colorDark:"#0b0d10",colorLight:"#ffffff",correctLevel:window.QRCode.CorrectLevel.M})}
  catch(e){log("QR generation: "+e.message);ui.qr.textContent="Use Copy link"}
}
function stopTimers(){clearTimeout(recoveryTimer);clearTimeout(watchdog);clearTimeout(networkRetry);recoveryTimer=watchdog=networkRetry=null}
function waiting(message="연결 대기"){
  ui.peerOrb.className="peer-orb";ui.peerState.textContent="상대 기기 대기 중";
  ui.peerDetail.textContent=message;ui.pairingStatus.textContent=message;ui.status.textContent="대기";
  ui.path.textContent="—";ui.transferArea.classList.add("hidden");
}
async function disposeTransfers(){
  const old=transfers;transfers=null;
  if(!old)return;
  if(old.incoming||old.outgoing){
    ui.transferState.textContent="전송 중단 · 다시 선택";ui.transferActions.innerHTML="";
    ui.incoming.classList.add("hidden");pendingIncoming=null;
  }
  try{await old.dispose()}catch(e){log("cleanup: "+e.message)}
}
async function endConnection(){
  stopTimers();const p=peer,s=signaling;peer=null;signaling=null;
  p?.close();s?.close();await disposeTransfers();
}
function watchdogFor(p){
  clearTimeout(watchdog);
  watchdog=setTimeout(()=>{if(peer===p&&p.channel?.readyState!=="open")scheduleRecovery(500)},22000);
}
function makePeer(){
  if(!signaling)return null;
  const p=new PeerSession(signaling);peer=p;
  const valid=()=>peer===p;
  ui.rtcState.textContent="new";ui.channelState.textContent="closed";
  p.addEventListener("peer-seen",()=>{
    if(!valid())return;
    hasDiscoveredPeer=true;
    ui.peerState.textContent="연결 중";
    ui.peerDetail.textContent="상대 기기 확인됨";
    ui.pairingStatus.textContent="연결 중";
    showScene("connecting");
    watchdogFor(p);
  });
  p.addEventListener("peer-switch",()=>{if(valid())scheduleRecovery(0)});
  p.addEventListener("state",event=>{
    if(!valid())return;
    ui.rtcState.textContent=event.detail;log("webrtc: "+event.detail);
    if(event.detail==="connected"){
      clearTimeout(recoveryTimer);recoveryTimer=null;clearTimeout(watchdog);watchdog=null;
      ui.peerOrb.className="peer-orb online";ui.status.textContent="연결됨";
      setTimeout(async()=>{if(valid())ui.path.textContent=await p.connectionPath()},800);
    }else if(event.detail==="failed")scheduleRecovery(1500);
    else if(event.detail==="disconnected")scheduleRecovery(7000);
  });
  p.addEventListener("channel",async event=>{
    if(!valid())return;
    clearTimeout(recoveryTimer);recoveryTimer=null;clearTimeout(watchdog);watchdog=null;
    await disposeTransfers();if(!valid())return;
    ui.channelState.textContent="open";ui.transferArea.classList.remove("hidden");
    ui.peerOrb.className="peer-orb online";ui.status.textContent="연결됨";
    ui.peerState.textContent="연결됨";ui.peerDetail.textContent="";
    ui.pairingStatus.textContent="연결됨";
    showScene("transfer");
    transfers=new TransferManager(event.detail,p.safeChunkSize());bindTransfers(transfers);
    log("data channel open · chunk "+p.safeChunkSize()+" bytes");
  });
  p.addEventListener("channel-close",()=>{
    if(!valid())return;ui.channelState.textContent="closed";scheduleRecovery(1200);
  });
  p.addEventListener("error",event=>{
    if(!valid())return;log("peer error: "+event.detail.message);
    if(p.channel?.readyState!=="open")scheduleRecovery(4000);
  });
  return p;
}
function scheduleRecovery(delay){
  if(recoveryTimer||!signaling)return;
  const stamp=generation,p=peer;
  ui.status.textContent="재연결";ui.peerOrb.className="peer-orb";
  ui.peerState.textContent="재연결 중";
  ui.peerDetail.textContent="";
  ui.pairingStatus.textContent="재연결 중";
  showScene("connecting");
  recoveryTimer=setTimeout(async()=>{
    recoveryTimer=null;
    if(generation!==stamp||!signaling||peer!==p||p?.channel?.readyState==="open")return;
    p?.close();peer=null;await disposeTransfers();
    if(generation!==stamp||!signaling)return;
    waiting("같은 코드로 재연결 중");
    ui.peerState.textContent="재연결 중";
    showScene("connecting");
    const next=makePeer();
    if(signaling.opened)next.announce().catch(e=>log("reconnect announce: "+e.message));
  },delay);
}
async function beginSession(input,{join=false}={}){
  const key=normalizeSessionInput(input);if(!key)return;
  const stamp=++generation;
  await endConnection();if(stamp!==generation)return;
  secret=key;shareUrl=location.origin+location.pathname+"#join/"+secret;
  store(SAVE_KEY,secret);
  manualPairing=false;hasDiscoveredPeer=join;
  showScene(join?"connecting":"pair",{force:true});
  ui.role.textContent="PRIVATE SESSION";ui.title.textContent="연결 대기";
  ui.detail.textContent="";
  ui.shareActions.classList.remove("hidden");ui.signalingState.textContent="connecting";
  waiting();if(join){ui.peerState.textContent="연결 중";ui.peerDetail.textContent="상대 기기 찾는 중";}
  ui.homeCode.textContent="준비 중";ui.code.textContent="—";renderQR();
  const label=await sessionLabel(key);if(stamp!==generation)return;
  ui.homeCode.textContent=label;ui.code.textContent=label;ui.connectionCode.textContent=label;ui.transferCode.textContent=label;
  const s=new NtfySignaling(key,deviceId);signaling=s;
  s.addEventListener("state",event=>{
    if(stamp!==generation||signaling!==s)return;
    ui.signalingState.textContent=event.detail;log("signaling: "+event.detail);
    if(event.detail==="connected"&&peer&&peer.channel?.readyState!=="open")peer.announce().catch(e=>log(e.message));
    if(event.detail==="reconnecting"&&peer?.channel?.readyState!=="open")
      ui.pairingStatus.textContent="서버 재연결 중";
  });
  try{
    await s.connect();if(stamp!==generation){s.close();return}
    const p=makePeer();await p.announce();log("session ready for pairing");
  }catch(e){
    if(stamp!==generation)return;
    log("signaling error: "+e.message);
    ui.status.textContent="오프라인";ui.peerState.textContent="연결 실패";
    ui.peerDetail.textContent="네트워크 확인 필요";
    ui.pairingStatus.textContent="네트워크 확인 필요";
    networkRetry=setTimeout(()=>{if(stamp===generation)beginSession(secret,{join:currentScene==="connecting"})},12000);
  }
}
async function copyLink(button){
  if(!shareUrl)return;
  try{
    await navigator.clipboard.writeText(shareUrl);
    const previous=button.textContent;button.textContent="복사됨";
    setTimeout(()=>button.textContent=previous,1400);
  }catch(e){log("clipboard: "+e.message);ui.pairingStatus.textContent="복사 실패"}
}
async function shareLink(){
  if(!shareUrl)return;
  if(navigator.share){
    try{await navigator.share({title:"shotbylove",text:"Join my file transfer",url:shareUrl});return}
    catch(e){if(e?.name==="AbortError")return}
  }
  await copyLink(ui.homeShare);
}
function stopScanner(){
  scannerOpen=false;if(scannerFrame)cancelAnimationFrame(scannerFrame);scannerFrame=0;
  scannerStream?.getTracks().forEach(t=>t.stop());scannerStream=null;
  ui.scannerVideo.pause();ui.scannerVideo.srcObject=null;ui.scanner.classList.add("hidden");
}
function scanned(value){
  const key=normalizeSessionInput(value);
  if(!key){ui.scannerStatus.textContent="유효하지 않은 QR 코드입니다";return false}
  stopScanner();
  if(key===secret){ui.pairingStatus.textContent="이미 연결된 세션입니다";return true}
  history.replaceState(null,"",location.pathname+location.search+"#join/"+key);
  beginSession(key,{join:true});return true;
}
function scanLoop(){
  if(!scannerOpen)return;
  const v=ui.scannerVideo;
  if(v.readyState>=2&&v.videoWidth&&typeof window.jsQR==="function"){
    scanCanvas??=document.createElement("canvas");
    const scale=Math.min(1,768/v.videoWidth);
    const w=Math.round(v.videoWidth*scale),h=Math.round(v.videoHeight*scale);
    scanCanvas.width=w;scanCanvas.height=h;
    const ctx=scanCanvas.getContext("2d",{willReadFrequently:true});
    ctx.drawImage(v,0,0,w,h);
    const code=window.jsQR(ctx.getImageData(0,0,w,h).data,w,h,{inversionAttempts:"attemptBoth"});
    if(code&&scanned(code.data))return;
  }
  scannerFrame=requestAnimationFrame(scanLoop);
}
async function openScanner(){
  if(scannerOpen)return;scannerOpen=true;ui.scanner.classList.remove("hidden");
  ui.scannerStatus.textContent="QR 코드를 비춰주세요";
  if(typeof window.jsQR!=="function"){ui.scannerStatus.textContent="QR 인식을 지원하지 않습니다";return}
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error("Camera is not supported");
    const stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280}}});
    if(!scannerOpen){stream.getTracks().forEach(t=>t.stop());return}
    scannerStream=stream;ui.scannerVideo.srcObject=stream;await ui.scannerVideo.play();
    if(scannerOpen)scanLoop();
  }catch(e){ui.scannerStatus.textContent="카메라 사용 불가 · 사진에서 선택";log("camera: "+e.message)}
}
async function scanImage(file){
  if(!file||typeof window.jsQR!=="function")return;
  let bitmap;
  try{
    bitmap=await createImageBitmap(file);
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const w=Math.round(bitmap.width*scale),h=Math.round(bitmap.height*scale);
    const c=document.createElement("canvas");c.width=w;c.height=h;
    const ctx=c.getContext("2d",{willReadFrequently:true});
    ctx.drawImage(bitmap,0,0,w,h);
    const code=window.jsQR(ctx.getImageData(0,0,w,h).data,w,h,{inversionAttempts:"attemptBoth"});
    if(!code||!scanned(code.data))ui.scannerStatus.textContent="QR 코드를 찾지 못했습니다";
  }catch(e){ui.scannerStatus.textContent="이미지를 읽지 못했습니다";log("image QR: "+e.message)}
  finally{bitmap?.close?.();ui.scannerImage.value=""}
}
function bindTransfers(manager){const bind=(type,fn)=>manager.addEventListener(type,event=>{if(transfers===manager)fn(event)});
  bind("incoming",event=>{showScene("transfer",{force:true});pendingIncoming=event.detail.meta;ui.incoming.classList.remove("hidden");ui.incomingName.textContent=pendingIncoming.name;ui.incomingMeta.textContent=humanSize(pendingIncoming.size)+" · "+(pendingIncoming.type||"unknown type");log("incoming offer: "+pendingIncoming.name+" ("+pendingIncoming.size+" bytes)")});
  bind("offered",event=>{showTransfer(event.detail.meta,"수락 대기");addCancelButton();log("file offered: "+event.detail.meta.name)});
  bind("sink",event=>{ui.sinkState.textContent=event.detail.kind;log("receive sink: "+event.detail.kind)});
  bind("progress",event=>updateProgress(event.detail));
  bind("awaiting-confirmation",event=>{ui.transferState.textContent="완료 확인 중";ui.speedText.textContent="";log("all chunks queued · waiting for receiver acknowledgement")});
  bind("rejected",event=>{ui.transferState.textContent="거절됨";ui.transferActions.innerHTML="";log("file rejected: "+event.detail.reason)});
  bind("cancelled",()=>{ui.transferState.textContent="취소됨";ui.transferActions.innerHTML="";ui.incoming.classList.add("hidden");log("transfer cancelled")});
  bind("error",event=>{ui.transferState.textContent="Error";ui.transferActions.innerHTML="";log("transfer error: "+event.detail.error.message)});
  bind("complete",async event=>{const direction=event.detail.direction,meta=event.detail.meta,result=event.detail.result;ui.transferState.textContent="완료";ui.progressBar.style.width="100%";ui.progressText.textContent="100% · "+humanSize(meta.size);ui.transferActions.innerHTML="";if(direction==="receive"&&result?.blob){await showReceivedFile(meta,result)}else log("send complete")})
}
async function sendFile(file){if(!transfers||!file)return;try{showTransfer({name:file.name,size:file.size},"준비 중");const meta=transfers.offer(file);showTransfer(meta,"수락 대기");addCancelButton()}catch(error){log("send error: "+error.message)}}

ui.joinToggle.addEventListener("click",()=>{ui.joinForm.classList.toggle("hidden");if(!ui.joinForm.classList.contains("hidden"))ui.joinInput.focus()});
ui.joinForm.addEventListener("submit",event=>{
  event.preventDefault();const key=normalizeSessionInput(ui.joinInput.value);
  if(!key){ui.joinInput.setCustomValidity("전체 세션 링크나 22자리 키를 입력해 주세요");ui.joinInput.reportValidity();return}
  ui.joinInput.setCustomValidity("");ui.joinForm.classList.add("hidden");
  history.replaceState(null,"",location.pathname+location.search+"#join/"+key);beginSession(key,{join:true});
});
ui.newCode.addEventListener("click",()=>{history.replaceState(null,"",location.pathname+location.search);beginSession(createSessionSecret())});
ui.scan.addEventListener("click",openScanner);
ui.backToQr.addEventListener("click",showQrManually);
ui.transferQr.addEventListener("click",showQrManually);
ui.backToSession.addEventListener("click",returnToSession);
ui.connectionNew.addEventListener("click",()=>{
  history.replaceState(null,"",location.pathname+location.search);
  beginSession(createSessionSecret());
});
ui.scannerClose.addEventListener("click",stopScanner);
document.addEventListener("keydown",event=>{if(event.key==="Escape"&&scannerOpen)stopScanner()});
ui.scannerImage.addEventListener("change",()=>scanImage(ui.scannerImage.files?.[0]));
ui.homeShare.addEventListener("click",shareLink);ui.homeCopy.addEventListener("click",()=>copyLink(ui.homeCopy));
ui.share.addEventListener("click",shareLink);ui.copy.addEventListener("click",()=>copyLink(ui.copy));
ui.fileInput.addEventListener("change",()=>{const file=ui.fileInput.files?.[0];ui.fileInput.value="";sendFile(file)});
for(const type of["dragenter","dragover"])ui.dropZone.addEventListener(type,event=>{event.preventDefault();ui.dropZone.classList.add("drag")});
for(const type of["dragleave","drop"])ui.dropZone.addEventListener(type,event=>{event.preventDefault();ui.dropZone.classList.remove("drag")});
ui.dropZone.addEventListener("drop",event=>sendFile(event.dataTransfer?.files?.[0]));
ui.accept.addEventListener("click",async()=>{
  if(!pendingIncoming)return;
  try{showTransfer(pendingIncoming,"저장 준비");addCancelButton();ui.incoming.classList.add("hidden");await transfers.acceptIncoming();pendingIncoming=null}
  catch(e){ui.transferState.textContent="받기 실패";log("receive setup error: "+e.message)}
});
ui.reject.addEventListener("click",()=>{transfers?.rejectIncoming();pendingIncoming=null;ui.incoming.classList.add("hidden")});
ui.leave.addEventListener("click",async()=>{
  await releaseReceived();history.replaceState(null,"",location.pathname+location.search);beginSession(createSessionSecret());
});
window.addEventListener("beforeunload",()=>{stopScanner();signaling?.close();peer?.close()});
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState!=="visible"||!signaling||peer?.channel?.readyState==="open"||!signaling.opened)return;
  if(!peer)makePeer();
  peer.announce().catch(e=>log("resume: "+e.message));
});
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;ui.installBanner.classList.remove("hidden")});
ui.installBtn.addEventListener("click",async()=>{if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;ui.installBanner.classList.add("hidden")}});
ui.installDismiss.addEventListener("click",()=>ui.installBanner.classList.add("hidden"));
async function registerServiceWorker(){if(!("serviceWorker"in navigator))return;try{const r=await navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"});r.update().catch(()=>{})}catch(e){log("service worker: "+e.message)}}
log("build v0.3.0");registerServiceWorker();
const inviteKey=normalizeSessionInput(location.hash);
beginSession(inviteKey||normalizeSessionInput(saved(SAVE_KEY))||createSessionSecret(),{join:Boolean(inviteKey)});
