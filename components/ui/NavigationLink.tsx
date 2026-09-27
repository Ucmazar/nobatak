'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition, type ComponentProps } from 'react';
export function NavigationLink({children,onNavigate,...props}:ComponentProps<typeof Link>){
 const router=useRouter();const [pending,startTransition]=useTransition();const locked=useRef(false);
 useEffect(()=>{if(!pending)locked.current=false;},[pending]);
 return <Link {...props} aria-busy={pending||undefined} aria-disabled={pending||undefined} data-navigation-pending={pending||undefined} onNavigate={event=>{
  if(locked.current){event.preventDefault();return;}
  let prevented=false;
  onNavigate?.({preventDefault:()=>{prevented=true;event.preventDefault();}});
  if(prevented)return;
  const href=typeof props.href==='string'?props.href:null;
  if(!href)return;
  const destination=new URL(href,window.location.href);
  if(destination.origin!==window.location.origin||destination.pathname===window.location.pathname&&destination.search===window.location.search)return;
  event.preventDefault();locked.current=true;
  startTransition(()=>{if(props.replace)router.replace(href,{scroll:props.scroll});else router.push(href,{scroll:props.scroll});});
 }}>{pending?<span role="status" className="navigation-progress"><span className="navigation-spinner" aria-hidden="true"/>در حال بازشدن…</span>:children}</Link>;
}
