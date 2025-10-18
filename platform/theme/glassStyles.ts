import { Theme } from './useTheme';

export const colors = {
  light: {
    background: '#F5F5F5',
    text: '#000000',
    glassBackground: 'rgba(255, 255, 255, 0.7)',
    glassBorder: 'rgba(255, 255, 255, 0.3)',
  },
  dark: {
    background: '#000000',
    text: '#FFFFFF',
    glassBackground: 'rgba(0, 0, 0, 0.7)',
    glassBorder: 'rgba(255, 255, 255, 0.1)',
  },
};

export function getColors(theme: Theme): typeof colors.light {
  return colors[theme];
}
