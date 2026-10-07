'use client';
import {useEffect} from 'react';
export default function VisitTracker(){useEffect(()=>{void fetch('/api/research/activity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'visit'})}).catch(()=>{});},[]);return null;}
