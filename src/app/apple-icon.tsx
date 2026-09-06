import Icon, { contentType } from './icon'

/**
 * iOS wants its own size and does not round the corners for you, which the
 * mark already accounts for.
 */
export const size = { width: 180, height: 180 }
export { contentType }
export default Icon
