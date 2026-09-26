import script from './userscript.js';
import css from '!css-loader!./style.css';
import icon from '!url-loader!./layers.svg';
export const resources = {'userscript.js': script, 'style.css': css, 'layers.svg': icon};
