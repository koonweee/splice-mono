import { createTheme, MantineColorsTuple } from '@mantine/core'

/** Mantine theme */
const brand: MantineColorsTuple = [
  '#e6faf7',
  '#dceeeb',
  '#c0d9d5',
  '#a0c2bd',
  '#85afa9',
  '#72a39b',
  '#689e96',
  '#568a82',
  '#487b73',
  '#356b63',
]

// Teal for positive/success states
const teal: MantineColorsTuple = [
  '#e6faf7',
  '#d0f4ef',
  '#a8e8df',
  '#7ddace',
  '#58ccbf',
  '#3ec2b3',
  '#35b8a9',
  '#2a9e91',
  '#1f8a7e',
  '#12756a',
]

// Warm red complementary to teal brand
const red: MantineColorsTuple = [
  '#fce9e9',
  '#f3d4d4',
  '#e5acac',
  '#d78181',
  '#cc5f5f',
  '#c44a4a',
  '#bf4040',
  '#a83434',
  '#962c2c',
  '#832222',
]

const dark: MantineColorsTuple = [
  '#c9d1cf', // text - lightest, slight teal tint
  '#a8b3b0',
  '#889592',
  '#6a7876',
  '#525e5c',
  '#3d4847', // borders
  '#2a3331', // hover states
  '#1c2422', // cards/inputs
  '#131918', // main background
  '#0a0e0d', // darkest
]

const warm = createTheme({
  colors: {
    dark,
    brand,
    teal,
    red,
  },
  primaryColor: 'brand',
})

export const themes = {
  warm,
}
