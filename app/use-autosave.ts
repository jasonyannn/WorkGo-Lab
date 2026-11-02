'use client';
import {useEffect,useLayoutEffect,useMemo,useRef,useSyncExternalStore} from 'react';
import {createSaveQueue} from '@/lib/save-queue';
export type RegisterSave=(id:string,flush:()=>Promise<void>)=>()=>void;
export function useAutosave<T>(id:string,initial:T,value:T,revision:number,persist:(value:T,version:number)=>Promise<number>,register:RegisterSave){
 const writer=useRef(persist);writer.current=persist;
 // Each page/block owns an independent queue and revision counter.
 const queue=useMemo(()=>createSaveQueue(initial,revision,(v,r)=>writer.current(v,r)),[id]);
 const state=useSyncExternalStore(queue.subscribe,queue.getState,queue.getState);
 const serialized=JSON.stringify(value);
 useLayoutEffect(()=>{queue.update(value)},[queue,serialized]);
 useEffect(()=>{const unregister=register(id,queue.flush);const online=()=>{void queue.flush().catch(()=>{})};window.addEventListener('online',online);return()=>{unregister();window.removeEventListener('online',online);queue.dispose()}},[queue,register,id]);
 return {...state,flush:queue.flush};
}
