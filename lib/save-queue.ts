// Serializes writes so a slow response cannot replace a newer local edit.
export function createSaveQueue<T>(initial:T,revision:number,persist:(value:T,revision:number)=>Promise<number>){
 let latest=initial,saved=JSON.stringify(initial),running:Promise<void>|null=null,timer:ReturnType<typeof setTimeout>|null=null;
 let state={pending:false,saving:false,error:''};const listeners=new Set<()=>void>();
 function emit(next:Partial<typeof state>){state={...state,...next};listeners.forEach(fn=>fn())}
 const queue={
  subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}},
  getState:()=>state,
  update(value:T){latest=value;const pending=JSON.stringify(value)!==saved;emit({pending});if(timer)clearTimeout(timer);if(pending&&!state.error)timer=setTimeout(()=>{void queue.flush().catch(()=>{})},650)},
  flush():Promise<void>{
   if(timer){clearTimeout(timer);timer=null}if(running)return running;
   if(JSON.stringify(latest)===saved)return Promise.resolve();
   emit({saving:true,error:''});
   running=(async()=>{try{while(JSON.stringify(latest)!==saved){const snapshot=latest;const serialized=JSON.stringify(snapshot);revision=await persist(snapshot,revision);saved=serialized;emit({pending:JSON.stringify(latest)!==saved})}}catch(e){emit({error:e instanceof Error?e.message:'Unable to save. Your draft is still here.'});throw e}finally{running=null;emit({saving:false})}})();
   return running;
  },
  dispose(){if(timer)clearTimeout(timer);listeners.clear()}
 };return queue;
}
