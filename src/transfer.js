import{createReceiveSink}from"./storage.js";
const HIGH_WATER=4*1024*1024;
function id(){return crypto.randomUUID()}
function control(channel,message){channel.send(JSON.stringify(message))}
function humanRate(bytesPerSecond){if(!Number.isFinite(bytesPerSecond)||bytesPerSecond<=0)return"—";const units=["B/s","KB/s","MB/s","GB/s"];let value=bytesPerSecond,i=0;while(value>=1024&&i<units.length-1){value/=1024;i++}const display=value>=100?value.toFixed(0):value>=10?value.toFixed(1):value.toFixed(2);return display+" "+units[i]}
export class TransferManager extends EventTarget{
  constructor(channel,chunkSize){super();this.channel=channel;this.chunkSize=chunkSize;this.incoming=null;this.outgoing=null;channel.addEventListener("message",event=>this.onMessage(event.data).catch(error=>this.emit("error",{error})))}
  emit(type,detail){this.dispatchEvent(new CustomEvent(type,{detail}))}
  async onMessage(data){
    if(typeof data==="string"){await this.onControl(JSON.parse(data));return}
    if(!(data instanceof ArrayBuffer)||!this.incoming?.accepted)return;
    const state=this.incoming;await state.sink.write(state.received,data);state.received+=data.byteLength;const elapsed=Math.max(.001,(performance.now()-state.startedAt)/1000);this.emit("progress",{direction:"receive",id:state.meta.id,loaded:state.received,total:state.meta.size,rate:humanRate(state.received/elapsed)})
  }
  async onControl(message){
    switch(message.t){
      case"file-offer":if(this.incoming){control(this.channel,{t:"file-reject",id:message.meta.id,reason:"busy"});return}this.incoming={meta:message.meta,accepted:false,sink:null,received:0,startedAt:0};this.emit("incoming",{meta:message.meta});break;
      case"file-accept":if(this.outgoing?.meta.id===message.id){this.outgoing.accepted=true;this.sendChunks().catch(error=>this.emit("error",{error}))}break;
      case"file-reject":if(this.outgoing?.meta.id===message.id){this.emit("rejected",{id:message.id,reason:message.reason||"declined"});this.outgoing=null}break;
      case"file-done":if(!this.incoming||this.incoming.meta.id!==message.id)return;if(this.incoming.received!==this.incoming.meta.size){await this.incoming.sink.abort();this.emit("error",{error:new Error("Received byte count does not match the announced file size.")});this.incoming=null;return}{const state=this.incoming,result=await state.sink.finish();this.emit("complete",{direction:"receive",meta:state.meta,result});this.incoming=null}break;
      case"cancel":if(this.incoming?.meta.id===message.id){await this.incoming.sink?.abort();this.incoming=null;this.emit("cancelled",{direction:"receive",id:message.id})}if(this.outgoing?.meta.id===message.id){this.outgoing.cancelled=true;this.emit("cancelled",{direction:"send",id:message.id})}break
    }
  }
  offer(file){if(this.outgoing)throw new Error("A file is already being sent.");const meta={id:id(),name:file.name,size:file.size,type:file.type,lastModified:file.lastModified,chunkSize:this.chunkSize};this.outgoing={file,meta,accepted:false,cancelled:false,offset:0,startedAt:0};control(this.channel,{t:"file-offer",meta});this.emit("offered",{meta});return meta}
  async acceptIncoming(){if(!this.incoming||this.incoming.accepted)return;const state=this.incoming;state.sink=await createReceiveSink(state.meta);state.accepted=true;state.startedAt=performance.now();this.emit("sink",{kind:state.sink.kind});control(this.channel,{t:"file-accept",id:state.meta.id})}
  rejectIncoming(){if(!this.incoming)return;control(this.channel,{t:"file-reject",id:this.incoming.meta.id,reason:"declined"});this.incoming=null}
  cancelActive(){const active=this.outgoing||this.incoming;if(!active)return;const activeId=active.meta.id;control(this.channel,{t:"cancel",id:activeId});if(this.outgoing?.meta.id===activeId)this.outgoing.cancelled=true;if(this.incoming?.meta.id===activeId)this.incoming.sink?.abort()}
  async waitForDrain(){if(this.channel.bufferedAmount<=HIGH_WATER)return;await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{cleanup();reject(new Error("Data channel stalled while waiting for buffer space."))},30000);const onLow=()=>{cleanup();resolve()};const cleanup=()=>{clearTimeout(timeout);this.channel.removeEventListener("bufferedamountlow",onLow)};this.channel.addEventListener("bufferedamountlow",onLow,{once:true})})}
  async sendChunks(){const state=this.outgoing;if(!state?.accepted)return;state.startedAt=performance.now();while(state.offset<state.file.size){if(state.cancelled){this.outgoing=null;return}if(this.channel.readyState!=="open")throw new Error("Data channel closed during transfer.");await this.waitForDrain();const end=Math.min(state.offset+this.chunkSize,state.file.size),buffer=await state.file.slice(state.offset,end).arrayBuffer();this.channel.send(buffer);state.offset=end;const elapsed=Math.max(.001,(performance.now()-state.startedAt)/1000);this.emit("progress",{direction:"send",id:state.meta.id,loaded:state.offset,total:state.meta.size,rate:humanRate(state.offset/elapsed)})}control(this.channel,{t:"file-done",id:state.meta.id});this.emit("complete",{direction:"send",meta:state.meta});this.outgoing=null}
}
