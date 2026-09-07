import { expandMediaQuery } from './src/lib/media-queries'
import { expandTypography } from './typography-css'
import type { CSSOptions } from 'vite'

/** App and workbench compile the same named responsive conditions. */
export const spliceCss: CSSOptions = {
  postcss: {
    plugins: [
      {
        postcssPlugin: 'splice-responsive-media',
        AtRule: {
          'splice-type': expandTypography,
          'splice-typography': expandTypography,
          media(rule) {
            rule.params = expandMediaQuery(rule.params)
          },
        },
      },
    ],
  },
}
