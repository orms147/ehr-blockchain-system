import { defaultConfig } from '@tamagui/config/v5'
import { createTamagui } from 'tamagui'

const lightTheme = {
  ...defaultConfig.themes.light,
  background: '#F8FAF3',
  color: '#191C18',
  borderColor: '#C5C8BE',
  color1: '#FFFFFF',
  color2: '#F2F4ED',
  color3: '#ECEFE8',
  color4: '#E7E9E2',
  color5: '#E1E3DC',
  color6: '#D8DBD4',
  color7: '#C5C8BE',
  color8: '#A4A298',
  color9: '#757870',
  color10: '#5E635A',
  color11: '#444841',
  color12: '#191C18',
  primary: '#55624D',
}

const darkTheme = {
  ...defaultConfig.themes.dark,
  background: '#1D211D',
  color: '#EFF2EA',
  borderColor: '#444841',
  primary: '#98A68E',
}

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  themes: {
    ...defaultConfig.themes,
    light: lightTheme,
    dark: darkTheme,
  },
})

export default tamaguiConfig

export type Conf = typeof tamaguiConfig

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
