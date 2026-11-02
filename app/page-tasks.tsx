'use client';
import {useState} from 'react';
import {Plus,Trash2,Columns3,ListChecks,GripVertical} from 'lucide-react';
import {toast} from 'sonner';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {useAutosave,type RegisterSave} from './use-autosave';
type Task={id:string;title:string;status:'todo'|'doing'|'done'};
type TaskData={title:string;tasks:Task[]};
type Block={id:string;content:string;kind:string;version:number};
const columns=[{id:'todo',label:'To do'},{id:'doing',label:'In progress'},{id:'done',label:'Done'}] as const;
export default function PageTasks({block,canEdit,mutate,register}:{block:Block;canEdit:boolean;mutate:(action:Record<string,unknown>)=>Promise<Record<string,any>>;register:RegisterSave}){
 const [data,setData]=useState<TaskData>(()=>JSON.parse(block.content));
 const [draft,setDraft]=useState(''),[addingTo,setAddingTo]=useState<Task['status']>('todo'),[confirmRemove,setConfirmRemove]=useState(false),[removing,setRemoving]=useState(false);
 const board=block.kind==='kanban';
 const value={content:JSON.stringify(data),kind:block.kind};
 const save=useAutosave(block.id,{content:block.content,kind:block.kind},value,block.version,async(next,version)=>{await mutate({action:'saveBlock',blockId:block.id,...next,version});return version+1},register);
 function changeTask(id:string,patch:Partial<Task>){if(!canEdit||removing)return;setData(current=>({...current,tasks:current.tasks.map(task=>task.id===id?{...task,...patch}:task)}))}
 function removeTask(task:Task){setData(current=>({...current,tasks:current.tasks.filter(t=>t.id!==task.id)}));toast('Task removed',{action:{label:'Undo',onClick:()=>setData(current=>current.tasks.some(t=>t.id===task.id)||current.tasks.length>=200?current:{...current,tasks:[...current.tasks,task]})}})}
 async function removeBlock(){setRemoving(true);try{await save.flush();await mutate({action:'deleteBlock',blockId:block.id})}catch(e){toast.error(e instanceof Error?e.message:'Could not remove this block');setRemoving(false)}}
 function taskCard(task:Task){return <div className={'task-card '+(task.status==='done'?'task-complete':'')} key={task.id} draggable={board&&canEdit&&!removing} onDragStart={e=>{e.dataTransfer.setData('application/x-page-task',JSON.stringify({blockId:block.id,taskId:task.id}));e.dataTransfer.effectAllowed='move'}}>
 {board?<GripVertical size={14} className="task-grip" aria-hidden/>:<input type="checkbox" aria-label={'Complete '+(task.title||'task')} checked={task.status==='done'} disabled={!canEdit||removing} onChange={e=>changeTask(task.id,{status:e.target.checked?'done':'todo'})}/>}
 <textarea rows={2} maxLength={500} aria-label="Task title" value={task.title} readOnly={!canEdit||removing} onChange={e=>changeTask(task.id,{title:e.target.value})}/>
 {board&&<select aria-label={'Status for '+(task.title||'task')} value={task.status} disabled={!canEdit||removing} onChange={e=>changeTask(task.id,{status:e.target.value as Task['status']})}>{columns.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>}
 {canEdit&&<button type="button" className="task-remove" disabled={removing} aria-label={'Remove task '+(task.title||'Untitled')} onClick={()=>removeTask(task)}><Trash2 size={14}/></button>}
 </div>}
 return <section className="page-task-block" aria-label={board?'Kanban board':'Task checklist'} data-block-dirty={save.pending?'true':'false'}>
 <div className="task-block-heading">{board?<Columns3 size={20}/>:<ListChecks size={20}/>}<input aria-label={board?'Board title':'Checklist title'} maxLength={120} value={data.title} readOnly={!canEdit||removing} onChange={e=>setData(current=>({...current,title:e.target.value}))}/><small aria-live="polite">{save.error?'Not saved':save.saving?'Saving…':save.pending?'Waiting to save…':'Saved'}</small>{canEdit&&<button type="button" className="text-button" disabled={removing} aria-label={board?'Remove board':'Remove checklist'} onClick={()=>setConfirmRemove(true)}><Trash2 size={16}/></button>}</div>
 <p className="task-progress">{data.tasks.filter(t=>t.status==='done').length} of {data.tasks.length} tasks complete</p>
 {board?<div className="kanban-columns">{columns.map(column=><div className={'kanban-column column-'+column.id} key={column.id} aria-label={column.label} onDragOver={e=>{if(canEdit&&!removing&&e.dataTransfer.types.includes('application/x-page-task'))e.preventDefault()}} onDrop={e=>{e.preventDefault();if(!canEdit||removing)return;try{const dropped=JSON.parse(e.dataTransfer.getData('application/x-page-task'));if(dropped.blockId===block.id)changeTask(dropped.taskId,{status:column.id})}catch{}}}><h3>{column.label}<span>{data.tasks.filter(t=>t.status===column.id).length}</span></h3>{data.tasks.filter(t=>t.status===column.id).map(taskCard)}{!data.tasks.some(t=>t.status===column.id)&&<p className="task-empty">No tasks yet</p>}</div>)}</div>:<div className="task-checklist">{data.tasks.map(taskCard)}{!data.tasks.length&&<p className="task-empty">Add your first task below.</p>}</div>}
 {canEdit&&<form className="task-add" onSubmit={e=>{e.preventDefault();if(!draft.trim()||data.tasks.length>=200)return;setData(current=>({...current,tasks:[...current.tasks,{id:crypto.randomUUID(),title:draft.trim(),status:board?addingTo:'todo'}]}));setDraft('')}}><input aria-label="New task" placeholder="Add a task…" maxLength={500} value={draft} disabled={removing||data.tasks.length>=200} onChange={e=>setDraft(e.target.value)}/>{board&&<select aria-label="New task status" value={addingTo} disabled={removing} onChange={e=>setAddingTo(e.target.value as Task['status'])}>{columns.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select>}<button className="secondary" disabled={removing||!draft.trim()||data.tasks.length>=200}><Plus size={16}/>Add task</button>{data.tasks.length>=200&&<small>200-task limit reached. Add another board or checklist to continue.</small>}</form>}
 {save.error&&<div className="save-error" role="alert">{save.error}<button className="text-button" onClick={()=>void save.flush().catch(()=>{})}>Retry</button></div>}
 <Dialog open={confirmRemove} onOpenChange={open=>!removing&&setConfirmRemove(open)}><DialogContent><DialogTitle>Remove {board?'board':'checklist'}?</DialogTitle><DialogDescription>This removes “{data.title}” and its {data.tasks.length} tasks from this page. This cannot be undone.</DialogDescription><div className="modal-actions"><button autoFocus className="secondary" disabled={removing} onClick={()=>setConfirmRemove(false)}>Cancel</button><button className="primary" disabled={removing} onClick={()=>void removeBlock()}>{removing?'Removing…':'Remove'}</button></div></DialogContent></Dialog>
 </section>
}
