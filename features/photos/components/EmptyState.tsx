import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '../../../platform/i18n/useTranslation';
import { useTheme } from '../../../platform/theme/useTheme';
import { getColors } from '../../../platform/theme/glassStyles';

export function EmptyState(): JSX.Element {
  const { t } = useTranslation();
  const theme = useTheme();
  const colors = getColors(theme);

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: colors.text }]}>
        {t('emptyState.title')}
      </Text>
      <Text style={[styles.arrow, { color: colors.text }]}>↓</Text>
      <Text style={[styles.instruction, { color: colors.text }]}>
        {t('emptyState.instruction')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
  },
  arrow: {
    fontSize: 48,
    marginBottom: 16,
  },
  instruction: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
});
