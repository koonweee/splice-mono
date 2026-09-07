import { expandMediaQuery } from './src/lib/media-queries'
import type { CSSOptions } from 'vite'

/** App and workbench compile the same named responsive conditions. */
export const spliceCss: CSSOptions = {
  postcss: {
    plugins: [
      {
        postcssPlugin: 'splice-responsive-media',
        AtRule: {
          media(rule) {
            rule.params = expandMediaQuery(rule.params)
          },
        },
      },
    ],
  },
}
