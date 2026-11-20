import {Config} from '@remotion/cli/config';

Config.setChromiumOpenGlRenderer('angle');
Config.setConcurrency(1);
Config.setDelayRenderTimeoutInMilliseconds(300000);
Config.setOverwriteOutput(true);
