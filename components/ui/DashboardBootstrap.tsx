'use client';
import { createContext, useContext } from 'react';
import type { Business,Profile } from '@/types/database';
export type DashboardBootstrap={user:{id:string;email?:string;user_metadata:{full_name?:string}};profile:Profile;businesses:Business[]};
export const DashboardBootstrapContext=createContext<DashboardBootstrap|null>(null);
export const useDashboardBootstrap=()=>useContext(DashboardBootstrapContext);
