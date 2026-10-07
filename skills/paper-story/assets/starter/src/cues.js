import { TIMELINE } from './timeline.js';
import { PROJECT } from './project.js';
import { makeWarp as buildWarp } from './core/time.js';
export const CUES=TIMELINE.cues;
export const CUE_LIST=Object.entries(CUES).sort((a,b)=>a[1]-b[1]).map(([id,t])=>[id,t,id]);
export const NAMES={hero:'主角',princess:'伙伴',dragon:'巨龙',city:'小城',child:'孩子',...(PROJECT.names || {})};
export const DURATION=TIMELINE.duration;
export const cue=id=>{if(!(id in CUES))throw new Error(`Unknown cue ${id}`);return CUES[id];};
export const makeWarp=anchors=>buildWarp(anchors,CUES,DURATION);
