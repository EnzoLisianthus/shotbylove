const ICE_SERVERS=[{urls:"stun:stun.l.google.com:19302"}];

export class PeerSession extends EventTarget{
  constructor(signaling,role){
    super();this.signaling=signaling;this.role=role;this.pc=new RTCPeerConnection({iceServers:ICE_SERVERS});this.channel=null;this.pendingCandidates=[];this.offerStarted=false;
    this.pc.addEventListener("icecandidate",event=>{if(event.candidate)this.signaling.send("ice",event.candidate.toJSON()).catch(error=>this.fail(error))});
    this.pc.addEventListener("connectionstatechange",()=>this.dispatchEvent(new CustomEvent("state",{detail:this.pc.connectionState})));
    this.pc.addEventListener("datachannel",event=>this.bindChannel(event.channel));
    signaling.addEventListener("message",event=>this.onSignal(event.detail).catch(error=>this.fail(error)))
  }
  async announce(){await this.signaling.send("hello",{role:this.role})}
  async onSignal(message){
    switch(message.type){
      case"hello":if(this.role==="host"&&!this.offerStarted)await this.startOffer();break;
      case"offer":if(this.role!=="guest")return;await this.pc.setRemoteDescription(message.payload);await this.flushCandidates();{const answer=await this.pc.createAnswer();await this.pc.setLocalDescription(answer);await this.signaling.send("answer",this.pc.localDescription.toJSON())}break;
      case"answer":if(this.role!=="host")return;await this.pc.setRemoteDescription(message.payload);await this.flushCandidates();break;
      case"ice":if(!this.pc.remoteDescription)this.pendingCandidates.push(message.payload);else await this.pc.addIceCandidate(message.payload);break
    }
  }
  async startOffer(){if(this.offerStarted)return;this.offerStarted=true;this.bindChannel(this.pc.createDataChannel("shotbylove-files",{ordered:true}));const offer=await this.pc.createOffer();await this.pc.setLocalDescription(offer);await this.signaling.send("offer",this.pc.localDescription.toJSON())}
  async flushCandidates(){const pending=this.pendingCandidates.splice(0);for(const candidate of pending)await this.pc.addIceCandidate(candidate)}
  bindChannel(channel){if(this.channel)return;this.channel=channel;channel.binaryType="arraybuffer";channel.bufferedAmountLowThreshold=1024*1024;channel.addEventListener("open",()=>this.dispatchEvent(new CustomEvent("channel",{detail:channel})));channel.addEventListener("close",()=>this.dispatchEvent(new CustomEvent("channel-close")));channel.addEventListener("error",()=>this.fail(new Error("Data channel error")))}
  safeChunkSize(){const max=this.pc.sctp?.maxMessageSize;if(!max||max===Infinity||max===0)return 32*1024;return Math.max(4*1024,Math.min(32*1024,Math.floor(max*.5)))}
  async connectionPath(){try{const stats=await this.pc.getStats();let selected;stats.forEach(report=>{if(report.type==="transport"&&report.selectedCandidatePairId)selected=stats.get(report.selectedCandidatePairId)});if(!selected)stats.forEach(report=>{if(report.type==="candidate-pair"&&report.nominated&&report.state==="succeeded")selected=report});if(!selected)return"Unknown";const local=stats.get(selected.localCandidateId),remote=stats.get(selected.remoteCandidateId);return local?.candidateType==="relay"||remote?.candidateType==="relay"?"Relay":"Direct"}catch{return"Unknown"}}
  fail(error){this.dispatchEvent(new CustomEvent("error",{detail:error}))}
  close(){try{this.channel?.close()}catch{}try{this.pc.close()}catch{}}
}
