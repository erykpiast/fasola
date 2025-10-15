import { useColorScheme } from 'react-native';

export type Theme = 'light' | 'dark';

export function useTheme(): Theme {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? 'dark' : 'light';
}
