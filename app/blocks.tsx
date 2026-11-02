'use client';
import PageTasks from './page-tasks';
import {useState} from 'react';
import {useAutosave,type RegisterSave} from './use-autosave';
type Block={id:string;content:string;kind:string;version:number};
export default function Blocks({blocks,canEdit,mutate,register}:{blocks:Block[];canEdit:boolean;mutate:(action:Record<string,unknown>)=>Promise<Record<string,any>>;register:RegisterSave}){
 return <section className="legacy-blocks">{blocks.map(block=>['kanban','checklist'].includes(block.kind)?<PageTasks key={block.id} block={block} canEdit={canEdit} mutate={mutate} register={register}/>:<BlockEditor key={block.id} block={block} canEdit={canEdit} mutate={mutate} register={register}/>)}</section>;
}
function BlockEditor({block,canEdit,mutate,register}:{block:Block;canEdit:boolean;mutate:(action:Record<string,unknown>)=>Promise<Record<string,any>>;register:RegisterSave}){
 const [content,setContent]=useState(block.content),[kind,setKind]=useState(block.kind);
 const save=useAutosave(block.id,{content:block.content,kind:block.kind},{content,kind},block.version,async(value,version)=>{await mutate({action:'saveBlock',blockId:block.id,...value,version});return version+1},register);
 return <article className="legacy-block" data-block-dirty={save.pending?'true':'false'}><select aria-label="Block type" disabled={!canEdit} value={kind} onChange={e=>setKind(e.target.value)}>{['text','heading','todo','bullet','quote'].map(k=><option key={k} value={k}>{k}</option>)}</select><textarea aria-label="Block content" className={'block-content block-'+kind} value={content} readOnly={!canEdit} onChange={e=>setContent(e.target.value)} maxLength={50000}/>{save.error&&<div role="alert" className="save-error">{save.error}<button className="text-button" onClick={()=>void save.flush().catch(()=>{})}>Retry</button></div>}</article>
}
