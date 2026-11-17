const ICE_SERVERS=[
  {urls:["stun:stun.l.google.com:19302","stun:stun.cloudflare.com:3478"]}
];

export class PeerSession extends EventTarget{
  constructor(signaling){
    super();
    this.signaling=signaling;
    this.remoteId=null;
    this.remoteDeviceId=null;
    this.pc=new RTCPeerConnection({iceServers:ICE_SERVERS,iceCandidatePoolSize:1});
    this.channel=null;
    this.pendingCandidates=[];
    this.offerStarted=false;
    this.closed=false;
    this.boundSignal=event=>this.onSignal(event.detail).catch(error=>this.fail(error));
    signaling.addEventListener("message",this.boundSignal);

    this.pc.addEventListener("icecandidate",event=>{
      if(event.candidate&&this.remoteId&&!this.closed){
        this.signaling.send("ice",{to:this.remoteId,candidate:event.candidate.toJSON()})
          .catch(error=>this.fail(error));
      }
    });
    this.pc.addEventListener("connectionstatechange",()=>{
      if(!this.closed)this.dispatchEvent(new CustomEvent("state",{detail:this.pc.connectionState}));
    });
    this.pc.addEventListener("datachannel",event=>this.bindChannel(event.channel));
  }

  async announce(reply=false){
    if(this.closed)return;
    await this.signaling.send("hello",{device:this.signaling.deviceId,reply});
  }

  async onSignal(message){
    if(this.closed)return;
    const from=message.from;
    const payload=message.payload||{};

    if(message.type==="hello"){
      if(this.remoteId&&this.remoteId!==from){
        // A known device has reopened the page with a new tab ID.
        if(this.remoteDeviceId&&payload.device===this.remoteDeviceId){
          this.dispatchEvent(new CustomEvent("peer-switch"));
        }else if(this.channel?.readyState!=="open"){
          this.dispatchEvent(new CustomEvent("peer-switch"));
        }
        return;
      }
      if(!this.remoteId){
        this.remoteId=from;
        this.remoteDeviceId=typeof payload.device==="string"?payload.device:null;
        this.dispatchEvent(new CustomEvent("peer-seen",{detail:this.remoteDeviceId}));
      }else if(!this.remoteDeviceId&&typeof payload.device==="string"){
        this.remoteDeviceId=payload.device;
      }
      if(!payload.reply)this.announce(true).catch(error=>this.fail(error));
      if(this.signaling.clientId<from&&!this.offerStarted)await this.startOffer();
      return;
    }

    // Each SDP and ICE message must be addressed to this particular browser instance.
    if(payload.to!==this.signaling.clientId)return;
    if(this.remoteId&&this.remoteId!==from)return;
    if(!this.remoteId){
      this.remoteId=from;
      this.dispatchEvent(new CustomEvent("peer-seen",{detail:null}));
    }

    switch(message.type){
      case"offer":{
        if(this.pc.signalingState!=="stable")return;
        await this.pc.setRemoteDescription(payload.description);
        await this.flushCandidates();
        const answer=await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await this.signaling.send("answer",{to:from,description:this.pc.localDescription.toJSON()});
        break;
      }
      case"answer":
        if(this.pc.signalingState!=="have-local-offer")return;
        await this.pc.setRemoteDescription(payload.description);
        await this.flushCandidates();
        break;
      case"ice":
        if(!payload.candidate)return;
        if(!this.pc.remoteDescription)this.pendingCandidates.push(payload.candidate);
        else await this.pc.addIceCandidate(payload.candidate);
        break;
    }
  }

  async startOffer(){
    if(this.offerStarted||this.closed||!this.remoteId)return;
    this.offerStarted=true;
    this.bindChannel(this.pc.createDataChannel("shotbylove-files",{ordered:true}));
    const offer=await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this.signaling.send("offer",{to:this.remoteId,description:this.pc.localDescription.toJSON()});
  }

  async flushCandidates(){
    for(const candidate of this.pendingCandidates.splice(0)){
      try{await this.pc.addIceCandidate(candidate)}catch(error){this.fail(error)}
    }
  }

  bindChannel(channel){
    if(this.channel)return;
    this.channel=channel;
    channel.binaryType="arraybuffer";
    channel.bufferedAmountLowThreshold=1024*1024;
    channel.addEventListener("open",()=>{
      if(!this.closed)this.dispatchEvent(new CustomEvent("channel",{detail:channel}));
    });
    channel.addEventListener("close",()=>{
      if(!this.closed)this.dispatchEvent(new CustomEvent("channel-close"));
    });
    channel.addEventListener("error",()=>this.fail(new Error("Data channel error")));
  }

  safeChunkSize(){
    const max=this.pc.sctp?.maxMessageSize;
    if(!max||max===Infinity||max===0)return 32*1024;
    return Math.max(4*1024,Math.min(32*1024,Math.floor(max*.5)));
  }

  async connectionPath(){
    try{
      const stats=await this.pc.getStats();
      let selected;
      stats.forEach(report=>{if(report.type==="transport"&&report.selectedCandidatePairId)selected=stats.get(report.selectedCandidatePairId)});
      if(!selected)stats.forEach(report=>{if(report.type==="candidate-pair"&&report.nominated&&report.state==="succeeded")selected=report});
      if(!selected)return"Unknown";
      const local=stats.get(selected.localCandidateId),remote=stats.get(selected.remoteCandidateId);
      return local?.candidateType==="relay"||remote?.candidateType==="relay"?"Relay":"Direct";
    }catch{return"Unknown"}
  }

  fail(error){
    if(!this.closed)this.dispatchEvent(new CustomEvent("error",{detail:error instanceof Error?error:new Error(String(error))}));
  }

  close(){
    if(this.closed)return;
    this.closed=true;
    this.signaling.removeEventListener("message",this.boundSignal);
    try{this.channel?.close()}catch{}
    try{this.pc.close()}catch{}
  }
}
