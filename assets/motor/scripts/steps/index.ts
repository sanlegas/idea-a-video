import {art} from './art';
import {assets} from './assets';
import {brief} from './brief';
import {catalogo} from './catalogo';
import {chips} from './chips';
import {bed, factcheck, merge, mix, render, voice} from './production';
import {sound} from './sound';
import {storyboard} from './storyboard';
import {tomas} from './tomas';
import type {Step} from './types';

// The film's production line, in order. A new stage is one file and one entry here.
export const STEPS: Step[] = [factcheck, catalogo, brief, art, assets, tomas, storyboard, chips, sound, merge, voice, bed, render, mix];
