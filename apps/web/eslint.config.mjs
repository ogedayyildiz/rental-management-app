import next from 'eslint-config-next/core-web-vitals';
import base from '../../eslint.config.mjs';

const config = [...base, ...next];
export default config;
