import { VISUAL_FOUNDATION_STYLES, COSS_CONTROL_STYLES, INTERACTION_TEXTURE_STYLES, PRIMITIVE_STYLES, MICRO_INTERACTION_STYLES, VISUAL_FOUNDATION_CLIENT_SCRIPT } from '../../../packages/design-system/src/visual-foundation';
import { TYPEFACE_STYLES } from '../../../packages/design-system/src/typeface';
import { renderIconSprite } from '../../../packages/design-system/src/icons';
export const styles = `*{box-sizing:border-box}html,body{margin:0} [hidden]{display:none!important}svg{width:1em;height:1em;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.icon-sprite{position:absolute;width:0;height:0;overflow:hidden}` + VISUAL_FOUNDATION_STYLES + COSS_CONTROL_STYLES + INTERACTION_TEXTURE_STYLES + PRIMITIVE_STYLES + MICRO_INTERACTION_STYLES + TYPEFACE_STYLES;
export const sprite = renderIconSprite();
export const client = VISUAL_FOUNDATION_CLIENT_SCRIPT;
